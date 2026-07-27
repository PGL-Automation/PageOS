"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import {
  Search, UserPlus, RefreshCw, UserX, UserCheck, Eye,
  ChevronRight, X, Check, AlertCircle, Copy, CheckCircle2,
  ArrowRight, Building2, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = {
  position_code: string; position_title: string;
  subsidiary_id?: string; subsidiary_name?: string;
  is_primary: boolean; effective_from: string;
};

type Employee = {
  user_id: string; email: string; display_name: string;
  user_status: "active" | "inactive"; person_id?: string;
  assignments: Assignment[];
};

type SubsidiaryOption = { id: string; code: string; name: string };
type Position = { id: string; code: string; title: string; subsidiary_id?: string; is_group_level: boolean };

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";
async function adminPost(path: string, body?: object) {
  const res = await fetch(`${BASE}/api/v1/admin${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message ?? "Request failed");
  }
  return res.json();
}

// ── Transfer dialog ────────────────────────────────────────────────────────────

function TransferDialog({
  employee, subsidiaries, onClose,
}: { employee: Employee; subsidiaries: SubsidiaryOption[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [positionCode, setPositionCode]   = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [endCurrent, setEndCurrent]       = useState(true);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState("");

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["positions", selectedSubs[0] ?? ""],
    queryFn: async () => {
      const params = selectedSubs[0] ? `?subsidiary_id=${selectedSubs[0]}` : "";
      const res = await fetch(`${BASE}/api/v1/org/positions${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<Position[]>;
    },
    enabled: selectedSubs.length > 0,
  });

  function toggleSub(id: string) {
    setSelectedSubs(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
    setPositionCode("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedSubs.length === 0) { setError("Select at least one subsidiary."); return; }
    if (!positionCode) { setError("Select a position."); return; }
    setSaving(true); setError("");
    try {
      await adminPost(`/users/${employee.user_id}/transfer`, {
        new_position_code: positionCode,
        new_subsidiary_ids: selectedSubs,
        effective_from: effectiveFrom,
        end_current: endCurrent,
      });
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      toast({ title: "Transfer Complete", description: `${employee.display_name} has been transferred.` });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const currentRole = employee.assignments?.find(a => a.is_primary);
  const subPositions  = positions.filter(p => !p.is_group_level);
  const groupPositions = positions.filter(p => p.is_group_level);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Transfer Employee</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{employee.display_name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">
          {/* Current assignment */}
          {currentRole && (
            <div className="px-4 py-3 rounded-xl" style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>Current Role</p>
              <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>
                {currentRole.position_title} · {currentRole.subsidiary_name ?? "Group-level"}
              </p>
            </div>
          )}

          {/* New subsidiaries (multi-select checkboxes) */}
          <div>
            <p className="text-[12px] font-medium mb-2" style={{ color: "var(--pg-text-2)" }}>
              New Subsidiary(ies) <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>— can select more than one</span>
            </p>
            <div className="space-y-2 p-3 rounded-xl" style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)" }}>
              {subsidiaries.map(s => (
                <label key={s.id} className="flex items-center gap-2.5 cursor-pointer py-0.5">
                  <div className={cn("w-4 h-4 rounded flex items-center justify-center border transition-all",
                                     selectedSubs.includes(s.id) ? "border-blue-500 bg-blue-500" : "border-slate-300 dark:border-slate-600")}
                       onClick={() => toggleSub(s.id)}>
                    {selectedSubs.includes(s.id) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="text-[13px]" style={{ color: "var(--pg-text-1)" }}>{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Position dropdown */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              New Position {selectedSubs.length === 0 && <span style={{ color: "var(--pg-text-4)" }}>— select subsidiary first</span>}
            </label>
            <select value={positionCode} onChange={e => setPositionCode(e.target.value)} required
                    disabled={selectedSubs.length === 0}
                    className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
              <option value="">Select position…</option>
              {subPositions.length > 0 && <optgroup label="Subsidiary roles">{subPositions.map(p => <option key={p.id} value={p.code}>{p.title}</option>)}</optgroup>}
              {groupPositions.length > 0 && <optgroup label="Group-level">{groupPositions.map(p => <option key={p.id} value={p.code}>{p.title}</option>)}</optgroup>}
            </select>
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Effective Date</label>
              <input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)}
                     className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <div className={cn("w-4 h-4 rounded border transition-all flex items-center justify-center",
                                   endCurrent ? "bg-blue-500 border-blue-500" : "border-slate-300 dark:border-slate-600")}
                     onClick={() => setEndCurrent(v => !v)}>
                  {endCurrent && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>End current assignment(s)</span>
              </label>
            </div>
          </div>

          {error && <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-red-600">{error}</p>
          </div>}

          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {saving ? "Transferring…" : "Confirm Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reset password dialog ──────────────────────────────────────────────────────

function ResetPasswordDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function doReset() {
    setLoading(true);
    try {
      const { temporary_password } = await adminPost(`/users/${employee.user_id}/reset-password`);
      setNewPassword(temporary_password);
      toast({ title: "Password Reset", description: "Copy the temporary password and send it to the employee." });
    } catch (err) {
      toast({ title: "Reset Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function copyPwd() {
    navigator.clipboard.writeText(newPassword).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Reset Password</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
            Resetting password for <strong>{employee.display_name}</strong> ({employee.email}).<br />
            A new temporary password will be generated for you to share securely.
          </p>
          {!newPassword ? (
            <button onClick={doReset} disabled={loading}
                    className="w-full h-10 rounded-xl text-[13px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {loading ? "Generating…" : "Generate New Password"}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-emerald-600">✓ Password reset. Copy and send securely:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-10 px-3 rounded-xl font-mono text-[13px] flex items-center"
                     style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}>
                  {newPassword}
                </div>
                <button onClick={copyPwd}
                        className="w-10 h-10 flex items-center justify-center rounded-xl transition-colors"
                        style={{ border: "1px solid var(--pg-card-border)", color: copied ? "#059669" : "var(--pg-text-3)" }}>
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <button onClick={onClose} className="w-full h-9 rounded-xl text-[13px] font-medium" style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HRRecordsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState<"all"|"active"|"inactive"|"unassigned">("all");
  const [selected, setSelected]     = useState<Employee | null>(null);
  const [transferEmp, setTransfer]  = useState<Employee | null>(null);
  const [resetEmp, setResetEmp]     = useState<Employee | null>(null);

  const { data: rawUsers = [], isLoading } = useQuery({
    queryKey: ["org-users"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/users`, { credentials: "include" });
      if (!res.ok) return [] as Employee[];
      const json = await res.json() as Array<{ user_id: string; email: string; display_name: string; user_status: string; person_id?: string; assignments?: Assignment[] }>;
      return json.map(u => ({ ...u, assignments: u.assignments ?? [] })) as Employee[];
    },
  });

  const { data: subsidiaries = [] } = useQuery<SubsidiaryOption[]>({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/subsidiaries`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<SubsidiaryOption[]>;
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (emp: Employee) => adminPost(`/users/${emp.user_id}/${emp.user_status === "active" ? "deactivate" : "reactivate"}`),
    onSuccess: (_, emp) => {
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      toast({ title: emp.user_status === "active" ? "User Deactivated" : "User Reactivated" });
      setSelected(null);
    },
    onError: (err) => toast({ title: "Failed", description: (err as Error).message, variant: "destructive" }),
  });

  const filtered = rawUsers.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      || u.assignments?.some(a => a.position_title?.toLowerCase().includes(q) || a.subsidiary_name?.toLowerCase().includes(q));
    const matchFilter = filter === "all"
      || (filter === "active"     && u.user_status === "active")
      || (filter === "inactive"   && u.user_status === "inactive")
      || (filter === "unassigned" && !u.assignments?.length);
    return matchSearch && matchFilter;
  });

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Employee Directory</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Page Group · {rawUsers.length} people</p>
        </div>
        <Link href="/hr/admin"
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 6px rgba(37,99,235,0.35)" }}>
          <UserPlus className="w-3.5 h-3.5" /> Onboard User
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl flex-1 max-w-xs"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, role…"
                 className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {(["all","active","inactive","unassigned"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
                    className={cn("h-7 px-3 rounded-lg text-[11px] font-medium capitalize transition-all", filter !== f && "")}
                    style={filter === f ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "white" } : { color: "var(--pg-text-2)" }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Main: list + detail panel */}
      <div className={cn("grid gap-5", selected ? "xl:grid-cols-3" : "grid-cols-1")}>

        {/* Employee list */}
        <div className={selected ? "xl:col-span-2" : ""}>
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            {/* Table header */}
            <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
                 style={{ gridTemplateColumns: "2.5fr 1.5fr 1.5fr 80px 100px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
              <span>Employee</span>
              <span>Position</span>
              <span>Subsidiary</span>
              <span>Status</span>
              <span />
            </div>

            {isLoading ? (
              <div className="py-12 flex justify-center">
                <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--pg-text-4)", borderTopColor: "#2563eb" }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No employees match your search.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {filtered.map(emp => {
                  const primary = emp.assignments?.find(a => a.is_primary) ?? emp.assignments?.[0];
                  const subs = [...new Set(emp.assignments?.filter(a => a.subsidiary_name).map(a => a.subsidiary_name) ?? [])];
                  const isSelected = selected?.user_id === emp.user_id;
                  return (
                    <div key={emp.user_id}
                         className="grid items-center gap-2 px-5 py-3 cursor-pointer transition-colors"
                         style={{ gridTemplateColumns: "2.5fr 1.5fr 1.5fr 80px 100px", background: isSelected ? "rgba(37,99,235,0.05)" : undefined }}
                         onClick={() => setSelected(isSelected ? null : emp)}
                         onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                         onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = ""; }}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                             style={{ background: emp.user_status === "active" ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "#94a3b8" }}>
                          {initials(emp.display_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{emp.display_name}</p>
                          <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>{emp.email}</p>
                        </div>
                      </div>
                      <p className="text-[12px] truncate" style={{ color: "var(--pg-text-2)" }}>{primary?.position_title ?? "—"}</p>
                      <div className="flex flex-wrap gap-1">
                        {subs.length === 0 ? (
                          <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>No assignment</span>
                        ) : subs.map(s => (
                          <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>{s?.split(" ")[1] ?? s}</span>
                        ))}
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                            style={{ background: emp.user_status === "active" ? "#d1fae5" : "#fee2e2", color: emp.user_status === "active" ? "#065f46" : "#991b1b" }}>
                        {emp.user_status}
                      </span>
                      <ChevronRight className="w-4 h-4 justify-self-end" style={{ color: "var(--pg-text-4)" }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Employee Details</h3>
              <button onClick={() => setSelected(null)} className="w-6 h-6 flex items-center justify-center rounded" style={{ color: "var(--pg-text-3)" }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {/* Avatar + name */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-bold text-white"
                     style={{ background: selected.user_status === "active" ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "#94a3b8" }}>
                  {initials(selected.display_name)}
                </div>
                <div>
                  <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>{selected.display_name}</p>
                  <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>{selected.email}</p>
                </div>
              </div>

              {/* Assignments */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--pg-text-3)" }}>Current Roles</p>
                {selected.assignments.length === 0 ? (
                  <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>No org assignment yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.assignments.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--pg-muted-bg)" }}>
                        <Briefcase className="w-3.5 h-3.5 shrink-0" style={{ color: "#2563eb" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{a.position_title}</p>
                          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{a.subsidiary_name ?? "Group-level"} {a.is_primary && "· Primary"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                <button onClick={() => { setTransfer(selected); setSelected(null); }}
                        className="w-full flex items-center gap-2 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors"
                        style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <ArrowRight className="w-3.5 h-3.5 text-blue-600" /> Transfer / Change Role
                </button>
                <button onClick={() => { setResetEmp(selected); setSelected(null); }}
                        className="w-full flex items-center gap-2 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors"
                        style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" /> Reset Password
                </button>
                <button onClick={() => deactivateMutation.mutate(selected)}
                        disabled={deactivateMutation.isPending}
                        className="w-full flex items-center gap-2 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors"
                        style={{ border: `1px solid ${selected.user_status === "active" ? "#fca5a5" : "#a7f3d0"}`, color: selected.user_status === "active" ? "#dc2626" : "#059669" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = selected.user_status === "active" ? "#fef2f2" : "#ecfdf5"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  {selected.user_status === "active" ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                  {selected.user_status === "active" ? "Deactivate Account" : "Reactivate Account"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {transferEmp && <TransferDialog employee={transferEmp} subsidiaries={subsidiaries} onClose={() => setTransfer(null)} />}
      {resetEmp    && <ResetPasswordDialog employee={resetEmp} onClose={() => setResetEmp(null)} />}
    </div>
  );
}
