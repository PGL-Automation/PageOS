"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { usePosition } from "@/lib/position";
import {
  Brain, TrendingUp, TrendingDown, RefreshCw, CheckSquare, Shield,
  AlertTriangle, ChevronRight, ArrowUpRight, Clock, Check, Zap,
  Users, DollarSign, LineChart, BarChart2, FileText, Star, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const W = 72, H = 24;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - ((v - min) / range) * (H - 4) - 2,
  ]);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ overflow: "visible" }}>
      <path d={d} stroke={up ? "#10b981" : "#dc2626"} strokeWidth="1.5" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Mock data ──────────────────────────────────────────────────────────────────

const KPIs = [
  { label: "Total AUM",           value: "₦89.4B",  change: "+12.4%", up: true,  data: [72,75,73,78,77,80,84,83,87,89], unit: "YoY" },
  { label: "Net Revenue (Q4)",    value: "₦3.2B",   change: "+8.2%",  up: true,  data: [28,29,27,30,31,29,32,31,32,32], unit: "vs Q3" },
  { label: "Operating Expenses",  value: "₦1.1B",   change: "-3.1%",  up: false, data: [12,12,13,12,11,11,11,11,11,11], unit: "vs Q3" },
  { label: "Cash Position",       value: "₦12.3B",  change: "+5.8%",  up: true,  data: [10,10,11,11,12,11,12,12,12,12], unit: "MoM" },
  { label: "Active Clients",      value: "1,247",   change: "+18",    up: true,  data: [110,115,118,120,122,125,128,130,132,135], unit: "this month" },
];

const APPROVALS = [
  { id: "1", title: "Account Opening — Adebayo Johnson", module: "Onboarding", priority: "urgent", time: "2h ago",  from: "F. Okonkwo" },
  { id: "2", title: "Payment Auth. — ₦25M Wire Transfer", module: "Finance",    priority: "urgent", time: "4h ago",  from: "J. Eze" },
  { id: "3", title: "Risk Exception — Delta Corp Exposure", module: "Risk",      priority: "high",   time: "6h ago",  from: "A. Nwosu" },
  { id: "4", title: "New Vendor Onboarding — TechSoft Ltd", module: "Procure.",  priority: "medium", time: "1d ago",  from: "B. Lawal" },
];

const AI_INSIGHTS = [
  { type: "warning", text: "3 unmatched bank transactions totalling ₦1.24M in GT Bank reconciliation.", action: "Review now", href: "/finance/reconciliation" },
  { type: "info",    text: "Cash flow model shows potential shortfall in 58 days at current burn rate.", action: "See forecast", href: "/finance" },
  { type: "success", text: "Revenue up 12.4% MoM — Q4 target on track. No intervention needed.", action: null, href: null },
  { type: "warning", text: "2 compliance deadlines approaching within 14 days — FRCN filing & CAC return.", action: "View tasks", href: "/compliance" },
];

const ACTIVITY = [
  { icon: CheckSquare, text: "Account opening approved for Tunde Balogun",          time: "4m",  color: "#10b981" },
  { icon: RefreshCw,   text: "Auto-reconciliation completed — Nov GT Bank statement", time: "18m", color: "#2563eb" },
  { icon: DollarSign,  text: "₦3.5M payment processed to Stanbic IBTC",             time: "1h",  color: "#f59e0b" },
  { icon: Users,       text: "New RM onboarded: Chiamaka Eze (Page Capital)",        time: "3h",  color: "#7c3aed" },
  { icon: AlertTriangle, text: "Risk alert raised on Petrolex Group exposure",       time: "5h",  color: "#dc2626" },
  { icon: FileText,    text: "Q3 Financial Report signed off by CFO",                time: "1d",  color: "#0891b2" },
];

