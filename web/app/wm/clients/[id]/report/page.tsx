"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ChevronLeft, Loader2, AlertCircle, TrendingUp, TrendingDown,
  DollarSign, BarChart3, Activity, Download, FileSpreadsheet,
  Layers, PieChart, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportSummary = {
  total_invested: number;
  current_value: number;
  total_return: number;
  return_pct: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_fees: number;
  total_income: number;
  units_held: number;
  nav_per_unit: number;
  client_name: string;
  account_number: string;
  fund_name: string;
  currency: string;
};

type HoldingRow = {
  instrument: string;
  asset_class: string;
  units: number;
  book_value: number;
  market_value: number;
  unrealized_pnl: number;
};

type TransactionRow = {
  id: string;
  date: string;
  txn_type: string;
  amount: number;
  units: number;
  nav_per_unit: number;
  fees: number;
  net_amount: number;
  running_balance: number;
  narration: string;
};

type ClientReport = {
  summary: ReportSummary;
  holdings: HoldingRow[];
  transactions: TransactionRow[];
};

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtNaira(n: number): string {
  return "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUnits(n: number): string {
  return n.toLocaleString("en-NG", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function oneYearAgoIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

// ── TXN type badge ────────────────────────────────────────────────────────────

const TXN_CFG: Record<string, { label: string; color: string; bg: string }> = {
  subscription:          { label: "Subscription",    color: "#065f46", bg: "#d1fae5" },
  redemption:            { label: "Redemption",      color: "#991b1b", bg: "#fee2e2" },
  dividend_distribution: { label: "Dividend",        color: "#E05500", bg: "#fff0e0" },
  fee_charge:            { label: "Fee",             color: "#92400e", bg: "#fef3c7" },
  revaluation:           { label: "Revaluation",     color: "#4c1d95", bg: "#ede9fe" },
};

function TxnBadge({ type }: { type: string }) {
  const cfg = TXN_CFG[type] ?? { label: type, color: "#475569", bg: "#f1f5f9" };
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  color,
  accentBar,
  icon: Icon,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  accentBar: string;
  icon: React.ElementType;
  valueColor?: string;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div className="h-[3px]" style={{ background: accentBar }} />
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider leading-tight" style={{ color }}>
            {label}
          </p>
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: color + "18" }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color }} />
          </div>
        </div>
        <p
          className="text-[18px] font-bold tabular-nums leading-tight"
          style={{ color: valueColor ?? "var(--pg-text-1)" }}
        >
          {value}
        </p>
        {sub && (
          <p className="text-[10px] mt-1" style={{ color: "var(--pg-text-3)" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Holdings Table ────────────────────────────────────────────────────────────

function HoldingsTable({ holdings }: { holdings: HoldingRow[] }) {
  if (holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--pg-muted-bg)" }}
        >
          <Layers className="w-5 h-5" style={{ color: "var(--pg-text-3)" }} />
        </div>
        <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
          No holdings
        </p>
        <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
          No fund holdings found in the selected period.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Header */}
      <div
        className="grid items-center gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider min-w-[780px]"
        style={{
          gridTemplateColumns: "2fr 140px 100px 160px 160px 160px",
          background: "var(--pg-muted-bg)",
          color: "var(--pg-text-3)",
          borderBottom: "1px solid var(--pg-card-border)",
        }}
      >
        <span>Instrument</span>
        <span>Asset Class</span>
        <span className="text-right">Units</span>
        <span className="text-right">Book Value</span>
        <span className="text-right">Market Value</span>
        <span className="text-right">Unrealized P&amp;L</span>
      </div>

      {/* Rows */}
      <div className="divide-y min-w-[780px]" style={{ borderColor: "var(--pg-card-border)" }}>
        {holdings.map((h, i) => {
          const pnlPos = h.unrealized_pnl >= 0;
          return (
            <div
              key={i}
              className="grid items-center gap-3 px-5 py-3.5 transition-colors"
              style={{ gridTemplateColumns: "2fr 140px 100px 160px 160px 160px" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "")}
            >
              <div>
                <p className="text-[12.5px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                  {h.instrument}
                </p>
              </div>
              <div>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "#f1f5f9", color: "#475569" }}
                >
                  {h.asset_class}
                </span>
              </div>
              <p className="text-[12px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                {fmtUnits(h.units)}
              </p>
              <p className="text-[12px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                {fmtNaira(h.book_value)}
              </p>
              <p className="text-[12px] font-mono font-semibold text-right" style={{ color: "var(--pg-text-1)" }}>
                {fmtNaira(h.market_value)}
              </p>
              <p
                className="text-[12px] font-mono font-semibold text-right"
                style={{ color: pnlPos ? "#059669" : "#dc2626" }}
              >
                {pnlPos ? "+" : ""}{fmtNaira(h.unrealized_pnl)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Transactions Table ────────────────────────────────────────────────────────

function TransactionsTable({ transactions }: { transactions: TransactionRow[] }) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--pg-muted-bg)" }}
        >
          <Activity className="w-5 h-5" style={{ color: "var(--pg-text-3)" }} />
        </div>
        <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
          No transactions
        </p>
        <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
          No transactions found in the selected period.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Header */}
      <div
        className="grid items-center gap-2 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider min-w-[1100px]"
        style={{
          gridTemplateColumns: "90px 140px 120px 80px 80px 80px 120px 140px 1fr",
          background: "var(--pg-muted-bg)",
          color: "var(--pg-text-3)",
          borderBottom: "1px solid var(--pg-card-border)",
        }}
      >
        <span>Date</span>
        <span>Type</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Units</span>
        <span className="text-right">NAV/Unit</span>
        <span className="text-right">Fees</span>
        <span className="text-right">Net Amount</span>
        <span className="text-right">Running Balance</span>
        <span>Narration</span>
      </div>

      {/* Rows */}
      <div className="divide-y min-w-[1100px]" style={{ borderColor: "var(--pg-card-border)" }}>
        {transactions.map(t => {
          const isCredit = t.txn_type === "subscription" || t.txn_type === "dividend_distribution";
          return (
            <div
              key={t.id}
              className="grid items-center gap-2 px-5 py-3 transition-colors"
              style={{ gridTemplateColumns: "90px 140px 120px 80px 80px 80px 120px 140px 1fr" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "")}
            >
              <p className="text-[11px]" style={{ color: "var(--pg-text-2)" }}>
                {fmtDate(t.date)}
              </p>
              <div>
                <TxnBadge type={t.txn_type} />
              </div>
              <p
                className="text-[12px] font-mono font-semibold text-right"
                style={{ color: isCredit ? "#059669" : "#dc2626" }}
              >
                {isCredit ? "+" : "-"}{fmtNaira(Math.abs(t.amount))}
              </p>
              <p className="text-[11px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                {t.units !== 0 ? fmtUnits(Math.abs(t.units)) : "—"}
              </p>
              <p className="text-[11px] font-mono text-right" style={{ color: "var(--pg-text-3)" }}>
                {t.nav_per_unit > 0 ? fmtNaira(t.nav_per_unit) : "—"}
              </p>
              <p className="text-[11px] font-mono text-right" style={{ color: "var(--pg-text-3)" }}>
                {t.fees > 0 ? fmtNaira(t.fees) : "—"}
              </p>
              <p
                className="text-[12px] font-mono font-semibold text-right"
                style={{ color: isCredit ? "#059669" : "#dc2626" }}
              >
                {isCredit ? "+" : "-"}{fmtNaira(Math.abs(t.net_amount))}
              </p>
              <p className="text-[12px] font-mono font-bold text-right" style={{ color: "var(--pg-text-1)" }}>
                {fmtNaira(t.running_balance)}
              </p>
              <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>
                {t.narration || "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Client360ReportPage() {
  const { id: accountId } = useParams<{ id: string }>();

  const [fromDate, setFromDate] = useState(oneYearAgoIso());
  const [toDate, setToDate]     = useState(todayIso());

  // ── Fetch report ─────────────────────────────────────────────────────────────

  const { data: report, isLoading, error, isFetching } = useQuery<ClientReport>({
    queryKey: ["client-360-report", accountId, fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const res = await fetch(
        `${BASE}/api/v1/portfolio/accounts/${accountId}/report?${params}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "Request failed" } })) as {
          error?: { message?: string };
        };
        throw new Error(err?.error?.message ?? `Error ${res.status}`);
      }
      return res.json() as Promise<ClientReport>;
    },
    enabled: Boolean(accountId),
  });

  // ── Export ────────────────────────────────────────────────────────────────────

  function handleExport() {
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    window.open(`/api/portfolio/accounts/${accountId}/report/export?${params}`, "_blank");
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const s = report?.summary;
  const returnPos     = (s?.total_return ?? 0) >= 0;
  const returnColor   = returnPos ? "#059669" : "#dc2626";
  const realizedPos   = (s?.realized_pnl ?? 0) >= 0;
  const unrealizedPos = (s?.unrealized_pnl ?? 0) >= 0;

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <AlertCircle className="w-8 h-8" style={{ color: "#dc2626" }} />
        <p className="text-[14px] font-medium" style={{ color: "var(--pg-text-2)" }}>
          Failed to load report.
        </p>
        <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
          {(error as Error).message}
        </p>
        <Link
          href="/wm/clients"
          className="text-[13px] font-semibold"
          style={{ color: "#FF6600" }}
        >
          Back to Clients
        </Link>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/wm/clients"
            className="flex items-center gap-1.5 text-[12px] mb-2 transition-colors"
            style={{ color: "var(--pg-text-3)" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#FF6600")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "var(--pg-text-3)")}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            My Clients
          </Link>

          <div className="flex items-center gap-3 flex-wrap">
            {s?.account_number && (
              <code
                className="text-[12px] font-bold font-mono px-2.5 py-1 rounded-lg"
                style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
              >
                {s.account_number}
              </code>
            )}
            <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
              {s?.client_name ?? "Client Report"}
            </h1>
          </div>

          <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
            360 Report
            {s?.fund_name && (
              <> &middot; <strong style={{ color: "var(--pg-text-2)" }}>{s.fund_name}</strong></>
            )}
            {s?.currency && (
              <> &middot; <strong style={{ color: "var(--pg-text-2)" }}>{s.currency}</strong></>
            )}
          </p>
        </div>

        {/* Date range + Export */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* From date */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold" style={{ color: "var(--pg-text-3)" }}>From</span>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="h-8 px-3 rounded-xl text-[12px] outline-none"
              style={{
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-card-border)",
                color: "var(--pg-text-1)",
              }}
            />
          </div>

          {/* To date */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold" style={{ color: "var(--pg-text-3)" }}>To</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="h-8 px-3 rounded-xl text-[12px] outline-none"
              style={{
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-card-border)",
                color: "var(--pg-text-1)",
              }}
            />
          </div>

          {/* Export button */}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold transition-opacity hover:opacity-85"
            style={{
              background: "linear-gradient(135deg,#059669,#047857)",
              color: "#fff",
              boxShadow: "0 1px 6px rgba(5,150,105,0.30)",
            }}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export to Excel
          </button>

          {isFetching && !isLoading && (
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pg-text-3)" }} />
          )}
        </div>
      </div>

      {/* ── Summary cards — 5 per row on xl ── */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <SummaryCard
            label="Total Invested"
            value={fmtNaira(s.total_invested)}
            sub="Cost basis"
            color="#7c3aed"
            accentBar="#7c3aed"
            icon={DollarSign}
          />
          <SummaryCard
            label="Current Value"
            value={fmtNaira(s.current_value)}
            sub={`${fmtUnits(s.units_held)} units`}
            color="#FF6600"
            accentBar="#FF6600"
            icon={BarChart3}
          />

          {/* Total Return — dynamic colour */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div className="h-[3px]" style={{ background: returnColor }} />
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: returnColor }}>
                  Total Return
                </p>
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: returnColor + "18" }}
                >
                  {returnPos
                    ? <ArrowUpRight className="w-3.5 h-3.5" style={{ color: returnColor }} />
                    : <ArrowDownRight className="w-3.5 h-3.5" style={{ color: returnColor }} />}
                </div>
              </div>
              <p className="text-[18px] font-bold tabular-nums" style={{ color: "var(--pg-text-1)" }}>
                {returnPos ? "+" : ""}{fmtNaira(s.total_return)}
              </p>
              <p className="text-[11px] mt-1 font-semibold" style={{ color: returnColor }}>
                {fmtPct(s.return_pct)}
              </p>
            </div>
          </div>

          <SummaryCard
            label="Return %"
            value={fmtPct(s.return_pct)}
            sub="Inception to date"
            color={s.return_pct >= 0 ? "#059669" : "#dc2626"}
            accentBar={s.return_pct >= 0 ? "#059669" : "#dc2626"}
            icon={TrendingUp}
            valueColor={s.return_pct >= 0 ? "#059669" : "#dc2626"}
          />
          <SummaryCard
            label="Realized P&L"
            value={(realizedPos ? "+" : "") + fmtNaira(s.realized_pnl)}
            sub="Crystallised gains/losses"
            color={realizedPos ? "#059669" : "#dc2626"}
            accentBar={realizedPos ? "#059669" : "#dc2626"}
            icon={TrendingUp}
            valueColor={realizedPos ? "#059669" : "#dc2626"}
          />

          {/* Second row of 5 */}
          <SummaryCard
            label="Unrealized P&L"
            value={(unrealizedPos ? "+" : "") + fmtNaira(s.unrealized_pnl)}
            sub="Mark-to-market"
            color={unrealizedPos ? "#059669" : "#dc2626"}
            accentBar={unrealizedPos ? "#059669" : "#dc2626"}
            icon={unrealizedPos ? TrendingUp : TrendingDown}
            valueColor={unrealizedPos ? "#059669" : "#dc2626"}
          />
          <SummaryCard
            label="Total Fees"
            value={fmtNaira(s.total_fees)}
            sub="Management & transaction fees"
            color="#d97706"
            accentBar="#d97706"
            icon={DollarSign}
          />
          <SummaryCard
            label="Total Income"
            value={fmtNaira(s.total_income)}
            sub="Dividends & distributions"
            color="#0369a1"
            accentBar="#0369a1"
            icon={Download}
          />
          <SummaryCard
            label="Units Held"
            value={fmtUnits(s.units_held)}
            sub="Current holding"
            color="#6d28d9"
            accentBar="#6d28d9"
            icon={PieChart}
          />
          <SummaryCard
            label="NAV / Unit"
            value={fmtNaira(s.nav_per_unit)}
            sub="Latest NAV"
            color="#475569"
            accentBar="#475569"
            icon={Activity}
          />
        </div>
      )}

      {/* ── Holdings section ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--pg-card-border)" }}
        >
          <div>
            <h2 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              Holdings
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Fund holdings by instrument and asset class
            </p>
          </div>
          {report?.holdings && report.holdings.length > 0 && (
            <span
              className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: "#fff7f0", color: "#FF6600" }}
            >
              {report.holdings.length} instrument{report.holdings.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <HoldingsTable holdings={report?.holdings ?? []} />
      </div>

      {/* ── Transactions section ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--pg-card-border)" }}
        >
          <div>
            <h2 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              Transactions
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              All activity with running balance
            </p>
          </div>
          {report?.transactions && report.transactions.length > 0 && (
            <span
              className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}
            >
              {report.transactions.length} transaction{report.transactions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <TransactionsTable transactions={report?.transactions ?? []} />
      </div>
    </div>
  );
}
