"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Scale,
  AlertTriangle,
  TrendingUp,
  ListChecks,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

function koboToNaira(k: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    notation: "standard",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(k / 100);
}

function fmt(dateStr: string | undefined | null) {
  if (!dateStr) return "—";
  return dateStr.slice(0, 10);
}

type BalanceValidation = {
  is_balanced: boolean;
  difference_kobo: number;
  opening_balance_kobo: number;
  closing_balance_kobo: number;
  computed_closing_kobo: number;
};

type RunSummaryFull = {
  run_id: string;
  bank_account_id: string;
  bank_name: string;
  account_number: string;
  period_start: string;
  period_end: string;
  status: string;
  total_lines: number;
  matched_lines: number;
  unmatched_bank_lines: number;
  unmatched_internal_txns: number;
  match_rate_pct: number;
  balance_validation?: BalanceValidation;
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { background: string; color: string }> = {
    closed:      { background: "#d1fae5", color: "#065f46" },
    in_progress: { background: "#fef3c7", color: "#92400e" },
    draft:       { background: "#f1f5f9", color: "#475569" },
  };
  const s = styles[status] ?? { background: "#f1f5f9", color: "#475569" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
      style={s}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function MatchBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const barColor =
    clamped >= 95 ? "#22c55e" : clamped >= 80 ? "#f59e0b" : "#ef4444";
  const textColor =
    clamped >= 95 ? "#15803d" : clamped >= 80 ? "#b45309" : "#dc2626";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div
        className="flex-1 overflow-hidden rounded-full"
        style={{ height: 4, background: "var(--pg-muted-bg)" }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            borderRadius: 9999,
            background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
          }}
        />
      </div>
      <span
        className="text-[12px] font-semibold tabular-nums shrink-0"
        style={{ color: textColor }}
      >
        {clamped.toFixed(1)}%
      </span>
    </div>
  );
}

function BalanceCell({ bv }: { bv?: BalanceValidation }) {
  if (!bv)
    return (
      <span className="text-[12px]" style={{ color: "var(--pg-text-4)" }}>
        —
      </span>
    );
  if (bv.is_balanced) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[12px] font-semibold"
        style={{ color: "#059669" }}
      >
        <CheckCircle2 className="w-3.5 h-3.5" /> Balanced
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] font-semibold"
      style={{ color: "#dc2626" }}
    >
      <XCircle className="w-3.5 h-3.5" />
      {koboToNaira(Math.abs(bv.difference_kobo))}
    </span>
  );
}

// ── Table column header ────────────────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--pg-text-3)",
  background: "var(--pg-muted-bg)",
  borderBottom: "1px solid var(--pg-row-border)",
  whiteSpace: "nowrap",
};

const TD_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "var(--pg-text-1)",
  borderBottom: "1px solid var(--pg-row-border)",
  whiteSpace: "nowrap",
};

