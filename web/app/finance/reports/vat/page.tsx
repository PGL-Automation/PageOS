"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Loader2, Download, AlertCircle, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type VATReturn = {
  from: string; to: string;
  output_vat: number;  // VAT collected on sales — Cr 2121
  input_vat: number;   // VAT paid on purchases — Dr 1151
  net_vat_due: number; // output - input; positive = pay to FIRS
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

// ── Current VAT period: current month start → today ──────────────────────────
function defaultRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to   = now.toISOString().slice(0, 10);
  return { from, to };
}

export default function VATReturnPage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const def = defaultRange();
  const [from, setFrom] = useState(def.from);
  const [to,   setTo]   = useState(def.to);

  const { data: subsidiaries = [] } = useQuery<Subsidiary[]>({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const raw = await apiFetch("/subsidiaries").catch(() => []);
      return Array.isArray(raw) ? (raw as Subsidiary[]) : [];
    },
  });

  const { data, isLoading, error } = useQuery<VATReturn>({
    queryKey: ["vat-return", subsidId, from, to],
    enabled: Boolean(from && to),
    queryFn: () => {
      const p = new URLSearchParams({ from, to });
      if (subsidId) p.set("subsidiary_id", subsidId);
      return apiFetch(`/vat/return?${p}`);
    },
  });

  const due = data ? data.net_vat_due > 0 : false;

  return (
    <div className="max-w-[720px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>VAT Return</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Output VAT collected vs. input VAT paid — net amount due to FIRS
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/finance/reports/wht"
            className="h-8 px-3 flex items-center rounded-xl text-[12px] font-semibold"
            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
            WHT Register →
          </Link>
        </div>
      </div>

      {/* Period picker */}
      <div className="rounded-2xl p-5"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>
          VAT Period
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

      {/* Report */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-[12px]"
             style={{ background: "#fef2f2", color: "#dc2626" }}>
          <AlertCircle className="w-4 h-4 shrink-0" /> Failed to load VAT return
        </div>
      ) : data ? (
        <div className="space-y-4">

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Output VAT",  value: data.output_vat,  sub: "VAT collected on sales",    color: "#059669", bg: "#ecfdf5", icon: TrendingUp   },
              { label: "Input VAT",   value: data.input_vat,   sub: "VAT paid on purchases",     color: "#dc2626", bg: "#fef2f2", icon: TrendingDown  },
              { label: "Net Due",     value: Math.abs(data.net_vat_due), sub: due ? "Payable to FIRS" : data.net_vat_due < 0 ? "Credit (refund due)" : "Nil balance", color: due ? "#d97706" : "#475569", bg: due ? "#fffbeb" : "#f1f5f9", icon: due ? TrendingUp : CheckCircle2 },
            ].map(({ label, value, sub, color, bg, icon: Icon }) => (
              <div key={label} className="rounded-2xl p-4"
                   style={{ background: bg, border: "1px solid var(--pg-card-border)" }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{label}</p>
                </div>
                <p className="text-[18px] font-bold" style={{ color }}>{fmt(value)}</p>
                <p className="text-[10px] mt-1" style={{ color: `${color}99` }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Breakdown table */}
          <div className="rounded-2xl overflow-hidden"
               style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
            <div className="px-5 py-3.5"
                 style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                VAT Computation — {data.from} to {data.to}
              </p>
            </div>
            <table className="w-full text-[13px]">
              <tbody>
                {[
                  { label: "Output VAT (Sales — Account 2121)",    value: data.output_vat,   sign: "+"  },
                  { label: "Input VAT (Purchases — Account 1151)", value: data.input_vat,    sign: "−"  },
                ].map(row => (
                  <tr key={row.label} style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                    <td className="px-5 py-3.5" style={{ color: "var(--pg-text-2)" }}>{row.label}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold w-40"
                        style={{ color: "var(--pg-text-1)" }}>
                      <span className="text-slate-400 mr-1">{row.sign}</span>{fmt(row.value)}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: due ? "#fffbeb" : "#f8fafc" }}>
                  <td className="px-5 py-4 font-bold" style={{ color: due ? "#92400e" : "var(--pg-text-1)" }}>
                    Net VAT {due ? "Payable to FIRS" : data.net_vat_due < 0 ? "Credit (Refund)" : "Balance"}
                  </td>
                  <td className="px-5 py-4 text-right font-mono font-bold text-[15px] w-40"
                      style={{ color: due ? "#d97706" : data.net_vat_due < 0 ? "#059669" : "var(--pg-text-1)" }}>
                    {fmt(data.net_vat_due)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Compliance note */}
          <div className="rounded-2xl p-4 flex items-start gap-3"
               style={{ background: due ? "#fffbeb" : "#ecfdf5", border: `1px solid ${due ? "#fde68a" : "#a7f3d0"}` }}>
            {due
              ? <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              : <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
            <div>
              <p className="text-[12px] font-semibold" style={{ color: due ? "#92400e" : "#065f46" }}>
                {due
                  ? `₦${fmt(data.net_vat_due)} is due to FIRS`
                  : data.net_vat_due < 0
                    ? `₦${fmt(Math.abs(data.net_vat_due))} credit — refund claimable from FIRS`
                    : "No VAT liability for this period"}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: due ? "#a16207" : "#047857" }}>
                VAT returns are due by the 21st of the following month. Post a Payment journal (Dr 2121 / Cr Bank) when remitting.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
