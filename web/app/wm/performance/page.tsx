"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, TrendingUp, TrendingDown, BarChart3,
  Activity, Calculator, RefreshCw, Users,
} from "lucide-react";

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

// ── Period Buttons ─────────────────────────────────────────────────────────────

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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
      <Icon style={{ width: 12, height: 12, flexShrink: 0, color }} />
      <span
        style={{
          fontFamily:  "monospace",
          fontWeight:  600,
          fontSize:    12,
          fontVariantNumeric: "tabular-nums",
          color,
        }}
      >
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
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  accentColor: string;
  accentBg: string;
  isReturn?: boolean;
}) {
  const displayColor =
    isReturn && typeof value === "number" ? returnColor(value) : accentColor;

  const displayValue =
    typeof value === "number" && isReturn
      ? fmtPct(value)
      : typeof value === "number"
        ? fmtNum(value)
        : (value ?? "—");

  return (
    <div
      style={{
        background:   "var(--pg-card)",
        border:       "1px solid var(--pg-card-border)",
        borderRadius: 16,
        padding:      20,
        display:      "flex",
        alignItems:   "flex-start",
        gap:          16,
      }}
    >
      <div
        style={{
          width:          40,
          height:         40,
          borderRadius:   12,
          background:     accentBg,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
        }}
      >
        <Icon style={{ width: 20, height: 20, color: accentColor }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize:      11,
            fontWeight:    700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color:         "var(--pg-text-3)",
            margin:        0,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize:           22,
            fontWeight:         700,
            lineHeight:         1.2,
            marginTop:          2,
            fontVariantNumeric: "tabular-nums",
            color:              displayColor,
            margin:             "2px 0 0",
          }}
        >
          {displayValue}
        </p>
        {sub && (
          <p
            style={{
              fontSize:   10,
              marginTop:  2,
              fontFamily: "monospace",
              color:      "var(--pg-text-4)",
              whiteSpace: "nowrap",
              overflow:   "hidden",
              textOverflow: "ellipsis",
              margin:     "2px 0 0",
            }}
          >
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Shared table styles ────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding:       "11px 16px",
  textAlign:     "left",
  fontSize:      10,
  fontWeight:    700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color:         "var(--pg-text-3)",
  whiteSpace:    "nowrap",
};

const thRight: React.CSSProperties = { ...thStyle, textAlign: "right" };

// ── History Table ──────────────────────────────────────────────────────────────

function HistoryTable({ rows }: { rows: PerformanceHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          padding:        "56px 16px",
          textAlign:      "center",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:            12,
        }}
      >
        <div
          style={{
            width:          48,
            height:         48,
            borderRadius:   16,
            background:     "var(--pg-muted-bg)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
          }}
        >
          <BarChart3 style={{ width: 24, height: 24, color: "var(--pg-text-4)" }} />
        </div>
        <p style={{ fontSize: 13, color: "var(--pg-text-3)", margin: 0 }}>
          No performance history available. Calculate a period to generate records.
        </p>
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <th style={{ ...thStyle, paddingLeft: 20 }}>Period</th>
          <th style={thStyle}>From</th>
          <th style={thStyle}>To</th>
          <th style={thRight}>TWR %</th>
          <th style={thRight}>MWR %</th>
          <th style={thRight}>Sharpe</th>
          <th style={thRight}>Volatility %</th>
          <th style={thRight}>Benchmark %</th>
          <th style={{ ...thRight, paddingRight: 20 }}>Excess %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <HistoryRow key={`${row.period}-${i}`} row={row} isLast={i === rows.length - 1} />
        ))}
      </tbody>
    </table>
  );
}

