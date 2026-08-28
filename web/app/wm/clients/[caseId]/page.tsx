"use client";

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api/client";
import { components } from "@/lib/api/types";
import {
  ChevronLeft, CheckCircle2, XCircle, AlertCircle, Clock, Shield,
  FileText, Upload, User, Building2, Phone, Mail, DollarSign,
  MessageSquare, Send, Plus, Loader2, AlertTriangle, Eye,
  ArrowRight, RefreshCw, ChevronRight, Info, Briefcase,
  StickyNote, Flag, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type CaseDetails = components["schemas"]["CaseDetails"];
type RequirementInstance = components["schemas"]["RequirementInstance"];

// ── Types ──────────────────────────────────────────────────────────────────────

type ComplianceCheck = {
  id: string; case_id: string;
  check_type: string; outcome: string; // pass | fail | needs_info
  notes: string; source: string;
  performed_by: string; performer_name: string;
  performed_at: string;
};

type CaseNote = {
  id: string; case_id: string; author_id: string; author_name: string;
  note_type: string; content: string; created_at: string;
};

// ── Check metadata ─────────────────────────────────────────────────────────────

const ALL_CHECKS: { key: string; label: string; icon: React.ElementType }[] = [
  { key: "pep_screening",          label: "PEP Screening",          icon: Shield      },
  { key: "sanctions_screening",    label: "Sanctions Screening",     icon: AlertTriangle },
  { key: "source_of_funds",        label: "Source of Funds",         icon: DollarSign  },
  { key: "id_verification",        label: "ID Verification",         icon: User        },
  { key: "bvn_validation",         label: "BVN Validation",          icon: Briefcase   },
  { key: "address_verification",   label: "Address Verification",    icon: Building2   },
  { key: "duplicate_client_check", label: "Duplicate Client Check",  icon: RefreshCw   },
];

const OUTCOME_CFG = {
  pass:       { label: "Passed",       color: "#059669", bg: "#ecfdf5", Icon: CheckCircle2  },
  fail:       { label: "Failed",       color: "#dc2626", bg: "#fef2f2", Icon: XCircle       },
  needs_info: { label: "Needs Info",   color: "#d97706", bg: "#fffbeb", Icon: AlertCircle   },
  pending:    { label: "Pending",      color: "#94a3b8", bg: "#f1f5f9", Icon: Clock         },
};

const CASE_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:             { label: "Draft",             color: "#475569", bg: "#f1f5f9" },
  submitted:         { label: "Submitted",         color: "#0369a1", bg: "#e0f2fe" },
  in_review:         { label: "Under Review",      color: "#E05500", bg: "#fff0e0" },
  compliance_review: { label: "Compliance Review", color: "#6d28d9", bg: "#ede9fe" },
  approved:          { label: "Approved",          color: "#065f46", bg: "#d1fae5" },
  rejected:          { label: "Rejected",          color: "#991b1b", bg: "#fee2e2" },
  returned:          { label: "Returned to WM",    color: "#92400e", bg: "#fef3c7" },
};

