"use client";

import { useState } from "react";
import { Target, Save, Check } from "lucide-react";

type WM = { id: string; name: string; title: string };
const TEAM: WM[] = [
  { id:"w1", name:"Chidi Okafor",  title:"Wealth Manager" },
  { id:"w2", name:"Amina Ibrahim", title:"Wealth Manager" },
  { id:"w3", name:"Emeka Nwosu",   title:"Wealth Manager" },
  { id:"w4", name:"Fatima Aliyu",  title:"Wealth Manager" },
];

type Target = { aum_ngn_m: number; aum_usd_k: number; client_count: number };
const DEFAULTS: Record<string, Target> = {
  w1: { aum_ngn_m: 300,  aum_usd_k: 1000, client_count: 10 },
  w2: { aum_ngn_m: 250,  aum_usd_k: 0,    client_count: 8  },
  w3: { aum_ngn_m: 500,  aum_usd_k: 750,  client_count: 12 },
  w4: { aum_ngn_m: 150,  aum_usd_k: 300,  client_count: 6  },
};

const QUARTERS = ["Q4 2026","Q1 2027","Q2 2027","Q3 2027"];

export default function MDTargetsPage() {
  const [quarter, setQuarter]   = useState("Q4 2026");
  const [targets, setTargets]   = useState<Record<string, Target>>(DEFAULTS);
  const [saved, setSaved]       = useState(false);

  function update(wmId: string, field: keyof Target, value: number) {
    setTargets(t => ({ ...t, [wmId]: { ...t[wmId], [field]: value } }));
  }

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color:"var(--pg-text-1)" }}>WM Targets</h1>
          <p className="text-[12px] mt-0.5" style={{ color:"var(--pg-text-3)" }}>
            Page Capital Asset Management · Set quarterly targets for each Wealth Manager
          </p>
        </div>
        <div className="flex gap-2">
          <select value={quarter} onChange={e => setQuarter(e.target.value)}
                  className="h-9 px-3 rounded-xl text-[12px] font-medium outline-none appearance-none"
                  style={{ background:"var(--pg-card)",border:"1px solid var(--pg-card-border)",color:"var(--pg-text-1)" }}>
            {QUARTERS.map(q => <option key={q}>{q}</option>)}
          </select>
          <button onClick={save}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background:saved?"#059669":"linear-gradient(135deg,#FF6600,#E05500)", boxShadow:"0 1px 6px rgba(255,102,0,0.35)" }}>
            {saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> Save Targets</>}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {TEAM.map(wm => {
          const t = targets[wm.id] ?? { aum_ngn_m: 0, aum_usd_k: 0, client_count: 0 };
          return (
            <div key={wm.id} className="rounded-2xl overflow-hidden" style={{ background:"var(--pg-card)",border:"1px solid var(--pg-card-border)" }}>
              <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom:"1px solid var(--pg-row-border)" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                     style={{ background:"linear-gradient(135deg,#FF6600,#E05500)" }}>
                  {wm.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color:"var(--pg-text-1)" }}>{wm.name}</p>
                  <p className="text-[11px]" style={{ color:"var(--pg-text-3)" }}>{wm.title} · {quarter}</p>
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-5 p-5">
                {[
                  { label:"AUM Target (NGN)", field:"aum_ngn_m" as keyof Target, value:t.aum_ngn_m, unit:"₦M", description:"Millions of naira AUM to manage by end of quarter" },
                  { label:"AUM Target (USD)", field:"aum_usd_k" as keyof Target, value:t.aum_usd_k, unit:"$K",  description:"Thousands of USD AUM (dollar-denominated portfolios)" },
                  { label:"Client Count",     field:"client_count" as keyof Target, value:t.client_count, unit:"clients", description:"Number of active clients under management" },
                ].map(f => (
                  <div key={f.field}>
                    <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color:"var(--pg-text-3)" }}>{f.label}</label>
                    <div className="flex items-center gap-1.5">
                      <input type="number" value={f.value}
                             onChange={e => update(wm.id, f.field, parseFloat(e.target.value) || 0)}
                             className="flex-1 h-10 px-3 rounded-xl text-[14px] font-bold tabular outline-none transition-all"
                             style={{ background:"var(--pg-input)",border:"1px solid var(--pg-input-border)",color:"var(--pg-text-1)" }} />
                      <span className="text-[12px] font-medium shrink-0" style={{ color:"var(--pg-text-3)" }}>{f.unit}</span>
                    </div>
                    <p className="text-[11px] mt-1" style={{ color:"var(--pg-text-4)" }}>{f.description}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
