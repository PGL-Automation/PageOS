"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api/client";
import { components } from "@/lib/api/types";
import {
  ChevronLeft, CheckCircle2, XCircle, AlertCircle, Shield,
  Flag, User, Phone, Mail, Building2, DollarSign, FileText,
  Loader2, Send, Eye, Clock, AlertTriangle, Lock,
  StickyNote, MessageSquare, ChevronDown, ChevronUp,
  Briefcase, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type CaseDetails    = components["schemas"]["CaseDetails"];
type OnboardingCase = components["schemas"]["OnboardingCase"];
type RequirementInstance = components["schemas"]["RequirementInstance"];

// ── Types ──────────────────────────────────────────────────────────────────────

type ComplianceCheck = {
  id: string; case_id: string;
  check_type: string; outcome: "pass" | "fail" | "needs_info";
  notes: string; source: string;
  performed_by: string; performer_name: string;
  performed_at: string;
};

type CaseNote = {
  id: string; author_name: string; note_type: string;
  content: string; created_at: string;
};

// ── Compliance check config ────────────────────────────────────────────────────

const ALL_CHECKS: { key: string; label: string; description: string }[] = [
  { key: "pep_screening",          label: "PEP Screening",           description: "Check if the client is a Politically Exposed Person" },
  { key: "sanctions_screening",    label: "Sanctions Screening",      description: "Verify against OFAC, UN, EU and local watchlists" },
  { key: "source_of_funds",        label: "Source of Funds",          description: "Validate the legitimacy of declared source of funds" },
  { key: "id_verification",        label: "ID Verification",          description: "Authenticate government-issued identity document" },
  { key: "bvn_validation",         label: "BVN Validation",           description: "Validate Bank Verification Number against NIBSS" },
  { key: "address_verification",   label: "Address Verification",     description: "Confirm residential address via utility bill or bank statement" },
  { key: "duplicate_client_check", label: "Duplicate Client Check",   description: "Confirm this is not an existing client under another profile" },
];

const OUTCOME_CFG = {
  pass:       { label: "Pass",       color: "#059669", bg: "#ecfdf5", Icon: CheckCircle2 },
  fail:       { label: "Fail",       color: "#dc2626", bg: "#fef2f2", Icon: XCircle      },
  needs_info: { label: "Needs Info", color: "#d97706", bg: "#fffbeb", Icon: AlertCircle  },
};

const STATE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  submitted:         { label: "Submitted",         color: "#0369a1", bg: "#e0f2fe" },
  in_review:         { label: "In Review",         color: "#E05500", bg: "#fff0e0" },
  compliance_review: { label: "Compliance Review", color: "#6d28d9", bg: "#ede9fe" },
  approved:          { label: "Approved",          color: "#065f46", bg: "#d1fae5" },
  rejected:          { label: "Rejected",          color: "#991b1b", bg: "#fee2e2" },
  returned:          { label: "Returned to WM",    color: "#92400e", bg: "#fef3c7" },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function CheckRow({
  checkDef, existing, onRecord, readOnly,
}: {
  checkDef: typeof ALL_CHECKS[number];
  existing?: ComplianceCheck;
  onRecord: (key: string, outcome: "pass" | "fail" | "needs_info", notes: string) => Promise<void>;
  readOnly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [outcome, setOutcome]   = useState<"pass" | "fail" | "needs_info">("pass");
  const [notes, setNotes]       = useState("");
  const [saving, setSaving]     = useState(false);

  async function submit() {
    setSaving(true);
    try { await onRecord(checkDef.key, outcome, notes); setExpanded(false); setNotes(""); }
    finally { setSaving(false); }
  }

  const cfg = existing ? OUTCOME_CFG[existing.outcome] ?? OUTCOME_CFG.needs_info : null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pg-card-border)" }}>
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ background: existing ? (cfg?.bg + "60") : "var(--pg-muted-bg)" }}
              onClick={() => !readOnly && setExpanded(e => !e)}>
        {/* Status icon */}
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
             style={{ background: cfg?.bg ?? "var(--pg-card)", border: `1px solid ${existing ? cfg!.color + "40" : "var(--pg-card-border)"}` }}>
          {existing && cfg
            ? <cfg.Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
            : <Clock className="w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{checkDef.label}</p>
            {existing && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: cfg!.bg, color: cfg!.color }}>{cfg!.label}</span>
            )}
            {!existing && <span className="text-[10px] font-medium" style={{ color: "var(--pg-text-4)" }}>Pending</span>}
          </div>
          {existing?.performer_name && (
            <p className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>
              {existing.performer_name} · {new Date(existing.performed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
          {existing?.notes && (
            <p className="text-[11px] italic mt-0.5" style={{ color: "var(--pg-text-2)" }}>&ldquo;{existing.notes}&rdquo;</p>
          )}
        </div>
        {!readOnly && (
          existing
            ? <span className="text-[10px] font-medium shrink-0" style={{ color: "var(--pg-text-4)" }}>
                {expanded ? "▲ Edit" : "▼ Update"}
              </span>
            : <span className="text-[10px] font-semibold text-violet-600 shrink-0">+ Record</span>
        )}
      </button>

      {/* Inline record form */}
      {!readOnly && expanded && (
        <div className="px-4 py-3 space-y-3" style={{ borderTop: "1px solid var(--pg-row-border)", background: "var(--pg-card)" }}>
          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{checkDef.description}</p>
          <div className="grid grid-cols-3 gap-2">
            {(["pass", "fail", "needs_info"] as const).map(o => {
              const c = OUTCOME_CFG[o];
              return (
                <button key={o} type="button" onClick={() => setOutcome(o)}
                        className="flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-semibold transition-all"
                        style={outcome === o
                          ? { background: c.bg, border: `2px solid ${c.color}`, color: c.color }
                          : { border: "1px solid var(--pg-card-border)", color: "var(--pg-text-3)" }}>
                  <c.Icon className="w-3.5 h-3.5" /> {c.label}
                </button>
              );
            })}
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    placeholder="Notes, findings, or source reference…"
                    className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setExpanded(false)} type="button"
                    className="h-8 px-3 rounded-lg text-[12px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button onClick={submit} disabled={saving}
                    className="h-8 px-4 rounded-lg text-[12px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#6d28d9,#4f46e5)" }}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Check"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Application info section (compact read-only) ───────────────────────────────

function AppInfo({ app }: { app: CaseDetails["application"] }) {
  const [expanded, setExpanded] = useState(false);
  if (!app) return null;

  const rows: { label: string; value: string | undefined }[] = [
    { label: "Full Name",          value: app.full_name },
    { label: "Date of Birth",      value: app.date_of_birth ? new Date(app.date_of_birth).toLocaleDateString("en-GB") : undefined },
    { label: "Place of Birth",     value: app.place_of_birth },
    { label: "Country of Origin",  value: app.country_of_origin },
    { label: "Address",            value: app.residential_address },
    { label: "Phone",              value: app.phone_numbers?.[0] },
    { label: "Email",              value: app.email },
    { label: "BVN",                value: app.bvn },
    { label: "TIN",                value: app.tin },
    { label: "Employer",           value: app.employer },
    { label: "Source of Funds",    value: app.source_of_funds },
    { label: "Source of Wealth",   value: app.source_of_wealth },
    { label: "Investment Purpose", value: app.investment_purpose },
    { label: "Investment Amount",  value: app.investment_amount_kobo ? `₦${(app.investment_amount_kobo / 100).toLocaleString()}` : undefined },
    { label: "Bank",               value: app.bank_name },
    { label: "Account Number",     value: app.bank_account_number },
    { label: "Next of Kin",        value: app.next_of_kin_name },
    { label: "NOK Phone",          value: app.next_of_kin_phone },
  ];

  const visible = expanded ? rows : rows.slice(0, 8);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Application Data</h2>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Read-only — submitted by wealth manager</p>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
        {visible.filter(r => r.value).map(r => (
          <div key={r.label} className="grid grid-cols-2 gap-2 px-5 py-2.5">
            <p className="text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}>{r.label}</p>
            <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-1)" }}>{r.value}</p>
          </div>
        ))}
      </div>
      {rows.filter(r => r.value).length > 8 && (
        <button onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-center gap-1.5 py-3 text-[12px] font-medium transition-colors hover:bg-[var(--pg-muted-bg)]"
                style={{ borderTop: "1px solid var(--pg-row-border)", color: "#6d28d9" }}>
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
            : <><ChevronDown className="w-3.5 h-3.5" /> Show {rows.filter(r => r.value).length - 8} more fields</>}
        </button>
      )}
      {/* Flags */}
      <div className="flex flex-wrap gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
        {app.is_pep && (
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}>
            <AlertTriangle className="w-3 h-3" /> PEP Declared
          </span>
        )}
        {app.is_us_person && (
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "#fff7ed", color: "#c2410c" }}>
            <Flag className="w-3 h-3" /> US Person
          </span>
        )}
        {app.declaration_tnc_accepted && (
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "#ecfdf5", color: "#059669" }}>
            <CheckCircle2 className="w-3 h-3" /> T&amp;C Accepted
          </span>
        )}
      </div>
    </div>
  );
}

