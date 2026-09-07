"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Wallet,
  DollarSign,
  BarChart2,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Plus,
  Download,
  RefreshCw,
  Settings,
  ArrowRight,
  Loader2,
  Clock,
  FileBarChart,
  Activity,
} from "lucide-react";
import Link from "next/link";

const BASE = "http://localhost:8081";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtCompact(n: number, cur = "NGN") {
  const sym = cur === "USD" ? "$" : "₦";
  if (n >= 1e9) return sym + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sym + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return sym + (n / 1e3).toFixed(1) + "K";
  return sym + n.toLocaleString("en-NG");
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d: Date) {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Fund {
  id?: string;
  name?: string;
  fund_type?: string;
  aum?: number;
  nav?: number;
  currency?: string;
  status?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Asset class categorisation
// ---------------------------------------------------------------------------
const ASSET_CLASSES = [
  { key: "fixed_income",   label: "Fixed Income",   color: "#1d4ed8" },
  { key: "money_market",   label: "Money Market",   color: "#059669" },
  { key: "equity",         label: "Equity",          color: "#FF6600" },
  { key: "alternatives",   label: "Alternatives",   color: "#7c3aed" },
  { key: "derivatives",    label: "Derivatives",    color: "#d97706" },
  { key: "pmmf",           label: "PMMF",            color: "#0891b2" },
];

function classifyFund(fund: Fund): string {
  const name = (fund.name ?? "").toLowerCase();
  const type = (fund.fund_type ?? "").toLowerCase();

  if (type === "pooled" || name.includes("pmmf") || name.includes("money market fund")) return "pmmf";
  if (name.includes("bond") || name.includes("fixed") || name.includes("tbill") || name.includes("treasury"))
    return "fixed_income";
  if (name.includes("money market") || name.includes("mmf") || name.includes("liquid"))
    return "money_market";
  if (name.includes("equity") || name.includes("stock") || name.includes("share"))
    return "equity";
  if (name.includes("alternative") || name.includes("private") || name.includes("real estate"))
    return "alternatives";
  if (name.includes("deriv") || name.includes("option") || name.includes("future") || name.includes("swap"))
    return "derivatives";

  // fallback by fund_type
  if (type.includes("fixed")) return "fixed_income";
  if (type.includes("money") || type.includes("liquid")) return "money_market";
  if (type.includes("equit")) return "equity";

  return "fixed_income";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MetricCardProps {
  accent: string;
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | null;
  trendText?: string;
}

function MetricCard({ accent, label, value, sub, icon, trend, trendText }: MetricCardProps) {
  return (
    <div
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
      className="rounded-2xl overflow-hidden flex flex-col"
    >
      <div className="h-[3px]" style={{ background: accent }} />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "var(--pg-text-3)" }}
          >
            {label}
          </span>
          <span style={{ color: accent, opacity: 0.7 }}>{icon}</span>
        </div>
        <div>
          <div
            className="text-[22px] font-bold leading-none"
            style={{ color: "var(--pg-text-1)" }}
          >
            {value}
          </div>
          {sub && (
            <div className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>
              {sub}
            </div>
          )}
          {trendText && (
            <div
              className="flex items-center gap-1 mt-1.5 text-[11px] font-medium"
              style={{ color: trend === "up" ? "#059669" : trend === "down" ? "#dc2626" : "var(--pg-text-3)" }}
            >
              {trend === "up" && <TrendingUp size={11} />}
              {trend === "down" && <TrendingDown size={11} />}
              {trendText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MaturityRowProps {
  label: string;
  assets: string;
  amount: string;
}

function MaturityRow({ label, assets, amount }: MaturityRowProps) {
  return (
    <div
      className="flex items-center justify-between py-2.5 px-3 rounded-xl"
      style={{ background: "var(--pg-muted-bg)" }}
    >
      <div className="flex items-center gap-2">
        <Clock size={13} style={{ color: "var(--pg-text-3)" }} />
        <span className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
          {label}
        </span>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
          {amount}
        </div>
        <div className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>
          {assets}
        </div>
      </div>
    </div>
  );
}

interface ExceptionItemProps {
  level: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  description: string;
  href: string;
  demo?: boolean;
}

function ExceptionItem({ level, title, description, href, demo }: ExceptionItemProps) {
  const [hovered, setHovered] = useState(false);

  const colors = {
    INFO: { border: "#1d4ed8", bg: "#dbeafe", text: "#1d4ed8", badge: "#1e40af" },
    WARNING: { border: "#d97706", bg: "#fef3c7", text: "#92400e", badge: "#b45309" },
    CRITICAL: { border: "#dc2626", bg: "#fee2e2", text: "#991b1b", badge: "#991b1b" },
  };
  const c = colors[level];

  return (
    <Link href={href}>
      <div
        className="flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all"
        style={{
          background: hovered ? "var(--pg-row-hover)" : "transparent",
          borderLeft: `3px solid ${c.border}`,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: c.bg }}
        >
          {level === "INFO" && <Activity size={12} style={{ color: c.border }} />}
          {level === "WARNING" && <AlertTriangle size={12} style={{ color: "#d97706" }} />}
          {level === "CRITICAL" && <AlertTriangle size={12} style={{ color: "#dc2626" }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: c.bg, color: c.badge }}
            >
              {level}
            </span>
            <span className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              {title}
            </span>
            {demo && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}
              >
                Demo
              </span>
            )}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {description}
          </div>
        </div>
        <ArrowRight size={14} style={{ color: "var(--pg-text-4)", flexShrink: 0, marginTop: 2 }} />
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function OverviewPage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";
  const now = new Date();

  // ---- Funds query --------------------------------------------------------
  const { data: fundsRaw, isLoading: fundsLoading } = useQuery({
    queryKey: ["pm-funds", subsidId],
    queryFn: () =>
      fetch(BASE + "/api/v1/portfolio/funds?subsidiary_id=" + subsidId, {
        credentials: "include",
      })
        .then((r) => r.json().catch(() => []))
        .catch(() => []),
    enabled: !!subsidId,
  });

  const funds: Fund[] = Array.isArray(fundsRaw) ? fundsRaw : [];

  // ---- Derived metrics ----------------------------------------------------
  const totalAUM = funds.reduce((s, f) => s + (typeof f.aum === "number" ? f.aum : 0), 0);
  const hasFunds = funds.length > 0;

  // ---- Allocation breakdown -----------------------------------------------
  const allocationMap: Record<string, number> = {};
  for (const f of funds) {
    const cls = classifyFund(f);
    const val = typeof f.aum === "number" ? f.aum : 0;
    allocationMap[cls] = (allocationMap[cls] ?? 0) + val;
  }
  const allocationTotal = Object.values(allocationMap).reduce((s, v) => s + v, 0);

  const quickActions = [
    { label: "Add Asset", icon: <Plus size={13} />, href: "/pm/assets" },
    { label: "Record Liability", icon: <TrendingDown size={13} />, href: "/pm/liabilities" },
    { label: "Maturities", icon: <CalendarDays size={13} />, href: "/pm/maturities" },
    { label: "Generate Report", icon: <FileBarChart size={13} />, href: "/pm/reports" },
    { label: "Export", icon: <Download size={13} />, href: "#" },
    { label: "Configure Alerts", icon: <Zap size={13} />, href: "/pm/alerts" },
  ];

  // ---- Loading state -------------------------------------------------------
  if (fundsLoading && subsidId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin" style={{ color: "#FF6600" }} />
          <span className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
            Loading portfolio data…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* ------------------------------------------------------------------ */}
      {/* HEADER                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
            >
              <LayoutDashboard size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-[22px] font-bold leading-none" style={{ color: "var(--pg-text-1)" }}>
                Portfolio Overview
              </h1>
              <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                {subsidiary?.Name ?? "—"} · Portfolio Management
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-3)",
              border: "1px solid var(--pg-card-border)",
            }}
          >
            <RefreshCw size={10} />
            As of {fmtDateTime(now)}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {quickActions.map((a) => (
            <Link href={a.href} key={a.label}>
              <button
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold transition-all hover:opacity-80"
                style={{
                  background: "var(--pg-muted-bg)",
                  color: "var(--pg-text-2)",
                  border: "1px solid var(--pg-card-border)",
                }}
              >
                {a.icon}
                {a.label}
              </button>
            </Link>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* METRIC CARDS – Row 1                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          accent="#1d4ed8"
          label="Total Assets"
          value={hasFunds ? fmtCompact(totalAUM) : "—"}
          sub={hasFunds ? `${funds.length} fund${funds.length !== 1 ? "s" : ""} tracked` : "No fund data connected"}
          icon={<TrendingUp size={16} />}
          trend={hasFunds ? "up" : null}
          trendText={hasFunds ? `${funds.length} active fund${funds.length !== 1 ? "s" : ""}` : undefined}
        />
        <MetricCard
          accent="#d97706"
          label="Total Liabilities"
          value="—"
          sub="Connect liability data"
          icon={<TrendingDown size={16} />}
        />
        <MetricCard
          accent="#059669"
          label="Net Asset Position"
          value={hasFunds ? fmtCompact(totalAUM) : "—"}
          sub="Assets minus liabilities · Liabilities not connected"
          icon={<BarChart2 size={16} />}
        />
      </div>

      {/* METRIC CARDS – Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          accent="#059669"
          label="Available Liquidity"
          value="—"
          sub="Connect bank feeds"
          icon={<Wallet size={16} />}
        />
        <MetricCard
          accent="#FF6600"
          label="Uninvested Cash"
          value="—"
          sub="Connect bank feeds"
          icon={<DollarSign size={16} />}
        />
        <MetricCard
          accent="#7c3aed"
          label="Portfolio Yield"
          value="—%"
          sub="Asset data required"
          icon={<Activity size={16} />}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MATURITY OUTLOOK                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={16} style={{ color: "var(--pg-text-3)" }} />
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Maturity Outlook
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Assets Maturing */}
          <div
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
            className="rounded-2xl overflow-hidden"
          >
            <div className="h-[3px]" style={{ background: "#1d4ed8" }} />
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    Assets Maturing
                  </div>
                  <div className="text-[13px] font-semibold mt-0.5" style={{ color: "var(--pg-text-1)" }}>
                    Upcoming redemptions
                  </div>
                </div>
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "#dbeafe" }}
                >
                  <TrendingUp size={14} style={{ color: "#1d4ed8" }} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <MaturityRow label="In 7 days" assets="— assets" amount="—" />
                <MaturityRow label="In 30 days" assets="— assets" amount="—" />
                <MaturityRow label="In 90 days" assets="— assets" amount="—" />
              </div>
              <div className="mt-3 text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                Connect asset maturity data to populate · <Link href="/pm/assets" className="underline" style={{ color: "#1d4ed8" }}>Manage assets</Link>
              </div>
            </div>
          </div>

          {/* Liabilities Due */}
          <div
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
            className="rounded-2xl overflow-hidden"
          >
            <div className="h-[3px]" style={{ background: "#d97706" }} />
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    Liabilities Due
                  </div>
                  <div className="text-[13px] font-semibold mt-0.5" style={{ color: "var(--pg-text-1)" }}>
                    Upcoming obligations
                  </div>
                </div>
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "#fef3c7" }}
                >
                  <TrendingDown size={14} style={{ color: "#d97706" }} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <MaturityRow label="In 7 days" assets="— liabilities" amount="—" />
                <MaturityRow label="In 30 days" assets="— liabilities" amount="—" />
                <MaturityRow label="In 90 days" assets="— liabilities" amount="—" />
              </div>
              <div className="mt-3 text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                Connect liability data to populate · <Link href="/pm/liabilities" className="underline" style={{ color: "#d97706" }}>Manage liabilities</Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ALLOCATION + LIQUIDITY                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Asset Allocation – col-span-3 */}
        <div
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
          className="rounded-2xl overflow-hidden lg:col-span-3"
        >
          <div className="h-[3px]" style={{ background: "linear-gradient(90deg,#1d4ed8,#FF6600,#059669)" }} />
          <div className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                  Asset Allocation
                </h2>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                  By net asset value
                </div>
              </div>
              <div
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px] font-semibold cursor-pointer hover:opacity-80 transition-all"
                style={{
                  background: "var(--pg-muted-bg)",
                  color: "var(--pg-text-2)",
                  border: "1px solid var(--pg-card-border)",
                }}
              >
                <Settings size={11} />
                Customize
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {ASSET_CLASSES.map((ac) => {
                const amt = allocationMap[ac.key] ?? 0;
                const pct = allocationTotal > 0 ? (amt / allocationTotal) * 100 : 0;
                const hasData = hasFunds && allocationTotal > 0;

                return (
                  <div key={ac.key} className="flex items-center gap-3">
                    {/* Dot */}
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: ac.color }}
                    />
                    {/* Label */}
                    <div
                      className="text-[12px] font-medium w-[110px] flex-shrink-0"
                      style={{ color: "var(--pg-text-2)" }}
                    >
                      {ac.label}
                    </div>
                    {/* Bar track */}
                    <div
                      className="flex-1 h-2 rounded-full overflow-hidden"
                      style={{ background: "var(--pg-muted-bg)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: hasData ? `${Math.max(pct, amt > 0 ? 1 : 0)}%` : "0%",
                          background: ac.color,
                          opacity: hasData && amt === 0 ? 0.15 : 1,
                        }}
                      />
                    </div>
                    {/* Amount */}
                    <div
                      className="text-[12px] font-semibold w-[80px] text-right flex-shrink-0"
                      style={{ color: "var(--pg-text-1)" }}
                    >
                      {hasData && amt > 0 ? fmtCompact(amt) : "—"}
                    </div>
                    {/* Percentage */}
                    <div
                      className="text-[11px] w-[40px] text-right flex-shrink-0"
                      style={{ color: "var(--pg-text-3)" }}
                    >
                      {hasData && amt > 0 ? `${pct.toFixed(1)}%` : "—%"}
                    </div>
                  </div>
                );
              })}
            </div>

            {!hasFunds && (
              <div
                className="mt-4 flex items-center gap-2 p-3 rounded-xl text-[11px]"
                style={{
                  background: "var(--pg-muted-bg)",
                  color: "var(--pg-text-3)",
                  border: "1px solid var(--pg-card-border)",
                }}
              >
                <AlertTriangle size={12} style={{ color: "#d97706", flexShrink: 0 }} />
                No fund data found. Add funds to see allocation breakdown.
              </div>
            )}

            <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--pg-card-border)" }}>
              <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                Allocation by NAV · As of {fmtDate(now.toISOString())}
              </span>
            </div>
          </div>
        </div>

        {/* Liquidity Position – col-span-2 */}
        <div
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
          className="rounded-2xl overflow-hidden lg:col-span-2"
        >
          <div className="h-[3px]" style={{ background: "#059669" }} />
          <div className="p-5 flex flex-col gap-4">
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                Liquidity Position
              </h2>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                Current cash & near-cash balances
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              {[
                { label: "Available Cash", value: "—" },
                { label: "Restricted", value: "—" },
                { label: "Pending Inflows", value: "—" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                  style={{ background: "var(--pg-muted-bg)" }}
                >
                  <span className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
                    {row.label}
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                    {row.value}
                  </span>
                </div>
              ))}

              {/* Highlighted row */}
              <div
                className="flex items-center justify-between py-3 px-3 rounded-xl mt-1"
                style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#059669" }} />
                  <span className="text-[13px] font-semibold" style={{ color: "#065f46" }}>
                    Investable Balance
                  </span>
                </div>
                <span className="text-[14px] font-bold" style={{ color: "#059669" }}>
                  —
                </span>
              </div>
            </div>

            {/* Info box */}
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl text-[11px]"
              style={{ background: "#fffbeb", border: "1px solid #fde68a" }}
            >
              <AlertTriangle size={12} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: "#92400e" }}>
                Bank account feeds not yet connected. Upload daily balances manually or contact Operations.
              </span>
            </div>

            <Link href="/pm/liquidity">
              <button
                className="w-full h-9 px-4 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
              >
                <Wallet size={14} />
                Upload Balances
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* PORTFOLIO EXCEPTIONS                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
        className="rounded-2xl overflow-hidden"
      >
        <div className="h-[3px]" style={{ background: "#dc2626" }} />
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} style={{ color: "#dc2626" }} />
              <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                Portfolio Exceptions
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg"
                style={{ background: "#fee2e2", color: "#991b1b" }}
              >
                3 Active
              </span>
              <Link href="/pm/alerts">
                <button
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px] font-semibold hover:opacity-80 transition-all"
                  style={{
                    background: "var(--pg-muted-bg)",
                    color: "var(--pg-text-2)",
                    border: "1px solid var(--pg-card-border)",
                  }}
                >
                  <Settings size={11} />
                  Manage Alerts
                </button>
              </Link>
            </div>
          </div>

          {/* All-clear banner (shown when no real exceptions) */}
          <div
            className="flex items-center gap-2.5 p-3 rounded-xl mb-4"
            style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}
          >
            <CheckCircle2 size={14} style={{ color: "#059669", flexShrink: 0 }} />
            <span className="text-[12px] font-medium" style={{ color: "#065f46" }}>
              No critical exceptions. Portfolio within approved limits. Items below are informational setup tasks.
            </span>
          </div>

          {/* Exception items */}
          <div className="flex flex-col gap-1">
            <ExceptionItem
              level="INFO"
              title="Asset prices not updated for 3 instruments"
              description="Stale pricing may affect NAV calculations. Update prices in the assets module."
              href="/pm/assets"
              demo
            />
            <ExceptionItem
              level="INFO"
              title="Liability data not connected"
              description="Net asset position and liability metrics cannot be calculated until liabilities are recorded."
              href="/pm/liabilities"
              demo
            />
            <ExceptionItem
              level="INFO"
              title="Bank balance feeds not configured"
              description="Liquidity metrics and uninvested cash tracking require live bank account integration."
              href="/pm/liquidity"
              demo
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* FOOTER                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="flex items-center justify-between py-3 px-4 rounded-xl text-[11px]"
        style={{
          background: "var(--pg-muted-bg)",
          border: "1px solid var(--pg-card-border)",
          color: "var(--pg-text-4)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <LayoutDashboard size={11} />
          PageOS Portfolio Management · {subsidiary?.Name ?? "—"}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/pm/reports" className="hover:underline" style={{ color: "var(--pg-text-3)" }}>
            Reports
          </Link>
          <Link href="/pm/alerts" className="hover:underline" style={{ color: "var(--pg-text-3)" }}>
            Alerts
          </Link>
          <span>Data as of {fmtDate(now.toISOString())}</span>
        </div>
      </div>
    </div>
  );
}
