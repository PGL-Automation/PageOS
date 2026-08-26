"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type ReportLine  = { code: string; name: string; amount: number };
type ReportGroup = { group: string; lines: ReportLine[]; total: number };
type PLReport = {
  from: string; to: string;
  revenue: ReportGroup[]; expenses: ReportGroup[];
  total_revenue: number; total_expenses: number; net_income: number;
};
type Subsidiary = { id: string; name: string };

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, { credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Math.abs(n));
}

function SectionHeader({ title, total, color, bg }: { title: string; total: number; color: string; bg: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3"
         style={{ background: bg, borderBottom: "1px solid var(--pg-row-border)" }}>
      <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color }}>{title}</p>
      <p className="text-[14px] font-bold tabular font-mono" style={{ color }}>{fmt(total)}</p>
    </div>
  );
}

export default function ProfitLossPage() {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = now.toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [subId, setSubId] = useState("");

  const { data: subsidiaries = [] } = useQuery<Subsidiary[]>({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/subsidiaries`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    },
  });

  const params = new URLSearchParams({ from, to });
  if (subId) params.set("subsidiary_id", subId);

  const { data: report, isLoading } = useQuery<PLReport>({
    queryKey: ["pl", from, to, subId],
    queryFn: () => apiFetch(`/reports/pl?${params}`),
  });

  function exportCSV() {
    if (!report) return;
    const rows: string[] = [
      `Income Statement — ${from} to ${to}`, "",
      "REVENUE", "Group,Code,Name,Amount",
      ...(report.revenue ?? []).flatMap(g => [
        ...g.lines.map(l => `${g.group},${l.code},"${l.name}",${l.amount.toFixed(2)}`),
        `${g.group} Total,,,${g.total.toFixed(2)}`,
      ]),
      `Total Revenue,,,${report.total_revenue.toFixed(2)}`, "",
      "EXPENSES", "Group,Code,Name,Amount",
      ...(report.expenses ?? []).flatMap(g => [
        ...g.lines.map(l => `${g.group},${l.code},"${l.name}",${l.amount.toFixed(2)}`),
        `${g.group} Total,,,${g.total.toFixed(2)}`,
      ]),
      `Total Expenses,,,${report.total_expenses.toFixed(2)}`, "",
      `Net Income / (Loss),,,${report.net_income.toFixed(2)}`,
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    a.download = `pl-${from}-to-${to}.csv`;
    a.click();
  }

  const netPositive = (report?.net_income ?? 0) >= 0;

  return (
    <div className="max-w-[900px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/finance" className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>Finance</Link>
            <span style={{ color: "var(--pg-text-4)" }}>›</span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>Income Statement</span>
          </div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Income Statement (P&L)</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Revenue, expenses, and net income from posted journals</p>
        </div>
        <button onClick={exportCSV}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
                style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap p-4 rounded-2xl"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                 className="h-9 px-3 rounded-lg text-[13px] outline-none"
                 style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
                 className="h-9 px-3 rounded-lg text-[13px] outline-none"
                 style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>Subsidiary</label>
          <select value={subId} onChange={e => setSubId(e.target.value)}
                  className="h-9 px-3 rounded-lg text-[13px] outline-none appearance-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
            <option value="">All subsidiaries</option>
            {(Array.isArray(subsidiaries) ? subsidiaries : []).map((s: Subsidiary) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
      ) : report ? (
        <div className="space-y-4">

          {/* Revenue */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <SectionHeader title="Revenue" total={report.total_revenue} color="#059669" bg="#ecfdf5" />
            {(report.revenue ?? []).map(grp => (
              <div key={grp.group}>
                <p className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider"
                   style={{ background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
                  {grp.group}
                </p>
                <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                  {grp.lines.map(l => l.amount !== 0 && (
                    <div key={l.code} className="flex items-center gap-3 px-5 py-2.5 transition-colors"
                         onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                         onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <code className="text-[11px] font-mono w-12 shrink-0" style={{ color: "var(--pg-text-4)" }}>{l.code}</code>
                      <p className="flex-1 text-[12.5px]" style={{ color: "var(--pg-text-1)" }}>{l.name}</p>
                      <p className="text-[13px] font-semibold tabular font-mono" style={{ color: "#059669" }}>{fmt(l.amount)}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center px-5 py-2.5 font-semibold"
                     style={{ background: "var(--pg-muted-bg)", borderTop: "1px solid var(--pg-row-border)" }}>
                  <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{grp.group} subtotal</p>
                  <p className="text-[13px] tabular font-mono" style={{ color: "#059669" }}>{fmt(grp.total)}</p>
                </div>
              </div>
            ))}
            {(!report.revenue || report.revenue.length === 0) && (
              <p className="px-5 py-6 text-[13px] text-center" style={{ color: "var(--pg-text-4)" }}>No revenue posted in this period.</p>
            )}
          </div>

          {/* Expenses */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <SectionHeader title="Expenses" total={report.total_expenses} color="#dc2626" bg="#fef2f2" />
            {(report.expenses ?? []).map(grp => (
              <div key={grp.group}>
                <p className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider"
                   style={{ background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
                  {grp.group}
                </p>
                <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                  {grp.lines.map(l => l.amount !== 0 && (
                    <div key={l.code} className="flex items-center gap-3 px-5 py-2.5 transition-colors"
                         onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                         onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <code className="text-[11px] font-mono w-12 shrink-0" style={{ color: "var(--pg-text-4)" }}>{l.code}</code>
                      <p className="flex-1 text-[12.5px]" style={{ color: "var(--pg-text-1)" }}>{l.name}</p>
                      <p className="text-[13px] font-semibold tabular font-mono" style={{ color: "#dc2626" }}>{fmt(l.amount)}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center px-5 py-2.5 font-semibold"
                     style={{ background: "var(--pg-muted-bg)", borderTop: "1px solid var(--pg-row-border)" }}>
                  <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{grp.group} subtotal</p>
                  <p className="text-[13px] tabular font-mono" style={{ color: "#dc2626" }}>{fmt(grp.total)}</p>
                </div>
              </div>
            ))}
            {(!report.expenses || report.expenses.length === 0) && (
              <p className="px-5 py-6 text-[13px] text-center" style={{ color: "var(--pg-text-4)" }}>No expenses posted in this period.</p>
            )}
          </div>

          {/* Net Income / Loss */}
          <div className="flex items-center justify-between px-6 py-5 rounded-2xl"
               style={{ background: netPositive ? "#d1fae5" : "#fee2e2", border: `2px solid ${netPositive ? "#a7f3d0" : "#fca5a5"}` }}>
            <div className="flex items-center gap-3">
              {netPositive
                ? <TrendingUp className="w-6 h-6 text-emerald-600" />
                : <TrendingDown className="w-6 h-6 text-red-600" />}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider"
                   style={{ color: netPositive ? "#065f46" : "#991b1b" }}>
                  {netPositive ? "Net Income" : "Net Loss"}
                </p>
                <p className="text-[11px]" style={{ color: netPositive ? "#059669" : "#dc2626" }}>
                  {from} → {to}
                </p>
              </div>
            </div>
            <p className="text-[22px] font-bold tabular font-mono"
               style={{ color: netPositive ? "#059669" : "#dc2626" }}>
              {netPositive ? "" : "("}
              {fmt(report.net_income)}
              {netPositive ? "" : ")"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Minus className="w-8 h-8 mb-3" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>Select a date range to generate the report.</p>
        </div>
      )}
    </div>
  );
}