const MODULES = [
  { label: "Finance",          href: "/finance",                icon: LineChart,   color: "#2563eb", bg: "#eff6ff" },
  { label: "Reconciliation",   href: "/finance/reconciliation", icon: RefreshCw,   color: "#7c3aed", bg: "#f5f3ff" },
  { label: "Approvals",        href: "/approval",               icon: CheckSquare, color: "#059669", bg: "#ecfdf5" },
  { label: "Compliance",       href: "/compliance",             icon: Shield,      color: "#d97706", bg: "#fffbeb" },
  { label: "HR",               href: "/hr",                     icon: Users,       color: "#0891b2", bg: "#ecfeff" },
  { label: "AI Copilot",       href: "/ai",                     icon: Brain,       color: "#7c3aed", bg: "#f5f3ff" },
  { label: "Risk",             href: "/risk",                   icon: AlertTriangle,color:"#dc2626", bg: "#fef2f2" },
  { label: "Analytics",        href: "/analytics",              icon: BarChart2,   color: "#2563eb", bg: "#eff6ff" },
];

const PRIORITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  urgent: { bg: "#fef2f2", text: "#dc2626", dot: "#dc2626" },
  high:   { bg: "#fff7ed", text: "#c2410c", dot: "#f97316" },
  medium: { bg: "#fefce8", text: "#a16207", dot: "#eab308" },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, subsidiary } = useAuth();
  const { primaryCode, isLoading: posLoading } = usePosition();
  const router = useRouter();
  const [now, setNow] = useState(new Date());

  // Each role has its own dedicated dashboard
  useEffect(() => {
    if (posLoading) return;
    const redirects: Record<string, string> = {
      WEALTH_MANAGER:    "/wm/dashboard",
      HR_MANAGER:        "/hr/dashboard",
      HR_OFFICER:        "/hr/dashboard",
      COMPLIANCE_MANAGER:"/compliance",
      FINANCE_OFFICER:   "/finance",
    };
    const dest = redirects[primaryCode ?? ""];
    if (dest) router.replace(dest);
  }, [primaryCode, posLoading, router]);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greeting = getGreeting();
  const firstName = user?.DisplayName?.split(" ")[0] ?? "there";

  // Show a full-screen loader while positions are resolving to avoid a flash
  // of the MD/Admin dashboard for users who will be redirected to a role dashboard.
  if (posLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">

      {/* ── Greeting header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">
            {greeting}, {firstName}.
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{dateStr}{subsidiary ? ` · ${subsidiary.Name}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai"
                className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", boxShadow: "0 2px 12px rgba(37,99,235,0.35)" }}>
            <Brain className="w-3.5 h-3.5" /> Ask AI
          </Link>
          <Link href="/workflows"
                className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                style={{ border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
            <Zap className="w-3.5 h-3.5 text-amber-500" /> Actions
          </Link>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {KPIs.map(({ label, value, change, up, data, unit }) => (
          <div key={label} className="rounded-2xl bg-white p-4 flex flex-col gap-3"
               style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[22px] font-bold text-slate-900 leading-none tabular">{value}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  {up ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
                  <span className={cn("text-[11px] font-semibold", up ? "text-emerald-600" : "text-red-600")}>{change}</span>
                  <span className="text-[10px] text-slate-400">{unit}</span>
                </div>
              </div>
              <Sparkline data={data} up={up} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <div className="grid xl:grid-cols-3 gap-5">

        {/* Left 2/3 */}
        <div className="xl:col-span-2 space-y-5">

          {/* AI insights */}
          <div className="rounded-2xl bg-white overflow-hidden"
               style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                     style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)" }}>
                  <Brain className="w-3.5 h-3.5 text-white" />
                </div>
                <h2 className="text-[13px] font-semibold text-slate-800">AI Insights</h2>
              </div>
              <Link href="/ai" className="text-[11px] font-medium text-blue-600 hover:underline flex items-center gap-0.5">
                Ask AI <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-slate-50">
              {AI_INSIGHTS.map((ins, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                                     ins.type === "warning" ? "bg-amber-400" : ins.type === "success" ? "bg-emerald-400" : "bg-blue-400")} />
                  <p className="text-[13px] text-slate-600 flex-1 leading-relaxed">{ins.text}</p>
                  {ins.action && ins.href && (
                    <Link href={ins.href} className="text-[12px] font-semibold text-blue-600 hover:underline whitespace-nowrap">
                      {ins.action} →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recent activity */}
          <div className="rounded-2xl bg-white overflow-hidden"
               style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: "1px solid #f1f5f9" }}>
              <h2 className="text-[13px] font-semibold text-slate-800">Recent Activity</h2>
              <span className="text-[11px] text-slate-400">Live</span>
            </div>
            <div className="divide-y divide-slate-50">
              {ACTIVITY.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                       style={{ background: item.color + "18" }}>
                    <item.icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                  </div>
                  <p className="text-[13px] text-slate-700 flex-1">{item.text}</p>
                  <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{item.time}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Module quick access */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Quick Access</p>
            <div className="grid grid-cols-4 gap-3">
              {MODULES.map(({ label, href, icon: Icon, color, bg }) => (
                <Link key={label} href={href}
                      className="rounded-xl p-3.5 bg-white hover:scale-[1.02] transition-all group"
                      style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
                       style={{ background: bg }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <p className="text-[12px] font-semibold text-slate-700 leading-tight">{label}</p>
                  <ArrowUpRight className="w-3 h-3 text-slate-300 mt-0.5 group-hover:text-slate-500 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1/3 */}
        <div className="space-y-5">

          {/* Pending approvals */}
          <div className="rounded-2xl bg-white overflow-hidden"
               style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-slate-800">Pending Approvals</h2>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular"
                      style={{ background: "#fef2f2", color: "#dc2626" }}>23</span>
              </div>
              <Link href="/approval" className="text-[11px] font-medium text-blue-600 hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-slate-50">
              {APPROVALS.map(a => {
                const pc = PRIORITY_COLORS[a.priority];
                return (
                  <Link key={a.id} href="/approval"
                        className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors group">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: pc.dot }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-slate-800 truncate leading-snug">{a.title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{a.module} · {a.time}</p>
                    </div>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 capitalize"
                          style={{ background: pc.bg, color: pc.text }}>
                      {a.priority}
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="px-4 py-3" style={{ borderTop: "1px solid #f1f5f9" }}>
              <Link href="/approval"
                    className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                See all 23 pending <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Reconciliation status */}
          <div className="rounded-2xl bg-white overflow-hidden"
               style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-violet-500" />
                <h2 className="text-[13px] font-semibold text-slate-800">Reconciliation</h2>
              </div>
              <Link href="/finance/reconciliation" className="text-[11px] font-medium text-blue-600 hover:underline">Open</Link>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: "Matched",         pct: 94.8, color: "#10b981", v: "2,835" },
                { label: "Unmatched Bank",  pct: 3.1,  color: "#f59e0b", v: "12" },
                { label: "Unmatched Ledger",pct: 2.1,  color: "#dc2626", v: "11" },
              ].map(r => (
                <div key={r.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] text-slate-500">{r.label}</span>
                    <span className="text-[11px] font-semibold tabular" style={{ color: r.color }}>{r.v}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: "#f1f5f9" }}>
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${r.pct}%`, background: r.color }} />
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-amber-600 font-medium mt-2">⚠ ₦1.24M difference — review required</p>
            </div>
          </div>

          {/* Today's agenda */}
          <div className="rounded-2xl bg-white overflow-hidden"
               style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid #f1f5f9" }}>
              <h2 className="text-[13px] font-semibold text-slate-800">Today&apos;s Agenda</h2>
            </div>
            <div className="p-4 space-y-2">
              {[
                { time: "09:00", label: "Investment Committee — Board Room",  done: true },
                { time: "11:30", label: "RM Pipeline Review",                 done: true },
                { time: "14:00", label: "Compliance Briefing — FRCN Filing",  done: false },
                { time: "16:00", label: "Q4 Budget Presentation",             done: false },
              ].map(ev => (
                <div key={ev.time} className={cn("flex items-start gap-3 py-1.5 rounded-lg px-2", ev.done ? "opacity-50" : "")}>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0 mt-0.5 w-9">{ev.time}</span>
                  <div className="flex items-start gap-2">
                    <div className={cn("w-4 h-4 rounded flex items-center justify-center mt-0.5 shrink-0",
                                       ev.done ? "bg-emerald-100" : "bg-slate-100")}>
                      {ev.done && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                    </div>
                    <p className={cn("text-[12px] leading-snug", ev.done ? "line-through text-slate-400" : "text-slate-700")}>{ev.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
