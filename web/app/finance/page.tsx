"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api/client";
import {
  TrendingUp, RefreshCw, CheckCircle2,
  ChevronRight, Brain, BookOpen, FileText, CreditCard,
  Wallet, ClipboardList, Loader2, Building2, ArrowUpRight,
  ArrowDownLeft, DollarSign, BarChart2, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ────────────────────────────────────────────────────────────────────

type BankAccount = {
  id: string; bank_name: string; account_number: string;
  account_name: string; currency: string; status: string;
};

type ReconRun = {
  id: string; bank_account_id: string; period_start: string;
  period_end: string; status: string;
};

type QueueItem = { step: { Label: string }; resource_type: string };

// Matches the actual Go BalanceSheetReport JSON:
//   assets/liabilities/equity are flat arrays of ReportGroup (not nested sections).
type BSLine  = { code: string; name: string; amount: number };   // field is "amount", in NGN
type BSGroup = { group: string; lines: BSLine[]; total: number }; // field is "group"
type BalanceSheetResponse = {
  as_of:             string;
  assets:            BSGroup[];  // flat array
  liabilities:       BSGroup[];
  equity:            BSGroup[];
  total_assets:      number;
  total_liabilities: number;
  total_equity:      number;
};

type JournalHeader = {
  id: string; subsidiary_id?: string; reference: string; date: string;
  type: string; description: string; status: string;
  debit_total: number; credit_total: number; line_count: number;
  created_by_name: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** NGN amount → compact formatted string.
 *  Finance GL amounts are stored and returned in NGN (not kobo).
 *  Reconciliation amounts are in kobo — those pages have their own formatter. */
function fmtAmount(ngn: number, currency = "NGN") {
  const symbol = currency === "USD" ? "$" : "₦";
  const abs = Math.abs(ngn);
  if (abs >= 1_000_000_000) return `${symbol}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${symbol}${(abs / 1_000).toFixed(0)}K`;
  return `${symbol}${abs.toLocaleString()}`;
}

/** Determine cash-flow direction from journal type label */
function journalDirection(type: string): "inflow" | "outflow" | "neutral" {
  const t = type.toLowerCase();
  if (t.includes("receipt") || t.includes("subscription")) return "inflow";
  if (t.includes("payment") || t.includes("redemption"))   return "outflow";
  return "neutral";
}

// Cash account codes in the GL (1101–1114)
const CASH_CODES = new Set(
  Array.from({ length: 14 }, (_, i) => String(1101 + i)),
);

// ── Sub-components ────────────────────────────────────────────────────────────

/** Live cash-position card — shows real data from the balance sheet */
function CashPositionCard({ cashNGN, isLoading }: { cashNGN: number | null; isLoading: boolean }) {
  const displayValue = isLoading
    ? "—"
    : cashNGN === null
    ? "N/A"
    : fmtAmount(cashNGN);

  return (
    <div
      className="rounded-2xl bg-white p-4 flex flex-col gap-3"
      style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Cash Position</p>
      <div className="flex items-end justify-between gap-2">
        <div>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-300 mt-1" />
          ) : (
            <p className="text-[22px] font-bold text-slate-900 leading-none tabular">{displayValue}</p>
          )}
          <p className="text-[10px] text-slate-400 mt-1.5">From GL balance sheet</p>
        </div>
        <BarChart2 className="w-8 h-8 text-slate-100" />
      </div>
    </div>
  );
}

