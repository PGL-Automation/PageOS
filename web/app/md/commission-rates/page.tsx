"use client";

import { useState } from "react";
import { Star, Edit2, Save, X, Plus, Info } from "lucide-react";

type Rate = { id: string; product_type: string; label: string; currency: "NGN"|"USD"; mgmt_fee_bps: number; wm_portion_pct: number; effective_from: string; active: boolean };

const INITIAL_RATES: Rate[] = [
  { id:"r1", product_type:"money_market_ngn",label:"Money Market (NGN)",        currency:"NGN",mgmt_fee_bps:50, wm_portion_pct:30,effective_from:"2026-01-01",active:true },
  { id:"r2", product_type:"fixed_income_ngn",label:"Fixed Income (NGN)",        currency:"NGN",mgmt_fee_bps:100,wm_portion_pct:30,effective_from:"2026-01-01",active:true },
  { id:"r3", product_type:"equity_ngn",      label:"Equity (NGN)",              currency:"NGN",mgmt_fee_bps:150,wm_portion_pct:30,effective_from:"2026-01-01",active:true },
  { id:"r4", product_type:"dollar_mmf_usd",  label:"Dollar Money Market (USD)", currency:"USD",mgmt_fee_bps:40, wm_portion_pct:30,effective_from:"2026-01-01",active:true },
  { id:"r5", product_type:"dollar_bond_usd", label:"Dollar Fixed Income (USD)", currency:"USD",mgmt_fee_bps:80, wm_portion_pct:30,effective_from:"2026-01-01",active:true },
];

function sampleAUM(currency: "NGN"|"USD") { return currency === "NGN" ? 100_000_000 : 100_000; }
function quarterlyWM(bps: number, portion: number, currency: "NGN"|"USD") {
  const aum  = sampleAUM(currency);
  const comm = aum * (bps / 10000) * (90 / 365) * (portion / 100);
  return currency === "NGN" ? `₦${comm.toLocaleString(undefined, {maximumFractionDigits:0})}` : `$${comm.toFixed(2)}`;
}

export default function CommissionRatesPage() {
  const [rates, setRates]     = useState<Rate[]>(INITIAL_RATES);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft]     = useState<Partial<Rate>>({});
  const [saved, setSaved]     = useState<string | null>(null);

  function startEdit(r: Rate) { setEditing(r.id); setDraft({ mgmt_fee_bps: r.mgmt_fee_bps, wm_portion_pct: r.wm_portion_pct }); }
  function saveEdit(id: string) {
    setRates(rs => rs.map(r => r.id === id ? { ...r, ...draft } : r));
    setEditing(null);
    setSaved(id);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Commission Rate Configuration</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          Page Capital Asset Management · Set by Managing Director · Applies to all Wealth Managers
        </p>
      </div>

      <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
           style={{ background: "rgba(255,102,0,0.07)", border: "1px solid rgba(255,102,0,0.15)" }}>
        <Info className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
        <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
          <strong>Management Fee</strong> is the total fee charged to clients annually (in bps, 100 bps = 1% p.a.). The <strong>WM Portion</strong> is the percentage of that fee paid to the Wealth Manager as commission. Commission is calculated quarterly (90/365 days). Changes take effect from the next quarter.
        </p>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Active Commission Rates</h2>
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
            <Plus className="w-3.5 h-3.5" /> Add Product
          </button>
        </div>

        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              {["Product","Currency","Mgmt Fee (p.a.)","WM Portion","Sample Q Comm*","Effective",""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rates.map(r => (
              <tr key={r.id} className="transition-colors" style={{ borderBottom: "1px solid var(--pg-row-border)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 shrink-0" style={{ color: r.currency === "USD" ? "#7c3aed" : "#FF6600" }} />
                    <span className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{r.label}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: r.currency === "USD" ? "#f5f3ff" : "#fff7f0", color: r.currency === "USD" ? "#7c3aed" : "#FF6600" }}>
                    {r.currency}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {editing === r.id ? (
                    <input type="number" value={draft.mgmt_fee_bps ?? r.mgmt_fee_bps}
                           onChange={e => setDraft(d => ({ ...d, mgmt_fee_bps: parseInt(e.target.value) || 0 }))}
                           className="w-20 h-8 px-2 rounded-lg text-[13px] font-semibold tabular outline-none"
                           style={{ background: "var(--pg-input)", border: "1px solid #FF6600", color: "var(--pg-text-1)" }} />
                  ) : (
                    <span className="text-[13px] font-semibold tabular" style={{ color: "var(--pg-text-1)" }}>
                      {(r.mgmt_fee_bps/100).toFixed(2)}% ({r.mgmt_fee_bps} bps)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editing === r.id ? (
                    <div className="flex items-center gap-1">
                      <input type="number" value={draft.wm_portion_pct ?? r.wm_portion_pct}
                             onChange={e => setDraft(d => ({ ...d, wm_portion_pct: parseInt(e.target.value) || 0 }))}
                             className="w-16 h-8 px-2 rounded-lg text-[13px] font-semibold tabular outline-none"
                             style={{ background: "var(--pg-input)", border: "1px solid #FF6600", color: "var(--pg-text-1)" }} />
                      <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>%</span>
                    </div>
                  ) : (
                    <span className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{r.wm_portion_pct}%</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[12px] font-semibold tabular" style={{ color: "#059669" }}>
                  {quarterlyWM(editing === r.id ? (draft.mgmt_fee_bps ?? r.mgmt_fee_bps) : r.mgmt_fee_bps,
                               editing === r.id ? (draft.wm_portion_pct ?? r.wm_portion_pct) : r.wm_portion_pct,
                               r.currency)}
                </td>
                <td className="px-4 py-3 text-[11px] font-mono" style={{ color: "var(--pg-text-3)" }}>{r.effective_from}</td>
                <td className="px-4 py-3">
                  {saved === r.id ? (
                    <span className="text-[11px] font-semibold text-emerald-600">✓ Saved</span>
                  ) : editing === r.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => saveEdit(r.id)}
                              className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-white"
                              style={{ background: "#FF6600" }}>
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditing(null)}
                              className="h-7 px-2 rounded-lg text-[11px] transition-colors"
                              style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(r)}
                            className="h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1"
                            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <Edit2 className="w-3 h-3" /> Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
            * Sample quarterly commission on ₦100M NGN / $100K USD AUM.  Formula: AUM × (fee bps ÷ 10,000) × (90 ÷ 365) × WM portion
          </p>
        </div>
      </div>
    </div>
  );
}
