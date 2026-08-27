"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, Check, X, Clock, CheckCircle2, XCircle,
  Plus, Search, Loader2, AlertCircle, Upload, FileText,
  UserCircle, Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { usePosition, roleFamily } from "@/lib/position";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type LeavePolicy = {
  id: string; code: string; name: string;
  days_per_year: number; requires_approval: boolean; is_active: boolean;
  is_unpaid: boolean;
  minimum_tenure_months: number;
  applicable_grades?: string[];
};

type LeaveRequest = {
  id: string;
  person_id: string; person_name: string; person_email: string; subsidiary_name: string;
  policy_id: string; policy_code: string; policy_name: string;
  start_date: string; end_date: string; days_count: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  notes: string;
  reviewer_person_id?: string; reviewer_note: string;
  reviewed_at?: string; created_at: string;
  reliever_person_id?: string; reliever_name?: string;
  handover_document_id?: string;
};

type LeaveBalance = {
  policy_id: string; policy_code: string; policy_name: string;
  year: number; days_granted: number; days_used: number; days_remaining: number;
};

type OrgUser = {
  user_id: string; email: string; display_name: string;
  user_status: string; person_id?: string;
  assignments: { position_title: string; subsidiary_name: string; is_primary: boolean }[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; icon: React.FC<{ className?: string }>; bg: string; color: string }> = {
  pending:   { label: "Pending",   icon: Clock,         bg: "#fef3c7", color: "#d97706" },
  approved:  { label: "Approved",  icon: CheckCircle2,  bg: "#d1fae5", color: "#059669" },
  rejected:  { label: "Rejected",  icon: XCircle,       bg: "#fee2e2", color: "#dc2626" },
  cancelled: { label: "Cancelled", icon: X,             bg: "#f1f5f9", color: "#64748b" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  const Icon = s.icon;
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: s.bg, color: s.color }}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function fmtDate(d: string) {
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

// ── Balance Strip ──────────────────────────────────────────────────────────────

function BalanceStrip({ balances }: { balances: LeaveBalance[] }) {
  if (balances.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {balances.map(b => (
        <span key={b.policy_id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium"
              style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
          <span className="font-semibold" style={{ color: "var(--pg-text-1)" }}>{b.policy_name}:</span>
          <span style={{ color: b.days_remaining < 3 ? "#dc2626" : "#059669" }}>{b.days_remaining}</span>
          <span style={{ color: "var(--pg-text-3)" }}>of {b.days_granted} days remaining</span>
        </span>
      ))}
    </div>
  );
}

// ── Balance Cards (employee-facing section) ────────────────────────────────────

function MyBalanceCards({ balances }: { balances: LeaveBalance[] }) {
  if (balances.length === 0) return null;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>My Leave Balances — {new Date().getFullYear()}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4">
        {balances.map(b => (
          <div key={b.policy_id} className="rounded-xl p-3"
               style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wide truncate" style={{ color: "var(--pg-text-3)" }}>{b.policy_name}</p>
            <p className="text-[22px] font-bold tabular mt-1"
               style={{ color: b.days_remaining < 3 ? "#dc2626" : "var(--pg-text-1)" }}>
              {b.days_remaining}
            </p>
            <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
              of {b.days_granted} remaining
            </p>
            {b.days_used > 0 && (
              <p className="text-[10px] mt-0.5" style={{ color: "var(--pg-text-4)" }}>{b.days_used} used</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Create Request Modal ───────────────────────────────────────────────────────

function CreateRequestModal({
  policies, isHR, onClose,
}: {
  policies: LeavePolicy[];
  isHR: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [daysCount, setDaysCount] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [relieverPersonId, setRelieverPersonId] = useState("");
  const [handoverFile, setHandoverFile] = useState<File | null>(null);
  const [handoverDocId, setHandoverDocId] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [relieverSearch, setRelieverSearch] = useState("");

  // Fetch org users (needed for HR employee picker + reliever picker)
  const { data: orgUsers = [] } = useQuery<OrgUser[]>({
    queryKey: ["org-users"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/users`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as OrgUser[];
    },
  });

  // Employees = users with a person_id
  const employees = orgUsers.filter(u => u.person_id);

  // Fetch balance for the selected (or own) person
  const balancePersonId = isHR ? selectedPersonId : undefined;
  const { data: balances = [] } = useQuery<LeaveBalance[]>({
    queryKey: ["leave-balance-modal", balancePersonId ?? "own"],
    queryFn: async () => {
      const url = balancePersonId
        ? `${BASE}/api/v1/hr/leave/balance/${balancePersonId}`
        : `${BASE}/api/v1/hr/leave/balance`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as LeaveBalance[];
    },
    enabled: isHR ? !!selectedPersonId : true,
  });

  // Auto-compute working days when both dates are set
  function handleDateChange(field: "start" | "end", value: string) {
    const newStart = field === "start" ? value : startDate;
    const newEnd   = field === "end"   ? value : endDate;
    if (field === "start") setStartDate(value);
    else setEndDate(value);
    if (newStart && newEnd && newEnd >= newStart) {
      setDaysCount(String(calcWorkingDays(newStart, newEnd)));
    }
  }

  async function uploadHandoverDoc(file: File) {
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("context", JSON.stringify({ type: "leave_handover" }));
      const res = await fetch(`${BASE}/api/v1/documents/`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { id } = await res.json() as { id: string };
      setHandoverDocId(id);
      setHandoverFile(file);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingDoc(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!policyId || !startDate || !endDate || !daysCount) {
      setError("Please fill all required fields.");
      return;
    }
    const days = parseFloat(daysCount);
    if (days <= 0) {
      setError("Working days must be greater than 0.");
      return;
    }
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = {
        policy_id: policyId, start_date: startDate, end_date: endDate,
        days_count: days, notes: handoverNotes,
      };
      if (isHR && selectedPersonId) body.person_id = selectedPersonId;
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
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-balance"] });
      toast({ title: "Leave Request Created" });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const filteredEmployees = employees.filter(u =>
    !employeeSearch || u.display_name.toLowerCase().includes(employeeSearch.toLowerCase())
  );
  const filteredRelievers = employees.filter(u =>
    u.person_id !== selectedPersonId &&
    (!relieverSearch || u.display_name.toLowerCase().includes(relieverSearch.toLowerCase()))
  );

  const selectedEmployee = employees.find(u => u.person_id === selectedPersonId);
  const selectedReliever = employees.find(u => u.person_id === relieverPersonId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
           style={{
             background: "var(--pg-card)",
             border: "1px solid var(--pg-card-border)",
             boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
             maxHeight: "90vh",
           }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>New Leave Request</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto flex-1">

          {/* Balance strip */}
          {((!isHR) || selectedPersonId) && balances.length > 0 && (
            <BalanceStrip balances={balances} />
          )}

          {/* HR: employee selector */}
          {isHR && (
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                Employee *
              </label>
              {selectedEmployee ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                     style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                  <div className="flex items-center gap-2">
                    <UserCircle className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{selectedEmployee.display_name}</p>
                      <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{selectedEmployee.email}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setSelectedPersonId(""); setEmployeeSearch(""); }}
                          className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>Change</button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--pg-text-3)" }} />
                  <input value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)}
                         placeholder="Search employee…"
                         className="w-full h-10 pl-8 pr-3 rounded-xl text-[13px] outline-none"
                         style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                  {employeeSearch && filteredEmployees.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 rounded-xl overflow-hidden shadow-lg"
                         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", maxHeight: "180px", overflowY: "auto" }}>
                      {filteredEmployees.map(u => (
                        <button key={u.person_id} type="button"
                                className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-[var(--pg-row-hover)]"
                                onClick={() => { setSelectedPersonId(u.person_id!); setEmployeeSearch(""); }}>
                          <UserCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                          <div>
                            <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-1)" }}>{u.display_name}</p>
                            <p className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>{u.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Leave type */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Leave Type *</label>
            <select value={policyId} onChange={e => setPolicyId(e.target.value)} required
                    className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
              <option value="">Select type…</option>
              {policies.map(p => {
                const bal = balances.find(b => b.policy_id === p.id);
                const rem = bal ? `${bal.days_remaining} of ${bal.days_granted}d remaining` : `${p.days_per_year}d max`;
                const suffix = p.is_unpaid ? " · Unpaid" : "";
                return <option key={p.id} value={p.id}>{p.name} ({rem}){suffix}</option>;
              })}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Start Date *</label>
              <input type="date" value={startDate} onChange={e => handleDateChange("start", e.target.value)} required
                     className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>End Date *</label>
              <input type="date" value={endDate} onChange={e => handleDateChange("end", e.target.value)} required
                     className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          </div>

          {/* Working days (auto-computed) */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Working Days *
              {startDate && endDate && (
                <span className="ml-2 text-[10px] font-normal" style={{ color: "var(--pg-text-4)" }}>
                  auto-computed (Mon–Fri)
                </span>
              )}
            </label>
            <input type="number" min="0.5" step="0.5" value={daysCount}
                   onChange={e => setDaysCount(e.target.value)} required
                   placeholder="e.g. 5"
                   className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                   style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>

          {/* Reliever */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Reliever / Backup <span style={{ color: "var(--pg-text-4)" }}>— optional</span>
            </label>
            {selectedReliever ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                <div className="flex items-center gap-2">
                  <UserCircle className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
                  <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{selectedReliever.display_name}</p>
                </div>
                <button type="button" onClick={() => { setRelieverPersonId(""); setRelieverSearch(""); }}
                        className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>Remove</button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--pg-text-3)" }} />
                <input value={relieverSearch} onChange={e => setRelieverSearch(e.target.value)}
                       placeholder="Search reliever…"
                       className="w-full h-10 pl-8 pr-3 rounded-xl text-[13px] outline-none"
                       style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                {relieverSearch && filteredRelievers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 rounded-xl overflow-hidden shadow-lg"
                       style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", maxHeight: "160px", overflowY: "auto" }}>
                    {filteredRelievers.map(u => (
                      <button key={u.person_id} type="button"
                              className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-[var(--pg-row-hover)]"
                              onClick={() => { setRelieverPersonId(u.person_id!); setRelieverSearch(""); }}>
                        <UserCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                        <div>
                          <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-1)" }}>{u.display_name}</p>
                          <p className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Handover notes */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Handover Notes <span style={{ color: "var(--pg-text-4)" }}>— optional</span>
            </label>
            <textarea value={handoverNotes} onChange={e => setHandoverNotes(e.target.value)} rows={3}
                      placeholder="Describe handover tasks, ongoing work, contacts…"
                      className="w-full px-3 py-2 rounded-xl text-[13px] outline-none resize-none"
                      style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>

          {/* Handover document upload */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Handover Document <span style={{ color: "var(--pg-text-4)" }}>— optional</span>
            </label>
            <input type="file" className="hidden" ref={fileRef}
                   onChange={e => {
                     const f = e.target.files?.[0];
                     if (f) uploadHandoverDoc(f);
                     e.target.value = "";
                   }} />
            {handoverFile && handoverDocId ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                <Paperclip className="w-4 h-4 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                <p className="text-[12px] flex-1 truncate" style={{ color: "var(--pg-text-1)" }}>{handoverFile.name}</p>
                <button type="button" onClick={() => { setHandoverFile(null); setHandoverDocId(null); }}
                        className="w-5 h-5 flex items-center justify-center rounded" style={{ color: "var(--pg-text-3)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button type="button" disabled={uploadingDoc}
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 h-10 px-4 rounded-xl text-[12px] font-medium w-full justify-center"
                      style={{ border: "1px dashed var(--pg-card-border)", color: "var(--pg-text-2)", background: "var(--pg-muted-bg)" }}>
                {uploadingDoc
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Upload className="w-4 h-4" />}
                {uploadingDoc ? "Uploading…" : "Attach Handover Document"}
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
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {saving ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Review Modal ───────────────────────────────────────────────────────────────

function ReviewModal({ request, action, onClose }: {
  request: LeaveRequest; action: "approve" | "reject"; onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "Action failed" } }));
        throw new Error((err as { error?: { message?: string } }).error?.message ?? "Action failed");
      }
      queryClient.invalidateQueries({ queryKey: ["leave-requests"], exact: false });
      toast({ title: action === "approve" ? "Request Approved" : "Request Rejected" });
      onClose();
    } catch (err) {
      toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const isApprove = action === "approve";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: isApprove ? "#059669" : "#dc2626" }}>
            {isApprove ? "Approve" : "Reject"} Leave Request
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="px-4 py-3 rounded-xl" style={{ background: "var(--pg-muted-bg)" }}>
            <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{request.person_name}</p>
            <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              {request.policy_name} · {fmtDate(request.start_date)} → {fmtDate(request.end_date)} · {request.days_count}d
            </p>
            {request.reliever_name && (
              <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                Reliever: {request.reliever_name}
              </p>
            )}
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Note <span style={{ color: "var(--pg-text-4)" }}>— optional</span>
            </label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                      placeholder={isApprove ? "Any conditions or notes…" : "Reason for rejection…"}
                      className="w-full px-3 py-2 rounded-xl text-[13px] outline-none resize-none"
                      style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>
          <div className="flex justify-end gap-2" style={{ borderTop: "1px solid var(--pg-row-border)", paddingTop: "12px" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: isApprove ? "linear-gradient(135deg,#059669,#047857)" : "linear-gradient(135deg,#dc2626,#b91c1c)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isApprove ? "Approve" : "Reject")}
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

// ── Pending document requests banner (employee-facing) ────────────────────────

type DocRequest = {
  id: string; document_type: string; notes: string;
  due_date?: string; status: string; created_at: string;
};

function PendingDocRow({ req, onUploaded }: { req: DocRequest; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadForRequest(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("context", JSON.stringify({ document_request_id: req.id }));
      const upRes = await fetch(`${BASE}/api/v1/documents/`, { method: "POST", credentials: "include", body: fd });
      if (!upRes.ok) return;
      const { id: docId } = await upRes.json() as { id: string };
      await fetch(`${BASE}/api/v1/hr/document-requests/${req.id}/fulfill`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: docId }),
      });
      onUploaded();
    } finally { setUploading(false); }
  }

  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <FileText className="w-4 h-4 text-amber-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-amber-900">{req.document_type}</p>
        {req.notes && <p className="text-[11px] text-amber-700 mt-0.5">{req.notes}</p>}
        {req.due_date && (
          <p className="text-[11px] text-amber-600 mt-0.5">Due: {req.due_date}</p>
        )}
      </div>
      <input type="file" className="hidden" ref={fileRef}
             onChange={e => {
               const f = e.target.files?.[0];
               if (f) uploadForRequest(f);
               e.target.value = "";
             }} />
      <button onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white shrink-0"
              style={{ background: uploading ? "#94a3b8" : "#d97706" }}>
        {uploading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Upload className="w-3.5 h-3.5" />}
        {uploading ? "Uploading…" : "Upload"}
      </button>
    </div>
  );
}

function PendingDocumentsBanner() {
  const qc = useQueryClient();

  const { data: pending = [] } = useQuery<DocRequest[]>({
    queryKey: ["my-doc-requests"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/hr/document-requests/my?status=pending`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as DocRequest[];
    },
  });

  if (pending.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ border: "1px solid #fde68a", background: "#fffbeb" }}>
      <div className="flex items-center gap-2 px-5 py-3.5"
           style={{ borderBottom: "1px solid #fde68a" }}>
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
        <p className="text-[13px] font-semibold text-amber-800">
          HR has requested {pending.length} document{pending.length !== 1 ? "s" : ""} from you
        </p>
      </div>
      <div className="divide-y divide-amber-100">
        {pending.map(req => (
          <PendingDocRow key={req.id} req={req}
                         onUploaded={() => qc.invalidateQueries({ queryKey: ["my-doc-requests"] })} />
        ))}
      </div>
    </div>
  );
}

export default function LeavePage() {
  const { activePosition } = usePosition();
  const family = roleFamily(activePosition?.code);
  const isHR = family === "hr" || family === "md";

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [reviewing, setReviewing] = useState<{ request: LeaveRequest; action: "approve" | "reject" } | null>(null);

  const { data: policies = [] } = useQuery<LeavePolicy[]>({
    queryKey: ["leave-policies"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/hr/leave/policies`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as LeavePolicy[];
    },
  });

  // Own balance (shown for non-HR employees as balance cards)
  const { data: myBalances = [] } = useQuery<LeaveBalance[]>({
    queryKey: ["my-balance"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/hr/leave/balance`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as LeaveBalance[];
    },
  });

  const { data: requests = [], isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ["leave-requests", tab],
    queryFn: async () => {
      const params = tab !== "all" ? `?status=${tab}` : "";
      const res = await fetch(`${BASE}/api/v1/hr/leave/requests${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as LeaveRequest[];
    },
  });

  const { data: pendingRequests = [] } = useQuery<LeaveRequest[]>({
    queryKey: ["leave-requests", "pending"],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/hr/leave/requests?status=pending`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as LeaveRequest[];
    },
  });

  const filtered = requests.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.person_name.toLowerCase().includes(q) || r.policy_name.toLowerCase().includes(q)
      || r.subsidiary_name.toLowerCase().includes(q);
  });

  const pendingCount = pendingRequests.length;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">

      {/* Pending document requests for this employee */}
      <PendingDocumentsBanner />

      {/* My Leave Balances (employee self-service section) */}
      {!isHR && myBalances.length > 0 && (
        <MyBalanceCards balances={myBalances} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Leave Management</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Page Group · {requests.length} request{requests.length !== 1 ? "s" : ""}
            {pendingCount > 0 && (
              <span className="ml-2 font-bold px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{ background: "#fef3c7", color: "#d97706" }}>
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 6px rgba(37,99,235,0.35)" }}>
          <Plus className="w-3.5 h-3.5" /> New Request
        </button>
      </div>

      {/* Policy overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {policies.map(p => (
          <div key={p.id} className="rounded-xl p-3 flex flex-col gap-1"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wide leading-tight" style={{ color: "var(--pg-text-3)" }}>{p.name}</p>
            <div className="flex items-end gap-1">
              <p className="text-[20px] font-bold tabular leading-none" style={{ color: "var(--pg-text-1)" }}>{p.days_per_year}</p>
              <p className="text-[10px] mb-0.5" style={{ color: "var(--pg-text-4)" }}>days</p>
            </div>
            {p.is_unpaid && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full self-start"
                    style={{ background: "#fef3c7", color: "#b45309" }}>Unpaid</span>
            )}
            {p.minimum_tenure_months > 0 && (
              <p className="text-[9px]" style={{ color: "var(--pg-text-4)" }}>{p.minimum_tenure_months}m tenure req.</p>
            )}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl flex-1 max-w-xs"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Search by name, type, subsidiary…"
                 className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
        </div>
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
                      style={{ background: tab === "pending" ? "rgba(255,255,255,0.3)" : "#fef3c7", color: tab === "pending" ? "white" : "#d97706" }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Requests table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
             style={{ gridTemplateColumns: "2fr 1.2fr 1.5fr 100px 80px 120px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
          <span>Employee</span>
          <span>Leave Type</span>
          <span>Period</span>
          <span>Days</span>
          <span>Status</span>
          <span />
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <CalendarDays className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--pg-text-4)" }} />
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
              {search ? "No requests match your search." : "No leave requests yet."}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {filtered.map(req => (
              <div key={req.id}
                   className="grid items-center gap-2 px-5 py-3.5 transition-colors"
                   style={{ gridTemplateColumns: "2fr 1.2fr 1.5fr 100px 80px 120px" }}
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                {/* Employee */}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{req.person_name}</p>
                  <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>
                    {req.subsidiary_name || req.person_email}
                    {req.reliever_name && (
                      <span className="ml-2 text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                        · Reliever: {req.reliever_name}
                      </span>
                    )}
                  </p>
                </div>

                {/* Type */}
                <p className="text-[12px] truncate" style={{ color: "var(--pg-text-2)" }}>{req.policy_name}</p>

                {/* Period */}
                <p className="text-[11px]" style={{ color: "var(--pg-text-2)" }}>
                  {fmtDate(req.start_date)} → {fmtDate(req.end_date)}
                </p>

                {/* Days */}
                <p className="text-[13px] font-semibold tabular" style={{ color: "var(--pg-text-1)" }}>
                  {req.days_count}d
                </p>

                {/* Status */}
                <StatusBadge status={req.status} />

                {/* Actions */}
                <div className="flex items-center gap-1.5 justify-end">
                  {req.status === "pending" && (
                    <>
                      <button
                        onClick={() => setReviewing({ request: req, action: "approve" })}
                        className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold text-white"
                        style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
                        <Check className="w-3 h-3" /> Approve
                      </button>
                      <button
                        onClick={() => setReviewing({ request: req, action: "reject" })}
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                        style={{ border: "1px solid #fca5a5", color: "#dc2626" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fef2f2"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {req.status !== "pending" && req.reviewer_note && (
                    <p className="text-[10px] italic truncate max-w-[100px]" style={{ color: "var(--pg-text-4)" }}>
                      {req.reviewer_note}
                    </p>
                  )}
                  {req.handover_document_id && (
                    <span title="Has handover document"
                          className="w-5 h-5 flex items-center justify-center rounded"
                          style={{ color: "var(--pg-text-4)" }}>
                      <Paperclip className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateRequestModal policies={policies} isHR={isHR} onClose={() => setShowCreate(false)} />
      )}
      {reviewing && (
        <ReviewModal request={reviewing.request} action={reviewing.action} onClose={() => setReviewing(null)} />
      )}
    </div>
  );
}
