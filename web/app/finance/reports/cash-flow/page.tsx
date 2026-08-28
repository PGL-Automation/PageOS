"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Loader2, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type CashFlowLine    = { label: string; amount: number };
type CashFlowSection = { title: string; lines: CashFlowLine[]; total: number };
type CashFlowReport  = {
  from: string; to: string;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  net_change: number;
  opening_cash: number;
  closing_cash: number;
};

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, { credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 2,
  }).format(Math.abs(n));
}

function defaultRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-01-01`;
  const to   = now.toISOString().slice(0, 10);
  return { from, to };
}

// ── Section component ─────────────────────────────────────────────────────────

function Section({ section, color, bg }: { section: CashFlowSection; color: string; bg: string }) {
  const positive = section.total >= 0;
  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-3.5"
           style={{ borderBottom: "1px solid var(--pg-row-border)", background: bg }}>
        <p className="text-[13px] font-bold" style={{ color }}>{section.title}</p>
        <div className="flex items-center gap-1.5">
          {positive
            ? <TrendingUp className="w-3.5 h-3.5" style={{ color }} />
            : <TrendingDown className="w-3.5 h-3.5" style={{ color }} />}
          <span className="text-[13px] font-bold" style={{ color }}>
            {positive ? "" : "−"}{fmt(section.total)}
          </span>
        </div>
      </div>

      {/* Lines */}
      <table className="w-full text-[13px]">
        <tbody>
          {section.lines.filter(l => l.amount !== 0).map((line, i) => (
            <tr key={i}
                className="hover:bg-slate-50/60 transition-colors"
                style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <td className="px-5 py-3" style={{ color: "var(--pg-text-2)" }}>{line.label}</td>
              <td className={cn("px-5 py-3 text-right font-mono w-44",
                line.amount > 0 ? "text-emerald-700" : "text-red-600")}>
                {line.amount > 0 ? "" : "−"}{fmt(line.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: bg, borderTop: `2px solid ${color}22` }}>
            <td className="px-5 py-3.5 font-bold text-[12px]" style={{ color }}>
              Net cash from {section.title.toLowerCase()}
            </td>
            <td className="px-5 py-3.5 text-right font-mono font-bold w-44" style={{ color }}>
              {section.total >= 0 ? "" : "−"}{fmt(section.total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CashFlowPage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const def = defaultRange();
  const [from, setFrom] = useState(def.from);
  const [to,   setTo]   = useState(def.to);

  const { data, isLoading, error } = useQuery<CashFlowReport>({
    queryKey: ["cash-flow", subsidId, from, to],
    enabled: Boolean(from && to),
    queryFn: () => {
      const p = new URLSearchParams({ from, to });
      if (subsidId) p.set("subsidiary_id", subsidId);
      return apiFetch(`/reports/cash-flow?${p}`);
    },
  });

  const SECTIONS = data ? [
    { section: data.operating, color: "#059669", bg: "#ecfdf5" },
    { section: data.investing, color: "#FF6600", bg: "#fff7f0" },
    { section: data.financing, color: "#7c3aed", bg: "#f5f3ff" },
  ] : [];

  return (
    <div className="max-w-[760px] mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
          Statement of Cash Flows
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          Indirect method — derived from posted journal entries
        </p>
      </div>

      {/* Period picker */}
      <div className="rounded-2xl p-5"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>Period</p>
        <div className="grid grid-cols-2 gap-3">
          {[{ label: "From", value: from, set: setFrom }, { label: "To", value: to, set: setTo }].map(f => (
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
          <AlertCircle className="w-4 h-4 shrink-0" /> Failed to load cash flow statement
        </div>
      ) : data ? (
        <div className="space-y-4">

          {/* Cash position bridge */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Opening Cash", value: data.opening_cash, color: "#475569", bg: "#f1f5f9" },
              { label: "Net Change",   value: data.net_change,   color: data.net_change >= 0 ? "#059669" : "#dc2626", bg: data.net_change >= 0 ? "#ecfdf5" : "#fef2f2" },
              { label: "Closing Cash", value: data.closing_cash, color: "#FF6600", bg: "#fff7f0" },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className="rounded-2xl p-4"
                   style={{ background: bg, border: "1px solid var(--pg-card-border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color }}>{label}</p>
                <p className="text-[17px] font-bold" style={{ color }}>
                  {value >= 0 ? "" : "−"}{fmt(value)}
                </p>
              </div>
            ))}
          </div>

          {/* The three sections */}
          {SECTIONS.map(({ section, color, bg }) => (
            <Section key={section.title} section={section} color={color} bg={bg} />
          ))}

          {/* Net change reconciliation */}
          <div className="rounded-2xl overflow-hidden"
               style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
            <table className="w-full text-[13px]">
              <tbody>
                {[
                  { label: "Net cash from operating activities", value: data.operating.total, color: "#059669" },
                  { label: "Net cash from investing activities",  value: data.investing.total, color: "#FF6600" },
                  { label: "Net cash from financing activities",  value: data.financing.total, color: "#7c3aed" },
                ].map(row => (
                  <tr key={row.label} style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                    <td className="px-5 py-3" style={{ color: "var(--pg-text-2)" }}>{row.label}</td>
                    <td className="px-5 py-3 text-right font-mono w-44"
                        style={{ color: row.value >= 0 ? row.color : "#dc2626" }}>
                      {row.value >= 0 ? "" : "−"}{fmt(row.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: data.net_change >= 0 ? "#ecfdf5" : "#fef2f2", borderTop: "2px solid var(--pg-card-border)" }}>
                  <td className="px-5 py-4 font-bold" style={{ color: data.net_change >= 0 ? "#065f46" : "#991b1b" }}>
                    Net increase / (decrease) in cash
                  </td>
                  <td className="px-5 py-4 text-right font-mono font-bold text-[15px] w-44"
                      style={{ color: data.net_change >= 0 ? "#059669" : "#dc2626" }}>
                    {data.net_change >= 0 ? "" : "−"}{fmt(data.net_change)}
                  </td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                  <td className="px-5 py-3" style={{ color: "var(--pg-text-2)" }}>Opening cash balance</td>
                  <td className="px-5 py-3 text-right font-mono w-44" style={{ color: "var(--pg-text-1)" }}>{fmt(data.opening_cash)}</td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--pg-row-border)", background: "#fff7f0" }}>
                  <td className="px-5 py-4 font-bold" style={{ color: "#E05500" }}>Closing cash balance</td>
                  <td className="px-5 py-4 text-right font-mono font-bold text-[15px] w-44" style={{ color: "#FF6600" }}>
                    {fmt(data.closing_cash)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-[10px] px-1" style={{ color: "var(--pg-text-4)" }}>
            Prepared using the indirect method from posted finance journals. Non-cash items (depreciation, accruals) are adjusted automatically.
          </p>
        </div>
      ) : null}
    </div>
  );
}
