"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, BookOpen } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Account = { code: string; name: string; account_type: string; normal_balance: string; is_header: boolean };
type LedgerEntry = {
  date: string; reference: string; journal_description: string; narration: string;
  type: string; debit: number; credit: number; running_balance: number;
  status: string; created_by_name: string;
};
type LedgerResponse = { account_code: string; opening_balance: number; entries: LedgerEntry[] };

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, { credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Math.abs(n));
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const TYPE_LABELS: Record<string, { color: string }> = {
  ASSET:     { color: "#2563eb" }, LIABILITY: { color: "#dc2626" },
  EQUITY:    { color: "#7c3aed" }, REVENUE:   { color: "#059669" },
  EXPENSE:   { color: "#d97706" },
};

export default function LedgerPage() {
  const [selectedCode, setSelectedCode] = useState("");
  const [search, setSearch] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const raw = await apiFetch("/accounts?active=true");
      return Array.isArray(raw) ? (raw as Account[]) : [];
    },
  });

  const leafAccounts = accounts.filter(a => !a.is_header);
  const filtered = leafAccounts.filter(a =>
    !search || a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase())
  );

  const { data: ledger, isLoading } = useQuery<LedgerResponse>({
    queryKey: ["ledger", selectedCode, fromDate, toDate],
    queryFn: () => apiFetch(`/ledger?account_code=${selectedCode}&from=${fromDate}&to=${toDate}`),
    enabled: !!selectedCode,
  });

  const selectedAccount = accounts.find(a => a.code === selectedCode);
  const entries = ledger?.entries ?? [];

  const totalDebit  = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const closingBalance = (ledger?.opening_balance ?? 0) + totalDebit - totalCredit;

  function exportCSV() {
    if (!ledger || !selectedAccount) return;
    const lines = [
      `General Ledger — ${selectedAccount.code} ${selectedAccount.name}`,
      `Period: ${fromDate} to ${toDate}`,
      `Opening Balance: ${ledger.opening_balance.toFixed(2)}`,
      "",
      "Date,Reference,Description,Narration,Debit,Credit,Running Balance",
      ...entries.map(e => [e.date, e.reference, `"${e.journal_description}"`,
        `"${e.narration}"`, e.debit, e.credit, e.running_balance].join(",")),
      `,,,,${totalDebit.toFixed(2)},${totalCredit.toFixed(2)},${closingBalance.toFixed(2)}`,
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines], { type: "text/csv" }));
    a.download = `ledger-${selectedCode}-${fromDate}.csv`;
    a.click();
  }

  return (
    <div className="max-w-[1300px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>General Ledger</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Transaction history and running balance per account
          </p>
        </div>
        {selectedCode && (
          <button onClick={exportCSV}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
                  style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        )}
      </div>

      <div className="grid xl:grid-cols-4 gap-5">

        {/* Account selector sidebar */}
        <div className="xl:col-span-1">
          <div className="rounded-2xl overflow-hidden sticky top-5"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                     placeholder="Search accounts…"
                     className="w-full h-8 px-3 rounded-lg text-[12px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
              {filtered.length === 0 ? (
                <p className="text-[12px] text-center py-6" style={{ color: "var(--pg-text-4)" }}>No accounts found</p>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                  {filtered.map(a => {
                    const tc = TYPE_LABELS[a.account_type]?.color ?? "#64748b";
                    return (
                      <button key={a.code}
                              onClick={() => setSelectedCode(a.code)}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors"
                              style={{ background: selectedCode === a.code ? "rgba(37,99,235,0.06)" : undefined }}
                              onMouseEnter={e => { if (selectedCode !== a.code) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                              onMouseLeave={e => { if (selectedCode !== a.code) (e.currentTarget as HTMLElement).style.background = ""; }}>
                        <code className="text-[11px] font-mono shrink-0 w-11" style={{ color: "var(--pg-text-4)" }}>{a.code}</code>
                        <p className="text-[12px] leading-snug truncate" style={{ color: "var(--pg-text-1)" }}>{a.name}</p>
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full ml-auto" style={{ background: tc }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Ledger view */}
        <div className="xl:col-span-3 space-y-4">

          {/* Date range */}
          <div className="flex items-center gap-3 flex-wrap p-4 rounded-2xl"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            {selectedAccount && (
              <div className="flex items-center gap-2 mr-2">
                <span className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                  {selectedAccount.code} — {selectedAccount.name}
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: TYPE_LABELS[selectedAccount.account_type]?.color + "18",
                               color: TYPE_LABELS[selectedAccount.account_type]?.color }}>
                  {selectedAccount.account_type}
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: selectedAccount.normal_balance === "DR" ? "#eff6ff" : "#fef2f2",
                               color: selectedAccount.normal_balance === "DR" ? "#2563eb" : "#dc2626" }}>
                  {selectedAccount.normal_balance} normal
                </span>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                     className="h-8 px-2 rounded-lg text-[12px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
              <span style={{ color: "var(--pg-text-4)" }}>→</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                     className="h-8 px-2 rounded-lg text-[12px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          </div>

          {!selectedCode ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <BookOpen className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-4)" }} />
              <p className="text-[14px] font-medium" style={{ color: "var(--pg-text-3)" }}>Select an account to view its ledger</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
          ) : (
            <div className="rounded-2xl overflow-hidden"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>

              {/* Opening balance */}
              <div className="grid items-center gap-3 px-5 py-3 font-semibold"
                   style={{ gridTemplateColumns: "90px 120px 1fr 1fr 90px 90px 110px",
                            background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)" }}>
                <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{fromDate}</p>
                <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>—</p>
                <p className="text-[12px] col-span-2" style={{ color: "var(--pg-text-2)" }}>Opening Balance</p>
                <span /><span />
                <p className="text-[12px] tabular text-right font-bold font-mono"
                   style={{ color: (ledger?.opening_balance ?? 0) >= 0 ? "#dc2626" : "#059669" }}>
                  {fmt(ledger?.opening_balance ?? 0)}
                </p>
              </div>

              {/* Column headers */}
              <div className="grid px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                   style={{ gridTemplateColumns: "90px 120px 1fr 1fr 90px 90px 110px",
                            borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
                <span>Date</span><span>Reference</span>
                <span>Description</span><span>Narration</span>
                <span className="text-right">Debit</span>
                <span className="text-right">Credit</span>
                <span className="text-right">Balance</span>
              </div>

              {entries.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No entries for this period.</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                  {entries.map((e, i) => (
                    <div key={i}
                         className="grid items-start gap-3 px-5 py-2.5 transition-colors"
                         style={{ gridTemplateColumns: "90px 120px 1fr 1fr 90px 90px 110px" }}
                         onMouseEnter={e2 => (e2.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                         onMouseLeave={e2 => (e2.currentTarget as HTMLElement).style.background = ""}>
                      <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>{fmtDate(e.date)}</p>
                      <code className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
                        {e.reference}
                      </code>
                      <p className="text-[12px] truncate" style={{ color: "var(--pg-text-1)" }}>{e.journal_description}</p>
                      <p className="text-[12px] truncate" style={{ color: "var(--pg-text-3)" }}>{e.narration || "—"}</p>
                      <p className="text-[12px] tabular text-right font-mono" style={{ color: e.debit > 0 ? "#dc2626" : "var(--pg-text-4)" }}>
                        {e.debit > 0 ? fmt(e.debit) : "—"}
                      </p>
                      <p className="text-[12px] tabular text-right font-mono" style={{ color: e.credit > 0 ? "#059669" : "var(--pg-text-4)" }}>
                        {e.credit > 0 ? fmt(e.credit) : "—"}
                      </p>
                      <p className="text-[12px] tabular text-right font-mono font-semibold"
                         style={{ color: e.running_balance >= 0 ? "#dc2626" : "#059669" }}>
                        {fmt(e.running_balance)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Closing balance */}
              <div className="grid items-center gap-3 px-5 py-3.5 font-bold"
                   style={{ gridTemplateColumns: "90px 120px 1fr 1fr 90px 90px 110px",
                            borderTop: "2px solid var(--pg-card-border)", background: "var(--pg-muted-bg)" }}>
                <span /><span />
                <p className="text-[12px] col-span-2" style={{ color: "var(--pg-text-2)" }}>Period Total</p>
                <p className="text-[12px] tabular text-right font-mono" style={{ color: "#dc2626" }}>{fmt(totalDebit)}</p>
                <p className="text-[12px] tabular text-right font-mono" style={{ color: "#059669" }}>{fmt(totalCredit)}</p>
                <p className="text-[13px] tabular text-right font-mono"
                   style={{ color: closingBalance >= 0 ? "#dc2626" : "#059669" }}>
                  {fmt(closingBalance)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
