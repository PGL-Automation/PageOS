"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { usePosition, roleFamily } from "@/lib/position";
import { api } from "@/lib/api/client";
import { components } from "@/lib/api/types";
import {
  Brain, TrendingUp, TrendingDown, RefreshCw, CheckSquare, Shield,
  AlertTriangle, ChevronRight, ArrowUpRight, Clock, Check, Zap,
  Users, DollarSign, LineChart, BarChart2, FileText, Loader2,
  ClipboardList, User, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────────

type QueueItem = components["schemas"]["ApprovalQueueItem"];

type Fund = {
  id: string;
  aum: number;
  status: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8081";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Format a naira amount in kobo → ₦B / ₦M / ₦k */
function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000_000) return `₦${(naira / 1_000_000_000).toFixed(1)}B`;
  if (naira >= 1_000_000)     return `₦${(naira / 1_000_000).toFixed(1)}M`;
  if (naira >= 1_000)         return `₦${(naira / 1_000).toFixed(1)}k`;
  return `₦${naira.toFixed(0)}`;
}

/** Format AUM which is already in naira (not kobo) */
function formatAUM(naira: number): string {
  if (naira >= 1_000_000_000) return `₦${(naira / 1_000_000_000).toFixed(1)}B`;
  if (naira >= 1_000_000)     return `₦${(naira / 1_000_000).toFixed(1)}M`;
  if (naira >= 1_000)         return `₦${(naira / 1_000).toFixed(0)}k`;
  return `₦${naira.toFixed(0)}`;
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

// ── Static / sample data ───────────────────────────────────────────────────────

const AI_INSIGHTS = [
  { type: "warning", text: "3 unmatched bank transactions in GT Bank reconciliation. Review for accuracy.", action: "Review now", href: "/finance/reconciliation" },
  { type: "info",    text: "Cash flow model shows potential shortfall in 58 days at current burn rate.", action: "See forecast", href: "/finance" },
  { type: "success", text: "Q4 target on track. No intervention needed.", action: null, href: null },
  { type: "warning", text: "2 compliance deadlines approaching within 14 days — FRCN filing & CAC return.", action: "View tasks", href: "/compliance" },
];

const ACTIVITY = [
  { icon: CheckSquare, text: "Account opening approved for Tunde Balogun",          time: "4m",  color: "#10b981" },
  { icon: RefreshCw,   text: "Auto-reconciliation completed — Nov GT Bank statement", time: "18m", color: "#FF6600" },
  { icon: DollarSign,  text: "₦3.5M payment processed to Stanbic IBTC",             time: "1h",  color: "#f59e0b" },
  { icon: Users,       text: "New RM onboarded: Chiamaka Eze (Page Capital)",        time: "3h",  color: "#7c3aed" },
  { icon: AlertTriangle, text: "Risk alert raised on Petrolex Group exposure",       time: "5h",  color: "#dc2626" },
  { icon: FileText,    text: "Q3 Financial Report signed off by CFO",                time: "1d",  color: "#0891b2" },
];

const MODULES = [
  { label: "Finance",          href: "/finance",                icon: LineChart,   color: "#FF6600", bg: "#fff7f0" },
  { label: "Reconciliation",   href: "/finance/reconciliation", icon: RefreshCw,   color: "#7c3aed", bg: "#f5f3ff" },
  { label: "Approvals",        href: "/approval",               icon: CheckSquare, color: "#059669", bg: "#ecfdf5" },
  { label: "Compliance",       href: "/compliance",             icon: Shield,      color: "#d97706", bg: "#fffbeb" },
  { label: "HR",               href: "/hr",                     icon: Users,       color: "#0891b2", bg: "#ecfeff" },
  { label: "AI Copilot",       href: "/ai",                     icon: Brain,       color: "#7c3aed", bg: "#f5f3ff" },
  { label: "Risk",             href: "/risk",                   icon: AlertTriangle,color:"#dc2626", bg: "#fef2f2" },
  { label: "Analytics",        href: "/analytics",              icon: BarChart2,   color: "#FF6600", bg: "#fff7f0" },
];

const PRIORITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  urgent: { bg: "#fef2f2", text: "#dc2626", dot: "#dc2626" },
  high:   { bg: "#fff7ed", text: "#c2410c", dot: "#f97316" },
  medium: { bg: "#fefce8", text: "#a16207", dot: "#eab308" },
};

function resourceLabel(type: string) {
  const map: Record<string, string> = { onboarding_case: "Client Onboarding" };
  return map[type] ?? type.replace(/_/g, " ");
}

