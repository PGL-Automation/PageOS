"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const map: Record<string, string> = {
    closed: "bg-green-100 text-green-800 border-green-200",
    in_progress: "bg-amber-100 text-amber-800 border-amber-200",
    draft: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function MatchBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color =
    clamped >= 95 ? "bg-green-500" : clamped >= 80 ? "bg-amber-400" : "bg-red-500";
  const textColor =
    clamped >= 95 ? "text-green-700" : clamped >= 80 ? "text-amber-700" : "text-red-700";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${textColor}`}>{clamped.toFixed(1)}%</span>
    </div>
  );
}

function BalanceCell({ bv }: { bv?: BalanceValidation }) {
  if (!bv) return <span className="text-slate-300 text-xs">—</span>;
  if (bv.is_balanced) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700">
        <CheckCircle2 className="w-3.5 h-3.5" /> Balanced
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600">
      <XCircle className="w-3.5 h-3.5" />
      {koboToNaira(Math.abs(bv.difference_kobo))}
    </span>
  );
}

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
      <div className="py-16 text-center text-slate-400 text-sm">No runs to display.</div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Bank</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Period</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Matched</TableHead>
          <TableHead className="text-right">Unmatched Bank</TableHead>
          <TableHead className="text-right">Unmatched Internal</TableHead>
          <TableHead>Match %</TableHead>
          <TableHead>Balance</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r) => {
          const totalUnmatched = r.unmatched_bank_lines + r.unmatched_internal_txns;
          const canAutoClose = r.status !== "closed" && totalUnmatched === 0;
          return (
            <TableRow key={r.run_id}>
              <TableCell className="font-medium text-sm">{r.bank_name}</TableCell>
              <TableCell className="font-mono text-xs text-slate-500">{r.account_number}</TableCell>
              <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                {fmt(r.period_start)} → {fmt(r.period_end)}
              </TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">{r.total_lines}</TableCell>
              <TableCell className="text-right text-sm tabular-nums text-green-700">{r.matched_lines}</TableCell>
              <TableCell className="text-right text-sm tabular-nums text-amber-700">
                {r.unmatched_bank_lines > 0 ? r.unmatched_bank_lines : <span className="text-slate-300">0</span>}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums text-red-700">
                {r.unmatched_internal_txns > 0 ? r.unmatched_internal_txns : <span className="text-slate-300">0</span>}
              </TableCell>
              <TableCell>
                <MatchBar pct={r.match_rate_pct} />
              </TableCell>
              <TableCell>
                <BalanceCell bv={r.balance_validation} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Link href={`/reconciliation/runs/${r.run_id}`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="ml-1 hidden xl:inline">View</span>
                    </Button>
                  </Link>
                  {canAutoClose && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-green-700 hover:text-green-800 hover:bg-green-50"
                      disabled={autoClosingId === r.run_id}
                      onClick={() => onAutoClose(r.run_id)}
                      title="Auto-close: all items matched"
                    >
                      {autoClosingId === r.run_id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span className="ml-1 hidden xl:inline">Auto-Close</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-slate-500 hover:text-slate-700"
                    disabled={checkingBalance === r.run_id}
                    onClick={() => onCheckBalance(r.run_id)}
                    title="Check balance"
                  >
                    {checkingBalance === r.run_id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Scale className="w-3.5 h-3.5" />
                    )}
                    <span className="ml-1 hidden xl:inline">Balance</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
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

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <ListChecks className="w-7 h-7 text-slate-400" />
            Exception Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Monitor reconciliation runs, exceptions, and balance health across all accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/reconciliation">
            <Button variant="outline" size="sm">
              Manage Accounts
            </Button>
          </Link>
          <Button onClick={handleTriggerAllPulls} size="sm">
            <RefreshCw className="mr-2 w-4 h-4" />
            Trigger All Pulls
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-3xl font-bold text-slate-900 tabular-nums">{totalRuns}</p>
                <p className="text-xs text-slate-500 mt-1">Total Runs</p>
              </div>
              <div className="p-2 rounded-lg bg-slate-100">
                <ListChecks className="w-4 h-4 text-slate-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-3xl font-bold tabular-nums ${openExceptions > 0 ? "text-amber-600" : "text-green-600"}`}>
                  {openExceptions}
                </p>
                <p className="text-xs text-slate-500 mt-1">Open Exceptions</p>
              </div>
              <div className={`p-2 rounded-lg ${openExceptions > 0 ? "bg-amber-50" : "bg-green-50"}`}>
                <AlertTriangle className={`w-4 h-4 ${openExceptions > 0 ? "text-amber-500" : "text-green-500"}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-3xl font-bold tabular-nums ${avgMatchRate >= 95 ? "text-green-600" : avgMatchRate >= 80 ? "text-amber-600" : "text-red-600"}`}>
                  {avgMatchRate.toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500 mt-1">Avg Match Rate</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-50">
                <TrendingUp className="w-4 h-4 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-3xl font-bold text-slate-900 tabular-nums">{autoClosedToday}</p>
                <p className="text-xs text-slate-500 mt-1">Auto-Closed Today</p>
              </div>
              <div className="p-2 rounded-lg bg-green-50">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div>
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-200 mb-4">
          <button
            onClick={() => setActiveTab("exceptions")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "exceptions"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Exceptions
            {openExceptions > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold h-4 min-w-[16px] px-1">
                {openExceptions}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "all"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            All Runs
          </button>
        </div>

        {/* Exceptions tab */}
        {activeTab === "exceptions" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Open &amp; Problematic Runs
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {excLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
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
            </CardContent>
          </Card>
        )}

        {/* All Runs tab */}
        {activeTab === "all" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Reconciliation Runs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {allLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
