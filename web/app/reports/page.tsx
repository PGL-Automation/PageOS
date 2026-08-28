"use client";

import { useState } from "react";
import { Brain, Download, Share2, TrendingUp, TrendingDown, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── SVG chart primitives ───────────────────────────────────────────────────────

function LineChart({ series, w = 560, h = 140 }: { series: { label: string; values: number[]; color: string }[]; w?: number; h?: number }) {
  const allVals = series.flatMap(s => s.values);
  const max = Math.max(...allVals), min = 0;
  const range = max - min || 1;
  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const pts = (vals: number[]) => vals.map((v, i) => [((i / (vals.length - 1)) * (w - 40)) + 20, h - 20 - ((v - min) / range) * (h - 40)]);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {/* Grid lines */}
      {[0,0.25,0.5,0.75,1].map(t => (
        <line key={t} x1={20} x2={w-20} y1={20 + t*(h-40)} y2={20 + t*(h-40)} stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
      ))}
      {series.map(s => {
        const p = pts(s.values);
        const d = p.map(([x,y],i) => `${i===0?"M":"L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const area = `${d} L${p[p.length-1][0].toFixed(1)},${h-20} L${p[0][0].toFixed(1)},${h-20} Z`;
        return (
          <g key={s.label}>
            <path d={area} fill={s.color} fillOpacity={0.07} />
            <path d={d} stroke={s.color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}
      {/* X labels */}
      {series[0].values.map((_, i) => (
        <text key={i} x={20 + (i / (series[0].values.length - 1)) * (w - 40)} y={h - 4} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.4}>
          {labels[i % 12]}
        </text>
      ))}
    </svg>
  );
}

function HBar({ label, value, max, color, formatted }: { label: string; value: number; max: number; color: string; formatted: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 text-[12px] text-right shrink-0" style={{ color: "var(--pg-text-2)" }}>{label}</span>
      <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: "var(--pg-muted-bg)" }}>
        <div className="h-full rounded-md flex items-center pl-2 transition-all"
             style={{ width: `${(value / max) * 100}%`, background: color, minWidth: 8 }}>
        </div>
      </div>
      <span className="w-20 text-[12px] font-semibold tabular text-right shrink-0" style={{ color: "var(--pg-text-1)" }}>{formatted}</span>
    </div>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────

const REVENUE_TREND = [{ label: "Revenue", values: [2.1,2.3,2.0,2.4,2.5,2.3,2.7,2.8,2.9,3.0,3.1,3.2], color: "#FF6600" },
                       { label: "Expenses", values: [1.2,1.3,1.1,1.2,1.3,1.2,1.2,1.1,1.1,1.1,1.1,1.1], color: "#dc2626" }];

const INCOME_LINES = [
  { label: "Fixed Income",    value: 1840, max: 1840, color: "#FF6600",  formatted: "₦1,840M" },
  { label: "Equity Mandates", value: 924,  max: 1840, color: "#7c3aed",  formatted: "₦924M" },
  { label: "Money Market",    value: 436,  max: 1840, color: "#0891b2",  formatted: "₦436M" },
];
const EXPENSE_LINES = [
  { label: "Staff Costs",      value: 580, max: 1100, color: "#dc2626", formatted: "₦580M" },
  { label: "Operations",       value: 320, max: 1100, color: "#f97316", formatted: "₦320M" },
  { label: "Administration",   value: 200, max: 1100, color: "#f59e0b", formatted: "₦200M" },
];

type ReportTab = "pl" | "cashflow" | "balance" | "kpi";

const PL_TABLE = [
  { item: "Investment Income",      q3: "₦1,701M", q4: "₦1,840M", change: "+8.2%",  up: true },
  { item: "Fee Income",             q3: "₦854M",   q4: "₦924M",   change: "+8.2%",  up: true },
  { item: "Other Income",           q3: "₦395M",   q4: "₦436M",   change: "+10.4%", up: true },
  { item: "Total Revenue",          q3: "₦2,950M", q4: "₦3,200M", change: "+8.5%",  up: true, bold: true },
  { item: "",                       q3: "",        q4: "",        change: "",       up: true },
  { item: "Staff Costs",            q3: "₦612M",   q4: "₦580M",   change: "-5.2%",  up: false },
  { item: "Operations",             q3: "₦340M",   q4: "₦320M",   change: "-5.9%",  up: false },
  { item: "Administration",         q3: "₦198M",   q4: "₦200M",   change: "+1.0%",  up: true },
  { item: "Total Expenses",         q3: "₦1,150M", q4: "₦1,100M", change: "-4.3%",  up: false, bold: true },
  { item: "",                       q3: "",        q4: "",        change: "",       up: true },
  { item: "EBITDA",                 q3: "₦1,800M", q4: "₦2,100M", change: "+16.7%", up: true, bold: true },
  { item: "Net Profit Margin",      q3: "61.0%",   q4: "65.6%",   change: "+4.6pp", up: true, bold: true },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("pl");

  const tabs: { key: ReportTab; label: string }[] = [
    { key: "pl",        label: "Profit & Loss" },
    { key: "cashflow",  label: "Cash Flow" },
    { key: "balance",   label: "Balance Sheet" },
    { key: "kpi",       label: "KPI Summary" },
  ];

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>Financial Reports</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Page Capital · Q4 2026</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
            Q4 2026 <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
          <button className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}>
            <Download className="w-3.5 h-3.5" /> Export PDF
          </button>
        </div>
      </div>

      {/* AI narrative */}
      <div className="flex items-start gap-3 px-5 py-4 rounded-2xl"
           style={{ background: "linear-gradient(135deg,rgba(255,102,0,0.07),rgba(124,58,237,0.07))", border: "1px solid rgba(255,102,0,0.18)" }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
             style={{ background: "linear-gradient(135deg,#FF6600,#7c3aed)" }}>
          <Brain className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>AI Executive Summary</p>
          <p className="text-[12px] leading-relaxed mt-1" style={{ color: "var(--pg-text-2)" }}>
            Q4 2026 was a strong quarter for Page Capital. Net revenue grew 8.5% QoQ to <strong>₦3.2B</strong>, driven by fixed income mandate growth (+8.2%) and improved money market performance (+10.4%). The cost efficiency ratio improved to 34.4% (from 39.0% in Q3), with total expenses down 4.3% — primarily from staff cost optimisation. Net profit margin expanded by 4.6 percentage points to <strong>65.6%</strong>. AUM closed at ₦89.4B (+12.4% YoY). Recommend maintaining current mandate mix and accelerating the equity growth strategy in Q1 2027.
          </p>
        </div>
      </div>

      {/* Trend chart */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Revenue vs Expenses — 12 Month Trend (₦B)</h2>
          <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full inline-block" style={{ background: "#FF6600" }} /> Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full inline-block" style={{ background: "#dc2626" }} /> Expenses</span>
          </div>
        </div>
        <div className="px-5 py-4" style={{ color: "var(--pg-text-3)" }}>
          <LineChart series={REVENUE_TREND} />
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 p-1 rounded-xl mb-5 w-fit" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
                    className={cn("h-8 px-4 rounded-lg text-[12px] font-medium transition-all", tab === t.key ? "text-white" : "hover:bg-black/5 dark:hover:bg-white/10")}
                    style={tab === t.key ? { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "white" } : { color: "var(--pg-text-2)" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* P&L */}
        {tab === "pl" && (
          <div className="grid xl:grid-cols-5 gap-5">
            {/* Charts */}
            <div className="xl:col-span-3 space-y-5">
              {/* Revenue breakdown */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Revenue Breakdown</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Q4 2026 · ₦3,200M total</p>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {INCOME_LINES.map(l => <HBar key={l.label} {...l} />)}
                </div>
              </div>
              {/* Expense breakdown */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Expense Breakdown</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Q4 2026 · ₦1,100M total</p>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {EXPENSE_LINES.map(l => <HBar key={l.label} {...l} />)}
                </div>
              </div>
            </div>

            {/* P&L table */}
            <div className="xl:col-span-2">
              <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>P&L Summary</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Q3 vs Q4 2026</p>
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                      <th className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Item</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Q3</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Q4</th>
                      <th className="text-right px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PL_TABLE.map((r, i) => r.item === "" ? (
                      <tr key={i}><td colSpan={4} className="py-1" style={{ borderBottom: "1px solid var(--pg-row-border)" }}></td></tr>
                    ) : (
                      <tr key={i} className="transition-colors" style={{ borderBottom: "1px solid var(--pg-row-border)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                        <td className={cn("px-5 py-2.5 text-[12px]", r.bold && "font-semibold")} style={{ color: "var(--pg-text-1)" }}>{r.item}</td>
                        <td className="px-3 py-2.5 text-right text-[12px] tabular" style={{ color: "var(--pg-text-3)" }}>{r.q3}</td>
                        <td className={cn("px-3 py-2.5 text-right text-[12px] tabular", r.bold && "font-semibold")} style={{ color: "var(--pg-text-1)" }}>{r.q4}</td>
                        <td className="px-5 py-2.5 text-right">
                          {r.change && (
                            <span className={cn("text-[11px] font-semibold flex items-center justify-end gap-0.5")}>
                              {r.up ? <TrendingUp className="w-3 h-3" style={{ color: "#10b981" }} /> : <TrendingDown className="w-3 h-3" style={{ color: "#dc2626" }} />}
                              <span style={{ color: r.up ? "#059669" : "#dc2626" }}>{r.change}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {(tab === "cashflow" || tab === "balance" || tab === "kpi") && (
          <div className="rounded-2xl flex items-center justify-center py-20"
               style={{ background: "var(--pg-card)", border: "2px dashed var(--pg-card-border)" }}>
            <div className="text-center">
              <p className="text-[15px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{tabs.find(t => t.key === tab)?.label}</p>
              <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>Coming next — backend integration in progress.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
