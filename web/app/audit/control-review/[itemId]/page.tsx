"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, CheckCircle2, XCircle, AlertCircle, AlertTriangle,
  Clock, Loader2, FileText, File, Upload, ChevronDown, ChevronUp,
  User, Calendar, Shield, Flag, Paperclip, Activity,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type ReviewItem = {
  id: string;
  reference_no: string;
  title: string;
  description?: string;
  instructions?: string;
  status: string;
  risk_level: string;
  priority: string;
  item_type: string;
  business_unit: string;
  submitter_name: string;
  reviewer_name?: string;
  submitted_at: string;
  due_date?: string;
  age_days: number;
  is_overdue: boolean;
  compliance_required: boolean;
  compliance_cleared: boolean;
  linked_references?: string[];
};

type ChecklistItem = {
  id: string;
  seq: number;
  label: string;
  status: string;
  reviewer_comments: string;
  validated_by_name: string;
  validated_at?: string;
  is_mandatory: boolean;
};

type ReviewAction = {
  id: string;
  action: string;
  actor_name: string;
  comments: string;
  previous_status: string;
  new_status: string;
  created_at: string;
};

type ReviewDocument = {
  id: string;
  file_name: string;
  document_type: string;
  uploader_name: string;
  file_size: number;
  notes: string;
  created_at: string;
};

type ReviewException = {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  owner_name: string;
  corrective_action: string;
  due_date?: string;
  raised_by_name: string;
};

// ── Config ─────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending_review:       { label: "Pending Review",       color: "#0369a1", bg: "#e0f2fe" },
  under_review:         { label: "Under Review",         color: "#E05500", bg: "#fff0e0" },
  awaiting_information: { label: "Awaiting Information", color: "#d97706", bg: "#fffbeb" },
  exception_raised:     { label: "Exception Raised",     color: "#ea580c", bg: "#fff7ed" },
  escalated:            { label: "Escalated",            color: "#dc2626", bg: "#fee2e2" },
  completed:            { label: "Completed",            color: "#059669", bg: "#ecfdf5" },
  passed:               { label: "Passed",               color: "#059669", bg: "#ecfdf5" },
  returned:             { label: "Returned",             color: "#92400e", bg: "#fef3c7" },
  rejected:             { label: "Rejected",             color: "#991b1b", bg: "#fee2e2" },
};

const RISK_CFG: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: "Low Risk",      color: "#059669", bg: "#ecfdf5" },
  medium:   { label: "Medium Risk",   color: "#d97706", bg: "#fffbeb" },
  high:     { label: "High Risk",     color: "#dc2626", bg: "#fee2e2" },
  critical: { label: "Critical Risk", color: "#7c3aed", bg: "#ede9fe" },
};

const PRIORITY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: "Low",    color: "#6b7280", bg: "#f3f4f6" },
  medium: { label: "Medium", color: "#d97706", bg: "#fffbeb" },
  high:   { label: "High",   color: "#dc2626", bg: "#fee2e2" },
  urgent: { label: "Urgent", color: "#7c3aed", bg: "#ede9fe" },
};

const SEVERITY_CFG: Record<string, { color: string; bg: string }> = {
  low:      { color: "#059669", bg: "#ecfdf5" },
  medium:   { color: "#d97706", bg: "#fffbeb" },
  high:     { color: "#dc2626", bg: "#fee2e2" },
  critical: { color: "#7c3aed", bg: "#ede9fe" },
};

const CHECKLIST_STATUS_CFG: Record<string, { color: string; bg: string }> = {
  outstanding:    { color: "#d97706", bg: "#fffbeb" },
  received:       { color: "#0369a1", bg: "#e0f2fe" },
  valid:          { color: "#059669", bg: "#ecfdf5" },
  invalid:        { color: "#dc2626", bg: "#fee2e2" },
  not_applicable: { color: "#6b7280", bg: "#f3f4f6" },
};

const ACTION_COLORS: Record<string, string> = {
  pass:                "#059669",
  return:              "#d97706",
  escalate:            "#dc2626",
  reject:              "#dc2626",
  start_review:        "#0369a1",
  assign:              "#7c3aed",
  note:                "#6b7280",
  request_information: "#ea580c",
  resume:              "#0369a1",
  raise_exception:     "#ea580c",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(s?: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(s?: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtBytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color, background: bg }}
    >
      {label}
    </span>
  );
}

// ── Action panel config ────────────────────────────────────────────────────────

