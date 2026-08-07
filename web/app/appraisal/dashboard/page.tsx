"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, ClipboardList, X, AlertCircle, Lock, BarChart2,
  ChevronRight, Settings2, Eye, Play, Users, Archive,
  CheckCircle2, Clock, Calendar, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Cycle = {
  id: string; title: string; description: string; status: string;
  self_deadline?: string; manager_deadline?: string;
  question_count: number; submission_count: number;
  self_submitted_count: number; completed_count: number;
  opened_at?: string; closed_at?: string; created_at: string;
};

function cycleStatusBadge(status: string) {
  switch (status) {
    case "draft":    return { label: "Draft",    color: "#94a3b8", bg: "#f1f5f9" };
    case "open":     return { label: "Open",     color: "#059669", bg: "#ecfdf5" };
    case "closed":   return { label: "Closed",   color: "#dc2626", bg: "#fef2f2" };
    case "archived": return { label: "Archived", color: "#64748b", bg: "#f1f5f9" };
    default:         return { label: status,     color: "#64748b", bg: "#f1f5f9" };
  }
}

async function apiPost(path: string, body?: object) {
  const res = await fetch(`${BASE}/api/v1/appraisal${path}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message ?? err.error?.message ?? "Request failed");
  }
  return res.json();
}

function CreateCycleDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle]         = useState("");
  const [desc, setDesc]           = useState("");
  const [selfDL, setSelfDL]       = useState("");
  const [managerDL, setManagerDL] = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Cycle title is required."); return; }
    setSaving(true); setError("");
    try {
      await apiPost("/cycles", {
        title: title.trim(),
        description: desc.trim(),
        self_deadline:    selfDL    || null,
        manager_deadline: managerDL || null,
      });
      queryClient.invalidateQueries({ queryKey: ["appraisal-cycles-all"] });
      toast({ title: "Cycle Created", description: `"${title}" is in draft. Add questions to get started.` });
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
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>New Appraisal Cycle</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Creates a draft — add questions before opening</p>
          </div>
          <button onClick={onClose} style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Cycle Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required
                   placeholder="e.g. H1 2026 Performance Review"
                   className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                   style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
                      placeholder="Brief description of this appraisal cycle…"
                      className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none"
                      style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Self-Assessment Deadline</label>
              <input type="date" value={selfDL} onChange={e => setSelfDL(e.target.value)}
                     className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Manager Review Deadline</label>
              <input type="date" value={managerDL} onChange={e => setManagerDL(e.target.value)}
                     className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Cycle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AppraisalDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: cycles = [], isLoading } = useQuery<Cycle[]>({
    queryKey: ["appraisal-cycles-all"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles`, { credentials: "include" });
      if (!res.ok) return [];
      return (await res.json()) ?? [];
    },
  });

  async function openCycle(id: string) {
    setActionLoading(id + "-open");
    try {
      await apiPost(`/cycles/${id}/open`);
      queryClient.invalidateQueries({ queryKey: ["appraisal-cycles-all"] });
      toast({ title: "Cycle Opened", description: "Employees can now submit their self-assessments." });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
    finally { setActionLoading(null); }
  }

  async function closeCycle(id: string) {
    if (!confirm("Close this cycle? Employees and managers will no longer be able to submit scores.")) return;
    setActionLoading(id + "-close");
    try {
      await apiPost(`/cycles/${id}/close`);
      queryClient.invalidateQueries({ queryKey: ["appraisal-cycles-all"] });
      toast({ title: "Cycle Closed", description: "The appraisal cycle has been closed." });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
    finally { setActionLoading(null); }
  }

  async function archiveCycle(id: string) {
    if (!confirm("Archive this cycle? It will be preserved as a read-only historical record.")) return;
    setActionLoading(id + "-archive");
    try {
      await apiPost(`/cycles/${id}/archive`);
      queryClient.invalidateQueries({ queryKey: ["appraisal-cycles-all"] });
      toast({ title: "Cycle Archived", description: "The cycle has been archived for historical record." });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
    finally { setActionLoading(null); }
  }

  const draftCycles  = cycles.filter(c => c.status === "draft");
  const openCycles   = cycles.filter(c => c.status === "open");
  const closedCycles = cycles.filter(c => c.status === "closed" || c.status === "archived");

  const STATS = [
    { label: "Total Cycles",   value: cycles.length,   color: "#2563eb", bg: "#eff6ff",  icon: ClipboardList },
    { label: "Open",           value: openCycles.length, color: "#059669", bg: "#ecfdf5", icon: Play },
    { label: "Draft",          value: draftCycles.length, color: "#d97706", bg: "#fffbeb", icon: Settings2 },
    { label: "Closed",         value: closedCycles.length, color: "#64748b", bg: "#f1f5f9", icon: Lock },
  ];

  function CycleSection({ title, items }: { title: string; items: Cycle[] }) {
    if (items.length === 0) return null;
    return (
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>{title}</p>
        <div className="space-y-3">
          {items.map(cycle => {
            const cs = cycleStatusBadge(cycle.status);
            const completion = cycle.submission_count > 0
              ? Math.round((cycle.completed_count / cycle.submission_count) * 100)
              : 0;
            const selfPct = cycle.submission_count > 0
              ? Math.round((cycle.self_submitted_count / cycle.submission_count) * 100)
              : 0;
            return (
              <div key={cycle.id} className="rounded-2xl overflow-hidden"
                   style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
                <div className="flex items-center gap-4 px-5 py-4"
                     style={{ borderBottom: cycle.status !== "draft" ? "1px solid var(--pg-row-border)" : undefined }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                       style={{ background: cycle.status === "open" ? "#ecfdf5" : cycle.status === "closed" ? "#f1f5f9" : "#fffbeb" }}>
                    {cycle.status === "open"   && <Play className="w-4.5 h-4.5 text-emerald-600" />}
                    {cycle.status === "closed" && <Lock className="w-4.5 h-4.5 text-slate-500" />}
                    {cycle.status === "draft"  && <Settings2 className="w-4.5 h-4.5 text-amber-500" />}
                    {cycle.status === "archived" && <Lock className="w-4.5 h-4.5 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-bold truncate" style={{ color: "var(--pg-text-1)" }}>{cycle.title}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: cs.bg, color: cs.color }}>{cs.label}</span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                      {cycle.question_count} question{cycle.question_count !== 1 ? "s" : ""}
                      {cycle.submission_count > 0 && ` · ${cycle.submission_count} participants`}
                      {cycle.self_deadline && ` · Self due: ${new Date(cycle.self_deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {cycle.status === "draft" && (
                      <button onClick={() => openCycle(cycle.id)}
                              disabled={cycle.question_count === 0 || actionLoading === cycle.id + "-open"}
                              title={cycle.question_count === 0 ? "Add questions first" : "Open cycle"}
                              className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
                        {actionLoading === cycle.id + "-open" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Open
                      </button>
                    )}
                    {cycle.status === "open" && (
                      <button onClick={() => closeCycle(cycle.id)}
                              disabled={actionLoading === cycle.id + "-close"}
                              className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold"
                              style={{ border: "1px solid #fca5a5", color: "#dc2626" }}>
                        {actionLoading === cycle.id + "-close" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                        Close
                      </button>
                    )}
                    {cycle.status === "closed" && (
                      <button onClick={() => archiveCycle(cycle.id)}
                              disabled={actionLoading === cycle.id + "-archive"}
                              className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold"
                              style={{ border: "1px solid #c4b5fd", color: "#7c3aed" }}>
                        {actionLoading === cycle.id + "-archive" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Archive
                      </button>
                    )}
                    {cycle.status !== "archived" && (
                      <Link href={`/appraisal/${cycle.id}/manage`}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold"
                            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                        <Settings2 className="w-3.5 h-3.5" /> Manage
                      </Link>
                    )}
                    {cycle.status === "archived" && (
                      <Link href={`/appraisal/${cycle.id}/manage`}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold"
                            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-4)" }}>
                        <Eye className="w-3.5 h-3.5" /> View
                      </Link>
                    )}
                  </div>
                </div>

                {/* Progress bar for open cycles */}
                {cycle.status === "open" && cycle.submission_count > 0 && (
                  <div className="px-5 py-3 grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Self-submitted</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--pg-muted-bg)" }}>
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${selfPct}%`, background: "#2563eb" }} />
                        </div>
                        <span className="text-[11px] font-bold tabular" style={{ color: "#2563eb" }}>{cycle.self_submitted_count}/{cycle.submission_count}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Completed</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--pg-muted-bg)" }}>
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${completion}%`, background: "#059669" }} />
                        </div>
                        <span className="text-[11px] font-bold tabular" style={{ color: "#059669" }}>{cycle.completed_count}/{cycle.submission_count}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <Link href={`/appraisal/${cycle.id}/manage`}
                            className="text-[11px] font-medium text-blue-600 hover:underline flex items-center gap-0.5">
                        View submissions <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Appraisal Management</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Create and manage performance appraisal cycles
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
          <Plus className="w-3.5 h-3.5" /> New Cycle
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {STATS.map(s => (
          <div key={s.label} className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="h-[3px]" style={{ background: s.color }} />
            <div className="p-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
                <p className="text-[26px] font-bold tabular leading-none mt-1.5" style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
        </div>
      ) : cycles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl"
             style={{ background: "var(--pg-card)", border: "1px dashed var(--pg-card-border)" }}>
          <ClipboardList className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>No appraisal cycles yet</p>
          <p className="text-[12px] mt-1 mb-4" style={{ color: "var(--pg-text-4)" }}>Create your first cycle to start evaluating performance.</p>
          <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
            <Plus className="w-3.5 h-3.5" /> New Cycle
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <CycleSection title="Open" items={openCycles} />
          <CycleSection title="Draft" items={draftCycles} />
          <CycleSection title="Closed & Archived" items={closedCycles} />
        </div>
      )}

      {showCreate && <CreateCycleDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
