"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Loader2, AlertCircle, CheckCircle2, Download } from "lucide-react";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type WHTEntry = {
  date: string; reference: string; description: string;
  wht_payable: number;  // credit to 2122 — WHT deducted from vendors
  wht_credit: number;   // debit to 1150  — WHT deducted by clients from us
};

type WHTRegister = {
  from: string; to: string;
  entries: WHTEntry[];
  total_payable: number;
  total_credit: number;
  net_wht_due: number;
};

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, { credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Math.abs(n));
}

function defaultRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-01-01`;
  const to   = now.toISOString().slice(0, 10);
  return { from, to };
}

export default function WHTRegisterPage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const def = defaultRange();
  const [from, setFrom] = useState(def.from);
  const [to,   setTo]   = useState(def.to);

  const { data, isLoading, error } = useQuery<WHTRegister>({
    queryKey: ["wht-register", subsidId, from, to],
    enabled: Boolean(from && to),
    queryFn: () => {
      const p = new URLSearchParams({ from, to });
      if (subsidId) p.set("subsidiary_id", subsidId);
      return apiFetch(`/wht/register?${p}`);
    },
  });

  const entries = data?.entries ?? [];
  const due = (data?.net_wht_due ?? 0) > 0;

  return (
    <div className="max-w-[860px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>WHT Register</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Withholding tax deducted from vendors vs. deducted by clients — net amount due to FIRS
          </p>
        </div>
        <Link href="/finance/reports/vat"
              className="h-8 px-3 flex items-center rounded-xl text-[12px] font-semibold"
              style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
          VAT Return →
        </Link>
      </div>

      {/* Period picker */}
      <div className="rounded-2xl p-5"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>
          Period
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "From", value: from, set: setFrom },
            { label: "To",   value: to,   set: setTo   },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>{f.label}</label>
              <input type="date" value={f.value} onChange={e => f.set(e.target.value)}
                     className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none"
                     style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
            </div>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-[12px]"
             style={{ background: "#fef2f2", color: "#dc2626" }}>
          <AlertCircle className="w-4 h-4 shrink-0" /> Failed to load WHT register
        </div>
      ) : data ? (
        <div className="space-y-4">

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "WHT Payable",  value: data.total_payable, sub: "Deducted from vendors (2122)",    color: "#dc2626", bg: "#fef2f2" },
              { label: "WHT Credit",   value: data.total_credit,  sub: "Deducted by clients from us (1150)", color: "#059669", bg: "#ecfdf5" },
              { label: "Net Due",      value: Math.abs(data.net_wht_due), sub: due ? "Payable to FIRS" : "Credit balance", color: due ? "#d97706" : "#475569", bg: due ? "#fffbeb" : "#f1f5f9" },
            ].map(({ label, value, sub, color, bg }) => (
              <div key={label} className="rounded-2xl p-4"
                   style={{ background: bg, border: "1px solid var(--pg-card-border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color }}>{label}</p>
                <p className="text-[18px] font-bold" style={{ color }}>{fmt(value)}</p>
                <p className="text-[10px] mt-1" style={{ color: `${color}99` }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Compliance note */}
          <div className="rounded-2xl p-4 flex items-start gap-3"
               style={{ background: due ? "#fffbeb" : "#ecfdf5", border: `1px solid ${due ? "#fde68a" : "#a7f3d0"}` }}>
            {due
              ? <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              : <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
            <p className="text-[12px]" style={{ color: due ? "#92400e" : "#065f46" }}>
              {due
                ? `${fmt(data.net_wht_due)} net WHT is due to FIRS. Post a Payment journal (Dr 2122 / Cr Bank) when remitting.`
                : data.net_wht_due < 0
                  ? `${fmt(Math.abs(data.net_wht_due))} WHT credit — more was deducted from you than you withheld.`
                  : "No net WHT liability for this period."}
              {" "}WHT is due by the 21st of the month following deduction.
            </p>
          </div>

          {/* Transaction register */}
          {entries.length === 0 ? (
            <div className="rounded-2xl py-14 text-center"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No WHT transactions found for this period.</p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden"
                 style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
              <div className="flex items-center justify-between px-5 py-3.5"
                   style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                  WHT Transactions ({entries.length})
                </p>
                <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                  {data.from} to {data.to}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}>
                      {["Date", "Reference", "Description", "WHT Payable", "WHT Credit"].map(h => (
                        <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-left ${h === "WHT Payable" || h === "WHT Credit" ? "text-right" : ""}`}
                            style={{ color: "var(--pg-text-3)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--pg-row-border)" }}
                          className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-mono" style={{ color: "var(--pg-text-2)" }}>{e.date}</td>
                        <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "var(--pg-text-3)" }}>{e.reference}</td>
                        <td className="px-4 py-3" style={{ color: "var(--pg-text-1)" }}>{e.description}</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: e.wht_payable > 0 ? "#dc2626" : "var(--pg-text-4)" }}>
                          {e.wht_payable > 0 ? fmt(e.wht_payable) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: e.wht_credit > 0 ? "#059669" : "var(--pg-text-4)" }}>
                          {e.wht_credit > 0 ? fmt(e.wht_credit) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--pg-muted-bg)", borderTop: "2px solid var(--pg-card-border)" }}>
                      <td colSpan={3} className="px-4 py-3 text-[12px] font-bold" style={{ color: "var(--pg-text-1)" }}>Total</td>
                      <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: "#dc2626" }}>{fmt(data.total_payable)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: "#059669" }}>{fmt(data.total_credit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
