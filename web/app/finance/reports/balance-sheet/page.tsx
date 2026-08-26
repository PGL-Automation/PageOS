"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type ReportLine  = { code: string; name: string; amount: number };
type ReportGroup = { group: string; lines: ReportLine[]; total: number };
type BSReport = {
  as_of: string;
  assets: ReportGroup[]; liabilities: ReportGroup[]; equity: ReportGroup[];
  total_assets: number; total_liabilities: number; total_equity: number;
  is_balanced: boolean;
};
type Subsidiary = { id: string; name: string };

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, { credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

function fmt(n: number, showNeg = false) {
  const f = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Math.abs(n));
  if (showNeg && n < 0) return `(${f})`;
  return f;
}

function Section({ title, groups, total, color, bg }: {
  title: string; groups: ReportGroup[]; total: number; color: string; bg: string;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="flex items-center justify-between px-5 py-3.5"
           style={{ background: bg, borderBottom: "1px solid var(--pg-row-border)" }}>
        <p className="text-[13px] font-bold uppercase tracking-wider" style={{ color }}>{title}</p>
        <p className="text-[15px] font-bold tabular font-mono" style={{ color }}>{fmt(total)}</p>
      </div>
      {groups.map(grp => (
        <div key={grp.group}>
          <p className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider"
             style={{ background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
            {grp.group}
          </p>
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {grp.lines.map(l => (
              <div key={l.code} className="flex items-center gap-3 px-5 py-2.5 transition-colors"
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <code className="text-[11px] font-mono w-12 shrink-0" style={{ color: "var(--pg-text-4)" }}>{l.code}</code>
                <p className="flex-1 text-[12.5px]" style={{ color: "var(--pg-text-1)" }}>{l.name}</p>
                <p className="text-[13px] font-semibold tabular font-mono"
                   style={{ color: l.amount < 0 ? "#dc2626" : "var(--pg-text-1)" }}>
                  {fmt(l.amount, true)}
                </p>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center px-5 py-2.5 font-semibold"
               style={{ background: "var(--pg-muted-bg)", borderTop: "1px solid var(--pg-row-border)" }}>
            <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{grp.group} subtotal</p>
            <p className="text-[13px] tabular font-mono" style={{ color }}>{fmt(grp.total)}</p>
          </div>
        </div>
      ))}
      {groups.length === 0 && (
        <p className="px-5 py-6 text-[13px] text-center" style={{ color: "var(--pg-text-4)" }}>No balances as of this date.</p>
      )}
    </div>
  );
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
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

  const params = new URLSearchParams({ as_of: asOf });
  if (subId) params.set("subsidiary_id", subId);

  const { data: report, isLoading } = useQuery<BSReport>({
    queryKey: ["balance-sheet", asOf, subId],
    queryFn: () => apiFetch(`/reports/balance-sheet?${params}`),
  });

  function exportCSV() {
    if (!report) return;
    const section = (title: string, groups: ReportGroup[], total: number) => [
      title, "Group,Code,Name,Balance",
      ...(groups ?? []).flatMap(g => [
        ...g.lines.map(l => `${g.group},${l.code},"${l.name}",${l.amount.toFixed(2)}`),
        `${g.group} Total,,,${g.total.toFixed(2)}`,
      ]),
      `Total ${title},,,${total.toFixed(2)}`, "",
    ];
    const rows = [
      `Balance Sheet — As of ${asOf}`, "",
      ...section("ASSETS", report.assets, report.total_assets),
      ...section("LIABILITIES", report.liabilities, report.total_liabilities),
      ...section("EQUITY", report.equity, report.total_equity),
      `Total Liabilities + Equity,,,${(report.total_liabilities + report.total_equity).toFixed(2)}`,
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    a.download = `balance-sheet-${asOf}.csv`;
    a.click();
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/finance" className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>Finance</Link>
            <span style={{ color: "var(--pg-text-4)" }}>›</span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>Balance Sheet</span>
          </div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Balance Sheet</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Statement of Financial Position — Assets = Liabilities + Equity
          </p>
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
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>As of Date</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
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
          {/* Balance check */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
               style={{ background: report.is_balanced ? "#d1fae5" : "#fee2e2",
                        border: `1px solid ${report.is_balanced ? "#a7f3d0" : "#fca5a5"}` }}>
            {report.is_balanced
              ? <><CheckCircle2 className="w-5 h-5 text-emerald-600" /><span className="text-[13px] font-semibold text-emerald-700">In Balance — Assets ({fmt(report.total_assets)}) = Liabilities + Equity ({fmt(report.total_liabilities + report.total_equity)})</span></>
              : <><AlertTriangle className="w-5 h-5 text-red-500" /><span className="text-[13px] font-semibold text-red-700">Out of Balance — difference of {fmt(Math.abs(report.total_assets - report.total_liabilities - report.total_equity))}</span></>
            }
          </div>

          <Section title="Assets"      groups={report.assets ?? []}      total={report.total_assets}      color="#2563eb" bg="#eff6ff" />
          <Section title="Liabilities" groups={report.liabilities ?? []} total={report.total_liabilities} color="#dc2626" bg="#fef2f2" />
          <Section title="Equity"      groups={report.equity ?? []}      total={report.total_equity}      color="#7c3aed" bg="#f5f3ff" />

          {/* Summary */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "2px solid var(--pg-card-border)" }}>
            {[
              { label: "Total Assets",              value: report.total_assets,                                   color: "#2563eb" },
              { label: "Total Liabilities",          value: report.total_liabilities,                              color: "#dc2626" },
              { label: "Total Equity",               value: report.total_equity,                                   color: "#7c3aed" },
              { label: "Total Liabilities + Equity", value: report.total_liabilities + report.total_equity,        color: "#059669" },
            ].map((row, i) => (
              <div key={row.label}
                   className="flex items-center justify-between px-6 py-3.5 font-semibold"
                   style={{ borderTop: i === 3 ? "2px solid var(--pg-card-border)" : i > 0 ? "1px solid var(--pg-row-border)" : undefined }}>
                <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>{row.label}</p>
                <p className="text-[15px] tabular font-bold font-mono" style={{ color: row.color }}>{fmt(row.value)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