// ── Documents panel ───────────────────────────────────────────────────────────

function DocumentsPanel({ requirements }: { requirements: RequirementInstance[] }) {
  const docs = requirements.filter(r =>
    (r.status ?? r.Status) === "satisfied" && (r.document_id ?? r.DocumentID)
  );
  const pending = requirements.filter(r => (r.status ?? r.Status) === "pending");

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>KYC Documents</h2>
        <span className="text-[11px] font-medium"
              style={{ color: docs.length === requirements.filter(r => (r.obligation ?? r.Obligation) === "required").length ? "#059669" : "var(--pg-text-3)" }}>
          {docs.length}/{requirements.length} uploaded
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
        {requirements.map(req => {
          const isSatisfied = (req.status ?? req.Status) === "satisfied";
          const docId       = req.document_id ?? req.DocumentID;
          const label       = req.label ?? req.Label ?? req.requirement_key ?? req.RequirementKey ?? "";
          return (
            <div key={req.id ?? req.ID} className="flex items-center gap-3 px-5 py-3">
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0")}
                   style={{ background: isSatisfied ? "#ecfdf5" : "#f1f5f9" }}>
                {isSatisfied
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  : <Clock className="w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />}
              </div>
              <p className="flex-1 text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{label}</p>
              {isSatisfied && docId && (
                <a href={`${BASE}/api/v1/documents/${docId}/download`}
                   target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold text-violet-600 hover:bg-violet-50 transition-colors">
                  <Eye className="w-3 h-3" /> View
                </a>
              )}
              {!isSatisfied && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "#fef9c3", color: "#92400e" }}>Missing</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Decision panel ────────────────────────────────────────────────────────────

type Decision = "approve" | "reject" | "return" | null;

function DecisionPanel({
  caseId, state, checks, onDecision,
}: {
  caseId: string;
  state: string;
  checks: ComplianceCheck[];
  onDecision: () => void;
}) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<Decision>(null);
  const [reason, setReason]     = useState("");
  const [saving, setSaving]     = useState(false);

  const passedAll   = ALL_CHECKS.every(c => checks.some(ch => ch.check_type === c.key && ch.outcome === "pass"));
  const hasFailed   = checks.some(ch => ch.outcome === "fail");
  const completedN  = checks.filter(ch => ALL_CHECKS.some(c => c.key === ch.check_type)).length;
  const isReviewable = ["compliance_review", "in_review", "submitted"].includes(state);

  async function execute() {
    if (!decision) return;
    if ((decision === "reject" || decision === "return") && !reason.trim()) {
      toast({ title: "Please provide a reason", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (decision === "return") body.notes = reason;
      if (decision === "reject") body.reason = reason;
      const res = await fetch(`${BASE}/api/v1/onboarding/cases/${caseId}/${decision}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: Object.keys(body).length ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? `${decision} failed`);
      }
      toast({
        title: decision === "approve" ? "Case Approved ✓" : decision === "return" ? "Returned to WM" : "Case Rejected",
        description: decision === "approve"
          ? "The client has been approved for onboarding."
          : decision === "return"
          ? "The wealth manager has been notified."
          : "The case has been closed as rejected.",
      });
      setDecision(null);
      setReason("");
      onDecision();
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!isReviewable) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3.5 rounded-xl"
           style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
        <Lock className="w-4 h-4 shrink-0" style={{ color: "var(--pg-text-4)" }} />
        <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
          Case is in &ldquo;<strong>{STATE_CFG[state]?.label ?? state}</strong>&rdquo; state — no actions available.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Decision</h2>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          {completedN}/{ALL_CHECKS.length} checks completed
          {hasFailed && <span className="ml-1.5 text-red-600 font-semibold">· {checks.filter(c => c.outcome === "fail").length} failed</span>}
        </p>
      </div>
      <div className="p-5 space-y-4">
        {/* Decision buttons */}
        {!decision && (
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setDecision("approve")}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all border-2 hover:border-emerald-500"
                    style={{ background: "#ecfdf5", border: passedAll ? "2px solid #059669" : "2px solid #a7f3d0" }}>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-[11px] font-semibold text-emerald-700">Approve</span>
            </button>
            <button onClick={() => setDecision("return")}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all border-2 hover:border-amber-500"
                    style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
              <RefreshCw className="w-5 h-5 text-amber-600" />
              <span className="text-[11px] font-semibold text-amber-700">Return to WM</span>
            </button>
            <button onClick={() => setDecision("reject")}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all border-2 hover:border-red-500"
                    style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
              <XCircle className="w-5 h-5 text-red-600" />
              <span className="text-[11px] font-semibold text-red-700">Reject</span>
            </button>
          </div>
        )}

        {/* Confirmation form */}
        {decision && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                 style={{
                   background: decision === "approve" ? "#ecfdf5" : decision === "reject" ? "#fef2f2" : "#fffbeb",
                   border: `1px solid ${decision === "approve" ? "#a7f3d0" : decision === "reject" ? "#fecaca" : "#fde68a"}`,
                 }}>
              {decision === "approve"  && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              {decision === "return"   && <RefreshCw    className="w-4 h-4 text-amber-500" />}
              {decision === "reject"   && <XCircle      className="w-4 h-4 text-red-600" />}
              <p className="text-[12px] font-semibold" style={{ color: decision === "approve" ? "#065f46" : decision === "reject" ? "#991b1b" : "#92400e" }}>
                {decision === "approve" ? "Confirm approval" : decision === "return" ? "Return to wealth manager" : "Reject this case"}
              </p>
            </div>

            {decision === "approve" && !passedAll && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700">Not all checks have passed. Approving will override the checklist.</p>
              </div>
            )}

            {(decision === "return" || decision === "reject") && (
              <div>
                <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                  {decision === "return" ? "Return notes (required)" : "Rejection reason (required)"}
                </label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                          placeholder={decision === "return" ? "Describe what needs to be corrected or provided…" : "State the reason for rejection…"}
                          className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none"
                          style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setDecision(null); setReason(""); }}
                      className="flex-1 h-9 rounded-xl text-[12px] font-medium"
                      style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
              <button onClick={execute} disabled={saving}
                      className="flex-1 h-9 rounded-xl text-[12px] font-semibold text-white disabled:opacity-60"
                      style={{
                        background: decision === "approve"
                          ? "linear-gradient(135deg,#059669,#047857)"
                          : decision === "reject"
                          ? "linear-gradient(135deg,#dc2626,#b91c1c)"
                          : "linear-gradient(135deg,#d97706,#b45309)",
                      }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Notes panel ───────────────────────────────────────────────────────────────

function CaseNotesPanel({ caseId }: { caseId: string }) {
  const { toast }       = useToast();
  const queryClient     = useQueryClient();
  const [content, setContent]   = useState("");
  const [noteType, setNoteType] = useState("compliance");
  const [saving, setSaving]     = useState(false);

  const { data: notes = [] } = useQuery<CaseNote[]>({
    queryKey: ["case-notes", caseId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/onboarding/cases/${caseId}/notes`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []);
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/v1/onboarding/cases/${caseId}/notes`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_type: noteType, content: content.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      queryClient.invalidateQueries({ queryKey: ["case-notes", caseId] });
      setContent("");
      toast({ title: "Note saved" });
    } catch { toast({ title: "Failed to save note", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  const NOTE_TYPE_CFG = {
    compliance: { label: "Compliance Note",  color: "#6d28d9", bg: "#ede9fe" },
    internal:   { label: "Internal Note",    color: "#475569", bg: "#f1f5f9" },
    client:     { label: "Client Follow-up", color: "#0369a1", bg: "#e0f2fe" },
  };

  function timeAgo(d: string) {
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Notes</h2>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Visible to WM and compliance</p>
      </div>
      <form onSubmit={submit} className="p-4 space-y-3" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div className="flex gap-1.5">
          {(["compliance", "internal", "client"] as const).map(t => {
            const cfg = NOTE_TYPE_CFG[t];
            return (
              <button key={t} type="button" onClick={() => setNoteType(t)}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-medium transition-all"
                      style={noteType === t
                        ? { background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }
                        : { border: "1px solid var(--pg-card-border)", color: "var(--pg-text-3)" }}>
                {cfg.label}
              </button>
            );
          })}
        </div>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={2}
                  placeholder="Add a compliance note or follow-up…"
                  className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        <div className="flex justify-end">
          <button type="submit" disabled={saving || !content.trim()}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#6d28d9,#4f46e5)" }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Add Note
          </button>
        </div>
      </form>
      <div className="divide-y max-h-64 overflow-y-auto" style={{ borderColor: "var(--pg-row-border)" }}>
        {notes.length === 0
          ? <div className="px-5 py-6 text-center"><p className="text-[12px]" style={{ color: "var(--pg-text-4)" }}>No notes yet</p></div>
          : notes.map(n => {
            const cfg = NOTE_TYPE_CFG[n.note_type as keyof typeof NOTE_TYPE_CFG] ?? NOTE_TYPE_CFG.internal;
            return (
              <div key={n.id} className="px-5 py-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  <span className="text-[11px] font-medium" style={{ color: "var(--pg-text-2)" }}>{n.author_name}</span>
                  <span className="text-[10px] ml-auto" style={{ color: "var(--pg-text-4)" }}>{timeAgo(n.created_at)}</span>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--pg-text-1)" }}>{n.content}</p>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ComplianceCasePage() {
  const { caseId }   = useParams<{ caseId: string }>();
  const router       = useRouter();
  const queryClient  = useQueryClient();
  const { toast }    = useToast();

  const { data: details, isLoading } = useQuery<CaseDetails>({
    queryKey: ["case-details", caseId],
    queryFn: async () => {
      const { data, error } = await api.GET("/onboarding/cases/{id}", {
        params: { path: { id: caseId } },
      });
      if (error || !data) throw new Error("Case not found");
      return data as CaseDetails;
    },
  });

  const { data: complianceChecks = [], refetch: refetchChecks } = useQuery<ComplianceCheck[]>({
    queryKey: ["compliance-checks", caseId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/onboarding/cases/${caseId}/compliance`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []);
    },
  });

  async function recordCheck(key: string, outcome: "pass" | "fail" | "needs_info", notes: string) {
    const res = await fetch(`${BASE}/api/v1/onboarding/cases/${caseId}/compliance`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_type: key, outcome, notes }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message ?? "Failed to record check");
    }
    await refetchChecks();
    toast({ title: "Check recorded" });
  }

  function onDecision() {
    queryClient.invalidateQueries({ queryKey: ["case-details", caseId] });
    queryClient.invalidateQueries({ queryKey: ["compliance-cases-all"] });
    router.push("/compliance");
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  if (!details) return null;

  const c    = details.case!;
  const app  = details.application;
  const reqs = details.requirements ?? [];
  const st   = STATE_CFG[c.State] ?? { label: c.State, color: "#64748b", bg: "#f1f5f9" };

  const byType    = Object.fromEntries(complianceChecks.map(ch => [ch.check_type, ch]));
  const done      = ALL_CHECKS.filter(ch => byType[ch.key]).length;
  const passedAll = ALL_CHECKS.every(ch => byType[ch.key]?.outcome === "pass");
  const isReadOnly = !["compliance_review", "in_review", "submitted"].includes(c.State);

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/compliance" className="flex items-center gap-1.5 text-[12px] mb-2" style={{ color: "var(--pg-text-3)" }}>
            <ChevronLeft className="w-3.5 h-3.5" /> Compliance Queue
          </Link>
          <h1 className="text-[18px] font-bold font-mono" style={{ color: "var(--pg-text-1)" }}>
            {app?.full_name ?? caseId.slice(0, 8) + "…"}
          </h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[11px] capitalize font-medium px-2 py-0.5 rounded-full"
                  style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>{c.ClientType}</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: st.bg, color: st.color }}>{st.label}</span>
            {c.RiskFlag && (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "#fee2e2", color: "#dc2626" }}>
                <Flag className="w-2.5 h-2.5" /> High Risk
              </span>
            )}
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: passedAll ? "#ecfdf5" : "#f1f5f9", color: passedAll ? "#059669" : "#475569" }}>
              {done}/{ALL_CHECKS.length} checks
            </span>
          </div>
        </div>
        {/* Compliance progress */}
        <div className="hidden md:flex items-center gap-2">
          <div className="w-28 h-2 rounded-full" style={{ background: "var(--pg-muted-bg)" }}>
            <div className="h-2 rounded-full transition-all"
                 style={{ width: `${(done / ALL_CHECKS.length) * 100}%`, background: passedAll ? "#059669" : "linear-gradient(90deg,#6d28d9,#FF6600)" }} />
          </div>
          <span className="text-[12px] font-bold" style={{ color: passedAll ? "#059669" : "#6d28d9" }}>
            {Math.round((done / ALL_CHECKS.length) * 100)}%
          </span>
        </div>
      </div>

      {/* Return/risk banners */}
      {c.ReturnNotes && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-amber-800">Previously returned</p>
            <p className="text-[12px] text-amber-700">{c.ReturnNotes}</p>
          </div>
        </div>
      )}
      {c.RiskFlag && c.RiskNotes && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
          <Flag className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-red-800">Risk flag</p>
            <p className="text-[12px] text-red-700">{c.RiskNotes}</p>
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-5 gap-5">

        {/* Left: Application + Documents (3/5) */}
        <div className="xl:col-span-3 space-y-5">
          <AppInfo app={app} />
          {reqs.length > 0 && <DocumentsPanel requirements={reqs} />}
        </div>

        {/* Right: Checklist + Decision + Notes (2/5) */}
        <div className="xl:col-span-2 space-y-5">

          {/* Compliance checklist */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Compliance Checklist</h2>
              {passedAll && done === ALL_CHECKS.length && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ecfdf5", color: "#059669" }}>
                  <CheckCircle2 className="w-3 h-3" /> All Passed
                </span>
              )}
            </div>
            <div className="p-3 space-y-2">
              {ALL_CHECKS.map(chk => (
                <CheckRow key={chk.key}
                          checkDef={chk}
                          existing={byType[chk.key]}
                          onRecord={recordCheck}
                          readOnly={isReadOnly} />
              ))}
            </div>
          </div>

          <DecisionPanel
            caseId={caseId}
            state={c.State}
            checks={complianceChecks}
            onDecision={onDecision}
          />

          <CaseNotesPanel caseId={caseId} />
        </div>
      </div>
    </div>
  );
}