// ── Role routing map (outside component — stable reference) ───────────────────

const FAMILY_DEST: Partial<Record<ReturnType<typeof roleFamily>, string>> = {
  wm:         "/wm/dashboard",
  hr:         "/hr/dashboard",
  finance:    "/finance",
  compliance: "/compliance",
  // md and default stay on this executive dashboard
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, subsidiary } = useAuth();
  const { primaryCode, isLoading: posLoading } = usePosition();
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);

  const redirectDest = posLoading ? null : (FAMILY_DEST[roleFamily(primaryCode)] ?? null);

  useEffect(() => {
    if (redirectDest) router.replace(redirectDest);
  }, [redirectDest, router]);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const dateStr = now
    ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  const greeting = now ? getGreeting() : "Welcome";
  const firstName = user?.DisplayName?.split(" ")[0] ?? "there";

  // ── Live data queries ──────────────────────────────────────────────────────

  // Approval queue — already the source of truth for pending count
  const { data: queueRaw = [] } = useQuery({
    queryKey: ["approval-queue"],
    queryFn: async () => {
      const { data, error } = await api.GET("/approval/queue");
      if (error) throw new Error("Failed to fetch queue");
      return data ?? [];
    },
  });
  const queue: QueueItem[] = Array.isArray(queueRaw) ? queueRaw : [];

  // Portfolio funds — total AUM
  const { data: fundsRaw } = useQuery({
    queryKey: ["portfolio-funds", subsidiary?.ID ?? ""],
    queryFn: async (): Promise<Fund[]> => {
      const subId = subsidiary?.ID ?? "";
      const url = `${BASE}/api/v1/portfolio/funds${subId ? `?subsidiary_id=${subId}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json().catch(() => null);
      return Array.isArray(json) ? (json as Fund[]) : [];
    },
    enabled: !posLoading && !redirectDest,
  });
  const funds: Fund[] = Array.isArray(fundsRaw) ? fundsRaw : [];
  const totalAUM = funds.reduce((s, f) => s + (f.aum ?? 0), 0);

  // Active clients — count
  const { data: clientsRaw } = useQuery({
    queryKey: ["onboarding-clients", subsidiary?.ID ?? ""],
    queryFn: async () => {
      if (!subsidiary?.ID) return [];
      const { data } = await api.GET("/onboarding/clients", {
        params: { query: { subsidiary_id: subsidiary.ID } },
      });
      return data ?? [];
    },
    enabled: Boolean(subsidiary?.ID) && !posLoading && !redirectDest,
  });
  const clients = Array.isArray(clientsRaw) ? clientsRaw : [];
  const activeClientCount = clients.filter(c => c.Status === "active").length;

  // Reconciliation accounts + latest run per account
  const { data: accountsRaw } = useQuery({
    queryKey: ["recon-accounts", subsidiary?.ID ?? ""],
    queryFn: async () => {
      if (!subsidiary?.ID) return [];
      const { data } = await api.GET("/reconciliation/accounts", {
        params: { query: { subsidiary_id: subsidiary.ID } },
      });
      return data ?? [];
    },
    enabled: Boolean(subsidiary?.ID) && !posLoading && !redirectDest,
  });
  const accounts = Array.isArray(accountsRaw) ? accountsRaw : [];

  // Fetch runs for the first account (executive summary — most recent run)
  const firstAccountId = accounts[0]?.id ?? null;
  const { data: runsRaw } = useQuery({
    queryKey: ["recon-runs", firstAccountId],
    queryFn: async () => {
      if (!firstAccountId) return [];
      const { data } = await api.GET("/reconciliation/runs", {
        params: { query: { bank_account_id: firstAccountId } },
      });
      return data ?? [];
    },
    enabled: Boolean(firstAccountId) && !posLoading && !redirectDest,
  });
  const runs = Array.isArray(runsRaw) ? runsRaw : [];

  // Fetch the latest run's details for the summary
  const latestRunId = runs.length > 0 ? runs[runs.length - 1]?.id : null;
  const { data: latestRunDetails } = useQuery({
    queryKey: ["recon-run-details", latestRunId],
    queryFn: async () => {
      if (!latestRunId) return null;
      const { data } = await api.GET("/reconciliation/runs/{id}", {
        params: { path: { id: latestRunId } },
      });
      return data ?? null;
    },
    enabled: Boolean(latestRunId) && !posLoading && !redirectDest,
  });

  // ── Derived recon stats ────────────────────────────────────────────────────

  const reconSummary = latestRunDetails?.summary ?? null;
  const reconMatched      = reconSummary?.matched ?? null;
  const reconUnmatchBank  = reconSummary?.unmatched_bank ?? null;
  const reconUnmatchLedger = reconSummary?.unmatched_internal ?? null;
  const reconTotal        = reconSummary
    ? (reconSummary.matched + reconSummary.unmatched_bank + reconSummary.unmatched_internal)
    : 0;
  const reconMatchedPct   = reconTotal > 0 && reconMatched !== null ? (reconMatched / reconTotal) * 100 : 0;
  const reconBankPct      = reconTotal > 0 && reconUnmatchBank !== null ? (reconUnmatchBank / reconTotal) * 100 : 0;
  const reconLedgerPct    = reconTotal > 0 && reconUnmatchLedger !== null ? (reconUnmatchLedger / reconTotal) * 100 : 0;
  const hasReconData      = reconSummary !== null;

  // ── KPI strip ─────────────────────────────────────────────────────────────

  type KPI = {
    label: string;
    value: string;
    change: string | null;
    up: boolean;
    data: number[];
    unit: string;
    href?: string;
  };

  const KPIs: KPI[] = [
    {
      label:  "Total AUM",
      value:  fundsRaw !== undefined ? (totalAUM > 0 ? formatAUM(totalAUM) : "₦0") : "—",
      change: null,
      up:     true,
      data:   [72, 75, 73, 78, 77, 80, 84, 83, 87, 89],
      unit:   "across all funds",
      href:   "/wm/portfolio",
    },
    {
      label:  "Net Revenue",
      value:  "—",
      change: null,
      up:     true,
      data:   [28, 29, 27, 30, 31, 29, 32, 31, 32, 32],
      unit:   "P&L report",
      href:   "/finance/reports",
    },
    {
      label:  "Operating Expenses",
      value:  "—",
      change: null,
      up:     false,
      data:   [12, 12, 13, 12, 11, 11, 11, 11, 11, 11],
      unit:   "P&L report",
      href:   "/finance/reports",
    },
    {
      label:  "Cash Position",
      value:  "—",
      change: null,
      up:     true,
      data:   [10, 10, 11, 11, 12, 11, 12, 12, 12, 12],
      unit:   "balance sheet",
      href:   "/finance/reports",
    },
    {
      label:  "Active Clients",
      value:  clientsRaw !== undefined
        ? (activeClientCount > 0 ? activeClientCount.toLocaleString() : clients.length > 0 ? clients.length.toLocaleString() : "0")
        : "—",
      change: null,
      up:     true,
      data:   [110, 115, 118, 120, 122, 125, 128, 130, 132, 135],
      unit:   "onboarded",
      href:   "/wm",
    },
  ];

  // ── Hold loader ────────────────────────────────────────────────────────────

  if (posLoading || redirectDest) {
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
                style={{ background: "linear-gradient(135deg,#FF6600,#7c3aed)", boxShadow: "0 2px 12px rgba(255,102,0,0.35)" }}>
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
        {KPIs.map(({ label, value, change, up, data, unit, href }) => {
          const isUnavailable = value === "—";
          const card = (
            <div key={label} className="rounded-2xl bg-white p-4 flex flex-col gap-3"
                 style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className={cn("text-[22px] font-bold leading-none tabular", isUnavailable ? "text-slate-300" : "text-slate-900")}>
                    {value}
                  </p>
                  <div className="flex items-center gap-1 mt-1.5">
                    {!isUnavailable && change && (
                      up ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />
                    )}
                    {!isUnavailable && change && (
                      <span className={cn("text-[11px] font-semibold", up ? "text-emerald-600" : "text-red-600")}>{change}</span>
                    )}
                    <span className={cn("text-[10px]", isUnavailable ? "text-orange-500 underline" : "text-slate-400")}>
                      {unit}
                    </span>
                  </div>
                </div>
                <Sparkline data={data} up={up} />
              </div>
            </div>
          );
          return isUnavailable && href ? (
            <Link key={label} href={href} className="block hover:opacity-80 transition-opacity">
              {card}
            </Link>
          ) : (
            <div key={label}>{card}</div>
          );
        })}
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <div className="grid xl:grid-cols-3 gap-5">

        {/* Left 2/3 */}
        <div className="xl:col-span-2 space-y-5">

          {/* AI insights — sample data */}
          <div className="rounded-2xl bg-white overflow-hidden"
               style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                     style={{ background: "linear-gradient(135deg,#FF6600,#7c3aed)" }}>
                  <Brain className="w-3.5 h-3.5 text-white" />
                </div>
                <h2 className="text-[13px] font-semibold text-slate-800">AI Insights</h2>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400">Sample</span>
              </div>
              <Link href="/ai" className="text-[11px] font-medium text-orange-600 hover:underline flex items-center gap-0.5">
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
                    <Link href={ins.href} className="text-[12px] font-semibold text-orange-600 hover:underline whitespace-nowrap">
                      {ins.action} →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recent activity — sample data */}
          <div className="rounded-2xl bg-white overflow-hidden"
               style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-slate-800">Recent Activity</h2>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400">Sample</span>
              </div>
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

          {/* Pending approvals — live queue */}
          <div className="rounded-2xl bg-white overflow-hidden"
               style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-slate-800">Pending Approvals</h2>
                {queue.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular"
                        style={{ background: "#fef2f2", color: "#dc2626" }}>
                    {queue.length}
                  </span>
                )}
              </div>
              <Link href="/approval" className="text-[11px] font-medium text-orange-600 hover:underline">View all</Link>
            </div>

            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <ClipboardList className="w-8 h-8 text-slate-200 mb-2" />
                <p className="text-[12px] text-slate-400">No items pending your review.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {queue.slice(0, 5).map(a => {
                  const c = (a.context as Record<string, unknown>) ?? {};
                  const clientType = String(c.client_type ?? "");
                  const Icon = clientType === "corporate" ? Building2 : User;
                  // Map to a priority colour — default to medium
                  const priorityKey = "medium";
                  const pc = PRIORITY_COLORS[priorityKey];
                  return (
                    <Link key={a.step.ID} href="/approval"
                          className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors group">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: pc.dot }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-slate-800 truncate leading-snug">{a.step.Label}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Icon className="w-3 h-3 shrink-0 text-slate-400" />
                          <p className="text-[11px] text-slate-400 capitalize">
                            {resourceLabel(a.resource_type)}{clientType ? ` · ${clientType}` : ""}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="px-4 py-3" style={{ borderTop: "1px solid #f1f5f9" }}>
              <Link href="/approval"
                    className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-semibold text-orange-600 hover:bg-orange-50 transition-colors">
                {queue.length > 0
                  ? <>See all {queue.length} pending <ChevronRight className="w-3 h-3" /></>
                  : <>Open approvals <ChevronRight className="w-3 h-3" /></>}
              </Link>
            </div>
          </div>

          {/* Reconciliation status — live data */}
          <div className="rounded-2xl bg-white overflow-hidden"
               style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-violet-500" />
                <h2 className="text-[13px] font-semibold text-slate-800">Reconciliation</h2>
              </div>
              <Link href="/finance/reconciliation" className="text-[11px] font-medium text-orange-600 hover:underline">Open</Link>
            </div>

            {!hasReconData ? (
              <div className="p-5 flex flex-col items-center justify-center text-center gap-2">
                {accounts.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No bank accounts configured yet.</p>
                ) : runs.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No reconciliation runs found.</p>
                ) : (
                  <p className="text-[12px] text-slate-400">Loading reconciliation data…</p>
                )}
                <Link href="/finance/reconciliation" className="text-[12px] font-medium text-orange-600 hover:underline">
                  Go to reconciliation →
                </Link>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                {[
                  { label: "Matched",          pct: reconMatchedPct,  color: "#10b981", v: reconMatched?.toLocaleString() ?? "—" },
                  { label: "Unmatched Bank",   pct: reconBankPct,    color: "#f59e0b", v: reconUnmatchBank?.toLocaleString() ?? "—" },
                  { label: "Unmatched Ledger", pct: reconLedgerPct,  color: "#dc2626", v: reconUnmatchLedger?.toLocaleString() ?? "—" },
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
                {(reconUnmatchBank !== null && reconUnmatchBank > 0) || (reconUnmatchLedger !== null && reconUnmatchLedger > 0) ? (
                  <p className="text-[11px] text-amber-600 font-medium mt-2">
                    ⚠ {((reconUnmatchBank ?? 0) + (reconUnmatchLedger ?? 0)).toLocaleString()} unmatched item{((reconUnmatchBank ?? 0) + (reconUnmatchLedger ?? 0)) === 1 ? "" : "s"} — review required
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-600 font-medium mt-2">All items matched.</p>
                )}
              </div>
            )}
          </div>

          {/* Today's agenda — static placeholder */}
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