/** Placeholder KPI card shown for metrics not yet computed on-the-fly */
function PlaceholderKpiCard({ label, linkHref }: { label: string; linkHref: string }) {
  return (
    <div
      className="rounded-2xl bg-white p-4 flex flex-col gap-3"
      style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[22px] font-bold text-slate-300 leading-none tabular">—</p>
          <Link
            href={linkHref}
            className="text-[10px] text-orange-500 hover:underline mt-1.5 inline-block"
          >
            View Reports →
          </Link>
        </div>
        <BarChart2 className="w-8 h-8 text-slate-100" />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FinanceDashboard() {
  const { user, subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  // Initialize as null to avoid SSR/client mismatch (hydration error).
  // new Date() on the server differs from the client — set only after mount.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const dateStr  = now
    ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  const greeting = now ? getGreeting(now) : "Welcome";
  const firstName = user?.DisplayName?.split(" ")[0] ?? "there";

  // Fixed ISO date: always today on the client. Placeholder during SSR avoids
  // a query that would differ between server and client.
  const today = now ? now.toISOString().slice(0, 10) : "";

  // ── Live: balance sheet → cash position ─────────────────────────────────────
  const { data: balanceSheet, isLoading: bsLoading } = useQuery<BalanceSheetResponse | null>({
    queryKey: ["balance-sheet", today],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/finance/reports/balance-sheet?as_of=${today}`,
        { credentials: "include" },
      );
      if (!res.ok) return null;
      return (await res.json()) as BalanceSheetResponse;
    },
  });

  // Derive total cash position: sum lines with code 1101–1114 from assets array.
  // assets is a flat BSGroup[] — iterate directly, access line.amount (NGN).
  const cashNGN: number | null = (() => {
    if (!Array.isArray(balanceSheet?.assets)) return null;
    let total = 0;
    for (const group of balanceSheet!.assets) {
      for (const line of (group.lines ?? [])) {
        if (CASH_CODES.has(line.code)) total += line.amount;
      }
    }
    return total;
  })();

  // ── Live: today's posted journals ────────────────────────────────────────────
  const { data: todayJournals = [], isLoading: journalsLoading } = useQuery<JournalHeader[]>({
    queryKey: ["finance-journals-today", today],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/finance/journals`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      const all: unknown = await res.json();
      if (!Array.isArray(all)) return [];
      return (all as JournalHeader[])
        .filter(j => j.date === today && j.status === "posted")
        .slice(0, 10);
    },
  });

  // ── Live: bank accounts ──────────────────────────────────────────────────────
  const { data: accounts = [], isLoading: accsLoading } = useQuery<BankAccount[]>({
    queryKey: ["recon-accounts", subsidId],
    enabled: Boolean(subsidId),
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts?subsidiary_id=${subsidId}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as BankAccount[];
    },
  });

  // ── Live: most-recent recon run per account ──────────────────────────────────
  const { data: runsByAccount = {} } = useQuery<Record<string, ReconRun | null>>({
    queryKey: ["recon-runs-by-account", accounts.map(a => a.id).join(",")],
    enabled: accounts.length > 0,
    queryFn: async () => {
      const out: Record<string, ReconRun | null> = {};
      await Promise.all(accounts.map(async acc => {
        try {
          const res = await fetch(
            `${BASE}/api/v1/reconciliation/runs?bank_account_id=${acc.id}`,
            { credentials: "include" },
          );
          if (!res.ok) { out[acc.id] = null; return; }
          const runs: ReconRun[] = (await res.json()) ?? [];
          out[acc.id] = runs[0] ?? null;
        } catch {
          out[acc.id] = null;
        }
      }));
      return out;
    },
  });

  // ── Live: approval queue ─────────────────────────────────────────────────────
  const { data: queue = [] } = useQuery<QueueItem[]>({
    queryKey: ["approval-queue"],
    queryFn: async () => {
      const { data } = await api.GET("/approval/queue");
      return (data ?? []) as QueueItem[];
    },
  });

  // Derived counts
  const openRuns  = Object.values(runsByAccount).filter(r => r && r.status === "open").length;
  const closedRuns = Object.values(runsByAccount).filter(r => r && r.status === "closed").length;

  const QUICK_LINKS = [
    { href: "/finance/journals",       icon: FileText,      label: "Journals",        color: "#0891b2", bg: "#ecfeff" },
    { href: "/finance/ledger",         icon: BookOpen,      label: "General Ledger",  color: "#FF6600", bg: "#fff7f0" },
    { href: "/finance/reports/pl",             icon: TrendingUp,    label: "Income Statement", color: "#059669", bg: "#ecfdf5" },
    { href: "/finance/reports/balance-sheet", icon: BarChart2,     label: "Balance Sheet",    color: "#7c3aed", bg: "#f5f3ff" },
    { href: "/finance/reports/cash-flow",     icon: RefreshCw,     label: "Cash Flow",        color: "#0891b2", bg: "#ecfeff" },
    { href: "/finance/trial-balance",          icon: BarChart2,     label: "Trial Balance",    color: "#0891b2", bg: "#ecfeff" },
    { href: "/finance/accounts",               icon: ClipboardList, label: "Chart of Accounts", color: "#475569", bg: "#f1f5f9" },
    { href: "/finance/periods",        icon: CheckCircle2,  label: "Periods",         color: "#059669", bg: "#ecfdf5" },
    { href: "/finance/reconciliation", icon: RefreshCw,     label: "Reconciliation",  color: "#d97706", bg: "#fffbeb" },
    { href: "/finance/payables",       icon: CreditCard,    label: "Payables",        color: "#dc2626", bg: "#fef2f2" },
    { href: "/finance/receivables",    icon: Wallet,        label: "Receivables",     color: "#059669", bg: "#ecfdf5" },
    { href: "/finance/assets",           icon: DollarSign,    label: "Fixed Assets",    color: "#7c3aed", bg: "#f5f3ff" },
    { href: "/finance/budget",            icon: BarChart2,     label: "Budget vs Actual", color: "#d97706", bg: "#fffbeb" },
    { href: "/finance/reports/vat",      icon: FileText,      label: "VAT Return",       color: "#0891b2", bg: "#ecfeff" },
    { href: "/finance/reports/wht",      icon: FileText,      label: "WHT Register",     color: "#475569", bg: "#f1f5f9" },
  ];

  const RUN_STATUS: Record<string, { label: string; bg: string; color: string }> = {
    open:   { label: "Open",   bg: "#fffbeb", color: "#d97706" },
    closed: { label: "Closed", bg: "#ecfdf5", color: "#059669" },
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">
            {greeting}, {firstName}.
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {dateStr}{subsidiary ? ` · ${subsidiary.Name}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai"
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#FF6600,#7c3aed)", boxShadow: "0 2px 12px rgba(255,102,0,0.35)" }}>
            <Brain className="w-3.5 h-3.5" /> Ask AI
          </Link>
          <Link href="/finance/reconciliation"
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors"
            style={{ border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
            <Zap className="w-3.5 h-3.5 text-amber-500" /> Reconcile
          </Link>
        </div>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CashPositionCard cashNGN={cashNGN} isLoading={bsLoading} />
        <PlaceholderKpiCard label="Today's Inflows"  linkHref="/finance/reports/pl" />
        <PlaceholderKpiCard label="Today's Outflows" linkHref="/finance/reports/pl" />
        <PlaceholderKpiCard label="Net Position"     linkHref="/finance/reports/cash-flow" />
      </div>

      {/* Live stat pills */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Building2 className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            {accsLoading ? "—" : accounts.length}
          </span>
          <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>Bank Accounts</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={{ background: openRuns > 0 ? "#fffbeb" : "var(--pg-card)", border: `1px solid ${openRuns > 0 ? "#fde68a" : "var(--pg-card-border)"}` }}>
          <RefreshCw className={cn("w-3.5 h-3.5", openRuns > 0 ? "text-amber-500" : "text-slate-400")} />
          <span className="text-[13px] font-semibold" style={{ color: openRuns > 0 ? "#d97706" : "var(--pg-text-1)" }}>
            {openRuns}
          </span>
          <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>Open Recon Runs</span>
          {openRuns > 0 && (
            <Link href="/finance/reconciliation" className="text-[11px] font-semibold text-amber-600 hover:underline ml-1">
              Review →
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={{ background: queue.length > 0 ? "#fef2f2" : "var(--pg-card)", border: `1px solid ${queue.length > 0 ? "#fca5a5" : "var(--pg-card-border)"}` }}>
          <ClipboardList className={cn("w-3.5 h-3.5", queue.length > 0 ? "text-red-500" : "text-slate-400")} />
          <span className="text-[13px] font-semibold" style={{ color: queue.length > 0 ? "#dc2626" : "var(--pg-text-1)" }}>
            {queue.length}
          </span>
          <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>Pending Approvals</span>
          {queue.length > 0 && (
            <Link href="/approval" className="text-[11px] font-semibold text-red-600 hover:underline ml-1">
              Review →
            </Link>
          )}
        </div>
      </div>

      {/* ── Main grid ───────────────────────────────────────────────── */}
      <div className="grid xl:grid-cols-3 gap-5">

        {/* ── Left 2/3 ────────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-5">

          {/* Bank Reconciliation Status ─────────────────────────── */}
          <div className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-violet-500" />
                <h2 className="text-[13px] font-semibold text-slate-800">Bank Reconciliation Status</h2>
              </div>
              <Link href="/finance/reconciliation"
                className="text-[11px] font-medium text-orange-600 hover:underline flex items-center gap-0.5">
                Open full view <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {accsLoading ? (
              <div className="flex items-center justify-center py-12 bg-white">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 bg-white text-center px-6">
                <Building2 className="w-8 h-8 text-slate-200 mb-2" />
                <p className="text-[13px] text-slate-400">No bank accounts found for this subsidiary.</p>
                <Link href="/finance/reconciliation"
                  className="mt-3 text-[12px] font-semibold text-orange-600 hover:underline">
                  Set up bank accounts →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 bg-white">
                {accounts.map(acc => {
                  const run    = runsByAccount[acc.id];
                  const status = run?.status ?? "no_runs";
                  const pill   = RUN_STATUS[status] ?? { label: "No runs", bg: "#f1f5f9", color: "#94a3b8" };
                  return (
                    <div key={acc.id}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: "#fff7f0" }}>
                        <Building2 className="w-4 h-4 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 truncate">{acc.bank_name}</p>
                        <p className="text-[11px] text-slate-400">
                          {acc.account_number} · {acc.currency}
                          {run && (
                            <> · {new Date(run.period_start).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
                               {" – "}{new Date(run.period_end).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</>
                          )}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: pill.bg, color: pill.color }}>
                        {pill.label}
                      </span>
                      <Link href="/finance/reconciliation"
                        className="text-[11px] font-medium text-orange-600 hover:underline shrink-0">
                        {status === "open" ? "Continue →" : "Start run →"}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Today's Posted Journals ─────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden bg-white"
            style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid #f1f5f9" }}>
              <h2 className="text-[13px] font-semibold text-slate-800">Today&apos;s Posted Journals</h2>
              <span className="text-[11px] text-slate-400">
                {journalsLoading ? "Loading…" : `${todayJournals.length} journal${todayJournals.length !== 1 ? "s" : ""}${now ? ` · ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
              </span>
            </div>

            {journalsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : todayJournals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <FileText className="w-8 h-8 text-slate-200 mb-2" />
                <p className="text-[13px] text-slate-400">No posted journals for today yet.</p>
                <Link href="/finance/journals"
                  className="mt-3 text-[12px] font-semibold text-orange-600 hover:underline">
                  Go to Journals →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {todayJournals.map(j => {
                  const dir = journalDirection(j.type);
                  const isInflow  = dir === "inflow";
                  const isOutflow = dir === "outflow";
                  return (
                    <Link
                      key={j.id}
                      href="/finance/journals"
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          background: isInflow ? "#ecfdf5" : isOutflow ? "#fef2f2" : "#f1f5f9",
                        }}
                      >
                        {isInflow  && <ArrowDownLeft className="w-4 h-4 text-emerald-600" />}
                        {isOutflow && <ArrowUpRight  className="w-4 h-4 text-red-500" />}
                        {!isInflow && !isOutflow && <FileText className="w-4 h-4 text-slate-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-medium text-slate-700 truncate">
                            {j.description || j.reference}
                          </p>
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: "#f1f5f9", color: "#475569" }}
                          >
                            {j.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{j.reference} · {j.created_by_name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn(
                          "text-[13px] font-semibold tabular",
                          isInflow ? "text-emerald-600" : isOutflow ? "text-red-600" : "text-slate-700",
                        )}>
                          {isInflow ? "+" : isOutflow ? "−" : ""}{fmtAmount(j.debit_total)}
                        </p>
                        <p className="text-[10px] text-slate-400">{j.date}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ── Right 1/3 ───────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Pending Approvals ───────────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden bg-white"
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
              <Link href="/approval" className="text-[11px] font-medium text-orange-600 hover:underline">
                View all
              </Link>
            </div>

            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                <CheckCircle2 className="w-7 h-7 text-emerald-400 mb-2" />
                <p className="text-[12px] text-slate-400">Queue is empty — all caught up.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {(queue as QueueItem[]).slice(0, 5).map((item, i) => (
                  <Link key={i} href="/approval"
                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors group">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-red-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-slate-800 truncate leading-snug">
                        {item.step.Label}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 capitalize">
                        {item.resource_type.replace("_", " ")}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0 group-hover:text-slate-500 transition-colors" />
                  </Link>
                ))}
                {queue.length > 5 && (
                  <div className="px-4 py-3" style={{ borderTop: "1px solid #f1f5f9" }}>
                    <Link href="/approval"
                      className="flex items-center justify-center gap-1 text-[12px] font-semibold text-orange-600 hover:underline">
                      See all {queue.length} pending <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Navigation ───────────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden bg-white"
            style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid #f1f5f9" }}>
              <h2 className="text-[13px] font-semibold text-slate-800">Finance Modules</h2>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2.5">
              {QUICK_LINKS.map(({ href, icon: Icon, label, color, bg }) => (
                <Link key={href} href={href}
                  className="flex flex-col items-start gap-2 p-3 rounded-xl hover:scale-[1.02] transition-all group"
                  style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: bg }}>
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                  </div>
                  <p className="text-[11px] font-semibold text-slate-700 leading-tight">{label}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* AI Copilot prompt ─────────────────────────────────── */}
          <div className="rounded-2xl p-5"
            style={{ background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", border: "1px solid #c4b5fd" }}>
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-violet-600" />
              <span className="text-[12px] font-bold text-violet-800">AI Finance Copilot</span>
            </div>
            <p className="text-[12px] text-violet-700 leading-relaxed mb-3">
              Ask about cash flow, reconciliation anomalies, or get a variance explanation.
            </p>
            <Link href="/ai"
              className="flex items-center justify-center gap-1.5 h-8 w-full rounded-lg text-[12px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
              Open AI Copilot <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