function HistoryRow({ row, isLast }: { row: PerformanceHistoryRow; isLast: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:   hovered ? "var(--pg-row-hover)" : "transparent",
        borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)",
        transition:   "background 0.12s",
      }}
    >
      <td style={{ padding: "12px 16px 12px 20px" }}>
        <span
          style={{
            fontSize:     10,
            fontWeight:   700,
            padding:      "2px 8px",
            borderRadius: 999,
            background:   "var(--pg-muted-bg)",
            color:        "var(--pg-text-2)",
          }}
        >
          {row.period_label || row.period}
        </span>
      </td>
      <td style={{ padding: "12px 16px", fontSize: 11, color: "var(--pg-text-3)" }}>
        {fmtDate(row.start_date)}
      </td>
      <td style={{ padding: "12px 16px", fontSize: 11, color: "var(--pg-text-3)" }}>
        {fmtDate(row.end_date)}
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right" }}>
        <ReturnCell value={row.twr} />
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right" }}>
        <ReturnCell value={row.mwr} />
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right" }}>
        <span
          style={{
            fontFamily:         "monospace",
            fontWeight:         600,
            fontSize:           12,
            fontVariantNumeric: "tabular-nums",
            color:              row.sharpe_ratio >= 1 ? "#059669" : row.sharpe_ratio < 0 ? "#dc2626" : "var(--pg-text-2)",
          }}
        >
          {row.sharpe_ratio.toFixed(2)}
        </span>
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right" }}>
        <span
          style={{
            fontFamily:         "monospace",
            fontSize:           12,
            fontVariantNumeric: "tabular-nums",
            color:              "var(--pg-text-2)",
          }}
        >
          {fmtPctAbs(row.volatility)}
        </span>
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right" }}>
        <ReturnCell value={row.benchmark_return} />
      </td>
      <td style={{ padding: "12px 20px 12px 16px", textAlign: "right" }}>
        <span
          style={{
            fontSize:           11,
            fontWeight:         700,
            padding:            "2px 6px",
            borderRadius:       999,
            fontVariantNumeric: "tabular-nums",
            fontFamily:         "monospace",
            background:         returnBg(row.excess_return),
            color:              returnColor(row.excess_return),
          }}
        >
          {fmtPct(row.excess_return)}
        </span>
      </td>
    </tr>
  );
}

// ── Client Performance Table ───────────────────────────────────────────────────

function ClientTable({ rows }: { rows: ClientPerformanceRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          padding:        "56px 16px",
          textAlign:      "center",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:            12,
        }}
      >
        <div
          style={{
            width:          48,
            height:         48,
            borderRadius:   16,
            background:     "var(--pg-muted-bg)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
          }}
        >
          <Users style={{ width: 24, height: 24, color: "var(--pg-text-4)" }} />
        </div>
        <p style={{ fontSize: 13, color: "var(--pg-text-3)", margin: 0 }}>
          No client accounts linked to this fund.
        </p>
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <th style={{ ...thStyle, paddingLeft: 20 }}>Account #</th>
          <th style={thStyle}>Client</th>
          <th style={thRight}>Invested</th>
          <th style={thRight}>Current Value</th>
          <th style={thRight}>Abs. Return</th>
          <th style={thRight}>Return %</th>
          <th style={{ ...thRight, paddingRight: 20 }}>Days Held</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <ClientRow key={row.account_number} row={row} isLast={i === rows.length - 1} />
        ))}
      </tbody>
    </table>
  );
}

