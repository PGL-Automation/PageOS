"use client";

import { useState } from "react";
import { Users, TrendingUp, DollarSign, ArrowUpRight, ChevronRight, Target } from "lucide-react";
import Link from "next/link";

const EX_RATE     = 1620;
const WM_PORTION  = 0.30;

const TEAM = [
  { id:"w1", name:"Chidi Okafor",    email:"chidi@pagecapital.ng",  title:"Wealth Manager", clients:6, aum_ngn:223_000_000,aum_usd:750_000, target_ngn:300_000_000,target_usd:1_000_000,commission_ytd_ngn:3_200_000,q_target:1_500_000,q_earned:1_008_492, status:"active" },
  { id:"w2", name:"Amina Ibrahim",   email:"amina@pagecapital.ng",  title:"Wealth Manager", clients:4, aum_ngn:140_000_000,aum_usd:0,       target_ngn:250_000_000,target_usd:0,         commission_ytd_ngn:2_100_000,q_target:1_200_000,q_earned:983_000,  status:"active" },
  { id:"w3", name:"Emeka Nwosu",     email:"emeka@pagecapital.ng",  title:"Wealth Manager", clients:8, aum_ngn:380_000_000,aum_usd:500_000, target_ngn:500_000_000,target_usd:750_000,  commission_ytd_ngn:4_800_000,q_target:2_000_000,q_earned:1_620_000,status:"active" },
  { id:"w4", name:"Fatima Aliyu",    email:"fatima@pagecapital.ng", title:"Wealth Manager", clients:3, aum_ngn:85_000_000, aum_usd:200_000, target_ngn:150_000_000,target_usd:300_000,  commission_ytd_ngn:1_100_000,q_target:800_000, q_earned:540_000,  status:"probation" },
];

function shortM(n: number) {
  if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`;
  if (n >= 1e6) return `₦${(n/1e6).toFixed(1)}M`;
  return `₦${(n/1e3).toFixed(0)}K`;
}

export default function MDTeamPage() {
  const [selected, setSelected] = useState<string | null>(null);

  const totalAUM   = TEAM.reduce((s, w) => s + w.aum_ngn + w.aum_usd * EX_RATE, 0);
  const totalComm  = TEAM.reduce((s, w) => s + w.commission_ytd_ngn, 0);
  const totalClients = TEAM.reduce((s, w) => s + w.clients, 0);

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Team Overview</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Page Capital Asset Management · {TEAM.length} Wealth Managers</p>
        </div>
        <Link href="/md/targets" className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 6px rgba(37,99,235,0.35)" }}>
          <Target className="w-3.5 h-3.5" /> Set Targets
        </Link>
      </div>

      {/* Team totals */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:"Total Team AUM", value:shortM(totalAUM),               color:"#2563eb",bg:"#eff6ff",icon:TrendingUp },
          { label:"YTD Commission Paid",value:shortM(totalComm),         color:"#059669",bg:"#ecfdf5",icon:DollarSign },
          { label:"Total Clients",  value:totalClients.toString(),         color:"#7c3aed",bg:"#f5f3ff",icon:Users },
        ].map(s => (
          <div key={s.label} className="rounded-2xl overflow-hidden" style={{ background:"var(--pg-card)",border:"1px solid var(--pg-card-border)" }}>
            <div className="h-[3px]" style={{ background:s.color }} />
            <div className="p-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:s.color }}>{s.label}</p>
                <p className="text-[22px] font-bold tabular leading-none mt-1.5" style={{ color:"var(--pg-text-1)" }}>{s.value}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:s.bg }}>
                <s.icon className="w-4 h-4" style={{ color:s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Team table */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--pg-card)",border:"1px solid var(--pg-card-border)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom:"1px solid var(--pg-row-border)" }}>
              {["Wealth Manager","Clients","AUM (NGN Equiv.)","Q4 Target","Q4 Earned","Progress","YTD Commission","Status"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color:"var(--pg-text-3)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAM.map(w => {
              const aumTotal   = w.aum_ngn + w.aum_usd * EX_RATE;
              const targetTotal = w.target_ngn + w.target_usd * EX_RATE;
              const aumPct     = Math.min(100, (aumTotal / targetTotal) * 100);
              const commPct    = Math.min(100, (w.q_earned / w.q_target) * 100);
              return (
                <tr key={w.id} className="transition-colors cursor-pointer" style={{ borderBottom:"1px solid var(--pg-row-border)" }}
                    onClick={() => setSelected(w.id === selected ? null : w.id)}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                           style={{ background:"linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                        {w.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium" style={{ color:"var(--pg-text-1)" }}>{w.name}</p>
                        <p className="text-[11px]" style={{ color:"var(--pg-text-3)" }}>{w.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] tabular text-center font-semibold" style={{ color:"var(--pg-text-1)" }}>{w.clients}</td>
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="text-[13px] font-semibold tabular" style={{ color:"var(--pg-text-1)" }}>{shortM(aumTotal)}</p>
                      <p className="text-[11px]" style={{ color:"var(--pg-text-3)" }}>vs {shortM(targetTotal)} target · {aumPct.toFixed(0)}%</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-[12px] tabular" style={{ color:"var(--pg-text-2)" }}>{shortM(w.q_target)}</td>
                  <td className="px-4 py-3.5 text-[12px] font-semibold tabular" style={{ color:"#059669" }}>{shortM(w.q_earned)}</td>
                  <td className="px-4 py-3.5 w-28">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background:"var(--pg-muted-bg)" }}>
                      <div className="h-full rounded-full" style={{ width:`${commPct}%`, background:commPct>=100?"#059669":commPct>=75?"#2563eb":"#f59e0b", minWidth:4 }} />
                    </div>
                    <p className="text-[10px] mt-0.5 tabular" style={{ color:"var(--pg-text-3)" }}>{commPct.toFixed(0)}%</p>
                  </td>
                  <td className="px-4 py-3.5 text-[12px] font-semibold tabular" style={{ color:"var(--pg-text-1)" }}>{shortM(w.commission_ytd_ngn)}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background:w.status==="active"?"#d1fae5":"#fef3c7", color:w.status==="active"?"#065f46":"#92400e" }}>
                      {w.status === "active" ? "Active" : "Probation"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
