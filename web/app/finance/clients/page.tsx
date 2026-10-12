"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, ArrowUpRight, ArrowDownLeft, Loader2, FileText } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Client = {
  account_code: string;
  client_name: string;
  balance: number;
  txn_count: number;
  last_activity?: string;
};

type Posting = {
  date: string;
  tran_no: string;
  description: string;
  reference: string;
  source: string;
  debit: number;
  credit: number;
  reversed: boolean;
  officer: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);
}

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["finance-clients", search],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/finance/clients?search=${encodeURIComponent(search)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: postings = [], isLoading: postingsLoading } = useQuery<Posting[]>({
    queryKey: ["client-postings", selected?.account_code, from, to],
    enabled: Boolean(selected),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(
        `${BASE}/api/v1/finance/clients/${selected!.account_code}/postings?${params}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  const balance = postings.reduce((s, p) => s + (p.reversed ? 0 : p.credit - p.debit), 0);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)", gap: 0 }}>

      {/* ── Left panel: client list ─────────────────────────────────────────── */}
      <div style={{
        width: "320px", flexShrink: 0, borderRight: "1px solid var(--pg-card-border)",
        display: "flex", flexDirection: "column", background: "var(--pg-card)",
      }}>
        <div style={{ padding: "16px", borderBottom: "1px solid var(--pg-card-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <Users style={{ width: "16px", height: "16px", color: "#6d28d9" }} />
            <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--pg-text-1)" }}>Client Ledger</h2>
          </div>
          <p style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>
            {clients.length} clients · click to view transactions
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px",
            border: "1px solid var(--pg-card-border)", borderRadius: "10px", padding: "6px 10px",
            background: "var(--pg-muted-bg)" }}>
            <Search style={{ width: "13px", height: "13px", color: "var(--pg-text-3)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
              style={{ border: "none", background: "transparent", outline: "none",
                fontSize: "12px", color: "var(--pg-text-1)", width: "100%" }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {isLoading ? (
            <div style={{ padding: "32px", textAlign: "center" }}>
              <Loader2 style={{ width: "20px", height: "20px", color: "var(--pg-text-3)", margin: "0 auto" }} />
            </div>
          ) : clients.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>
              {search ? "No matching clients" : "No client data yet — run the seed script"}
            </div>
          ) : clients.map(c => (
            <button
              key={c.account_code}
              onClick={() => { setSelected(c); setFrom(""); setTo(""); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 16px", border: "none", cursor: "pointer",
                borderBottom: "1px solid var(--pg-row-border)",
                background: selected?.account_code === c.account_code
                  ? "rgba(109,40,217,0.07)" : "transparent",
                borderLeft: selected?.account_code === c.account_code
                  ? "3px solid #7c3aed" : "3px solid transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--pg-text-1)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.client_name}
                  </p>
                  <p style={{ fontSize: "10px", color: "var(--pg-text-3)", marginTop: "2px", fontFamily: "monospace" }}>
                    {c.account_code} · {c.txn_count} txns
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "8px" }}>
                  <p style={{ fontSize: "11px", fontWeight: 600,
                    color: c.balance >= 0 ? "#059669" : "#dc2626" }}>
                    {fmt(Math.abs(c.balance))}
                  </p>
                  {c.last_activity && (
                    <p style={{ fontSize: "9px", color: "var(--pg-text-3)", marginTop: "1px" }}>
                      {c.last_activity.slice(0, 10)}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right panel: transaction detail ─────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: "12px" }}>
            <FileText style={{ width: "40px", height: "40px", color: "var(--pg-text-4)" }} />
            <p style={{ fontSize: "14px", color: "var(--pg-text-3)" }}>Select a client to view their transactions</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--pg-card-border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "var(--pg-card)" }}>
              <div>
                <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--pg-text-1)" }}>
                  {selected.client_name}
                </h2>
                <p style={{ fontSize: "11px", color: "var(--pg-text-3)", marginTop: "2px" }}>
                  {selected.account_code} · Net balance: <strong style={{ color: balance >= 0 ? "#059669" : "#dc2626" }}>{fmt(balance)}</strong>
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                  style={{ height: "32px", padding: "0 8px", fontSize: "11px", borderRadius: "8px",
                    border: "1px solid var(--pg-card-border)", background: "var(--pg-card)", color: "var(--pg-text-1)" }} />
                <span style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>→</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)}
                  style={{ height: "32px", padding: "0 8px", fontSize: "11px", borderRadius: "8px",
                    border: "1px solid var(--pg-card-border)", background: "var(--pg-card)", color: "var(--pg-text-1)" }} />
              </div>
            </div>

            {/* Summary strip */}
            <div style={{ display: "flex", gap: "1px", background: "var(--pg-card-border)" }}>
              {[
                { label: "Total Credits", value: postings.filter(p => !p.reversed).reduce((s, p) => s + p.credit, 0), color: "#059669" },
                { label: "Total Debits", value: postings.filter(p => !p.reversed).reduce((s, p) => s + p.debit, 0), color: "#dc2626" },
                { label: "Transactions", value: postings.length, color: "var(--pg-text-1)", isCnt: true },
                { label: "Reversals", value: postings.filter(p => p.reversed).length, color: "#d97706", isCnt: true },
              ].map(m => (
                <div key={m.label} style={{ flex: 1, padding: "12px 16px", background: "var(--pg-muted-bg)" }}>
                  <p style={{ fontSize: "16px", fontWeight: 700, color: m.color }}>
                    {m.isCnt ? m.value : fmt(m.value as number)}
                  </p>
                  <p style={{ fontSize: "10px", color: "var(--pg-text-3)", textTransform: "uppercase",
                    letterSpacing: "0.06em", marginTop: "2px" }}>{m.label}</p>
                </div>
              ))}
            </div>

            {/* Transaction table */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {/* Header row */}
              <div style={{
                display: "grid", gridTemplateColumns: "90px 60px 1fr 90px 90px 60px",
                padding: "6px 20px", borderBottom: "1px solid var(--pg-card-border)",
                background: "var(--pg-muted-bg)", position: "sticky", top: 0,
              }}>
                {["Date", "Src", "Description / Reference", "Debit", "Credit", "Officer"].map((h, i) => (
                  <span key={h} style={{ fontSize: "10px", fontWeight: 600, color: "var(--pg-text-3)",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    textAlign: i >= 3 && i < 5 ? "right" : "left" }}>
                    {h}
                  </span>
                ))}
              </div>

              {postingsLoading ? (
                <div style={{ padding: "32px", textAlign: "center" }}>
                  <Loader2 style={{ width: "20px", height: "20px", color: "var(--pg-text-3)", margin: "0 auto" }} />
                </div>
              ) : postings.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>
                  No transactions found for this client
                </div>
              ) : postings.map((p, i) => (
                <div key={i}
                  style={{
                    display: "grid", gridTemplateColumns: "90px 60px 1fr 90px 90px 60px",
                    padding: "8px 20px", alignItems: "center",
                    borderBottom: "1px solid var(--pg-row-border)",
                    opacity: p.reversed ? 0.45 : 1,
                    background: p.reversed ? "rgba(239,68,68,0.03)" : "transparent",
                  }}
                >
                  <span style={{ fontSize: "11px", color: "var(--pg-text-3)", fontFamily: "monospace" }}>
                    {p.date?.slice(0, 10)}
                  </span>
                  <span style={{
                    fontSize: "10px", fontWeight: 600, padding: "1px 6px", borderRadius: "9999px",
                    background: p.source === "AM" ? "#ede9fe" : "#dbeafe",
                    color: p.source === "AM" ? "#6d28d9" : "#1d4ed8",
                    textAlign: "center", alignSelf: "center",
                  }}>
                    {p.source}
                  </span>
                  <div style={{ overflow: "hidden" }}>
                    <p style={{ fontSize: "12px", color: "var(--pg-text-1)", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.description || "—"}
                    </p>
                    <p style={{ fontSize: "10px", color: "var(--pg-text-3)", fontFamily: "monospace" }}>
                      {p.reference} {p.reversed ? "• REVERSED" : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                    {p.debit > 0 && <ArrowDownLeft style={{ width: "10px", height: "10px", color: "#dc2626" }} />}
                    <span style={{ fontSize: "11px", fontWeight: 600,
                      color: p.debit > 0 ? "#dc2626" : "var(--pg-text-4)" }}>
                      {p.debit > 0 ? fmt(p.debit) : "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                    {p.credit > 0 && <ArrowUpRight style={{ width: "10px", height: "10px", color: "#059669" }} />}
                    <span style={{ fontSize: "11px", fontWeight: 600,
                      color: p.credit > 0 ? "#059669" : "var(--pg-text-4)" }}>
                      {p.credit > 0 ? fmt(p.credit) : "—"}
                    </span>
                  </div>
                  <span style={{ fontSize: "10px", color: "var(--pg-text-3)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.officer || "—"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