function ClientRow({ row, isLast }: { row: ClientPerformanceRow; isLast: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:   hovered ? "var(--pg-row-hover)" : "transparent",
        borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)",
        transition:   "background 0.12s",
      }}
    >
      <td style={{ padding: "12px 16px 12px 20px" }}>
        <code style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: "var(--pg-text-1)" }}>
          {row.account_number}
        </code>
      </td>
      <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--pg-text-1)" }}>
        {row.client_name}
      </td>
      <td
        style={{
          padding:            "12px 16px",
          textAlign:          "right",
          fontSize:           12,
          fontFamily:         "monospace",
          fontVariantNumeric: "tabular-nums",
          color:              "var(--pg-text-2)",
        }}
      >
        {fmtCompact(row.invested)}
      </td>
      <td
        style={{
          padding:            "12px 16px",
          textAlign:          "right",
          fontSize:           12,
          fontFamily:         "monospace",
          fontWeight:         600,
          fontVariantNumeric: "tabular-nums",
          color:              "var(--pg-text-1)",
        }}
      >
        {fmtCompact(row.current_value)}
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
          {row.absolute_return >= 0
            ? <TrendingUp style={{ width: 12, height: 12, flexShrink: 0, color: "#059669" }} />
            : <TrendingDown style={{ width: 12, height: 12, flexShrink: 0, color: "#dc2626" }} />}
          <span
            style={{
              fontFamily:         "monospace",
              fontWeight:         600,
              fontVariantNumeric: "tabular-nums",
              fontSize:           12,
              color:              returnColor(row.absolute_return),
            }}
          >
            {row.absolute_return >= 0 ? "+" : ""}{fmtCompact(Math.abs(row.absolute_return))}
          </span>
        </div>
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right" }}>
        <span
          style={{
            fontSize:           11,
            fontWeight:         700,
            padding:            "2px 6px",
            borderRadius:       999,
            fontVariantNumeric: "tabular-nums",
            fontFamily:         "monospace",
            background:         returnBg(row.return_pct),
            color:              returnColor(row.return_pct),
          }}
        >
          {fmtPct(row.return_pct)}
        </span>
      </td>
      <td
        style={{
          padding:            "12px 20px 12px 16px",
          textAlign:          "right",
          fontSize:           12,
          fontFamily:         "monospace",
          fontVariantNumeric: "tabular-nums",
          color:              "var(--pg-text-3)",
        }}
      >
        {row.days_held.toLocaleString()}d
      </td>
    </tr>
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
          label:       "TWR",
          value:       summary.twr,
          sub:         "Time-Weighted Return",
          icon:        TrendingUp,
          accentColor: summary.twr >= 0 ? "#059669" : "#dc2626",
          accentBg:    summary.twr >= 0 ? "#d1fae5" : "#fee2e2",
          isReturn:    true,
        },
        {
          label:       "MWR",
          value:       summary.mwr,
          sub:         "Money-Weighted Return",
          icon:        summary.mwr >= 0 ? TrendingUp : TrendingDown,
          accentColor: summary.mwr >= 0 ? "#047857" : "#b91c1c",
          accentBg:    summary.mwr >= 0 ? "#d1fae5" : "#fee2e2",
          isReturn:    true,
        },
        {
          label:       "Sharpe Ratio",
          value:       summary.sharpe_ratio,
          sub:         "Risk-adjusted return",
          icon:        BarChart3,
          accentColor: summary.sharpe_ratio >= 1 ? "#059669" : "#d97706",
          accentBg:    summary.sharpe_ratio >= 1 ? "#d1fae5" : "#fef3c7",
          isReturn:    false,
        },
        {
          label:       "Volatility",
          value:       summary.volatility,
          sub:         "Annualised std deviation",
          icon:        Activity,
          accentColor: "#7c3aed",
          accentBg:    "#ede9fe",
          isReturn:    true,
        },
        {
          label:       "Benchmark Return",
          value:       summary.benchmark_return,
          sub:         selectedFund?.benchmark || "Benchmark",
          icon:        BarChart3,
          accentColor: summary.benchmark_return >= 0 ? "#0891b2" : "#dc2626",
          accentBg:    summary.benchmark_return >= 0 ? "#e0f2fe" : "#fee2e2",
          isReturn:    true,
        },
        {
          label:       "Excess Return",
          value:       summary.excess_return,
          sub:         "Alpha vs benchmark",
          icon:        summary.excess_return >= 0 ? TrendingUp : TrendingDown,
          accentColor: summary.excess_return >= 0 ? "#FF6600" : "#dc2626",
          accentBg:    summary.excess_return >= 0 ? "#fff0e0" : "#fee2e2",
          isReturn:    true,
        },
      ]
    : [];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }} className="space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pg-text-1)", margin: 0 }}>
            Performance Analytics
          </h1>
          <p style={{ fontSize: 13, marginTop: 4, color: "var(--pg-text-3)" }}>
            Time-weighted returns, risk metrics, and client-level attribution
          </p>
        </div>
      </div>

      {/* Controls row */}
      <div
        style={{
          background:   "var(--pg-card)",
          border:       "1px solid var(--pg-card-border)",
          borderRadius: 16,
          padding:      16,
          display:      "flex",
          flexWrap:     "wrap",
          alignItems:   "flex-end",
          gap:          16,
        }}
      >
        {/* Fund selector */}
        <div style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
          <p
            style={{
              fontSize:      10,
              fontWeight:    700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color:         "var(--pg-text-3)",
              marginBottom:  6,
            }}
          >
            Fund
          </p>
          {fundsLoading ? (
            <div
              style={{
                height:     36,
                borderRadius: 12,
                display:    "flex",
                alignItems: "center",
                padding:    "0 12px",
                background: "var(--pg-muted-bg)",
                border:     "1px solid var(--pg-card-border)",
              }}
            >
              <Loader2 style={{ width: 14, height: 14, color: "var(--pg-text-4)" }} className="animate-spin" />
            </div>
          ) : (
            <select
              value={activeFundId}
              onChange={e => {
                setSelectedFundId(e.target.value ?? "");
                setResult(null);
              }}
              style={{
                width:        "100%",
                height:       36,
                padding:      "0 12px",
                borderRadius: 12,
                fontSize:     13,
                outline:      "none",
                cursor:       "pointer",
                background:   "var(--pg-card)",
                border:       "1px solid var(--pg-card-border)",
                color:        "var(--pg-text-1)",
              }}
            >
              {funds.length === 0 && (
                <option value="">No funds available</option>
              )}
              {funds.map(f => (
                <option key={f.id} value={f.id}>
                  {f.code} — {f.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Period buttons */}
        <div>
          <p
            style={{
              fontSize:      10,
              fontWeight:    700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color:         "var(--pg-text-3)",
              marginBottom:  6,
            }}
          >
            Period
          </p>
          <div
            style={{
              display:      "flex",
              gap:          4,
              padding:      4,
              borderRadius: 12,
              background:   "var(--pg-muted-bg)",
              border:       "1px solid var(--pg-card-border)",
            }}
          >
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => { setPeriod(p.id); setResult(null); }}
                style={{
                  height:     28,
                  padding:    "0 12px",
                  borderRadius: 8,
                  fontSize:   12,
                  fontWeight: 600,
                  cursor:     "pointer",
                  border:     "none",
                  transition: "all 0.15s",
                  ...(period === p.id
                    ? { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "white" }
                    : { background: "transparent", color: "var(--pg-text-2)" }),
                }}
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
          style={{
            height:     36,
            padding:    "0 20px",
            borderRadius: 12,
            fontSize:   13,
            fontWeight: 600,
            color:      "white",
            background: "linear-gradient(135deg,#FF6600,#E05500)",
            border:     "none",
            cursor:     calculating || !activeFundId ? "not-allowed" : "pointer",
            opacity:    calculating || !activeFundId ? 0.6 : 1,
            display:    "flex",
            alignItems: "center",
            gap:        8,
            transition: "opacity 0.15s",
          }}
        >
          {calculating
            ? <><Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> Calculating…</>
            : <><Calculator style={{ width: 16, height: 16 }} /> Calculate</>}
        </button>

        {/* Fund metadata if selected */}
        {selectedFund && (
          <div
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        12,
              flexWrap:   "wrap",
              marginLeft: "auto",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
              Benchmark:{" "}
              <strong style={{ color: "var(--pg-text-2)" }}>
                {selectedFund.benchmark || "—"}
              </strong>
            </span>
            <span style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
              AUM:{" "}
              <strong style={{ color: "var(--pg-text-2)" }}>
                {fmtCompact(selectedFund.aum)}
              </strong>
            </span>
            {selectedFund.target_return != null && (
              <span style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
                Target:{" "}
                <strong style={{ color: "#059669" }}>
                  {selectedFund.target_return.toFixed(1)}%
                </strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Empty / initial state */}
      {!result && !calculating && (
        <div
          style={{
            background:     "var(--pg-card)",
            border:         "1px solid var(--pg-card-border)",
            borderRadius:   16,
            padding:        "64px 16px",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            gap:            12,
          }}
        >
          <div
            style={{
              width:          56,
              height:         56,
              borderRadius:   16,
              background:     "#fff0e0",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
            }}
          >
            <Calculator style={{ width: 28, height: 28, color: "#FF6600" }} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--pg-text-1)", margin: 0 }}>
            Ready to calculate
          </p>
          <p style={{ fontSize: 12, color: "var(--pg-text-3)", maxWidth: 300, textAlign: "center", margin: 0 }}>
            Select a fund and period above, then press Calculate to generate performance metrics.
          </p>
        </div>
      )}

      {/* Loading */}
      {calculating && (
        <div
          style={{
            background:     "var(--pg-card)",
            border:         "1px solid var(--pg-card-border)",
            borderRadius:   16,
            padding:        "64px 16px",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            12,
          }}
        >
          <Loader2 style={{ width: 28, height: 28, color: "#FF6600" }} className="animate-spin" />
          <p style={{ fontSize: 13, color: "var(--pg-text-3)", margin: 0 }}>
            Calculating performance metrics…
          </p>
        </div>
      )}

      {/* Results */}
      {result && !calculating && (
        <div className="space-y-5">

          {/* Period label + date range */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize:     10,
                fontWeight:   700,
                padding:      "4px 10px",
                borderRadius: 999,
                background:   "#fff0e0",
                color:        "#FF6600",
              }}
            >
              {summary?.period_label || period}
            </span>
            {summary && (
              <span style={{ fontSize: 12, color: "var(--pg-text-3)" }}>
                {fmtDate(summary.start_date)} — {fmtDate(summary.end_date)}
              </span>
            )}
            <button
              onClick={calculate}
              style={{
                marginLeft:   "auto",
                display:      "flex",
                alignItems:   "center",
                gap:          6,
                fontSize:     11,
                fontWeight:   600,
                height:       28,
                padding:      "0 12px",
                borderRadius: 8,
                background:   "var(--pg-muted-bg)",
                color:        "var(--pg-text-2)",
                border:       "1px solid var(--pg-card-border)",
                cursor:       "pointer",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#FF6600"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--pg-text-2)"}
            >
              <RefreshCw style={{ width: 12, height: 12 }} />
              Refresh
            </button>
          </div>

          {/* Summary metric cards — 3+3 grid */}
          <div
            style={{
              display:             "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap:                 16,
            }}
          >
            {metricCards.map(card => (
              <MetricCard key={card.label} {...card} />
            ))}
          </div>

          {/* Performance History table */}
          <div
            style={{
              background:   "var(--pg-card)",
              border:       "1px solid var(--pg-card-border)",
              borderRadius: 16,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px var(--pg-card-shadow)",
            }}
          >
            {/* Section header */}
            <div
              style={{
                display:       "flex",
                alignItems:    "center",
                justifyContent: "space-between",
                padding:       "14px 20px",
                borderBottom:  "1px solid var(--pg-row-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p
                  style={{
                    fontSize:      11,
                    fontWeight:    700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color:         "var(--pg-text-3)",
                    margin:        0,
                  }}
                >
                  Performance History
                </p>
                <BarChart3 style={{ width: 14, height: 14, color: "#7c3aed" }} />
                <span style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
                  {history.length} period{history.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <HistoryTable rows={history} />
          </div>

          {/* Client Performance table */}
          <div
            style={{
              background:   "var(--pg-card)",
              border:       "1px solid var(--pg-card-border)",
              borderRadius: 16,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px var(--pg-card-shadow)",
            }}
          >
            {/* Section header */}
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                padding:        "14px 20px",
                borderBottom:   "1px solid var(--pg-row-border)",
                flexWrap:       "wrap",
                gap:            8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p
                  style={{
                    fontSize:      11,
                    fontWeight:    700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color:         "var(--pg-text-3)",
                    margin:        0,
                  }}
                >
                  Client Performance
                </p>
                <Users style={{ width: 14, height: 14, color: "#0891b2" }} />
                <span style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
                  {clients.length} account{clients.length !== 1 ? "s" : ""}
                </span>
              </div>
              {clients.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--pg-text-3)" }}>
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
            <ClientTable rows={clients} />
          </div>

        </div>
      )}

    </div>
  );
}
