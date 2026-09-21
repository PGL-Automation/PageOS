"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, AlertCircle, TrendingUp, TrendingDown, BarChart3,
  Activity, Calculator, RefreshCw, Users,
} from "lucide-react";
import {
  Card, CardHeader, CardTitle, CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ── Constants ──────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type Fund = {
  id: string;
  code: string;
  name: string;
  fund_type: string;
  benchmark: string;
  currency: string;
  inception_date: string;
  target_return?: number;
  status: string;
  aum: number;
};

type Period = "1M" | "3M" | "6M" | "1Y" | "YTD" | "inception";

type PerformanceSummary = {
  fund_id: string;
  fund_name: string;
  period: string;
  period_label: string;
  start_date: string;
  end_date: string;
  twr: number;
  mwr: number;
  sharpe_ratio: number;
  volatility: number;
  benchmark_return: number;
  excess_return: number;
};

type PerformanceHistoryRow = {
  period: string;
  period_label: string;
  start_date: string;
  end_date: string;
  twr: number;
  mwr: number;
  sharpe_ratio: number;
  volatility: number;
  benchmark_return: number;
  excess_return: number;
};

type ClientPerformanceRow = {
  account_number: string;
  client_id: string;
  client_name: string;
  invested: number;
  current_value: number;
  absolute_return: number;
  return_pct: number;
  days_held: number;
};

type PerformanceResponse = {
  summary: PerformanceSummary;
  history: PerformanceHistoryRow[];
  client_performance: ClientPerformanceRow[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtPctAbs(n: number): string {
  return `${n.toFixed(2)}%`;
}

function fmtNum(n: number, dp = 2): string {
  return n.toLocaleString("en-NG", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `${sign}₦${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${sign}₦${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₦${abs.toFixed(2)}`;
}

function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function returnColor(n: number): string {
  if (n > 0) return "#059669";
  if (n < 0) return "#dc2626";
  return "var(--pg-text-3)";
}

function returnBg(n: number): string {
  if (n > 0) return "#d1fae5";
  if (n < 0) return "#fee2e2";
  return "var(--pg-muted-bg)";
}

// ── API ────────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ?? "Request failed"
    );
  }
  return res.json() as Promise<T>;
}

// ── Period Button ──────────────────────────────────────────────────────────────

const PERIODS: { id: Period; label: string }[] = [
  { id: "1M",        label: "1M"        },
  { id: "3M",        label: "3M"        },
  { id: "6M",        label: "6M"        },
  { id: "1Y",        label: "1Y"        },
  { id: "YTD",       label: "YTD"       },
  { id: "inception", label: "Inception" },
];

// ── Return Cell ────────────────────────────────────────────────────────────────

function ReturnCell({ value, showSign = true }: { value: number; showSign?: boolean }) {
  const color = returnColor(value);
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Activity;
  return (
    <div className="flex items-center justify-end gap-1">
      <Icon className="w-3 h-3 shrink-0" style={{ color }} />
      <span className="font-mono font-semibold tabular-nums text-[12px]" style={{ color }}>
        {showSign ? fmtPct(value) : fmtPctAbs(value)}
      </span>
    </div>
  );
}

// ── Metric Card ────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accentColor,
  accentBg,
  isReturn = false,
}: {
  label: string;
  value: string | number | null;
  sub?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accentColor: string;
  accentBg: string;
  isReturn?: boolean;
}) {
  const displayColor =
    isReturn && typeof value === "number"
      ? returnColor(value)
      : accentColor;

  const displayValue =
    typeof value === "number" && isReturn
      ? fmtPct(value)
      : typeof value === "number"
        ? fmtNum(value)
        : (value ?? "—");

  return (
    <div
      className="rounded-2xl p-5 flex items-start gap-4"
      style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: accentBg }}
      >
        <Icon className="w-5 h-5" style={{ color: accentColor }} />
      </div>
      <div className="min-w-0">
        <p
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "var(--pg-text-3)" }}
        >
          {label}
        </p>
        <p
          className="text-[22px] font-bold leading-tight mt-0.5 tabular-nums"
          style={{ color: displayColor }}
        >
          {displayValue}
        </p>
        {sub && (
          <p className="text-[10px] mt-0.5 font-mono truncate" style={{ color: "var(--pg-text-4)" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ── History Table ──────────────────────────────────────────────────────────────

function HistoryTable({ rows }: { rows: PerformanceHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center">
        <BarChart3 className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--pg-text-4)" }} />
        <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          No performance history available. Calculate a period to generate records.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider pl-5">
            Period
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider">
            From
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider">
            To
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
            TWR %
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
            MWR %
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
            Sharpe
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
            Volatility %
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
            Benchmark %
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right pr-5">
            Excess %
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={`${row.period}-${i}`}>
            <TableCell className="pl-5">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
              >
                {row.period_label || row.period}
              </span>
            </TableCell>
            <TableCell className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              {fmtDate(row.start_date)}
            </TableCell>
            <TableCell className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              {fmtDate(row.end_date)}
            </TableCell>
            <TableCell className="text-right">
              <ReturnCell value={row.twr} />
            </TableCell>
            <TableCell className="text-right">
              <ReturnCell value={row.mwr} />
            </TableCell>
            <TableCell className="text-right">
              <span
                className="font-mono font-semibold text-[12px] tabular-nums"
                style={{ color: row.sharpe_ratio >= 1 ? "#059669" : row.sharpe_ratio < 0 ? "#dc2626" : "var(--pg-text-2)" }}
              >
                {row.sharpe_ratio.toFixed(2)}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <span
                className="font-mono text-[12px] tabular-nums"
                style={{ color: "var(--pg-text-2)" }}
              >
                {fmtPctAbs(row.volatility)}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <ReturnCell value={row.benchmark_return} />
            </TableCell>
            <TableCell className="text-right pr-5">
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded-full tabular-nums font-mono"
                style={{
                  background: returnBg(row.excess_return),
                  color: returnColor(row.excess_return),
                }}
              >
                {fmtPct(row.excess_return)}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Client Performance Table ───────────────────────────────────────────────────

function ClientTable({ rows }: { rows: ClientPerformanceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center">
        <Users className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--pg-text-4)" }} />
        <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          No client accounts linked to this fund.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider pl-5">
            Account #
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider">
            Client
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
            Invested
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
            Current Value
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
            Abs. Return
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
            Return %
          </TableHead>
          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right pr-5">
            Days Held
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(row => (
          <TableRow key={row.account_number}>
            <TableCell className="pl-5">
              <code
                className="text-[11px] font-bold font-mono"
                style={{ color: "var(--pg-text-1)" }}
              >
                {row.account_number}
              </code>
            </TableCell>
            <TableCell className="text-[12px]" style={{ color: "var(--pg-text-1)" }}>
              {row.client_name}
            </TableCell>
            <TableCell
              className="text-right text-[12px] font-mono tabular-nums"
              style={{ color: "var(--pg-text-2)" }}
            >
              {fmtCompact(row.invested)}
            </TableCell>
            <TableCell
              className="text-right text-[12px] font-mono font-semibold tabular-nums"
              style={{ color: "var(--pg-text-1)" }}
            >
              {fmtCompact(row.current_value)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                {row.absolute_return >= 0
                  ? <TrendingUp className="w-3 h-3 shrink-0" style={{ color: "#059669" }} />
                  : <TrendingDown className="w-3 h-3 shrink-0" style={{ color: "#dc2626" }} />}
                <span
                  className="font-mono font-semibold tabular-nums text-[12px]"
                  style={{ color: returnColor(row.absolute_return) }}
                >
                  {row.absolute_return >= 0 ? "+" : ""}{fmtCompact(Math.abs(row.absolute_return))}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right">
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded-full tabular-nums font-mono"
                style={{
                  background: returnBg(row.return_pct),
                  color: returnColor(row.return_pct),
                }}
              >
                {fmtPct(row.return_pct)}
              </span>
            </TableCell>
            <TableCell
              className="text-right text-[12px] font-mono tabular-nums pr-5"
              style={{ color: "var(--pg-text-3)" }}
            >
              {row.days_held.toLocaleString()}d
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const { toast } = useToast();
  const [selectedFundId, setSelectedFundId] = useState<string>("");
  const [period, setPeriod] = useState<Period>("1Y");
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<PerformanceResponse | null>(null);

  // ── Funds list ────────────────────────────────────────────────────────────────

  const { data: funds = [], isLoading: fundsLoading } = useQuery<Fund[]>({
    queryKey: ["funds-list"],
    queryFn: () => apiFetch<Fund[]>("/api/v1/portfolio/funds"),
  });

  // ── Auto-select first active fund ─────────────────────────────────────────────

  const firstFundId = funds.find(f => f.status === "active")?.id ?? funds[0]?.id;
  const activeFundId = selectedFundId || firstFundId || "";

  // ── Calculate handler ─────────────────────────────────────────────────────────

  async function calculate() {
    if (!activeFundId) {
      toast({ title: "Select a fund first", variant: "destructive" });
      return;
    }
    setCalculating(true);
    setResult(null);
    try {
      const data = await apiFetch<PerformanceResponse>(
        `/api/v1/portfolio/funds/${activeFundId}/performance?period=${period}`
      );
      setResult(data);
    } catch (err) {
      toast({
        title: "Calculation failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
  }

  const summary = result?.summary ?? null;
  const history = result?.history ?? [];
  const clients = result?.client_performance ?? [];

  const selectedFund = funds.find(f => f.id === activeFundId);

  // ── Metric cards config ───────────────────────────────────────────────────────

  const metricCards = summary
    ? [
        {
          label: "TWR",
          value: summary.twr,
          sub: "Time-Weighted Return",
          icon: TrendingUp,
          accentColor: summary.twr >= 0 ? "#059669" : "#dc2626",
          accentBg: summary.twr >= 0 ? "#d1fae5" : "#fee2e2",
          isReturn: true,
        },
        {
          label: "MWR",
          value: summary.mwr,
          sub: "Money-Weighted Return",
          icon: summary.mwr >= 0 ? TrendingUp : TrendingDown,
          accentColor: summary.mwr >= 0 ? "#047857" : "#b91c1c",
          accentBg: summary.mwr >= 0 ? "#d1fae5" : "#fee2e2",
          isReturn: true,
        },
        {
          label: "Sharpe Ratio",
          value: summary.sharpe_ratio,
          sub: "Risk-adjusted return",
          icon: BarChart3,
          accentColor: summary.sharpe_ratio >= 1 ? "#059669" : "#d97706",
          accentBg: summary.sharpe_ratio >= 1 ? "#d1fae5" : "#fef3c7",
          isReturn: false,
        },
        {
          label: "Volatility",
          value: summary.volatility,
          sub: "Annualised std deviation",
          icon: Activity,
          accentColor: "#7c3aed",
          accentBg: "#ede9fe",
          isReturn: true,
        },
        {
          label: "Benchmark Return",
          value: summary.benchmark_return,
          sub: selectedFund?.benchmark || "Benchmark",
          icon: BarChart3,
          accentColor: summary.benchmark_return >= 0 ? "#0891b2" : "#dc2626",
          accentBg: summary.benchmark_return >= 0 ? "#e0f2fe" : "#fee2e2",
          isReturn: true,
        },
        {
          label: "Excess Return",
          value: summary.excess_return,
          sub: "Alpha vs benchmark",
          icon: summary.excess_return >= 0 ? TrendingUp : TrendingDown,
          accentColor: summary.excess_return >= 0 ? "#FF6600" : "#dc2626",
          accentBg: summary.excess_return >= 0 ? "#fff0e0" : "#fee2e2",
          isReturn: true,
        },
      ]
    : [];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Performance Analytics
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Time-weighted returns, risk metrics, and client-level attribution
          </p>
        </div>
      </div>

      {/* Controls row */}
      <div
        className="rounded-2xl p-4 flex flex-wrap items-end gap-4"
        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
      >
        {/* Fund selector */}
        <div className="flex-1 min-w-[200px] max-w-xs">
          <p
            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
            style={{ color: "var(--pg-text-3)" }}
          >
            Fund
          </p>
          {fundsLoading ? (
            <div className="h-8 rounded-lg flex items-center px-3"
                 style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)" }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
            </div>
          ) : (
            <Select
              value={activeFundId}
              onValueChange={v => {
                setSelectedFundId(v ?? "");
                setResult(null);
              }}
            >
              <SelectTrigger className="w-full h-9 rounded-xl text-[13px]">
                <SelectValue placeholder="Select fund…" />
              </SelectTrigger>
              <SelectContent>
                {funds.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="font-mono font-bold text-[11px] mr-1.5">{f.code}</span>
                    <span className="text-[12px]">{f.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Period buttons */}
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
            style={{ color: "var(--pg-text-3)" }}
          >
            Period
          </p>
          <div
            className="flex gap-1 p-1 rounded-xl"
            style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}
          >
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => { setPeriod(p.id); setResult(null); }}
                className="h-7 px-3 rounded-lg text-[12px] font-semibold transition-all"
                style={
                  period === p.id
                    ? { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "white" }
                    : { color: "var(--pg-text-2)" }
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Calculate button */}
        <button
          onClick={calculate}
          disabled={calculating || !activeFundId}
          className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-60 transition-opacity"
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
        >
          {calculating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculating…</>
            : <><Calculator className="w-4 h-4" /> Calculate</>}
        </button>

        {/* Fund metadata if selected */}
        {selectedFund && (
          <div className="flex items-center gap-3 flex-wrap ml-auto">
            <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              Benchmark: <strong style={{ color: "var(--pg-text-2)" }}>{selectedFund.benchmark || "—"}</strong>
            </span>
            <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              AUM: <strong style={{ color: "var(--pg-text-2)" }}>{fmtCompact(selectedFund.aum)}</strong>
            </span>
            {selectedFund.target_return != null && (
              <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                Target: <strong style={{ color: "#059669" }}>{selectedFund.target_return.toFixed(1)}%</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Empty / initial state */}
      {!result && !calculating && (
        <div
          className="rounded-2xl py-16 flex flex-col items-center justify-center gap-3"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "#fff0e0" }}
          >
            <Calculator className="w-7 h-7" style={{ color: "#FF6600" }} />
          </div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Ready to calculate
          </p>
          <p className="text-[12px] max-w-xs text-center" style={{ color: "var(--pg-text-3)" }}>
            Select a fund and period above, then press Calculate to generate performance metrics.
          </p>
        </div>
      )}

      {/* Loading */}
      {calculating && (
        <div
          className="rounded-2xl py-16 flex flex-col items-center gap-3"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#FF6600" }} />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
            Calculating performance metrics…
          </p>
        </div>
      )}

      {/* Results */}
      {result && !calculating && (
        <div className="space-y-5">

          {/* Period label + date range */}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="text-[10px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: "#fff0e0", color: "#FF6600" }}
            >
              {summary?.period_label || period}
            </span>
            {summary && (
              <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                {fmtDate(summary.start_date)} — {fmtDate(summary.end_date)}
              </span>
            )}
            <button
              onClick={calculate}
              className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold h-7 px-3 rounded-lg transition-colors"
              style={{
                background: "var(--pg-muted-bg)",
                color: "var(--pg-text-2)",
                border: "1px solid var(--pg-card-border)",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#FF6600"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--pg-text-2)"}
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>

          {/* Summary metric cards — 3+3 grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {metricCards.map(card => (
              <MetricCard key={card.label} {...card} />
            ))}
          </div>

          {/* Performance History table */}
          <Card>
            <CardHeader className="border-b" style={{ borderColor: "var(--pg-row-border)" }}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[13px] flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" style={{ color: "#7c3aed" }} />
                  Performance History
                  <span
                    className="text-[11px] font-normal ml-1"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    ({history.length} period{history.length !== 1 ? "s" : ""})
                  </span>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <HistoryTable rows={history} />
            </CardContent>
          </Card>

          {/* Client Performance table */}
          <Card>
            <CardHeader className="border-b" style={{ borderColor: "var(--pg-row-border)" }}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[13px] flex items-center gap-2">
                  <Users className="w-4 h-4" style={{ color: "#0891b2" }} />
                  Client Performance
                  <span
                    className="text-[11px] font-normal ml-1"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    ({clients.length} account{clients.length !== 1 ? "s" : ""})
                  </span>
                </CardTitle>
                {clients.length > 0 && (
                  <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                    <span>
                      Total invested:{" "}
                      <strong style={{ color: "var(--pg-text-2)" }}>
                        {fmtCompact(clients.reduce((s, c) => s + c.invested, 0))}
                      </strong>
                    </span>
                    <span>
                      Current value:{" "}
                      <strong style={{ color: "var(--pg-text-2)" }}>
                        {fmtCompact(clients.reduce((s, c) => s + c.current_value, 0))}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ClientTable rows={clients} />
            </CardContent>
          </Card>

        </div>
      )}

    </div>
  );
}
