"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, TrendingUp, Calculator, RefreshCw, ChevronDown,
  Activity, BarChart3, Layers,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ─────────────────────────────────────────────────────────────────────

type Fund = {
  id: string;
  code: string;
  name: string;
  fund_type: string;
  currency: string;
  status: string;
};

type NAVRecord = {
  id: string;
  fund_id: string;
  nav_date: string;
  total_nav: number;
  total_units: number;
  nav_per_unit: number;
  calculated_by_name?: string;
  created_at: string;
};

type RunAllResult = {
  results: { fund_id: string; fund_name: string; nav_per_unit: number; error?: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtNum(n: number, dp = 2): string {
  return n.toLocaleString("en-NG", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function fmtCompact(n: number, currency = "NGN"): string {
  const sym = currency === "USD" ? "$" : "₦";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${sym}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)     return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)         return `${sign}${sym}${(abs / 1_000).toFixed(2)}K`;
  return `${sign}${sym}${abs.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(
      (err as { error?: { message?: string }; message?: string }).error?.message ??
      (err as { message?: string }).message ??
      "Request failed"
    );
  }
  return res.json() as Promise<T>;
}

async function fetchFunds(): Promise<Fund[]> {
  const res = await fetch(`${BASE}/api/v1/portfolio/funds`, { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? json : [];
}

async function fetchNAVHistory(fundId: string): Promise<NAVRecord[]> {
  return apiFetch<NAVRecord[]>(`/api/v1/portfolio/funds/${fundId}/nav`);
}

// ── SVG Sparkline Chart ────────────────────────────────────────────────────────

function NAVChart({ data }: { data: NAVRecord[] }) {
  const WIDTH  = 700;
  const HEIGHT = 180;
  const PAD    = { top: 16, right: 16, bottom: 36, left: 60 };

  const sorted = useMemo(
    () => [...data].sort((a, b) => a.nav_date.localeCompare(b.nav_date)),
    [data]
  );

  if (sorted.length < 2) {
    return (
      <div className="flex items-center justify-center h-[180px]">
        <p className="text-[12px]" style={{ color: "var(--pg-text-4)" }}>
          At least 2 NAV records needed to draw a chart.
        </p>
      </div>
    );
  }

  const values   = sorted.map(r => r.nav_per_unit);
  const minVal   = Math.min(...values);
  const maxVal   = Math.max(...values);
  const valRange = maxVal - minVal || 1;

  const plotW = WIDTH  - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top  - PAD.bottom;

  function xOf(i: number): number {
    return PAD.left + (i / (sorted.length - 1)) * plotW;
  }
  function yOf(v: number): number {
    return PAD.top + plotH - ((v - minVal) / valRange) * plotH;
  }

  // Polyline points
  const pts = sorted.map((r, i) => `${xOf(i)},${yOf(r.nav_per_unit)}`).join(" ");

  // Area fill path (close under the line)
  const areaPath = [
    `M ${xOf(0)} ${yOf(sorted[0].nav_per_unit)}`,
    ...sorted.slice(1).map((r, i) => `L ${xOf(i + 1)} ${yOf(r.nav_per_unit)}`),
    `L ${xOf(sorted.length - 1)} ${PAD.top + plotH}`,
    `L ${xOf(0)} ${PAD.top + plotH}`,
    "Z",
  ].join(" ");

  // Y-axis ticks (5 levels)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = minVal + (valRange / 4) * i;
    const y = yOf(v);
    return { v, y };
  });

  // X-axis labels (show up to 6 evenly-spaced dates)
  const xLabelIndices: number[] = [];
  const maxLabels = Math.min(6, sorted.length);
  for (let i = 0; i < maxLabels; i++) {
    xLabelIndices.push(Math.round((i / (maxLabels - 1)) * (sorted.length - 1)));
  }

  const latest  = sorted[sorted.length - 1];
  const prev    = sorted[sorted.length - 2];
  const delta   = latest.nav_per_unit - prev.nav_per_unit;
  const deltaUp = delta >= 0;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ minWidth: 320, maxHeight: HEIGHT }}>

        <defs>
          <linearGradient id="nav-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#FF6600" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#FF6600" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map(({ y }, idx) => (
          <line key={idx} x1={PAD.left} x2={PAD.left + plotW} y1={y} y2={y}
                stroke="var(--pg-card-border)" strokeWidth="0.5" strokeDasharray="3 3" />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(({ v, y }, idx) => (
          <text key={idx} x={PAD.left - 6} y={y + 4} textAnchor="end"
                fontSize="9" fill="var(--pg-text-4)" fontFamily="monospace">
            ₦{fmtNum(v, 2)}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#nav-grad)" />

        {/* Line */}
        <polyline
          points={pts}
          fill="none"
          stroke="#FF6600"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data dots (only when few points) */}
        {sorted.length <= 20 && sorted.map((r, i) => (
          <circle key={r.id ?? i} cx={xOf(i)} cy={yOf(r.nav_per_unit)} r="3"
                  fill="#FF6600" stroke="white" strokeWidth="1.5" />
        ))}

        {/* Latest value callout */}
        <g>
          <circle cx={xOf(sorted.length - 1)} cy={yOf(latest.nav_per_unit)} r="5"
                  fill="#FF6600" stroke="white" strokeWidth="2" />
          <text
            x={xOf(sorted.length - 1) - 4}
            y={yOf(latest.nav_per_unit) - 9}
            textAnchor="end"
            fontSize="10"
            fontWeight="700"
            fill={deltaUp ? "#059669" : "#dc2626"}
            fontFamily="monospace">
            {deltaUp ? "+" : ""}{fmtNum(delta, 4)}
          </text>
        </g>

        {/* X-axis labels */}
        {xLabelIndices.map(i => (
          <text key={i}
                x={xOf(i)}
                y={PAD.top + plotH + 20}
                textAnchor="middle"
                fontSize="9"
                fill="var(--pg-text-4)"
                fontFamily="sans-serif">
            {fmtDate(sorted[i].nav_date)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Fund Selector ─────────────────────────────────────────────────────────────

function FundSelector({
  funds,
  selectedId,
  onChange,
}: {
  funds: Fund[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const selected = funds.find(f => f.id === selectedId);

  const inputStyle = {
    background: "var(--pg-muted-bg)",
    border: "1px solid var(--pg-card-border)",
    color: "var(--pg-text-1)",
  };

  return (
    <div className="relative flex items-center gap-2">
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                   style={{ color: "var(--pg-text-3)" }} />
      <select
        value={selectedId}
        onChange={e => onChange(e.target.value)}
        className="h-9 pl-3 pr-9 rounded-xl text-[13px] font-medium appearance-none outline-none min-w-[260px] cursor-pointer"
        style={inputStyle}>
        <option value="">— Select a fund —</option>
        {funds
          .filter(f => f.status === "active")
          .map(f => (
            <option key={f.id} value={f.id}>
              {f.code} · {f.name}
            </option>
          ))}
      </select>
      {selected && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#fff0e0", color: "#E05500" }}>
          {selected.currency}
        </span>
      )}
    </div>
  );
}

// ── NAV History Table ─────────────────────────────────────────────────────────

function NAVTable({ records, currency }: { records: NAVRecord[]; currency: string }) {
  const sorted = useMemo(
    () => [...records].sort((a, b) => b.nav_date.localeCompare(a.nav_date)),
    [records]
  );

  if (sorted.length === 0) {
    return (
      <div className="py-16 text-center">
        <Activity className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--pg-text-4)" }} />
        <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          No NAV records for this fund yet.
        </p>
        <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-4)" }}>
          Run a NAV calculation to populate history.
        </p>
      </div>
    );
  }

  const latest = sorted[0];

  return (
    <>
      {/* Table header */}
      <div
        className="grid items-center gap-4 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
        style={{
          gridTemplateColumns: "120px 1fr 1fr 1fr 140px",
          background: "var(--pg-muted-bg)",
          color: "var(--pg-text-3)",
          borderBottom: "1px solid var(--pg-row-border)",
        }}>
        <span>Date</span>
        <span className="text-right">Total NAV</span>
        <span className="text-right">Total Units</span>
        <span className="text-right">NAV Per Unit</span>
        <span className="text-right">Calculated By</span>
      </div>

      {/* Rows */}
      <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
        {sorted.map((r, idx) => {
          const prev      = sorted[idx + 1];
          const delta     = prev ? r.nav_per_unit - prev.nav_per_unit : null;
          const deltaUp   = delta != null ? delta >= 0 : null;
          const isLatest  = r.id === latest.id;

          return (
            <div
              key={r.id ?? idx}
              className="grid items-center gap-4 px-5 py-3.5 transition-colors"
              style={{ gridTemplateColumns: "120px 1fr 1fr 1fr 140px" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>

              {/* Date */}
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-medium tabular-nums"
                   style={{ color: "var(--pg-text-1)" }}>
                  {fmtDate(r.nav_date)}
                </p>
                {isLatest && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "#d1fae5", color: "#059669" }}>
                    Latest
                  </span>
                )}
              </div>

              {/* Total NAV */}
              <p className="text-[12px] font-mono text-right"
                 style={{ color: "var(--pg-text-2)" }}>
                {fmtCompact(r.total_nav, currency)}
              </p>

              {/* Total Units */}
              <p className="text-[12px] font-mono text-right"
                 style={{ color: "var(--pg-text-2)" }}>
                {fmtNum(r.total_units, 4)}
              </p>

              {/* NAV Per Unit */}
              <div className="flex items-center justify-end gap-2">
                <p className="text-[13px] font-bold font-mono tabular-nums"
                   style={{ color: isLatest ? "#FF6600" : "var(--pg-text-1)" }}>
                  {currency === "USD" ? "$" : "₦"}{fmtNum(r.nav_per_unit, 4)}
                </p>
                {delta != null && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: deltaUp ? "#d1fae5" : "#fee2e2",
                      color:      deltaUp ? "#059669" : "#dc2626",
                    }}>
                    {deltaUp ? "+" : ""}{fmtNum(delta, 4)}
                  </span>
                )}
              </div>

              {/* Calculated by */}
              <p className="text-[11px] text-right truncate"
                 style={{ color: "var(--pg-text-4)" }}>
                {r.calculated_by_name ?? "—"}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
         style={{
           background: "var(--pg-card)",
           border: "1px solid var(--pg-card-border)",
           boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
         }}>
      <div className="h-[3px]" style={{ background: color }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
            {label}
          </p>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: color + "18" }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        </div>
        <p className="text-[22px] font-bold tabular-nums leading-tight"
           style={{ color: "var(--pg-text-1)" }}>
          {value}
        </p>
        {sub && (
          <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-3)" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Run All Results Banner ────────────────────────────────────────────────────

function RunAllBanner({
  results,
  onDismiss,
}: {
  results: RunAllResult["results"];
  onDismiss: () => void;
}) {
  const ok  = results.filter(r => !r.error);
  const err = results.filter(r => !!r.error);

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{
           background: "var(--pg-card)",
           border: "1px solid var(--pg-card-border)",
           boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
         }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5"
           style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4" style={{ color: "#FF6600" }} />
          <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Run All Funds — Results
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "#d1fae5", color: "#059669" }}>
            {ok.length} succeeded
          </span>
          {err.length > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "#fee2e2", color: "#dc2626" }}>
              {err.length} failed
            </span>
          )}
          <button onClick={onDismiss}
                  className="text-[11px] font-semibold px-3 py-1 rounded-lg transition-colors"
                  style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
            Dismiss
          </button>
        </div>
      </div>

      {/* Result rows */}
      <div className="divide-y max-h-64 overflow-y-auto" style={{ borderColor: "var(--pg-row-border)" }}>
        {results.map((r, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-2.5">
            <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-1)" }}>
              {r.fund_name}
            </p>
            {r.error ? (
              <p className="text-[11px] font-medium" style={{ color: "#dc2626" }}>
                {r.error}
              </p>
            ) : (
              <p className="text-[12px] font-mono font-bold"
                 style={{ color: "#059669" }}>
                NAV/unit: ₦{fmtNum(r.nav_per_unit, 4)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NAVPage() {
  const { toast }      = useToast();
  const queryClient    = useQueryClient();

  const [selectedFundId, setSelectedFundId] = useState<string>("");
  const [runAllResults, setRunAllResults]    = useState<RunAllResult["results"] | null>(null);

  // Funds list
  const { data: funds = [], isLoading: fundsLoading } = useQuery<Fund[]>({
    queryKey: ["portfolio-funds-all"],
    queryFn: fetchFunds,
  });

  // NAV history for selected fund
  const {
    data: navHistory = [],
    isLoading: histLoading,
    isError: histError,
  } = useQuery<NAVRecord[]>({
    queryKey: ["fund-nav-history", selectedFundId],
    queryFn: () => fetchNAVHistory(selectedFundId),
    enabled: !!selectedFundId,
  });

  // Run NAV for selected fund
  const runFundMutation = useMutation({
    mutationFn: () =>
      apiFetch<NAVRecord>(`/api/v1/portfolio/funds/${selectedFundId}/nav`, {
        method: "POST",
        body: JSON.stringify({ nav_date: todayISO() }),
      }),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ["fund-nav-history", selectedFundId] });
      toast({
        title: "NAV calculated",
        description: `NAV per unit: ₦${fmtNum(record.nav_per_unit, 4)} (${fmtDate(record.nav_date)})`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "NAV calculation failed", description: err.message, variant: "destructive" });
    },
  });

  // Run NAV for all funds
  const runAllMutation = useMutation({
    mutationFn: () =>
      apiFetch<RunAllResult>("/api/v1/portfolio/nav/run-all", {
        method: "POST",
        body: JSON.stringify({ nav_date: todayISO() }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["fund-nav-history"] });
      if (selectedFundId) {
        queryClient.invalidateQueries({ queryKey: ["fund-nav-history", selectedFundId] });
      }
      setRunAllResults(data.results ?? []);
      const ok  = (data.results ?? []).filter(r => !r.error).length;
      const all = (data.results ?? []).length;
      toast({ title: `NAV run complete — ${ok}/${all} funds succeeded` });
    },
    onError: (err: Error) => {
      toast({ title: "Run All failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Derived stats ────────────────────────────────────────────────────────

  const selectedFund = funds.find(f => f.id === selectedFundId);

  const sortedHistory = useMemo(
    () => [...navHistory].sort((a, b) => a.nav_date.localeCompare(b.nav_date)),
    [navHistory]
  );

  const latestNAV   = sortedHistory[sortedHistory.length - 1];
  const previousNAV = sortedHistory[sortedHistory.length - 2];
  const navDelta    = latestNAV && previousNAV
    ? latestNAV.nav_per_unit - previousNAV.nav_per_unit
    : null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[20px] font-bold leading-tight"
              style={{ color: "var(--pg-text-1)" }}>
            NAV History
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Net Asset Value calculations and history per fund
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => runAllMutation.mutate()}
            disabled={runAllMutation.isPending}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-opacity disabled:opacity-60"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-1)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}>
            {runAllMutation.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running all…</>
              : <><Layers className="w-3.5 h-3.5" /> Run All Funds</>
            }
          </button>

          <button
            onClick={() => runFundMutation.mutate()}
            disabled={!selectedFundId || runFundMutation.isPending}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg,#FF6600,#E05500)",
              boxShadow: "0 1px 8px rgba(255,102,0,0.3)",
            }}>
            {runFundMutation.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating…</>
              : <><Calculator className="w-3.5 h-3.5" /> Run NAV Calculation</>
            }
          </button>
        </div>
      </div>

      {/* ── Fund selector row ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-3)" }}>
          Fund:
        </p>
        {fundsLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pg-text-4)" }} />
        ) : (
          <FundSelector
            funds={funds}
            selectedId={selectedFundId}
            onChange={id => {
              setSelectedFundId(id);
              setRunAllResults(null);
            }}
          />
        )}
        {selectedFund && (
          <p className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>
            {navHistory.length} record{navHistory.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── Run All results banner ── */}
      {runAllResults && (
        <RunAllBanner results={runAllResults} onDismiss={() => setRunAllResults(null)} />
      )}

      {/* ── Stat cards (only when fund is selected + has data) ── */}
      {selectedFund && latestNAV && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Latest NAV Per Unit"
            value={`${selectedFund.currency === "USD" ? "$" : "₦"}${fmtNum(latestNAV.nav_per_unit, 4)}`}
            sub={`As of ${fmtDate(latestNAV.nav_date)}`}
            color="#FF6600"
            icon={TrendingUp}
          />
          <StatCard
            label="Total NAV"
            value={fmtCompact(latestNAV.total_nav, selectedFund.currency)}
            sub="Aggregate net asset value"
            color="#059669"
            icon={BarChart3}
          />
          <StatCard
            label="Total Units"
            value={fmtNum(latestNAV.total_units, 2)}
            sub={navDelta != null
              ? `${navDelta >= 0 ? "+" : ""}${fmtNum(navDelta, 4)} vs previous`
              : "Outstanding units"}
            color={navDelta == null ? "#7c3aed" : navDelta >= 0 ? "#059669" : "#dc2626"}
            icon={Calculator}
          />
        </div>
      )}

      {/* ── Main content panel ── */}
      {!selectedFundId ? (
        /* No fund selected */
        <div className="rounded-2xl flex flex-col items-center justify-center py-24 text-center"
             style={{
               background: "var(--pg-card)",
               border: "1px solid var(--pg-card-border)",
             }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
               style={{ background: "var(--pg-muted-bg)" }}>
            <TrendingUp className="w-7 h-7" style={{ color: "var(--pg-text-3)" }} />
          </div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Select a fund to view NAV history
          </p>
          <p className="text-[12px] mt-1.5 max-w-xs" style={{ color: "var(--pg-text-3)" }}>
            Choose an active fund from the dropdown above to see its NAV chart and records.
          </p>
        </div>
      ) : histLoading ? (
        /* Loading */
        <div className="rounded-2xl flex items-center justify-center py-24"
             style={{
               background: "var(--pg-card)",
               border: "1px solid var(--pg-card-border)",
             }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
        </div>
      ) : histError ? (
        /* Error */
        <div className="rounded-2xl flex flex-col items-center justify-center py-20 text-center"
             style={{
               background: "var(--pg-card)",
               border: "1px solid var(--pg-card-border)",
             }}>
          <p className="text-[13px] font-medium" style={{ color: "#dc2626" }}>
            Failed to load NAV history.
          </p>
          <button
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["fund-nav-history", selectedFundId] })
            }
            className="mt-3 flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold"
            style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      ) : (
        /* Data panel */
        <div className="space-y-5">

          {/* Chart card */}
          <div className="rounded-2xl overflow-hidden"
               style={{
                 background: "var(--pg-card)",
                 border: "1px solid var(--pg-card-border)",
                 boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
               }}>
            <div className="px-5 py-4 flex items-center justify-between"
                 style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" style={{ color: "#FF6600" }} />
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                  NAV Per Unit — {selectedFund?.name}
                </h2>
              </div>
              <p className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>
                {navHistory.length} data point{navHistory.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="px-4 py-5">
              <NAVChart data={navHistory} />
            </div>
          </div>

          {/* History table card */}
          <div className="rounded-2xl overflow-hidden"
               style={{
                 background: "var(--pg-card)",
                 border: "1px solid var(--pg-card-border)",
                 boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
               }}>
            <div className="px-5 py-4 flex items-center justify-between"
                 style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" style={{ color: "#7c3aed" }} />
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                  NAV History
                </h2>
              </div>
              <button
                onClick={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["fund-nav-history", selectedFundId],
                  })
                }
                className="flex items-center gap-1 h-7 px-3 rounded-lg text-[11px] font-medium transition-colors"
                style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            <NAVTable records={navHistory} currency={selectedFund?.currency ?? "NGN"} />
          </div>
        </div>
      )}
    </div>
  );
}
