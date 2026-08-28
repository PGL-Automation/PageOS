"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type TBRow = {
  code: string; name: string; account_type: string; account_group: string;
  normal_balance: string; is_header: boolean;
  total_debit: number; total_credit: number; net_balance: number;
};

type Subsidiary = { id: string; code: string; name: string };

const TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ASSET:     { label: "Assets",      color: "#FF6600", bg: "#fff7f0" },
  LIABILITY: { label: "Liabilities", color: "#dc2626", bg: "#fef2f2" },
  EQUITY:    { label: "Equity",      color: "#7c3aed", bg: "#f5f3ff" },
  REVENUE:   { label: "Revenue",     color: "#059669", bg: "#ecfdf5" },
  EXPENSE:   { label: "Expenses",    color: "#d97706", bg: "#fffbeb" },
};

function fmt(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 2,
  }).format(Math.abs(n));
}

function fmtNet(n: number, normalBalance: string) {
  if (n === 0) return { text: "—", color: "var(--pg-text-4)" };
  // Show positive if balance is on the normal side
  const isNormal = (normalBalance === "DR" && n > 0) || (normalBalance === "CR" && n < 0);
  return {
    text: fmt(n),
    color: isNormal ? "var(--pg-text-1)" : "#dc2626",
  };
}

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, { credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export default function TrialBalancePage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [subId, setSubId] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const [hideHeader, setHideHeader] = useState(true);

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

  const { data: rows = [], isLoading } = useQuery<TBRow[]>({
    queryKey: ["trial-balance", asOf, subId],
    queryFn: async () => {
      const raw = await apiFetch(`/trial-balance?${params}`);
      return Array.isArray(raw) ? (raw as TBRow[]) : [];
    },
  });

  const visible = rows.filter(r =>
    (!hideZero   || r.total_debit !== 0 || r.total_credit !== 0) &&
    (!hideHeader || !r.is_header)
  );

  const totalDR = visible.reduce((s, r) => s + r.total_debit, 0);
  const totalCR = visible.reduce((s, r) => s + r.total_credit, 0);
  const isBalanced = Math.abs(totalDR - totalCR) < 0.01;

  function exportCSV() {
    const lines = [
      `Trial Balance — As of ${asOf}`,
      "Code,Name,Type,Group,Debit,Credit,Net Balance",
      ...visible.map(r => [r.code, `"${r.name}"`, r.account_type, r.account_group,
        r.total_debit, r.total_credit, r.net_balance].join(",")),
      `,,,,${totalDR.toFixed(2)},${totalCR.toFixed(2)},`,
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines], { type: "text/csv" }));
    a.download = `trial-balance-${asOf}.csv`;
    a.click();
  }

  const grouped = TYPE_ORDER.map(type => ({
    type, cfg: TYPE_LABELS[type],
    rows: visible.filter(r => r.account_type === type),
  })).filter(g => g.rows.length > 0);

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Trial Balance</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Aggregate debit and credit balances from posted journal entries
          </p>
        </div>
        <button onClick={exportCSV}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
                style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
          <Download className="w-3.5 h-3.5" /> Export CSV
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
            {(Array.isArray(subsidiaries) ? subsidiaries : []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[12px]" style={{ color: "var(--pg-text-2)" }}>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} />
            Hide zero balances
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={hideHeader} onChange={e => setHideHeader(e.target.checked)} />
            Hide header accounts
          </label>
        </div>
      </div>

      {/* Balance check banner */}
      {!isLoading && rows.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
             style={{ background: isBalanced ? "#d1fae5" : "#fee2e2", border: `1px solid ${isBalanced ? "#a7f3d0" : "#fca5a5"}` }}>
          {isBalanced
            ? <><CheckCircle2 className="w-5 h-5 text-emerald-600" /><span className="text-[13px] font-semibold text-emerald-700">Trial balance is in agreement — Total Debits = Total Credits = {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(totalDR)}</span></>
            : <><AlertTriangle className="w-5 h-5 text-red-500" /><span className="text-[13px] font-semibold text-red-700">Out of balance by {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Math.abs(totalDR - totalCR))} — check for posting errors</span></>
          }
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {/* Table header */}
          <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
               style={{ gridTemplateColumns: "80px 1fr 100px 110px 110px 110px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
            <span>Code</span><span>Account Name</span><span>Type</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Credit</span>
            <span className="text-right">Balance</span>
          </div>

          {visible.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
                No posted journal entries found for this date range.
              </p>
            </div>
          ) : (
            <>
              {grouped.map(({ type, cfg, rows: typeRows }) => (
                <div key={type}>
                  {/* Type section header */}
                  <div className="px-5 py-2.5"
                       style={{ background: cfg.bg, borderBottom: "1px solid var(--pg-row-border)" }}>
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>

                  <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                    {typeRows.map(r => {
                      const net = fmtNet(r.net_balance, r.normal_balance);
                      return (
                        <div key={r.code}
                             className="grid items-center gap-3 px-5 py-2.5 transition-colors"
                             style={{ gridTemplateColumns: "80px 1fr 100px 110px 110px 110px" }}
                             onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                             onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                          <code className="text-[12px] font-mono" style={{ color: "var(--pg-text-3)" }}>{r.code}</code>
                          <p className={`text-[12.5px] ${r.is_header ? "font-semibold" : ""}`}
                             style={{ color: "var(--pg-text-1)" }}>{r.name}</p>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded w-fit"
                                style={{ background: cfg.bg, color: cfg.color }}>{r.account_type}</span>
                          <p className="text-[12px] tabular text-right font-mono" style={{ color: r.total_debit > 0 ? "#dc2626" : "var(--pg-text-4)" }}>
                            {r.total_debit > 0 ? fmt(r.total_debit) : "—"}
                          </p>
                          <p className="text-[12px] tabular text-right font-mono" style={{ color: r.total_credit > 0 ? "#059669" : "var(--pg-text-4)" }}>
                            {r.total_credit > 0 ? fmt(r.total_credit) : "—"}
                          </p>
                          <p className="text-[12px] tabular text-right font-mono font-semibold" style={{ color: net.color }}>
                            {net.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Grand total row */}
              <div className="grid items-center gap-3 px-5 py-3.5 font-bold"
                   style={{ gridTemplateColumns: "80px 1fr 100px 110px 110px 110px",
                            borderTop: "2px solid var(--pg-card-border)", background: "var(--pg-muted-bg)" }}>
                <span />
                <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>TOTAL</p>
                <span />
                <p className="text-[13px] tabular text-right font-mono" style={{ color: "#dc2626" }}>
                  {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(totalDR)}
                </p>
                <p className="text-[13px] tabular text-right font-mono" style={{ color: "#059669" }}>
                  {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(totalCR)}
                </p>
                <p className="text-[13px] tabular text-right font-mono"
                   style={{ color: isBalanced ? "#059669" : "#dc2626" }}>
                  {isBalanced ? "✓ Balanced" : `≠ ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Math.abs(totalDR - totalCR))}`}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
