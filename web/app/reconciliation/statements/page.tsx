"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, Loader2, Download, ArrowUpRight, ArrowDownLeft, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

async function reconFetch(path: string) {
  const res = await fetch(`${BASE}/api/v1/reconciliation${path}`, { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

type Account = { id: string; bank_name: string; account_name: string; account_number: string; currency: string };
type Statement = { id: string; period_start: string; period_end: string; opening_balance: number; closing_balance: number; status: string };
type Line = { id: string; txn_date: string; value_date?: string; debit_kobo: number; credit_kobo: number; balance_kobo: number; narration: string; reference: string };

function kobo(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n / 100);
}
function shortKobo(n: number) {
  const v = n / 100;
  if (v >= 1e9) return `₦${(v/1e9).toFixed(2)}B`;
  if (v >= 1e6) return `₦${(v/1e6).toFixed(2)}M`;
  if (v >= 1e3) return `₦${(v/1e3).toFixed(0)}K`;
  return `₦${v.toFixed(2)}`;
}

function downloadCSV(lines: Line[], filename: string) {
  const header = "Date,Value Date,Narration,Reference,Debit,Credit,Balance\n";
  const rows = lines.map(l =>
    [l.txn_date, l.value_date ?? "", `"${l.narration}"`, l.reference,
     l.debit_kobo / 100, l.credit_kobo / 100, l.balance_kobo / 100].join(",")
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function StatementsPage() {
  const { subsidiary } = useAuth();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedStatement, setSelectedStatement] = useState<Statement | null>(null);
  const [search, setSearch] = useState("");

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["recon-accounts-stm"],
    queryFn: () => reconFetch("/accounts"),
  });

  const effectiveAccountId = selectedAccountId || accounts[0]?.id || "";

  const { data: statements = [] } = useQuery<Statement[]>({
    queryKey: ["recon-statements-page", effectiveAccountId],
    enabled: Boolean(effectiveAccountId),
    queryFn: () => reconFetch(`/accounts/${effectiveAccountId}/statements`),
  });

  const { data: lines = [], isLoading: linesLoading } = useQuery<Line[]>({
    queryKey: ["recon-stmt-lines", selectedStatement?.id],
    enabled: Boolean(selectedStatement),
    queryFn: () => reconFetch(`/statements/${selectedStatement!.id}/lines`),
  });

  const filteredLines = search
    ? lines.filter(l => l.narration.toLowerCase().includes(search.toLowerCase()) ||
                        l.reference.toLowerCase().includes(search.toLowerCase()))
    : lines;

  const selectedAccount = accounts.find(a => a.id === effectiveAccountId);

  const totalCredits = lines.reduce((s, l) => s + l.credit_kobo, 0);
  const totalDebits  = lines.reduce((s, l) => s + l.debit_kobo, 0);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)", overflow: "hidden" }}>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div style={{ width: "300px", flexShrink: 0, borderRight: "1px solid var(--pg-card-border)",
        display: "flex", flexDirection: "column", background: "var(--pg-card)" }}>

        {/* Account picker */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--pg-card-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <Building2 style={{ width: "15px", height: "15px", color: "#FF6600" }} />
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--pg-text-1)" }}>Bank Statements</span>
          </div>
          <select value={effectiveAccountId} onChange={e => { setSelectedAccountId(e.target.value); setSelectedStatement(null); }}
            className="w-full h-8 px-2 rounded-lg text-[12px] outline-none appearance-none"
            style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }}>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.account_name} — {a.account_number}</option>
            ))}
          </select>
        </div>

        {/* Statements list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {statements.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>
              No statements for this account
            </div>
          ) : statements.map(s => {
            const isSelected = selectedStatement?.id === s.id;
            const netKobo = s.closing_balance - s.opening_balance;
            return (
              <button key={s.id} onClick={() => { setSelectedStatement(s); setSearch(""); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "12px 16px", border: "none", cursor: "pointer",
                  borderBottom: "1px solid var(--pg-row-border)",
                  borderLeft: isSelected ? "3px solid #FF6600" : "3px solid transparent",
                  background: isSelected ? "rgba(255,102,0,0.06)" : "transparent",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--pg-text-1)" }}>
                      {s.period_start?.slice(0,10)} → {s.period_end?.slice(0,10)}
                    </p>
                    <p style={{ fontSize: "10px", color: "var(--pg-text-3)", marginTop: "2px" }}>
                      <span style={{
                        background: s.status === "reconciled" ? "#d1fae5" : "#fef3c7",
                        color: s.status === "reconciled" ? "#065f46" : "#92400e",
                        borderRadius: "9999px", padding: "1px 7px", fontWeight: 600,
                      }}>{s.status}</span>
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: "11px", fontWeight: 600,
                      color: netKobo >= 0 ? "#059669" : "#dc2626" }}>
                      {shortKobo(Math.abs(s.closing_balance))}
                    </p>
                    <p style={{ fontSize: "9px", color: "var(--pg-text-3)" }}>closing</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      {!selectedStatement ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: "12px" }}>
          <FileText style={{ width: "40px", height: "40px", color: "var(--pg-text-4)" }} />
          <p style={{ fontSize: "14px", color: "var(--pg-text-3)" }}>Select a statement to view transactions</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Header */}
          <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--pg-card-border)",
            display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
            background: "var(--pg-card)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--pg-text-1)" }}>
                {selectedAccount?.account_name}
              </p>
              <p style={{ fontSize: "11px", color: "var(--pg-text-3)", marginTop: "2px" }}>
                {selectedStatement.period_start?.slice(0,10)} → {selectedStatement.period_end?.slice(0,10)}
                {" · "}Opening: <strong>{kobo(selectedStatement.opening_balance)}</strong>
                {" · "}Closing: <strong>{kobo(selectedStatement.closing_balance)}</strong>
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px",
                border: "1px solid var(--pg-card-border)", borderRadius: "8px",
                background: "var(--pg-muted-bg)" }}>
                <Search style={{ width: "12px", height: "12px", color: "var(--pg-text-3)" }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search narration…"
                  style={{ border: "none", background: "transparent", outline: "none",
                    fontSize: "12px", color: "var(--pg-text-1)", width: "150px" }} />
              </div>
              <button onClick={() => downloadCSV(filteredLines,
                  `statement_${selectedStatement.period_start}_${selectedStatement.period_end}.csv`)}
                style={{ display: "flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px",
                  border: "1px solid var(--pg-card-border)", borderRadius: "8px", fontSize: "12px",
                  background: "var(--pg-card)", color: "var(--pg-text-2)", cursor: "pointer" }}>
                <Download style={{ width: "13px", height: "13px" }} /> Export CSV
              </button>
            </div>
          </div>

          {/* Summary strip */}
          <div style={{ display: "flex", gap: "1px", background: "var(--pg-card-border)", flexShrink: 0 }}>
            {[
              { label: "Total Credits", value: shortKobo(totalCredits), color: "#059669" },
              { label: "Total Debits",  value: shortKobo(totalDebits),  color: "#dc2626" },
              { label: "Transactions",  value: lines.length,            color: "var(--pg-text-1)", isNum: true },
              { label: "Showing",       value: filteredLines.length,    color: "var(--pg-text-3)", isNum: true },
            ].map(m => (
              <div key={m.label} style={{ flex: 1, padding: "10px 16px", background: "var(--pg-muted-bg)" }}>
                <p style={{ fontSize: "15px", fontWeight: 700, color: m.color }}>
                  {m.isNum ? m.value : m.value}
                </p>
                <p style={{ fontSize: "10px", color: "var(--pg-text-3)", textTransform: "uppercase",
                  letterSpacing: "0.06em", marginTop: "2px" }}>{m.label}</p>
              </div>
            ))}
          </div>

          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "90px 90px 1fr 90px 110px 110px 120px",
            padding: "7px 20px", borderBottom: "1px solid var(--pg-card-border)",
            background: "var(--pg-muted-bg)", flexShrink: 0 }}>
            {["Date", "Value Date", "Narration / Reference", "Type", "Debit", "Credit", "Balance"].map((h, i) => (
              <span key={h} style={{ fontSize: "10px", fontWeight: 600, color: "var(--pg-text-3)",
                textTransform: "uppercase", letterSpacing: "0.08em",
                textAlign: i >= 4 ? "right" : "left" }}>{h}</span>
            ))}
          </div>

          {/* Lines */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {linesLoading ? (
              <div style={{ padding: "32px", textAlign: "center" }}>
                <Loader2 style={{ width: "20px", height: "20px", color: "var(--pg-text-3)", margin: "0 auto" }} />
              </div>
            ) : filteredLines.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>
                {search ? "No matching transactions" : "No transaction lines"}
              </div>
            ) : filteredLines.map((l, i) => (
              <div key={l.id} style={{
                display: "grid", gridTemplateColumns: "90px 90px 1fr 90px 110px 110px 120px",
                padding: "8px 20px", alignItems: "center",
                borderBottom: "1px solid var(--pg-row-border)",
                background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.01)",
              }}>
                <span style={{ fontSize: "11px", color: "var(--pg-text-3)", fontFamily: "monospace" }}>
                  {l.txn_date?.slice(0,10)}
                </span>
                <span style={{ fontSize: "10px", color: "var(--pg-text-4)", fontFamily: "monospace" }}>
                  {l.value_date?.slice(0,10) || "—"}
                </span>
                <div style={{ overflow: "hidden" }}>
                  <p style={{ fontSize: "12px", color: "var(--pg-text-1)", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.narration || "—"}
                  </p>
                  <p style={{ fontSize: "10px", color: "var(--pg-text-3)", fontFamily: "monospace" }}>
                    {l.reference}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  {l.credit_kobo > 0
                    ? <><ArrowUpRight style={{ width: "11px", height: "11px", color: "#059669", flexShrink: 0 }} /><span style={{ fontSize: "10px", color: "#059669", fontWeight: 600 }}>CR</span></>
                    : <><ArrowDownLeft style={{ width: "11px", height: "11px", color: "#dc2626", flexShrink: 0 }} /><span style={{ fontSize: "10px", color: "#dc2626", fontWeight: 600 }}>DR</span></>
                  }
                </div>
                <span style={{ fontSize: "11px", fontWeight: l.debit_kobo > 0 ? 600 : 400,
                  color: l.debit_kobo > 0 ? "#dc2626" : "var(--pg-text-4)", textAlign: "right" }}>
                  {l.debit_kobo > 0 ? kobo(l.debit_kobo) : "—"}
                </span>
                <span style={{ fontSize: "11px", fontWeight: l.credit_kobo > 0 ? 600 : 400,
                  color: l.credit_kobo > 0 ? "#059669" : "var(--pg-text-4)", textAlign: "right" }}>
                  {l.credit_kobo > 0 ? kobo(l.credit_kobo) : "—"}
                </span>
                <span style={{ fontSize: "11px", color: l.balance_kobo < 0 ? "#dc2626" : "var(--pg-text-1)",
                  textAlign: "right", fontFamily: "monospace" }}>
                  {kobo(Math.abs(l.balance_kobo))}
                  {l.balance_kobo < 0 ? " DR" : " CR"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