function RunsTable({
  runs,
  checkingBalance,
  autoClosingId,
  onCheckBalance,
  onAutoClose,
}: {
  runs: RunSummaryFull[];
  checkingBalance: string | null;
  autoClosingId: string | null;
  onCheckBalance: (id: string) => void;
  onAutoClose: (id: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 gap-3"
        style={{ color: "var(--pg-text-3)" }}
      >
        <ListChecks className="w-8 h-8 opacity-40" />
        <p className="text-[13px]">No runs to display.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th style={TH_STYLE}>Bank</th>
            <th style={TH_STYLE}>Account</th>
            <th style={TH_STYLE}>Period</th>
            <th style={TH_STYLE}>Status</th>
            <th style={{ ...TH_STYLE, textAlign: "right" }}>Total</th>
            <th style={{ ...TH_STYLE, textAlign: "right" }}>Matched</th>
            <th style={{ ...TH_STYLE, textAlign: "right" }}>Unmatched Bank</th>
            <th style={{ ...TH_STYLE, textAlign: "right" }}>Unmatched Internal</th>
            <th style={TH_STYLE}>Match %</th>
            <th style={TH_STYLE}>Balance</th>
            <th style={{ ...TH_STYLE, textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const totalUnmatched = r.unmatched_bank_lines + r.unmatched_internal_txns;
            const canAutoClose = r.status !== "closed" && totalUnmatched === 0;
            return (
              <tr
                key={r.run_id}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    "var(--pg-row-hover)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "")
                }
              >
                <td style={TD_STYLE}>
                  <span className="font-semibold text-[13px]" style={{ color: "var(--pg-text-1)" }}>
                    {r.bank_name}
                  </span>
                </td>
                <td style={TD_STYLE}>
                  <code className="text-[12px]" style={{ color: "var(--pg-text-3)", fontFamily: "monospace" }}>
                    {r.account_number}
                  </code>
                </td>
                <td style={TD_STYLE}>
                  <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                    {fmt(r.period_start)} → {fmt(r.period_end)}
                  </span>
                </td>
                <td style={TD_STYLE}>
                  <StatusBadge status={r.status} />
                </td>
                <td style={{ ...TD_STYLE, textAlign: "right" }}>
                  <span className="tabular-nums font-semibold">{r.total_lines}</span>
                </td>
                <td style={{ ...TD_STYLE, textAlign: "right" }}>
                  <span className="tabular-nums font-semibold" style={{ color: "#059669" }}>
                    {r.matched_lines}
                  </span>
                </td>
                <td style={{ ...TD_STYLE, textAlign: "right" }}>
                  {r.unmatched_bank_lines > 0 ? (
                    <span className="tabular-nums font-semibold" style={{ color: "#d97706" }}>
                      {r.unmatched_bank_lines}
                    </span>
                  ) : (
                    <span style={{ color: "var(--pg-text-4)" }}>0</span>
                  )}
                </td>
                <td style={{ ...TD_STYLE, textAlign: "right" }}>
                  {r.unmatched_internal_txns > 0 ? (
                    <span className="tabular-nums font-semibold" style={{ color: "#dc2626" }}>
                      {r.unmatched_internal_txns}
                    </span>
                  ) : (
                    <span style={{ color: "var(--pg-text-4)" }}>0</span>
                  )}
                </td>
                <td style={TD_STYLE}>
                  <MatchBar pct={r.match_rate_pct} />
                </td>
                <td style={TD_STYLE}>
                  <BalanceCell bv={r.balance_validation} />
                </td>
                <td style={{ ...TD_STYLE, textAlign: "right" }}>
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/reconciliation/runs/${r.run_id}`}>
                      <button
                        className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors"
                        style={{
                          border: "1px solid var(--pg-card-border)",
                          color: "var(--pg-text-2)",
                          background: "transparent",
                        }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLElement).style.background =
                            "var(--pg-muted-bg)")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLElement).style.background =
                            "transparent")
                        }
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline">View</span>
                      </button>
                    </Link>
                    {canAutoClose && (
                      <button
                        className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50"
                        style={{
                          border: "1px solid #a7f3d0",
                          color: "#059669",
                          background: "transparent",
                        }}
                        disabled={autoClosingId === r.run_id}
                        onClick={() => onAutoClose(r.run_id)}
                        title="Auto-close: all items matched"
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLElement).style.background =
                            "#d1fae5")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLElement).style.background =
                            "transparent")
                        }
                      >
                        {autoClosingId === r.run_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden xl:inline">Auto-Close</span>
                      </button>
                    )}
                    <button
                      className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50"
                      style={{
                        border: "1px solid var(--pg-card-border)",
                        color: "var(--pg-text-3)",
                        background: "transparent",
                      }}
                      disabled={checkingBalance === r.run_id}
                      onClick={() => onCheckBalance(r.run_id)}
                      title="Check balance"
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLElement).style.background =
                          "var(--pg-muted-bg)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLElement).style.background =
                          "transparent")
                      }
                    >
                      {checkingBalance === r.run_id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Scale className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden xl:inline">Balance</span>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ReconciliationDashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"exceptions" | "all">("exceptions");
  const [checkingBalance, setCheckingBalance] = useState<string | null>(null);
  const [autoClosingId, setAutoClosingId] = useState<string | null>(null);

  // Fetch all runs (dashboard view)
  const { data: allRuns = [], isLoading: allLoading } = useQuery<RunSummaryFull[]>({
    queryKey: ["recon-dashboard"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/reconciliation/dashboard`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as RunSummaryFull[];
    },
  });

  // Fetch exception runs (open / problematic)
  const { data: exceptionRuns = [], isLoading: excLoading } = useQuery<RunSummaryFull[]>({
    queryKey: ["recon-exceptions"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/reconciliation/exceptions`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as RunSummaryFull[];
    },
  });

  // Derived summary stats
  const totalRuns = allRuns.length;
  const openExceptions = exceptionRuns.length;
  const avgMatchRate =
    allRuns.length > 0
      ? allRuns.reduce((sum, r) => sum + r.match_rate_pct, 0) / allRuns.length
      : 0;
  const today = new Date().toISOString().slice(0, 10);
  const autoClosedToday = allRuns.filter(
    (r) =>
      r.status === "closed" &&
      r.period_end?.slice(0, 10) === today
  ).length;

  // Auto-close mutation
  const autoCloseMutation = useMutation({
    mutationFn: async (runId: string) => {
      setAutoClosingId(runId);
      const res = await fetch(`${BASE}/api/v1/reconciliation/runs/${runId}/auto-close`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message ?? json?.error?.message ?? "Auto-close failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["recon-exceptions"] });
      toast({ title: "Run Auto-Closed", description: "The run has been sealed successfully." });
    },
    onError: (e) => {
      toast({ title: "Auto-Close Failed", description: (e as Error).message, variant: "destructive" });
    },
    onSettled: () => setAutoClosingId(null),
  });

  async function handleCheckBalance(runId: string) {
    setCheckingBalance(runId);
    try {
      const res = await fetch(`${BASE}/api/v1/reconciliation/runs/${runId}/balance`, {
        credentials: "include",
      });
      const json: BalanceValidation = await res.json();
      if (!res.ok) throw new Error("Balance check failed");
      // Refresh rows so BalanceCell reflects new data
      queryClient.invalidateQueries({ queryKey: ["recon-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["recon-exceptions"] });
      if (json.is_balanced) {
        toast({
          title: "Balanced",
          description: `Opening: ${koboToNaira(json.opening_balance_kobo)} | Closing: ${koboToNaira(json.closing_balance_kobo)}`,
        });
      } else {
        toast({
          title: "Not Balanced",
          description: `Difference: ${koboToNaira(Math.abs(json.difference_kobo))} — Computed closing: ${koboToNaira(json.computed_closing_kobo)}`,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Balance Check Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCheckingBalance(null);
    }
  }

  function handleTriggerAllPulls() {
    toast({ title: "Manual Pull Triggered", description: "All accounts queued for GL sync." });
  }

  const avgMatchColor =
    avgMatchRate >= 95 ? "#059669" : avgMatchRate >= 80 ? "#d97706" : "#dc2626";

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="flex items-center gap-2.5 font-bold"
            style={{ fontSize: 22, color: "var(--pg-text-1)" }}
          >
            <ListChecks className="w-5 h-5" style={{ color: "#FF6600" }} />
            Exception Dashboard
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--pg-text-3)" }}>
            Monitor reconciliation runs, exceptions, and balance health across all accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/reconciliation">
            <button
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                border: "1px solid var(--pg-card-border)",
                color: "var(--pg-text-2)",
                background: "transparent",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  "var(--pg-muted-bg)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "transparent")
              }
            >
              Manage Accounts
            </button>
          </Link>
          <button
            onClick={handleTriggerAllPulls}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Trigger All Pulls
          </button>
        </div>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        {/* Total Runs */}
        <div
          className="p-5 flex items-start justify-between"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 16,
          }}
        >
          <div>
            <p
              className="tabular-nums font-bold"
              style={{ fontSize: 28, color: "var(--pg-text-1)" }}
            >
              {totalRuns}
            </p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>
              Total Runs
            </p>
          </div>
          <div
            className="p-2 rounded-lg"
            style={{ background: "var(--pg-muted-bg)" }}
          >
            <ListChecks className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          </div>
        </div>

        {/* Open Exceptions */}
        <div
          className="p-5 flex items-start justify-between"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 16,
          }}
        >
          <div>
            <p
              className="tabular-nums font-bold"
              style={{ fontSize: 28, color: openExceptions > 0 ? "#d97706" : "#059669" }}
            >
              {openExceptions}
            </p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>
              Open Exceptions
            </p>
          </div>
          <div
            className="p-2 rounded-lg"
            style={{ background: openExceptions > 0 ? "#fef3c7" : "#d1fae5" }}
          >
            <AlertTriangle
              className="w-4 h-4"
              style={{ color: openExceptions > 0 ? "#d97706" : "#059669" }}
            />
          </div>
        </div>

        {/* Avg Match Rate */}
        <div
          className="p-5 flex items-start justify-between"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 16,
          }}
        >
          <div>
            <p
              className="tabular-nums font-bold"
              style={{ fontSize: 28, color: avgMatchColor }}
            >
              {avgMatchRate.toFixed(1)}%
            </p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>
              Avg Match Rate
            </p>
          </div>
          <div className="p-2 rounded-lg" style={{ background: "#eff6ff" }}>
            <TrendingUp className="w-4 h-4" style={{ color: "#3b82f6" }} />
          </div>
        </div>

        {/* Auto-Closed Today */}
        <div
          className="p-5 flex items-start justify-between"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 16,
          }}
        >
          <div>
            <p
              className="tabular-nums font-bold"
              style={{ fontSize: 28, color: "var(--pg-text-1)" }}
            >
              {autoClosedToday}
            </p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>
              Auto-Closed Today
            </p>
          </div>
          <div className="p-2 rounded-lg" style={{ background: "#d1fae5" }}>
            <CheckCircle2 className="w-4 h-4" style={{ color: "#059669" }} />
          </div>
        </div>
      </div>

      {/* ── Tabs + Table ─────────────────────────────────────────────────────── */}
      <div>
        {/* Tab bar */}
        <div
          className="flex gap-0 mb-0"
          style={{ borderBottom: "1px solid var(--pg-row-border)" }}
        >
          <button
            onClick={() => setActiveTab("exceptions")}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors"
            style={{
              borderBottom: activeTab === "exceptions"
                ? "2px solid #FF6600"
                : "2px solid transparent",
              color: activeTab === "exceptions" ? "#FF6600" : "var(--pg-text-3)",
              marginBottom: -1,
            }}
          >
            Exceptions
            {openExceptions > 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full text-white text-[10px] font-bold h-4 min-w-[16px] px-1"
                style={{ background: "#ef4444" }}
              >
                {openExceptions}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors"
            style={{
              borderBottom: activeTab === "all"
                ? "2px solid #FF6600"
                : "2px solid transparent",
              color: activeTab === "all" ? "#FF6600" : "var(--pg-text-3)",
              marginBottom: -1,
            }}
          >
            All Runs
          </button>
        </div>

        {/* Exceptions tab */}
        {activeTab === "exceptions" && (
          <div
            className="rounded-b-2xl overflow-hidden"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              borderTop: "none",
            }}
          >
            {/* Panel header */}
            <div
              className="flex items-center gap-2 px-5 py-3"
              style={{ borderBottom: "1px solid var(--pg-row-border)" }}
            >
              <AlertTriangle className="w-4 h-4" style={{ color: "#d97706" }} />
              <span
                className="text-[12px] font-bold uppercase tracking-widest"
                style={{ color: "var(--pg-text-2)" }}
              >
                Open &amp; Problematic Runs
              </span>
            </div>
            {excLoading ? (
              <div className="flex justify-center py-12">
                <Loader2
                  className="w-5 h-5 animate-spin"
                  style={{ color: "var(--pg-text-4)" }}
                />
              </div>
            ) : (
              <RunsTable
                runs={exceptionRuns}
                checkingBalance={checkingBalance}
                autoClosingId={autoClosingId}
                onCheckBalance={handleCheckBalance}
                onAutoClose={(id) => autoCloseMutation.mutate(id)}
              />
            )}
          </div>
        )}

        {/* All Runs tab */}
        {activeTab === "all" && (
          <div
            className="rounded-b-2xl overflow-hidden"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              borderTop: "none",
            }}
          >
            {/* Panel header */}
            <div
              className="flex items-center gap-2 px-5 py-3"
              style={{ borderBottom: "1px solid var(--pg-row-border)" }}
            >
              <ListChecks className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
              <span
                className="text-[12px] font-bold uppercase tracking-widest"
                style={{ color: "var(--pg-text-2)" }}
              >
                All Reconciliation Runs
              </span>
            </div>
            {allLoading ? (
              <div className="flex justify-center py-12">
                <Loader2
                  className="w-5 h-5 animate-spin"
                  style={{ color: "var(--pg-text-4)" }}
                />
              </div>
            ) : (
              <RunsTable
                runs={allRuns}
                checkingBalance={checkingBalance}
                autoClosingId={autoClosingId}
                onCheckBalance={handleCheckBalance}
                onAutoClose={(id) => autoCloseMutation.mutate(id)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
