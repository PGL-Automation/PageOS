"use client";

import { useState } from "react";
import { RefreshCw, Save, Check, AlertCircle, History } from "lucide-react";
import { cn } from "@/lib/utils";

const HISTORICAL = [
  { quarter: "Q4 2026", rate: 1620, setOn: "Oct 1, 2026",  setBy: "MD",  locked: false },
  { quarter: "Q3 2026", rate: 1580, setOn: "Jul 1, 2026",  setBy: "MD",  locked: true },
  { quarter: "Q2 2026", rate: 1520, setOn: "Apr 1, 2026",  setBy: "MD",  locked: true },
  { quarter: "Q1 2026", rate: 1490, setOn: "Jan 3, 2026",  setBy: "MD",  locked: true },
  { quarter: "Q4 2025", rate: 1450, setOn: "Oct 2, 2025",  setBy: "MD",  locked: true },
];

export default function ExchangeRatesPage() {
  const [q4Rate, setQ4Rate]   = useState("1620");
  const [saved, setSaved]     = useState(false);
  const [saving, setSaving]   = useState(false);

  function save() {
    setSaving(true);
    setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000); }, 800);
  }

  const parsedRate  = parseFloat(q4Rate) || 0;
  const sampleUSD   = 500_000; // $500K sample
  const sampleNGN   = sampleUSD * parsedRate;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Exchange Rates</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          Page Capital Asset Management · Set by Managing Director · Applied to commission calculations
        </p>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
           style={{ background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.15)" }}>
        <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
          The exchange rate set here is used to convert USD-denominated commissions to NGN for quarterly payout calculations. It applies to all Wealth Managers under Page Capital for the selected quarter. <strong>This is not a live market rate</strong> — it is a fixed rate set by management for fairness and predictability.
        </p>
      </div>

      {/* Q4 active rate */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-violet-500" />
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Active Rate — Q4 2026</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#d1fae5", color: "#065f46" }}>Live</span>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--pg-text-3)" }}>
                USD → NGN Rate (₦ per $1)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold" style={{ color: "var(--pg-text-3)" }}>₦</span>
                <input type="number" value={q4Rate} onChange={e => setQ4Rate(e.target.value)}
                       className="flex-1 h-12 px-3 rounded-xl text-[18px] font-bold tabular outline-none transition-all"
                       style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                <span className="text-[15px] font-bold" style={{ color: "var(--pg-text-3)" }}>/USD</span>
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>Effective for all Q4 2026 commission calculations</p>
            </div>

            {/* Live preview */}
            <div className="rounded-xl p-4" style={{ background: "var(--pg-muted-bg)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>Preview</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>$500,000 USD</span>
                  <span className="text-[12px] font-semibold tabular" style={{ color: "var(--pg-text-1)" }}>₦{sampleNGN.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>$250,000 USD</span>
                  <span className="text-[12px] font-semibold tabular" style={{ color: "var(--pg-text-1)" }}>₦{(250000*parsedRate).toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2" style={{ borderTop: "1px solid var(--pg-card-border)" }}>
                  <span className="text-[12px] font-bold" style={{ color: "var(--pg-text-1)" }}>$1 USD =</span>
                  <span className="text-[14px] font-bold" style={{ color: "#2563eb" }}>₦{parsedRate.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
                    className="flex items-center gap-1.5 h-10 px-6 rounded-xl text-[13px] font-semibold text-white disabled:opacity-70 transition-all"
                    style={{ background: saved ? "#059669" : "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 6px rgba(37,99,235,0.35)" }}>
              {saved ? <><Check className="w-4 h-4" /> Rate Saved</> : saving ? "Saving…" : <><Save className="w-4 h-4" /> Set Q4 2026 Rate</>}
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <History className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Rate History</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              {["Quarter","USD/NGN Rate","Set On","Set By","Status"].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HISTORICAL.map(r => (
              <tr key={r.quarter} className="transition-colors" style={{ borderBottom: "1px solid var(--pg-row-border)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <td className="px-5 py-3 text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{r.quarter}</td>
                <td className="px-5 py-3 text-[14px] font-bold tabular" style={{ color: "#2563eb" }}>₦{r.rate.toLocaleString()}</td>
                <td className="px-5 py-3 text-[12px]" style={{ color: "var(--pg-text-2)" }}>{r.setOn}</td>
                <td className="px-5 py-3 text-[12px]" style={{ color: "var(--pg-text-2)" }}>{r.setBy}</td>
                <td className="px-5 py-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: r.locked ? "#f1f5f9" : "#d1fae5", color: r.locked ? "#475569" : "#065f46" }}>
                    {r.locked ? "Locked" : "Active"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
