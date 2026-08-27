"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, Plus, X, Loader2, AlertCircle, CheckCircle2,
  XCircle, Clock, Upload, Paperclip, UserCircle, Search, Check,
  TrendingDown, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePosition, roleFamily } from "@/lib/position";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type LeavePolicy = {
  id: string; code: string; name: string;
  days_per_year: number; requires_approval: boolean; is_active: boolean;
  is_unpaid: boolean;
  minimum_tenure_months: number;
  applicable_grades?: string[];
};

type LeaveBalance = {
  policy_id: string; policy_code: string; policy_name: string;
  year: number; days_granted: number; days_used: number; days_remaining: number;
};

type LeaveRequest = {
  id: string;
  person_id: string; person_name: string; person_email: string; subsidiary_name: string;
  policy_id: string; policy_code: string; policy_name: string;
  start_date: string; end_date: string; days_count: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  notes: string;
  reviewer_note: string; reviewed_at?: string; created_at: string;
  reliever_name?: string; handover_document_id?: string;
};

type StaffMember = {
  person_id: string;
  full_name: string;
  email: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function calcWorkingDays(start: string, end: string): number {
  const s = new Date(start), e = new Date(end);
  let days = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

const STATUS: Record<string, { label: string; icon: React.FC<{ className?: string }>; bg: string; color: string }> = {
  pending:   { label: "Pending Review", icon: Clock,        bg: "#fef3c7", color: "#d97706" },
  approved:  { label: "Approved",       icon: CheckCircle2, bg: "#d1fae5", color: "#059669" },
  rejected:  { label: "Rejected",       icon: XCircle,      bg: "#fee2e2", color: "#dc2626" },
  cancelled: { label: "Cancelled",      icon: X,            bg: "#f1f5f9", color: "#64748b" },
};

const BALANCE_COLORS = [
  { bar: "#2563eb", bg: "#eff6ff", text: "#1d4ed8" },
  { bar: "#7c3aed", bg: "#f5f3ff", text: "#6d28d9" },
  { bar: "#059669", bg: "#f0fdf4", text: "#047857" },
  { bar: "#d97706", bg: "#fffbeb", text: "#b45309" },
  { bar: "#dc2626", bg: "#fef2f2", text: "#b91c1c" },
  { bar: "#0891b2", bg: "#ecfeff", text: "#0e7490" },
];

// ── Balance Cards ──────────────────────────────────────────────────────────────

function BalanceCards({ balances }: { balances: LeaveBalance[] }) {
  if (balances.length === 0) return null;
  const year = balances[0]?.year ?? new Date().getFullYear();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>
          My Leave Balances — {year}
        </h2>
        <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>Mon–Fri working days</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {balances.map((b, i) => {
          const palette = BALANCE_COLORS[i % BALANCE_COLORS.length];
          const pct = b.days_granted > 0 ? Math.round((b.days_used / b.days_granted) * 100) : 0;
          const critical = b.days_remaining < 3;
          return (
            <div key={b.policy_id} className="rounded-2xl p-4 flex flex-col gap-2"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "var(--pg-card-shadow)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide leading-tight"
                 style={{ color: "var(--pg-text-3)" }}>{b.policy_name}</p>

              <div className="flex items-end gap-1">
                <span className="text-[28px] font-black tabular leading-none"
                      style={{ color: critical ? "#dc2626" : palette.bar }}>
                  {b.days_remaining}
                </span>
                <span className="text-[11px] mb-1" style={{ color: "var(--pg-text-4)" }}>
                  / {b.days_granted}d
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--pg-muted-bg)" }}>
                <div className="h-full rounded-full transition-all"
                     style={{ width: `${pct}%`, background: critical ? "#dc2626" : palette.bar }} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                  {b.days_used}d used
                </span>
                {critical && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "#fef2f2", color: "#dc2626" }}>Low</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Request Modal ──────────────────────────────────────────────────────────────

function ApplyModal({
  policies,
  balances,
  onClose,
  onSuccess,
}: {
  policies: LeavePolicy[];
  balances: LeaveBalance[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [policyId, setPolicyId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [daysCount, setDaysCount] = useState("");
  const [notes, setNotes] = useState("");
  const [relieverSearch, setRelieverSearch] = useState("");
  const [relieverPersonId, setRelieverPersonId] = useState("");
  const [handoverFile, setHandoverFile] = useState<File | null>(null);
  const [handoverDocId, setHandoverDocId] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [relieverFocused, setRelieverFocused] = useState(false);

  // Server-side filtered staff list — always returns results, accessible to all roles.
  const { data: staffResults = [] } = useQuery<StaffMember[]>({
    queryKey: ["staff-search", relieverSearch],
    queryFn: async () => {
      const params = relieverSearch ? `?search=${encodeURIComponent(relieverSearch)}` : "";
      const res = await fetch(`${BASE}/api/v1/org/staff${params}`, { credentials: "include" });
      return res.ok ? (((await res.json()) ?? []) as StaffMember[]) : [];
    },
    staleTime: 10_000,
  });

  const [selectedReliever, setSelectedReliever] = useState<StaffMember | null>(null);

  function handleDateChange(field: "start" | "end", value: string) {
    const ns = field === "start" ? value : startDate;
    const ne = field === "end"   ? value : endDate;
    if (field === "start") setStartDate(value); else setEndDate(value);
    if (ns && ne && ne >= ns) setDaysCount(String(calcWorkingDays(ns, ne)));
  }

  async function uploadDoc(file: File) {
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("context", JSON.stringify({ type: "leave_handover" }));
      const res = await fetch(`${BASE}/api/v1/documents/`, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error();
      const { id } = await res.json() as { id: string };
      setHandoverDocId(id);
      setHandoverFile(file);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingDoc(false);
    }
  }

  const selectedBalance = balances.find(b => b.policy_id === policyId);
  const requestedDays = parseFloat(daysCount) || 0;
  const willExceed = selectedBalance ? requestedDays > selectedBalance.days_remaining : false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!policyId || !startDate || !endDate || !daysCount) {
      setError("Please fill all required fields.");
      return;
    }
    if (parseFloat(daysCount) <= 0) {
      setError("Working days must be greater than 0.");
      return;
    }
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = {
        policy_id: policyId, start_date: startDate, end_date: endDate,
        days_count: parseFloat(daysCount), notes,
      };
      if (relieverPersonId) body.reliever_person_id = relieverPersonId;
      if (handoverDocId) body.handover_document_id = handoverDocId;

      const res = await fetch(`${BASE}/api/v1/hr/leave/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
        throw new Error((err as { error?: { message?: string } }).error?.message ?? "Request failed");
      }
      toast({ title: "Leave Request Submitted", description: "HR will review your request shortly." });
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", maxHeight: "92vh" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Apply for Leave</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Your request will be reviewed by HR
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
                  style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5 overflow-y-auto flex-1">

          {/* Leave type */}
          <div>
            <label className="block text-[12px] font-semibold mb-2" style={{ color: "var(--pg-text-2)" }}>
              Leave Type *
            </label>
            <select value={policyId} onChange={e => setPolicyId(e.target.value)} required
                    className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
              <option value="">Select leave type…</option>
              {policies.map(p => {
                const bal = balances.find(b => b.policy_id === p.id);
                const bal_label = bal
                  ? `${bal.days_remaining} of ${bal.days_granted}d remaining`
                  : `${p.days_per_year}d max`;
                const unpaid = p.is_unpaid ? " · Unpaid" : "";
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} — {bal_label}{unpaid}
                  </option>
                );
              })}
            </select>

            {/* Unpaid / tenure notice */}
            {policyId && (() => {
              const pol = policies.find(p => p.id === policyId);
              if (!pol) return null;
              return (
                <div className="flex flex-col gap-1.5 mt-2">
                  {pol.is_unpaid && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                         style={{ background: "#fef3c7", border: "1px solid #fde68a" }}>
                      <span className="text-[11px] font-semibold" style={{ color: "#b45309" }}>
                        Unpaid leave — salary will not be paid during this period
                      </span>
                    </div>
                  )}
                  {pol.minimum_tenure_months > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                         style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                      <span className="text-[11px]" style={{ color: "var(--pg-text-2)" }}>
                        Requires at least <strong>{pol.minimum_tenure_months} months</strong> of confirmed service.
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Inline balance hint */}
            {selectedBalance && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl"
                   style={{ background: selectedBalance.days_remaining < 3 ? "#fef2f2" : "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                <TrendingDown className="w-3.5 h-3.5 shrink-0"
                              style={{ color: selectedBalance.days_remaining < 3 ? "#dc2626" : "var(--pg-text-3)" }} />
                <span className="text-[11px]" style={{ color: "var(--pg-text-2)" }}>
                  You have <strong>{selectedBalance.days_remaining}</strong> {selectedBalance.policy_name} days remaining
                  ({selectedBalance.days_used} used of {selectedBalance.days_granted})
                </span>
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold mb-2" style={{ color: "var(--pg-text-2)" }}>
                Start Date *
              </label>
              <input type="date" value={startDate} onChange={e => handleDateChange("start", e.target.value)} required
                     className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[12px] font-semibold mb-2" style={{ color: "var(--pg-text-2)" }}>
                End Date *
              </label>
              <input type="date" value={endDate} onChange={e => handleDateChange("end", e.target.value)} required
                     className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          </div>

          {/* Working days (auto-computed) */}
          {daysCount && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                 style={{ background: willExceed ? "#fef2f2" : "#f0fdf4", border: `1px solid ${willExceed ? "#fca5a5" : "#bbf7d0"}` }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: willExceed ? "#dc2626" : "#059669" }}>
                {daysCount} working day{parseFloat(daysCount) !== 1 ? "s" : ""}
              </span>
              {willExceed && (
                <span className="text-[11px]" style={{ color: "#b91c1c" }}>
                  — exceeds your remaining balance
                </span>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-[12px] font-semibold mb-2" style={{ color: "var(--pg-text-2)" }}>
              Reason / Notes <span style={{ color: "var(--pg-text-4)" }}>— optional</span>
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                      placeholder="Add any context for HR…"
                      className="w-full px-3 py-2 rounded-xl text-[13px] outline-none resize-none"
                      style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>

          {/* Reliever */}
          <div>
            <label className="block text-[12px] font-semibold mb-2" style={{ color: "var(--pg-text-2)" }}>
              Who will cover for you? <span style={{ color: "var(--pg-text-4)" }}>— optional</span>
            </label>
            {selectedReliever ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                <div className="flex items-center gap-2">
                  <UserCircle className="w-4 h-4 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-1)" }}>{selectedReliever.full_name}</p>
                    <p className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>{selectedReliever.email}</p>
                  </div>
                </div>
                <button type="button" className="text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}
                        onClick={() => { setSelectedReliever(null); setRelieverPersonId(""); setRelieverSearch(""); }}>
                  Remove
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                        style={{ color: "var(--pg-text-3)" }} />
                <input
                  value={relieverSearch}
                  onChange={e => setRelieverSearch(e.target.value)}
                  onFocus={() => setRelieverFocused(true)}
                  onBlur={() => setTimeout(() => setRelieverFocused(false), 150)}
                  placeholder="Type a name or click to browse all staff…"
                  className="w-full h-10 pl-9 pr-3 rounded-xl text-[13px] outline-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                {relieverFocused && staffResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 rounded-xl overflow-hidden shadow-lg"
                       style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", maxHeight: 200, overflowY: "auto" }}>
                    {staffResults.map(u => (
                      <button key={u.person_id} type="button"
                              className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors"
                              onMouseDown={e => e.preventDefault()}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
                              onClick={() => {
                                setSelectedReliever(u);
                                setRelieverPersonId(u.person_id);
                                setRelieverSearch("");
                                setRelieverFocused(false);
                              }}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
                             style={{ background: "#2563eb" }}>
                          {u.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{u.full_name}</p>
                          {u.email && <p className="text-[10px] truncate" style={{ color: "var(--pg-text-3)" }}>{u.email}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Handover document */}
          <div>
            <label className="block text-[12px] font-semibold mb-2" style={{ color: "var(--pg-text-2)" }}>
              Handover Document <span style={{ color: "var(--pg-text-4)" }}>— optional</span>
            </label>
            <input type="file" className="hidden" ref={fileRef}
                   onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = ""; }} />
            {handoverFile && handoverDocId ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                <Paperclip className="w-4 h-4 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                <p className="text-[12px] flex-1 truncate" style={{ color: "var(--pg-text-1)" }}>{handoverFile.name}</p>
                <button type="button" onClick={() => { setHandoverFile(null); setHandoverDocId(null); }}
                        className="w-5 h-5 flex items-center justify-center rounded" style={{ color: "var(--pg-text-3)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button type="button" disabled={uploadingDoc} onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 h-10 px-4 rounded-xl text-[12px] font-medium w-full justify-center transition-colors"
                      style={{ border: "1px dashed var(--pg-card-border)", color: "var(--pg-text-2)", background: "var(--pg-muted-bg)" }}>
                {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadingDoc ? "Uploading…" : "Attach Document"}
              </button>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                 style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60 flex items-center gap-2"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 6px rgba(37,99,235,0.3)" }}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Status Badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.pending;
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: s.bg, color: s.color }}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

// ── Cancel Confirm ────────────────────────────────────────────────────────────

function CancelConfirm({ request, onClose }: { request: LeaveRequest; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/v1/hr/leave/requests/${request.id}/cancel`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["my-balance"] });
      toast({ title: "Request Cancelled" });
      onClose();
    } catch {
      toast({ title: "Could not cancel", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5">
          <p className="text-[15px] font-bold mb-1" style={{ color: "var(--pg-text-1)" }}>Cancel Leave Request?</p>
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
            {request.policy_name} · {fmtDate(request.start_date)} → {fmtDate(request.end_date)} ({request.days_count}d)
          </p>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button onClick={onClose}
                  className="h-9 px-4 rounded-xl text-[13px] font-medium"
                  style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
            Keep
          </button>
          <button onClick={confirm} disabled={saving}
                  className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}>
            {saving ? "Cancelling…" : "Cancel Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── HR Review Actions (shown only when user is HR/MD) ─────────────────────────

function ReviewModal({ request, action, onClose }: {
  request: LeaveRequest; action: "approve" | "reject"; onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/v1/hr/leave/requests/${request.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewer_note: note }),
      });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["my-balance"] });
      toast({ title: action === "approve" ? "Approved" : "Rejected" });
      onClose();
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[14px] font-bold" style={{ color: action === "approve" ? "#059669" : "#dc2626" }}>
            {action === "approve" ? "Approve" : "Reject"} Leave Request
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="px-3 py-2.5 rounded-xl" style={{ background: "var(--pg-muted-bg)" }}>
            <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{request.person_name}</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              {request.policy_name} · {fmtDate(request.start_date)} → {fmtDate(request.end_date)} · {request.days_count}d
            </p>
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                    placeholder={action === "approve" ? "Any conditions or notes…" : "Reason for rejection…"}
                    className="w-full px-3 py-2 rounded-xl text-[13px] outline-none resize-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: action === "approve" ? "linear-gradient(135deg,#059669,#047857)" : "linear-gradient(135deg,#dc2626,#b91c1c)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (action === "approve" ? "Approve" : "Reject")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TABS = ["all", "pending", "approved", "rejected", "cancelled"] as const;
type Tab = typeof TABS[number];

export default function MyLeavePage() {
  const { activePosition } = usePosition();
  const family = roleFamily(activePosition?.code);
  const isHR = family === "hr" || family === "md";

  const [showApply, setShowApply] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);
  const [reviewing, setReviewing] = useState<{ request: LeaveRequest; action: "approve" | "reject" } | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const qc = useQueryClient();

  const { data: policies = [] } = useQuery<LeavePolicy[]>({
    queryKey: ["leave-policies"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/hr/leave/policies`, { credentials: "include" });
      return res.ok ? (((await res.json()) ?? []) as LeavePolicy[]) : [];
    },
  });

  const { data: balances = [], isLoading: balancesLoading } = useQuery<LeaveBalance[]>({
    queryKey: ["my-balance"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/hr/leave/balance`, { credentials: "include" });
      return res.ok ? (((await res.json()) ?? []) as LeaveBalance[]) : [];
    },
  });

  const { data: requests = [], isLoading: reqLoading } = useQuery<LeaveRequest[]>({
    queryKey: ["my-leave-requests", tab, isHR],
    queryFn: async () => {
      // HR sees all requests; staff see only their own (backend filters by caller)
      const params = new URLSearchParams();
      if (tab !== "all") params.set("status", tab);
      const res = await fetch(`${BASE}/api/v1/hr/leave/requests?${params}`, { credentials: "include" });
      return res.ok ? (((await res.json()) ?? []) as LeaveRequest[]) : [];
    },
  });

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const filtered = tab === "all" ? requests : requests.filter(r => r.status === (tab as string));

  const totalDaysLeft = balances.reduce((s, b) => s + b.days_remaining, 0);

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>My Leave</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Apply for leave and track your balances
            {!balancesLoading && balances.length > 0 && (
              <span className="ml-2 font-semibold" style={{ color: "var(--pg-text-2)" }}>
                · {totalDaysLeft} days remaining in total
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowApply(true)}
          className="flex items-center gap-2 h-9 px-5 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 6px rgba(37,99,235,0.3)" }}>
          <Plus className="w-3.5 h-3.5" />
          Apply for Leave
        </button>
      </div>

      {/* Balance cards */}
      {balancesLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl animate-pulse"
                 style={{ background: "var(--pg-muted-bg)" }} />
          ))}
        </div>
      ) : (
        <BalanceCards balances={balances} />
      )}

      {/* Separator */}
      <div style={{ borderTop: "1px solid var(--pg-row-border)" }} />

      {/* Request history header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            {isHR ? "All Leave Requests" : "My Requests"}
          </h2>
          {pendingCount > 0 && (
            <p className="text-[11px] mt-0.5" style={{ color: "#d97706" }}>
              {pendingCount} request{pendingCount !== 1 ? "s" : ""} pending review
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
                    className={cn("h-7 px-3 rounded-lg text-[11px] font-medium capitalize transition-all")}
                    style={tab === t
                      ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "white" }
                      : { color: "var(--pg-text-2)" }}>
              {t}
              {t === "pending" && pendingCount > 0 && (
                <span className="ml-1 text-[9px] font-bold px-1 rounded-full"
                      style={{ background: tab === "pending" ? "rgba(255,255,255,0.25)" : "#fef3c7", color: tab === "pending" ? "white" : "#d97706" }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Requests list */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        {reqLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 flex flex-col items-center gap-3">
            <CalendarDays className="w-9 h-9" style={{ color: "var(--pg-text-4)" }} />
            <div className="text-center">
              <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-2)" }}>
                {tab === "all" ? "No leave requests yet" : `No ${tab} requests`}
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-4)" }}>
                Click <strong>Apply for Leave</strong> to submit your first request
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {filtered.map(req => (
              <div key={req.id} className="px-5 py-4 transition-colors"
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  {/* Left: details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                        {isHR ? req.person_name : req.policy_name}
                      </p>
                      {isHR && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
                          {req.policy_name}
                        </span>
                      )}
                      <StatusBadge status={req.status} />
                    </div>

                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1 text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                        <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                        {fmtDate(req.start_date)} → {fmtDate(req.end_date)}
                      </span>
                      <span className="text-[12px] font-semibold tabular" style={{ color: "var(--pg-text-1)" }}>
                        {req.days_count} day{req.days_count !== 1 ? "s" : ""}
                      </span>
                      {req.reliever_name && (
                        <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                          Reliever: {req.reliever_name}
                        </span>
                      )}
                      {req.handover_document_id && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                          <Paperclip className="w-3 h-3" /> Handover doc attached
                        </span>
                      )}
                    </div>

                    {req.notes && (
                      <p className="text-[11px] mt-1.5 italic" style={{ color: "var(--pg-text-3)" }}>
                        &ldquo;{req.notes}&rdquo;
                      </p>
                    )}

                    {req.reviewer_note && (
                      <div className="mt-2 flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg"
                           style={{ background: req.status === "approved" ? "#f0fdf4" : "#fef2f2" }}>
                        <FileText className="w-3 h-3 shrink-0 mt-0.5"
                                  style={{ color: req.status === "approved" ? "#059669" : "#dc2626" }} />
                        <p className="text-[11px]"
                           style={{ color: req.status === "approved" ? "#047857" : "#b91c1c" }}>
                          HR note: {req.reviewer_note}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Employee: cancel own pending request */}
                    {!isHR && req.status === "pending" && (
                      <button onClick={() => setCancelTarget(req)}
                              className="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors"
                              style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-3)" }}>
                        Cancel
                      </button>
                    )}

                    {/* HR: approve / reject */}
                    {isHR && req.status === "pending" && (
                      <>
                        <button onClick={() => setReviewing({ request: req, action: "approve" })}
                                className="flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] font-semibold text-white"
                                style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
                          <Check className="w-3 h-3" /> Approve
                        </button>
                        <button onClick={() => setReviewing({ request: req, action: "reject" })}
                                className="h-8 px-3 rounded-lg text-[11px] font-semibold transition-colors"
                                style={{ border: "1px solid #fca5a5", color: "#dc2626" }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fef2f2"}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showApply && (
        <ApplyModal
          policies={policies}
          balances={balances}
          onClose={() => setShowApply(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
            qc.invalidateQueries({ queryKey: ["my-balance"] });
          }}
        />
      )}
      {cancelTarget && (
        <CancelConfirm request={cancelTarget} onClose={() => setCancelTarget(null)} />
      )}
      {reviewing && (
        <ReviewModal request={reviewing.request} action={reviewing.action}
                     onClose={() => setReviewing(null)} />
      )}
    </div>
  );
}
