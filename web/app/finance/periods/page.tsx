"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Lock, Unlock, CheckCircle2, Plus, AlertTriangle, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Period = {
  id: string; year: number; month: number; name: string;
  status: "open" | "closed" | "locked";
  opened_at: string; closed_at?: string;
};

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(e.error?.message ?? "Request failed");
  }
  return res.json();
}

const STATUS_CFG = {
  open:   { label: "Open",   bg: "#d1fae5", color: "#065f46", icon: CheckCircle2 },
  closed: { label: "Closed", bg: "#fee2e2", color: "#991b1b", icon: Lock },
  locked: { label: "Locked", bg: "#f1f5f9", color: "#475569", icon: Lock },
};

const MONTHS = ["", "January","February","March","April","May","June",
                "July","August","September","October","November","December"];

export default function PeriodsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [addMonth, setAddMonth] = useState<number | null>(null);

  const { data: periods = [], isLoading } = useQuery<Period[]>({
    queryKey: ["periods", year],
    queryFn: async () => {
      const raw = await apiFetch(`/periods?year=${year}`);
      return Array.isArray(raw) ? (raw as Period[]) : [];
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiFetch(`/periods/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      toast({ title: "Period updated" });
    },
    onError: (err) => toast({ title: "Failed", description: (err as Error).message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: ({ month }: { month: number }) =>
      apiFetch("/periods", { method: "POST", body: JSON.stringify({ year, month, name: `${MONTHS[month]} ${year}` }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      setAddMonth(null);
      toast({ title: "Period created" });
    },
    onError: (err) => toast({ title: "Failed", description: (err as Error).message, variant: "destructive" }),
  });

  // Months present in the data
  const existingMonths = new Set(periods.map(p => p.month));
  const missingMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(m => !existingMonths.has(m));

  const open   = periods.filter(p => p.status === "open").length;
  const closed = periods.filter(p => p.status === "closed").length;
  const locked = periods.filter(p => p.status === "locked").length;

  return (
    <div className="max-w-[800px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Accounting Periods</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Control which months accept new journal entries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(y => y - 1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[13px] font-bold"
                  style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>‹</button>
          <span className="text-[14px] font-bold w-12 text-center" style={{ color: "var(--pg-text-1)" }}>{year}</span>
          <button onClick={() => setYear(y => y + 1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[13px] font-bold"
                  style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>›</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open",   n: open,   color: "#059669", bg: "#d1fae5" },
          { label: "Closed", n: closed, color: "#991b1b", bg: "#fee2e2" },
          { label: "Locked", n: locked, color: "#475569", bg: "#f1f5f9" },
        ].map(s => (
          <div key={s.label} className="rounded-xl px-4 py-3 flex items-center gap-3"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.bg }}>
              <span className="text-[14px] font-bold" style={{ color: s.color }}>{s.n}</span>
            </div>
            <p className="text-[12px] font-semibold" style={{ color: s.color }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Periods list */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
               style={{ gridTemplateColumns: "1fr 100px 140px 200px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
            <span>Period</span><span>Status</span><span>Closed At</span><span>Actions</span>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {periods
              .slice()
              .sort((a, b) => b.month - a.month)
              .map(p => {
                const cfg = STATUS_CFG[p.status];
                const Icon = cfg.icon;
                return (
                  <div key={p.id}
                       className="grid items-center gap-3 px-5 py-3.5"
                       style={{ gridTemplateColumns: "1fr 100px 140px 200px" }}>
                    <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{p.name}</p>

                    <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full w-fit"
                          style={{ background: cfg.bg, color: cfg.color }}>
                      <Icon className="w-3 h-3" />{cfg.label}
                    </span>

                    <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                      {p.closed_at
                        ? new Date(p.closed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </p>

                    <div className="flex items-center gap-2">
                      {p.status === "open" && (
                        <button onClick={() => statusMutation.mutate({ id: p.id, action: "close" })}
                                disabled={statusMutation.isPending}
                                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors"
                                style={{ border: "1px solid #fca5a5", color: "#dc2626" }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fef2f2"}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                          <Lock className="w-3 h-3" /> Close Period
                        </button>
                      )}
                      {p.status === "closed" && (
                        <>
                          <button onClick={() => statusMutation.mutate({ id: p.id, action: "reopen" })}
                                  disabled={statusMutation.isPending}
                                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors"
                                  style={{ border: "1px solid #a7f3d0", color: "#059669" }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#ecfdf5"}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                            <Unlock className="w-3 h-3" /> Reopen
                          </button>
                          <button onClick={() => statusMutation.mutate({ id: p.id, action: "lock" })}
                                  disabled={statusMutation.isPending}
                                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors"
                                  style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-3)" }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                            <Lock className="w-3 h-3" /> Lock
                          </button>
                        </>
                      )}
                      {p.status === "locked" && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--pg-text-4)" }}>
                          <Lock className="w-3 h-3" /> Permanently locked
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Add missing months */}
          {missingMonths.length > 0 && (
            <div className="px-5 py-4" style={{ borderTop: "2px dashed var(--pg-card-border)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--pg-text-3)" }}>
                Missing periods
              </p>
              <div className="flex flex-wrap gap-2">
                {missingMonths.map(m => (
                  <button key={m}
                          onClick={() => createMutation.mutate({ month: m })}
                          disabled={createMutation.isPending}
                          className="flex items-center gap-1 h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors"
                          style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                    <Plus className="w-3 h-3" /> {MONTHS[m]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Warning */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
           style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[12px]" style={{ color: "#92400e" }}>
          Closing a period prevents new journals from being posted to that month. Locking is permanent and cannot be undone.
          Jan–Jul 2026 were seeded as closed — reopen any you need to adjust.
        </p>
      </div>
    </div>
  );
}