type ActionDef = {
  action: string;
  label: string;
  color: string;
  bg: string;
  description: string;
  requiresComment?: boolean;
};

const ACTION_DEFS: Record<string, ActionDef[]> = {
  pending_review: [
    { action: "start_review",    label: "Start Review",          color: "#fff", bg: "#0369a1", description: "Begin reviewing this control item. Status will move to Under Review.", requiresComment: false },
  ],
  under_review: [
    { action: "pass",            label: "Pass ✓",                color: "#fff", bg: "#059669", description: "Mark this item as passing the control review.", requiresComment: true },
    { action: "return",          label: "Return for Correction", color: "#fff", bg: "#d97706", description: "Send back to the submitter for corrections or additional information.", requiresComment: true },
    { action: "escalate",        label: "Escalate",              color: "#fff", bg: "#dc2626", description: "Escalate this item to a senior reviewer due to complexity or risk.", requiresComment: true },
    { action: "reject",          label: "Reject",                color: "#fff", bg: "#6b7280", description: "Reject this item as non-compliant or unsuitable.", requiresComment: true },
  ],
  awaiting_information: [
    { action: "resume",    label: "Resume Review",     color: "#fff", bg: "#0369a1", description: "Information received — resume the review process.", requiresComment: false },
    { action: "escalate",  label: "Escalate",          color: "#fff", bg: "#dc2626", description: "Escalate due to information delay or risk factors.", requiresComment: true },
  ],
  exception_raised: [
    { action: "escalate",  label: "Escalate",          color: "#fff", bg: "#dc2626", description: "Escalate after reviewing the exception.", requiresComment: true },
    { action: "pass",      label: "Pass ✓",             color: "#fff", bg: "#059669", description: "Accept exception and mark item as passed.", requiresComment: true },
  ],
  escalated: [
    { action: "pass",   label: "Pass ✓",  color: "#fff", bg: "#059669", description: "Resolve escalation and mark item as passed.", requiresComment: true },
    { action: "reject", label: "Reject",  color: "#fff", bg: "#6b7280", description: "Reject item following escalation review.", requiresComment: true },
  ],
};

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ReviewItemDetailPage() {
  const params    = useParams();
  const router    = useRouter();
  const { toast } = useToast();
  const qc        = useQueryClient();
  const itemId    = params.itemId as string;

  const [activeTab,         setActiveTab]         = useState<"checklist" | "documents" | "trail">("checklist");
  const [activeAction,      setActiveAction]      = useState<ActionDef | null>(null);
  const [actionComment,     setActionComment]     = useState("");
  const [showAssign,        setShowAssign]        = useState(false);
  const [reviewerName,      setReviewerName]      = useState("");
  const [showExceptionForm, setShowExceptionForm] = useState(false);

  // Checklist edit state: {[id]: {status, reviewer_comments}}
  const [checklistEdits, setChecklistEdits] = useState<Record<string, { status: string; reviewer_comments: string }>>({});

  // Add document form
  const [addDocForm, setAddDocForm] = useState({
    file_name: "", document_type: "source_document", uploader_name: "", notes: "",
  });

  // Exception form
  const [exForm, setExForm] = useState({
    title: "", description: "", severity: "medium",
    owner_name: "", corrective_action: "", due_date: "",
  });

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: item, isLoading: loadingItem } = useQuery<ReviewItem>({
    queryKey: ["audit-item", itemId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}`);
      if (!r.ok) throw new Error("Failed to load item");
      return r.json();
    },
  });

  const { data: checklist = [] } = useQuery<ChecklistItem[]>({
    queryKey: ["audit-checklist", itemId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}/checklist`);
      if (!r.ok) throw new Error("Failed to load checklist");
      return r.json();
    },
    enabled: !!itemId,
  });

  const { data: actions = [] } = useQuery<ReviewAction[]>({
    queryKey: ["audit-actions", itemId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}/actions`);
      if (!r.ok) throw new Error("Failed to load audit trail");
      return r.json();
    },
    enabled: !!itemId,
  });

  const { data: documents = [] } = useQuery<ReviewDocument[]>({
    queryKey: ["audit-documents", itemId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}/documents`);
      if (!r.ok) throw new Error("Failed to load documents");
      return r.json();
    },
    enabled: !!itemId,
  });

  const { data: exceptions = [] } = useQuery<ReviewException[]>({
    queryKey: ["audit-exceptions", itemId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}/exceptions`);
      if (!r.ok) throw new Error("Failed to load exceptions");
      return r.json();
    },
    enabled: !!itemId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const actionMut = useMutation({
    mutationFn: async ({ action, comments }: { action: string; comments: string }) => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comments }),
      });
      if (!r.ok) throw new Error("Action failed");
      return r.json();
    },
    onSuccess: (_data: unknown, vars: { action: string; comments: string }) => {
      qc.invalidateQueries({ queryKey: ["audit-item", itemId] });
      qc.invalidateQueries({ queryKey: ["audit-actions", itemId] });
      toast({ title: "Action recorded", description: `"${vars.action}" applied successfully.` });
      setActiveAction(null);
      setActionComment("");
    },
    onError: () => toast({ title: "Error", description: "Could not record action.", variant: "destructive" }),
  });

  const assignMut = useMutation({
    mutationFn: async (reviewer_name: string) => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer_name }),
      });
      if (!r.ok) throw new Error("Assign failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-item", itemId] });
      qc.invalidateQueries({ queryKey: ["audit-actions", itemId] });
      toast({ title: "Reviewer assigned" });
      setShowAssign(false);
      setReviewerName("");
    },
    onError: () => toast({ title: "Error", description: "Could not assign reviewer.", variant: "destructive" }),
  });

  const seedChecklistMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}/checklist/seed`, {
        method: "POST",
      });
      if (!r.ok) throw new Error("Seed failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-checklist", itemId] });
      toast({ title: "Standard checklist loaded" });
    },
    onError: () => toast({ title: "Error", description: "Could not load checklist.", variant: "destructive" }),
  });

  const updateChecklistMut = useMutation({
    mutationFn: async ({ cid, status, reviewer_comments }: { cid: string; status: string; reviewer_comments: string }) => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}/checklist/${cid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewer_comments }),
      });
      if (!r.ok) throw new Error("Update failed");
      return r.json();
    },
    onSuccess: (_data: unknown, vars: { cid: string; status: string; reviewer_comments: string }) => {
      qc.invalidateQueries({ queryKey: ["audit-checklist", itemId] });
      toast({ title: "Checklist item saved" });
      setChecklistEdits((prev: Record<string, { status: string; reviewer_comments: string }>) => {
        const next = { ...prev };
        delete next[vars.cid];
        return next;
      });
    },
    onError: () => toast({ title: "Error", description: "Could not save checklist item.", variant: "destructive" }),
  });

  const addDocMut = useMutation({
    mutationFn: async (data: typeof addDocForm) => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Upload failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-documents", itemId] });
      toast({ title: "Document added" });
      setAddDocForm({ file_name: "", document_type: "source_document", uploader_name: "", notes: "" });
    },
    onError: () => toast({ title: "Error", description: "Could not add document.", variant: "destructive" }),
  });

  const raiseExceptionMut = useMutation({
    mutationFn: async (data: typeof exForm) => {
      const r = await fetch(`${BASE}/api/v1/internal-audit/review-items/${itemId}/exceptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to raise exception");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-exceptions", itemId] });
      qc.invalidateQueries({ queryKey: ["audit-item", itemId] });
      qc.invalidateQueries({ queryKey: ["audit-actions", itemId] });
      toast({ title: "Exception raised" });
      setShowExceptionForm(false);
      setExForm({ title: "", description: "", severity: "medium", owner_name: "", corrective_action: "", due_date: "" });
    },
    onError: () => toast({ title: "Error", description: "Could not raise exception.", variant: "destructive" }),
  });

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (loadingItem) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-[14px]" style={{ color: "var(--pg-text-2)" }}>Item not found.</p>
        <Link href="/audit/control-review" className="text-[13px] font-medium text-blue-600 hover:underline">
          ← Back to queue
        </Link>
      </div>
    );
  }

  const statusCfg   = STATUS_CFG[item.status]   ?? { label: item.status,   color: "#6b7280", bg: "#f3f4f6" };
  const riskCfg     = RISK_CFG[item.risk_level]  ?? { label: item.risk_level, color: "#6b7280", bg: "#f3f4f6" };
  const priorityCfg = PRIORITY_CFG[item.priority] ?? { label: item.priority,  color: "#6b7280", bg: "#f3f4f6" };
  const availableActions = ACTION_DEFS[item.status] ?? [];

  // Checklist progress
  const validatedCount = checklist.filter(c => c.status === "valid" || c.status === "not_applicable").length;
  const totalCount     = checklist.length;
  const progressPct    = totalCount > 0 ? Math.round((validatedCount / totalCount) * 100) : 0;

  function getChecklistEdit(c: ChecklistItem) {
    return checklistEdits[c.id] ?? { status: c.status, reviewer_comments: c.reviewer_comments ?? "" };
  }

  function patchChecklistEdit(id: string, patch: Partial<{ status: string; reviewer_comments: string }>) {
    setChecklistEdits(prev => ({
      ...prev,
      [id]: { ...getChecklistEdit(checklist.find(x => x.id === id)!), ...prev[id], ...patch },
    }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: "var(--pg-bg)" }}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-4">
          <Link
            href="/audit/control-review"
            className="flex items-center gap-1.5 text-[12px] font-medium shrink-0 mt-0.5"
            style={{ color: "var(--pg-text-3)" }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Control Review Queue
          </Link>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded"
                    style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)", border: "1px solid var(--pg-card-border)" }}>
                {item.reference_no}
              </span>
              <Pill label={statusCfg.label}   color={statusCfg.color}   bg={statusCfg.bg} />
              <Pill label={riskCfg.label}     color={riskCfg.color}     bg={riskCfg.bg} />
              <Pill label={priorityCfg.label} color={priorityCfg.color} bg={priorityCfg.bg} />
            </div>
            <h1 className="text-[18px] font-bold leading-snug" style={{ color: "var(--pg-text-1)" }}>
              {item.title}
            </h1>
          </div>
        </div>

        {/* ── Overdue banner ───────────────────────────────────────────────── */}
        {item.is_overdue && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
               style={{ background: "#fee2e2", border: "1px solid #fca5a5" }}>
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#dc2626" }} />
            <p className="text-[12.5px] font-semibold" style={{ color: "#dc2626" }}>
              This item is overdue by {item.age_days} day{item.age_days !== 1 ? "s" : ""}. Immediate attention required.
            </p>
          </div>
        )}

        {/* ── Two-column layout ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT — 2/3 */}
          <div className="lg:col-span-2 space-y-5">

            {/* Details card */}
            <div className="rounded-2xl overflow-hidden"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Item Details</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x"
                   style={{ borderColor: "var(--pg-row-border)" }}>
                {[
                  { label: "Business Unit",  value: item.business_unit },
                  { label: "Item Type",      value: item.item_type.replace(/_/g, " ") },
                  { label: "Submitter",      value: item.submitter_name },
                  { label: "Reviewer",       value: item.reviewer_name ?? "Unassigned" },
                  { label: "Submission Date", value: fmtDate(item.submitted_at) },
                  {
                    label: "Due Date",
                    value: item.due_date ? fmtDate(item.due_date) : "—",
                    highlight: item.is_overdue,
                  },
                  { label: "Age (days)",     value: `${item.age_days} day${item.age_days !== 1 ? "s" : ""}` },
                ].map((row, i) => (
                  <div key={row.label}
                       className={cn("flex flex-col gap-0.5 px-5 py-3", i > 0 && "border-t sm:border-t-0")}
                       style={{ borderColor: "var(--pg-row-border)" }}>
                    <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--pg-text-4)" }}>
                      {row.label}
                    </p>
                    <p className="text-[13px] font-semibold"
                       style={{ color: (row as { highlight?: boolean }).highlight ? "#dc2626" : "var(--pg-text-1)" }}>
                      {row.value}
                    </p>
                  </div>
                ))}
                <div className="flex flex-col gap-0.5 px-5 py-3 border-t" style={{ borderColor: "var(--pg-row-border)" }}>
                  <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--pg-text-4)" }}>
                    Compliance Required
                  </p>
                  {item.compliance_required ? (
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-violet-600" />
                      <span className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Yes</span>
                      {item.compliance_cleared ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#ecfdf5", color: "#059669" }}>
                          Cleared
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#fff7ed", color: "#ea580c" }}>
                          Pending
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>No</p>
                  )}
                </div>
              </div>
            </div>

            {/* Description card */}
            {item.description && (
              <div className="rounded-2xl overflow-hidden"
                   style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Description</h2>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[13px] leading-relaxed" style={{ color: "var(--pg-text-2)" }}>{item.description}</p>
                </div>
              </div>
            )}

            {/* Instructions card */}
            {item.instructions && (
              <div className="rounded-2xl overflow-hidden"
                   style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Review Instructions</h2>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: "var(--pg-text-2)" }}>{item.instructions}</p>
                </div>
              </div>
            )}

            {/* Linked references */}
            {item.linked_references && item.linked_references.length > 0 && (
              <div className="rounded-2xl overflow-hidden"
                   style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Linked References</h2>
                </div>
                <div className="px-5 py-4 flex flex-wrap gap-2">
                  {item.linked_references.map((ref, i) => (
                    <span key={i}
                          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1 rounded-lg"
                          style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)", border: "1px solid var(--pg-card-border)" }}>
                      <Paperclip className="w-3 h-3" />
                      {ref}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — 1/3 Action Panel */}
          <div className="space-y-4">

            {/* Current status display */}
            <div className="rounded-2xl overflow-hidden"
                 style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.color}40` }}>
              <div className="px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: statusCfg.color }}>Current Status</p>
                <p className="text-[18px] font-bold" style={{ color: statusCfg.color }}>{statusCfg.label}</p>
              </div>
            </div>

            {/* Action buttons */}
            {item.status === "completed" || item.status === "passed" ? (
              <div className="rounded-2xl px-4 py-5 flex flex-col items-center gap-2"
                   style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                <p className="text-[13px] font-semibold text-emerald-700">Review Completed</p>
                <p className="text-[11px] text-emerald-600 text-center">This item has been fully reviewed and closed.</p>
              </div>
            ) : availableActions.length > 0 ? (
              <div className="rounded-2xl overflow-hidden"
                   style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Available Actions</p>
                </div>
                <div className="p-4 space-y-2">
                  {availableActions.map(def => (
                    <button
                      key={def.action}
                      onClick={() => {
                        if (activeAction?.action === def.action) {
                          setActiveAction(null);
                        } else {
                          setActiveAction(def);
                          setActionComment("");
                        }
                      }}
                      className="w-full h-9 rounded-xl text-[12px] font-semibold transition-all"
                      style={{ background: def.bg, color: def.color }}
                    >
                      {def.label}
                    </button>
                  ))}

                  {/* Inline action form */}
                  {activeAction && (
                    <div className="mt-3 p-3 rounded-xl space-y-3"
                         style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                      <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{activeAction.description}</p>
                      <textarea
                        value={actionComment}
                        onChange={e => setActionComment(e.target.value)}
                        rows={3}
                        placeholder={activeAction.requiresComment === false ? "Comments (optional)…" : "Comments (required)…"}
                        className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none"
                        style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setActiveAction(null); setActionComment(""); }}
                          className="flex-1 h-8 rounded-lg text-[12px] font-medium"
                          style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (activeAction.requiresComment !== false && !actionComment.trim()) {
                              toast({ title: "Comment required", description: "Please add a comment before submitting.", variant: "destructive" });
                              return;
                            }
                            actionMut.mutate({ action: activeAction.action, comments: actionComment });
                          }}
                          disabled={actionMut.isPending}
                          className="flex-1 h-8 rounded-lg text-[12px] font-semibold text-white disabled:opacity-60"
                          style={{ background: activeAction.bg }}
                        >
                          {actionMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Submit"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Assign Reviewer */}
            <div className="rounded-2xl overflow-hidden"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <button
                className="w-full flex items-center justify-between px-4 py-3"
                onClick={() => setShowAssign(v => !v)}
              >
                <span className="text-[12px] font-semibold flex items-center gap-2" style={{ color: "var(--pg-text-1)" }}>
                  <User className="w-3.5 h-3.5" />
                  Assign Reviewer
                </span>
                {showAssign ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />
                             : <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />}
              </button>
              {showAssign && (
                <div className="px-4 pb-4 space-y-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                  <div className="pt-3">
                    <input
                      value={reviewerName}
                      onChange={e => setReviewerName(e.target.value)}
                      placeholder="Reviewer full name…"
                      className="w-full px-3 py-2 rounded-xl text-[12px] outline-none"
                      style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                    />
                  </div>
                  <button
                    onClick={() => { if (reviewerName.trim()) assignMut.mutate(reviewerName.trim()); }}
                    disabled={!reviewerName.trim() || assignMut.isPending}
                    className="w-full h-8 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#6d28d9,#4f46e5)" }}
                  >
                    {assignMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Assign"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Tab navigation ───────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 rounded-2xl"
             style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
          {(["checklist", "documents", "trail"] as const).map(tab => {
            const labels = { checklist: "Document Checklist", documents: "Documents", trail: "Audit Trail" };
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 h-9 rounded-xl text-[12px] font-semibold transition-all"
                style={active
                  ? { background: "var(--pg-card)", color: "var(--pg-text-1)", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }
                  : { color: "var(--pg-text-3)" }}
              >
                {labels[tab]}
                {tab === "documents" && documents.length > 0 && (
                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "#e0f2fe", color: "#0369a1" }}>
                    {documents.length}
                  </span>
                )}
                {tab === "trail" && actions.length > 0 && (
                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
                    {actions.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: Document Checklist ────────────────────────────────────── */}
        {activeTab === "checklist" && (
          <div className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <div>
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Document Checklist</h2>
                {totalCount > 0 && (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                    {validatedCount} of {totalCount} items validated
                  </p>
                )}
              </div>
              {totalCount === 0 && (
                <button
                  onClick={() => seedChecklistMut.mutate()}
                  disabled={seedChecklistMut.isPending}
                  className="h-8 px-4 rounded-lg text-[12px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#0369a1,#0284c7)" }}
                >
                  {seedChecklistMut.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : "Load Standard Checklist"}
                </button>
              )}
            </div>

            {/* Progress bar */}
            {totalCount > 0 && (
              <div className="px-5 pt-4">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--pg-muted-bg)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${progressPct}%`, background: progressPct === 100 ? "#059669" : "#0369a1" }}
                  />
                </div>
                <p className="text-[10px] mt-1 font-medium" style={{ color: "var(--pg-text-4)" }}>{progressPct}% complete</p>
              </div>
            )}

            {totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <FileText className="w-10 h-10" style={{ color: "var(--pg-text-4)" }} />
                <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-3)" }}>No checklist yet</p>
                <p className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>Load a standard checklist to get started.</p>
              </div>
            ) : (
              <div className="divide-y px-5 py-2" style={{ borderColor: "var(--pg-row-border)" }}>
                {[...checklist].sort((a, b) => a.seq - b.seq).map(c => {
                  const edit = getChecklistEdit(c);
                  const scfg = CHECKLIST_STATUS_CFG[edit.status] ?? { color: "#6b7280", bg: "#f3f4f6" };
                  const isDirty =
                    edit.status !== c.status ||
                    edit.reviewer_comments !== (c.reviewer_comments ?? "");
                  return (
                    <div key={c.id} className="py-4 space-y-3">
                      <div className="flex items-start gap-3">
                        {/* Status indicator */}
                        <div
                          className="w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center"
                          style={{ background: scfg.bg, border: `2px solid ${scfg.color}` }}
                        >
                          {(edit.status === "valid" || edit.status === "not_applicable") && (
                            <CheckCircle2 className="w-3 h-3" style={{ color: scfg.color }} />
                          )}
                          {edit.status === "invalid" && (
                            <XCircle className="w-3 h-3" style={{ color: scfg.color }} />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className={cn("text-[13px]", c.is_mandatory ? "font-bold" : "font-medium")}
                             style={{ color: "var(--pg-text-1)" }}>
                            {c.seq}. {c.label}
                            {c.is_mandatory && (
                              <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide"
                                    style={{ background: "#fef3c7", color: "#92400e" }}>Required</span>
                            )}
                          </p>
                          {c.validated_by_name && (
                            <p className="text-[10px] mt-0.5" style={{ color: "var(--pg-text-4)" }}>
                              Validated by {c.validated_by_name}
                              {c.validated_at && ` · ${fmtDate(c.validated_at)}`}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 ml-8">
                        {/* Status select */}
                        <select
                          value={edit.status}
                          onChange={e => patchChecklistEdit(c.id, { status: e.target.value })}
                          className="h-8 px-2 rounded-lg text-[12px] outline-none"
                          style={{
                            background: scfg.bg, color: scfg.color,
                            border: `1px solid ${scfg.color}60`,
                            fontWeight: 600,
                          }}
                        >
                          <option value="outstanding">Outstanding</option>
                          <option value="received">Received</option>
                          <option value="valid">Valid</option>
                          <option value="invalid">Invalid</option>
                          <option value="not_applicable">Not Applicable</option>
                        </select>

                        {/* Comment */}
                        <input
                          value={edit.reviewer_comments}
                          onChange={e => patchChecklistEdit(c.id, { reviewer_comments: e.target.value })}
                          placeholder="Reviewer comments…"
                          className="flex-1 min-w-[160px] h-8 px-3 rounded-lg text-[12px] outline-none"
                          style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                        />

                        {/* Save button */}
                        <button
                          onClick={() => updateChecklistMut.mutate({ cid: c.id, status: edit.status, reviewer_comments: edit.reviewer_comments })}
                          disabled={!isDirty || updateChecklistMut.isPending}
                          className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40"
                          style={{ background: isDirty ? "#059669" : "var(--pg-muted-bg)" }}
                        >
                          {updateChecklistMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: Documents ─────────────────────────────────────────────── */}
        {activeTab === "documents" && (
          <div className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Documents</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{documents.length} document{documents.length !== 1 ? "s" : ""} attached</p>
            </div>

            {documents.length > 0 ? (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {documents.map(doc => {
                  const typeCfg: Record<string, { color: string; bg: string; label: string }> = {
                    source_document:    { color: "#0369a1", bg: "#e0f2fe", label: "Source" },
                    supporting_evidence: { color: "#7c3aed", bg: "#ede9fe", label: "Evidence" },
                    bank_statement:     { color: "#059669", bg: "#ecfdf5", label: "Bank Stmt" },
                    instruction:        { color: "#d97706", bg: "#fffbeb", label: "Instruction" },
                    other:              { color: "#6b7280", bg: "#f3f4f6", label: "Other" },
                  };
                  const tc = typeCfg[doc.document_type] ?? typeCfg.other;
                  return (
                    <div key={doc.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                           style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                        <FileText className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>{doc.file_name}</p>
                        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                          {doc.uploader_name} · {fmtDate(doc.created_at)}
                          {doc.file_size > 0 && ` · ${fmtBytes(doc.file_size)}`}
                        </p>
                        {doc.notes && <p className="text-[11px] italic mt-0.5" style={{ color: "var(--pg-text-4)" }}>{doc.notes}</p>}
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: tc.bg, color: tc.color }}>{tc.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <File className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
                <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-3)" }}>No documents yet</p>
              </div>
            )}

            {/* Add Document form */}
            <div className="px-5 py-4 space-y-3" style={{ borderTop: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}>
              <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Add Document</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={addDocForm.file_name}
                  onChange={e => setAddDocForm(f => ({ ...f, file_name: e.target.value }))}
                  placeholder="File name…"
                  className="h-9 px-3 rounded-xl text-[12px] outline-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                />
                <select
                  value={addDocForm.document_type}
                  onChange={e => setAddDocForm(f => ({ ...f, document_type: e.target.value }))}
                  className="h-9 px-3 rounded-xl text-[12px] outline-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                >
                  <option value="source_document">Source Document</option>
                  <option value="supporting_evidence">Supporting Evidence</option>
                  <option value="bank_statement">Bank Statement</option>
                  <option value="instruction">Instruction</option>
                  <option value="other">Other</option>
                </select>
                <input
                  value={addDocForm.uploader_name}
                  onChange={e => setAddDocForm(f => ({ ...f, uploader_name: e.target.value }))}
                  placeholder="Uploader name…"
                  className="h-9 px-3 rounded-xl text-[12px] outline-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                />
                <textarea
                  value={addDocForm.notes}
                  onChange={e => setAddDocForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Notes…"
                  rows={1}
                  className="px-3 py-2 rounded-xl text-[12px] outline-none resize-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    if (!addDocForm.file_name.trim()) {
                      toast({ title: "File name required", variant: "destructive" });
                      return;
                    }
                    addDocMut.mutate(addDocForm);
                  }}
                  disabled={addDocMut.isPending}
                  className="h-9 px-5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-60 flex items-center gap-2"
                  style={{ background: "linear-gradient(135deg,#0369a1,#0284c7)" }}
                >
                  {addDocMut.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <><Upload className="w-3.5 h-3.5" /> Add Document</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: Audit Trail ───────────────────────────────────────────── */}
        {activeTab === "trail" && (
          <div className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Audit Trail</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Chronological history of all actions (newest first)</p>
            </div>

            {actions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Activity className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
                <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-3)" }}>No actions recorded yet</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {[...actions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(act => {
                  const actionColor = ACTION_COLORS[act.action] ?? "#6b7280";
                  return (
                    <div key={act.id} className="flex items-start gap-4 px-5 py-4">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                           style={{ background: actionColor + "18", border: `1px solid ${actionColor}40` }}>
                        <Activity className="w-3.5 h-3.5" style={{ color: actionColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{act.actor_name}</p>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: actionColor + "18", color: actionColor }}>
                            {act.action.replace(/_/g, " ")}
                          </span>
                          {act.previous_status && act.new_status && act.previous_status !== act.new_status && (
                            <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                              {act.previous_status} → {act.new_status}
                            </span>
                          )}
                        </div>
                        {act.comments && (
                          <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--pg-text-2)" }}>{act.comments}</p>
                        )}
                        <p className="text-[10px] mt-1" style={{ color: "var(--pg-text-4)" }}>{fmtDateTime(act.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Exceptions Panel ─────────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Exceptions</h2>
              {exceptions.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: "#fee2e2", color: "#dc2626" }}>
                  {exceptions.length}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowExceptionForm(v => !v)}
              className="h-8 px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1.5"
              style={{ background: "#fff7ed", color: "#ea580c", border: "1px solid #fed7aa" }}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Raise Exception
            </button>
          </div>

          {/* Exception list */}
          {exceptions.length > 0 ? (
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {exceptions.map(ex => {
                const sc = SEVERITY_CFG[ex.severity] ?? { color: "#6b7280", bg: "#f3f4f6" };
                const exStatusCfg = STATUS_CFG[ex.status] ?? { label: ex.status, color: "#6b7280", bg: "#f3f4f6" };
                return (
                  <div key={ex.id} className="px-5 py-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>{ex.title}</p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: sc.bg, color: sc.color }}>
                        {ex.severity.charAt(0).toUpperCase() + ex.severity.slice(1)} severity
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: exStatusCfg.bg, color: exStatusCfg.color }}>
                        {exStatusCfg.label}
                      </span>
                    </div>
                    {ex.description && (
                      <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{ex.description}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                      {ex.owner_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> Owner: {ex.owner_name}
                        </span>
                      )}
                      {ex.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Due: {fmtDate(ex.due_date)}
                        </span>
                      )}
                      <span>Raised by {ex.raised_by_name}</span>
                    </div>
                    {ex.corrective_action && (
                      <div className="px-3 py-2 rounded-xl"
                           style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--pg-text-4)" }}>Corrective Action</p>
                        <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{ex.corrective_action}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-1">
              <Flag className="w-7 h-7" style={{ color: "var(--pg-text-4)" }} />
              <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>No exceptions raised</p>
            </div>
          )}

          {/* Raise Exception Form */}
          {showExceptionForm && (
            <div className="px-5 py-4 space-y-3" style={{ borderTop: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}>
              <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>New Exception</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={exForm.title}
                  onChange={e => setExForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Exception title (required)…"
                  className="h-9 px-3 rounded-xl text-[12px] outline-none sm:col-span-2"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                />
                <textarea
                  value={exForm.description}
                  onChange={e => setExForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Description (required)…"
                  rows={2}
                  className="px-3 py-2 rounded-xl text-[12px] outline-none resize-none sm:col-span-2"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                />
                <select
                  value={exForm.severity}
                  onChange={e => setExForm(f => ({ ...f, severity: e.target.value }))}
                  className="h-9 px-3 rounded-xl text-[12px] outline-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <input
                  value={exForm.owner_name}
                  onChange={e => setExForm(f => ({ ...f, owner_name: e.target.value }))}
                  placeholder="Owner name…"
                  className="h-9 px-3 rounded-xl text-[12px] outline-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                />
                <textarea
                  value={exForm.corrective_action}
                  onChange={e => setExForm(f => ({ ...f, corrective_action: e.target.value }))}
                  placeholder="Corrective action…"
                  rows={2}
                  className="px-3 py-2 rounded-xl text-[12px] outline-none resize-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--pg-text-4)" }}>Due Date</label>
                  <input
                    type="date"
                    value={exForm.due_date}
                    onChange={e => setExForm(f => ({ ...f, due_date: e.target.value }))}
                    className="h-9 px-3 rounded-xl text-[12px] outline-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowExceptionForm(false); setExForm({ title: "", description: "", severity: "medium", owner_name: "", corrective_action: "", due_date: "" }); }}
                  className="h-9 px-4 rounded-xl text-[12px] font-medium"
                  style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!exForm.title.trim() || !exForm.description.trim()) {
                      toast({ title: "Title and description required", variant: "destructive" });
                      return;
                    }
                    raiseExceptionMut.mutate(exForm);
                  }}
                  disabled={raiseExceptionMut.isPending}
                  className="h-9 px-5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#ea580c,#dc2626)" }}
                >
                  {raiseExceptionMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Raise Exception"}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