const NOTE_TYPE_CFG = {
  internal:   { label: "Internal Note",       color: "#475569", bg: "#f1f5f9",  Icon: StickyNote   },
  client:     { label: "Client Follow-up",    color: "#0369a1", bg: "#e0f2fe",  Icon: Phone        },
  compliance: { label: "Compliance Follow-up",color: "#6d28d9", bg: "#ede9fe",  Icon: Shield       },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── Compliance tracker ─────────────────────────────────────────────────────────

function ComplianceTracker({ checks }: { checks: ComplianceCheck[] }) {
  const byType = Object.fromEntries(checks.map(c => [c.check_type, c]));
  const done   = ALL_CHECKS.filter(c => byType[c.key]).length;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Compliance Status</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {done}/{ALL_CHECKS.length} checks completed
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 rounded-full" style={{ background: "var(--pg-muted-bg)" }}>
              <div className="h-2 rounded-full transition-all" style={{
                width: `${(done / ALL_CHECKS.length) * 100}%`,
                background: done === ALL_CHECKS.length ? "#059669" : "linear-gradient(90deg,#FF6600,#7c3aed)",
              }} />
            </div>
            <span className="text-[11px] font-bold" style={{ color: done === ALL_CHECKS.length ? "#059669" : "#FF6600" }}>
              {Math.round((done / ALL_CHECKS.length) * 100)}%
            </span>
          </div>
        </div>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
        {ALL_CHECKS.map(({ key, label, icon: Icon }) => {
          const check = byType[key];
          const outcomeKey = check?.outcome ?? "pending";
          const cfg = OUTCOME_CFG[outcomeKey as keyof typeof OUTCOME_CFG] ?? OUTCOME_CFG.pending;
          return (
            <div key={key} className="flex items-start gap-3.5 px-5 py-3.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                   style={{ background: cfg.bg }}>
                <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[12.5px] font-medium" style={{ color: "var(--pg-text-1)" }}>{label}</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                </div>
                {check ? (
                  <div className="mt-0.5 space-y-0.5">
                    {check.performer_name && (
                      <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                        By {check.performer_name} · {new Date(check.performed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    )}
                    {check.notes && (
                      <p className="text-[11px] italic" style={{ color: "var(--pg-text-2)" }}>&ldquo;{check.notes}&rdquo;</p>
                    )}
                    {check.source && (
                      <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>Source: {check.source}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-4)" }}>Not yet performed</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Requirements panel ─────────────────────────────────────────────────────────

function RequirementsPanel({ requirements }: { requirements: RequirementInstance[] }) {
  const byCategory = requirements.reduce<Record<string, RequirementInstance[]>>((acc, r) => {
    const cat = r.category ?? "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  const total     = requirements.length;
  const satisfied = requirements.filter(r => r.status === "satisfied").length;

  const REQ_STATUS = {
    satisfied:      { color: "#059669", bg: "#ecfdf5", Icon: CheckCircle2 },
    pending:        { color: "#d97706", bg: "#fffbeb", Icon: Clock        },
    not_applicable: { color: "#94a3b8", bg: "#f1f5f9", Icon: Info         },
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Documents & Requirements</h2>
        <span className="text-[11px] font-medium" style={{ color: satisfied === total ? "#059669" : "var(--pg-text-3)" }}>
          {satisfied}/{total} satisfied
        </span>
      </div>
      <div>
        {Object.entries(byCategory).map(([cat, reqs]) => (
          <div key={cat}>
            <div className="px-5 py-2.5" style={{ background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>{cat}</p>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {reqs.map(req => {
                const st = REQ_STATUS[req.status as keyof typeof REQ_STATUS] ?? REQ_STATUS.pending;
                return (
                  <div key={req.id} className="flex items-center gap-3 px-5 py-3">
                    <st.Icon className="w-4 h-4 shrink-0" style={{ color: st.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-1)" }}>{req.label}</p>
                      <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                        {req.obligation} · {req.requirement_key}
                      </p>
                    </div>
                    {req.status === "satisfied" && req.document_id && (
                      <a href={`${BASE}/api/v1/documents/${req.document_id}/download`}
                         target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium text-orange-600 hover:bg-orange-50 transition-colors">
                        <Eye className="w-3 h-3" /> View
                      </a>
                    )}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={{ background: st.bg, color: st.color }}>
                      {req.status === "not_applicable" ? "N/A" : req.status === "satisfied" ? "Done" : "Pending"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Notes panel ────────────────────────────────────────────────────────────────

function NotesPanel({ caseId, notes, onAdd }: {
  caseId: string;
  notes: CaseNote[];
  onAdd: (type: string, content: string) => Promise<void>;
}) {
  const [noteType, setNoteType]   = useState("internal");
  const [content, setContent]     = useState("");
  const [saving, setSaving]       = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try { await onAdd(noteType, content.trim()); setContent(""); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Follow-up & Notes</h2>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Log calls, emails and follow-ups</p>
      </div>

      {/* Add note form */}
      <form onSubmit={submit} className="p-4 space-y-3" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div className="flex gap-1.5">
          {(["internal", "client", "compliance"] as const).map(t => {
            const cfg = NOTE_TYPE_CFG[t];
            return (
              <button key={t} type="button" onClick={() => setNoteType(t)}
                      className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-all"
                      style={noteType === t
                        ? { background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }
                        : { border: "1px solid var(--pg-card-border)", color: "var(--pg-text-3)" }}>
                <cfg.Icon className="w-3 h-3" /> {cfg.label}
              </button>
            );
          })}
        </div>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={2}
                  placeholder={
                    noteType === "client"
                      ? "Log a call or email with the client…"
                      : noteType === "compliance"
                      ? "Follow up with compliance officer…"
                      : "Add an internal note…"
                  }
                  className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        <div className="flex justify-end">
          <button type="submit" disabled={saving || !content.trim()}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Add Note"}
          </button>
        </div>
      </form>

      {/* Notes list */}
      <div className="divide-y max-h-80 overflow-y-auto" style={{ borderColor: "var(--pg-row-border)" }}>
        {notes.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <StickyNote className="w-7 h-7 mx-auto mb-2" style={{ color: "var(--pg-text-4)" }} />
            <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>No notes yet</p>
          </div>
        ) : notes.map(note => {
          const cfg = NOTE_TYPE_CFG[note.note_type as keyof typeof NOTE_TYPE_CFG] ?? NOTE_TYPE_CFG.internal;
          return (
            <div key={note.id} className="px-5 py-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: cfg.bg, color: cfg.color }}>
                  {cfg.label}
                </span>
                <span className="text-[11px] font-medium" style={{ color: "var(--pg-text-2)" }}>{note.author_name}</span>
                <span className="text-[10px] ml-auto" style={{ color: "var(--pg-text-4)" }}>{timeAgo(note.created_at)}</span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--pg-text-1)" }}>{note.content}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { caseId }     = useParams<{ caseId: string }>();
  const router         = useRouter();
  const { toast }      = useToast();
  const queryClient    = useQueryClient();
  const { user }       = useAuth();

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

  const { data: complianceChecks = [] } = useQuery<ComplianceCheck[]>({
    queryKey: ["case-compliance", caseId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/onboarding/cases/${caseId}/compliance`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []);
    },
  });

  const { data: notes = [] } = useQuery<CaseNote[]>({
    queryKey: ["case-notes", caseId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/onboarding/cases/${caseId}/notes`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []);
    },
  });

  async function addNote(noteType: string, content: string) {
    const res = await fetch(`${BASE}/api/v1/onboarding/cases/${caseId}/notes`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_type: noteType, content }),
    });
    if (!res.ok) {
      toast({ title: "Failed to add note", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["case-notes", caseId] });
    toast({ title: "Note added" });
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  if (!details) return null;

  const c    = details.case!;   // case is always present when case is fetched
  const app  = details.application;
  const reqs = details.requirements ?? [];
  const st   = CASE_STATUS_CFG[c.State] ?? { label: c.State, color: "#475569", bg: "#f1f5f9" };

  const passedChecks = complianceChecks.filter(ch => ch.outcome === "pass").length;
  const failedChecks = complianceChecks.filter(ch => ch.outcome === "fail").length;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/wm/clients" className="flex items-center gap-1.5 text-[12px] mb-2" style={{ color: "var(--pg-text-3)" }}>
            <ChevronLeft className="w-3.5 h-3.5" /> My Clients
          </Link>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            {app?.full_name ?? `Client ${caseId.slice(0, 8)}`}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] capitalize px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
              {c.ClientType}
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: st.bg, color: st.color }}>{st.label}</span>
            {c.RiskFlag && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: "#fee2e2", color: "#dc2626" }}>
                <Flag className="w-2.5 h-2.5" /> High Risk
              </span>
            )}
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex gap-2">
          {c.State === "returned" && (
            <Link href={`/investments/onboarding?caseId=${caseId}`}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
              <RefreshCw className="w-3.5 h-3.5" /> Resume Application
            </Link>
          )}
          {c.State === "draft" && (
            <Link href={`/investments/onboarding?caseId=${caseId}`}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
              <ArrowRight className="w-3.5 h-3.5" /> Continue Onboarding
            </Link>
          )}
        </div>
      </div>

      {/* Return notes banner */}
      {c.State === "returned" && c.ReturnNotes && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
             style={{ background: "#fef9c3", border: "1px solid #fde68a" }}>
          <AlertCircle className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-amber-800">Application Returned — Action Required</p>
            <p className="text-[12px] text-amber-700 mt-0.5">{c.ReturnNotes}</p>
          </div>
        </div>
      )}

      {/* Risk notes banner */}
      {c.RiskFlag && c.RiskNotes && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
             style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
          <Flag className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-red-800">High Risk Flag</p>
            <p className="text-[12px] text-red-700 mt-0.5">{c.RiskNotes}</p>
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-5">

        {/* Left: Compliance + Requirements (2/3) */}
        <div className="xl:col-span-2 space-y-5">
          <ComplianceTracker checks={complianceChecks} />
          <RequirementsPanel requirements={reqs} />
        </div>

        {/* Right: Client info + Notes (1/3) */}
        <div className="space-y-5">

          {/* Client information */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Client Information</h2>
            </div>
            <div className="p-5 space-y-4">
              {app?.email && (
                <div className="flex items-center gap-2.5">
                  <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: "#FF6600" }} />
                  <span className="text-[12px]" style={{ color: "var(--pg-text-1)" }}>{app.email}</span>
                </div>
              )}
              {app?.phone_numbers?.[0] && (
                <div className="flex items-center gap-2.5">
                  <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: "#059669" }} />
                  <span className="text-[12px]" style={{ color: "var(--pg-text-1)" }}>{app.phone_numbers[0]}</span>
                </div>
              )}
              {app?.investment_amount_kobo != null && app.investment_amount_kobo > 0 && (
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: "#7c3aed" }} />
                  <div>
                    <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>Investment Amount</p>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                      {formatNaira(app.investment_amount_kobo)}
                    </p>
                  </div>
                </div>
              )}
              {app?.source_of_funds && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>Source of Funds</p>
                  <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{app.source_of_funds}</p>
                </div>
              )}
              {app?.bank_name && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>Bank</p>
                  <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-1)" }}>{app.bank_name}</p>
                  {app.bank_account_number && (
                    <p className="text-[11px] font-mono" style={{ color: "var(--pg-text-3)" }}>
                      {app.bank_account_number}
                    </p>
                  )}
                </div>
              )}
              {c.SubmittedAt && (
                <div className="pt-3" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>Submitted</p>
                  <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                    {new Date(c.SubmittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              )}
              {app?.is_pep && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#fef2f2" }}>
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-[11px] text-red-700 font-medium">Politically Exposed Person (PEP)</p>
                </div>
              )}
            </div>
          </div>

          {/* Compliance summary mini */}
          {complianceChecks.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Passed",   value: passedChecks,  color: "#059669", bg: "#ecfdf5" },
                { label: "Failed",   value: failedChecks,  color: "#dc2626", bg: "#fef2f2" },
                { label: "Pending",  value: ALL_CHECKS.length - complianceChecks.length, color: "#94a3b8", bg: "#f1f5f9" },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3 text-center"
                     style={{ background: s.bg }}>
                  <p className="text-[18px] font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] font-semibold" style={{ color: s.color }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <NotesPanel caseId={caseId} notes={notes} onAdd={addNote} />

          {/* Investment Accounts — shows accounts linked to this client after compliance approval */}
          <InvestmentAccountsPanel clientId={c.ClientID} />
        </div>
      </div>
    </div>
  );
}

// ── Investment Accounts Panel ─────────────────────────────────────────────────

const BASE_PORTFOLIO = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081");

type PortfolioAccount = {
  id: string; account_number: string; fund_name: string; fund_type: string;
  invested_amount: number; current_value: number; unrealized_pnl: number;
  status: string; opened_date: string;
};

function InvestmentAccountsPanel({ clientId }: { clientId: string }) {
  const { data: accounts = [] } = useQuery<PortfolioAccount[]>({
    queryKey: ["client-portfolio-accounts", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const res = await fetch(
        `${BASE_PORTFOLIO}/api/v1/portfolio/accounts?client_id=${clientId}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as PortfolioAccount[];
    },
  });

  const fmt = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Math.abs(n));

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
      <div className="flex items-center justify-between px-5 py-3.5"
           style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: "#FF6600" }} />
          <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Investment Accounts
          </p>
          {accounts.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "#fff7f0", color: "#FF6600" }}>
              {accounts.length}
            </span>
          )}
        </div>
        <Link href="/wm/portfolio/accounts"
              className="text-[11px] font-semibold" style={{ color: "#FF6600" }}>
          View all →
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
            No investment accounts yet.
          </p>
          {/* Only show open link once client is active (compliance approved) */}
          <Link href="/wm/portfolio/accounts"
                className="inline-flex items-center gap-1 mt-2 text-[12px] font-semibold"
                style={{ color: "#FF6600" }}>
            Open an account <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-slate-100/80">
          {accounts.map(acc => {
            const pnlPos = acc.unrealized_pnl >= 0;
            return (
              <Link key={acc.id} href={`/wm/portfolio/accounts/${acc.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[12px] font-mono font-semibold" style={{ color: "#FF6600" }}>
                      {acc.account_number}
                    </p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: acc.status === "active" ? "#d1fae5" : "#f1f5f9",
                                   color: acc.status === "active" ? "#065f46" : "#475569" }}>
                      {acc.status}
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                    {acc.fund_name} · Opened {acc.opened_date}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                    {fmt(acc.current_value)}
                  </p>
                  <p className="text-[11px] font-semibold"
                     style={{ color: pnlPos ? "#059669" : "#dc2626" }}>
                    {pnlPos ? "+" : "−"}{fmt(acc.unrealized_pnl)}
                  </p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-4)" }} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
