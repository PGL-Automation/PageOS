"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { usePosition } from "@/lib/position";
import { api } from "@/lib/api/client";
import { components } from "@/lib/api/types";
import {
  Users, TrendingUp, TrendingDown, ArrowUpRight, Clock,
  Mail, AlertCircle, CheckCircle2, ChevronRight, Brain,
  Plus, Star, Loader2, FileText, Shield, DollarSign,
  BarChart2, Calendar, MessageSquare, Target, Zap,
  RefreshCw, Gift, Bell,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type OnboardingCase = components["schemas"]["OnboardingCase"];
type CaseDetails    = components["schemas"]["CaseDetails"];
type Fund = {
  id: string;
  name: string;
  code: string;
  aum: number;
  currency: string;
  status: string;
  fund_type: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";
const QUARTERLY_TARGET = 1_000_000_000; // ₦1B demo target

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function fmtCompact(n: number, cur = "NGN") {
  const sym = cur === "USD" ? "$" : "₦";
  if (n >= 1e9) return sym + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sym + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return sym + (n / 1e3).toFixed(1) + "K";
  return sym + n.toLocaleString("en-NG");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

// ── Sub-types ─────────────────────────────────────────────────────────────────

interface ClientRow {
  id:       string;
  name:     string;
  type:     string;
  state:    string;
  riskFlag: boolean;
}

const CASE_PILL: Record<string, { label: string; bg: string; color: string }> = {
  draft:             { label: "Draft",       bg: "#f1f5f9", color: "#475569" },
  submitted:         { label: "Submitted",   bg: "#e0f2fe", color: "#0369a1" },
  in_review:         { label: "In Review",   bg: "#fff0e0", color: "#E05500" },
  compliance_review: { label: "Compliance",  bg: "#ede9fe", color: "#6d28d9" },
  approved:          { label: "Approved",    bg: "#d1fae5", color: "#065f46" },
  rejected:          { label: "Rejected",    bg: "#fee2e2", color: "#991b1b" },
  returned:          { label: "Returned",    bg: "#fef3c7", color: "#92400e" },
};

// ── Shared fetchers ───────────────────────────────────────────────────────────

async function fetchClients(subsidId: string, userId: string, filterToUser: boolean): Promise<ClientRow[]> {
  const res = await fetch(`${BASE}/api/v1/onboarding/cases?subsidiary_id=${subsidId}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const cases: OnboardingCase[] = (await res.json()) ?? [];
  const filtered = filterToUser ? cases.filter(c => c.InitiatedBy === userId) : cases;

  const details: (CaseDetails | null)[] = await Promise.all(
    filtered.map(async c => {
      try {
        const dr = await fetch(`${BASE}/api/v1/onboarding/cases/${c.ID}`, { credentials: "include" });
        if (!dr.ok) return null;
        return (await dr.json()) as CaseDetails;
      } catch { return null; }
    })
  );

  return filtered.map((c, i): ClientRow => ({
    id:       c.ID,
    name:     (details[i] as any)?.application?.full_name ?? `Case ${c.ID.slice(0, 6)}`,
    type:     c.ClientType,
    state:    c.State,
    riskFlag: c.RiskFlag,
  }));
}

// ── Maturity row type (derived from accounts) ────────────────────────────────

interface MaturityRow {
  id:          string;
  clientName:  string;
  fundType:    string;
  amount:      number;
  currency:    string;
  maturityDate: string | null;
  instructed:  boolean;
}

// ── Client List component ────────────────────────────────────────────────────

function ClientListCard({ clients, isLoading }: { clients: ClientRow[]; isLoading: boolean }) {
  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
      <div className="flex items-center justify-between px-5 py-4"
           style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
          My Clients
        </h2>
        <Link href="/wm/clients"
              className="text-[11px] font-medium text-orange-600 hover:underline flex items-center gap-0.5">
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
          <Users className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No clients yet</p>
          <Link href="/investments/onboarding"
                className="mt-3 text-[12px] font-semibold text-orange-600 hover:underline">
            Start a new onboarding →
          </Link>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
          {clients.map(c => {
            const pill = CASE_PILL[c.state] ?? { label: c.state, bg: "#f1f5f9", color: "#475569" };
            return (
              <Link key={c.id} href={`/wm/clients/${c.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors group"
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
                     style={{ background: c.riskFlag ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "linear-gradient(135deg,#FF6600,#E05500)" }}>
                  {c.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{c.name}</p>
                    {c.riskFlag && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: "#fee2e2", color: "#dc2626" }}>
                        Risk
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] capitalize mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                    {c.type}
                    {c.state === "compliance_review" && (
                      <span className="ml-1.5 text-violet-600 font-medium">· Compliance checking</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: pill.bg, color: pill.color }}>
                    {pill.label}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ color: "var(--pg-text-3)" }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Maturity card ─────────────────────────────────────────────────────────────

function MaturitiesCard({ accounts }: { accounts: any[] }) {
  const [tab, setTab] = useState<"week" | "month">("week");

  // Derive sample maturity rows from accounts with status "active"
  const rows: MaturityRow[] = (accounts ?? [])
    .filter((a: any) => a.status === "active")
    .slice(0, 8)
    .map((a: any): MaturityRow => ({
      id:          a.id ?? a.ID ?? "",
      clientName:  a.client_name ?? a.ClientName ?? "—",
      fundType:    a.fund_type ?? a.FundType ?? "Fixed Income",
      amount:      a.balance ?? a.Balance ?? a.aum ?? 0,
      currency:    a.currency ?? "NGN",
      maturityDate: a.maturity_date ?? a.MaturityDate ?? null,
      instructed:  Boolean(a.instructed ?? a.Instructed),
    }));

  const shownRows = tab === "week" ? rows.slice(0, 4) : rows;

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
      <div className="flex items-center justify-between px-5 py-4"
           style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" style={{ color: "#d97706" }} />
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Upcoming Maturities
          </h2>
        </div>
        <Link href="/wm/maturities"
              className="text-[11px] font-medium text-orange-600 hover:underline flex items-center gap-0.5">
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 pt-3 pb-1">
        {(["week", "month"] as const).map(t => (
          <button key={t}
                  onClick={() => setTab(t)}
                  className="h-7 px-3 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    background: tab === t ? "#FF66001a" : "var(--pg-muted-bg)",
                    color: tab === t ? "#FF6600" : "var(--pg-text-3)",
                    border: tab === t ? "1px solid #FF660033" : "1px solid transparent",
                  }}>
            {t === "week" ? "This Week" : "This Month"}
          </button>
        ))}
      </div>

      {shownRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <Clock className="w-8 h-8 mb-2" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
            No maturities this {tab}.
          </p>
          <Link href="/wm/maturities"
                className="mt-2 text-[11px] font-medium text-orange-600 hover:underline">
            Next maturity view →
          </Link>
          <p className="text-[10px] mt-3 px-6" style={{ color: "var(--pg-text-4)" }}>
            Connect maturity data to see live maturities
          </p>
        </div>
      ) : (
        <>
          <div className="px-5 pt-1">
            <div className="grid grid-cols-4 gap-3 pb-2 pt-1"
                 style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              {["Client", "Type", "Amount", "Status"].map(h => (
                <p key={h} className="text-[10px] font-bold uppercase tracking-wider"
                   style={{ color: "var(--pg-text-3)" }}>{h}</p>
              ))}
            </div>
          </div>
          <div className="divide-y px-5" style={{ borderColor: "var(--pg-row-border)" }}>
            {shownRows.map(r => (
              <div key={r.id}
                   className="grid grid-cols-4 gap-3 py-3 items-center"
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <p className="text-[13px] truncate" style={{ color: "var(--pg-text-1)" }}>{r.clientName}</p>
                <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{r.fundType}</p>
                <p className="text-[13px] font-semibold tabular" style={{ color: "var(--pg-text-1)" }}>
                  {fmtCompact(r.amount, r.currency)}
                </p>
                <div>
                  {r.instructed ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "#d1fae5", color: "#065f46" }}>
                      Instructed
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "#fee2e2", color: "#991b1b" }}>
                      No instruction
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── AI Nudge ──────────────────────────────────────────────────────────────────

function AINudge() {
  return (
    <Link href="/ai"
          className="flex items-center gap-3 px-5 py-4 rounded-2xl transition-all"
          style={{
            background: "linear-gradient(135deg,rgba(124,58,237,0.08),rgba(255,102,0,0.08))",
            border: "1px solid rgba(124,58,237,0.15)",
          }}>
      <Brain className="w-5 h-5 shrink-0" style={{ color: "#7c3aed" }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-semibold" style={{ color: "var(--pg-text-1)" }}>AI Copilot</p>
        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
          Ask about your clients, commissions, or next steps
        </p>
      </div>
      <ArrowUpRight className="w-4 h-4 shrink-0" style={{ color: "#7c3aed" }} />
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WM PERFORMANCE DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function WMView({
  clients,
  isLoading,
  funds,
  accounts,
  firstName,
  subsidiaryName,
  dateStr,
}: {
  clients:        ClientRow[];
  isLoading:      boolean;
  funds:          Fund[];
  accounts:       any[];
  firstName:      string;
  subsidiaryName: string;
  dateStr:        string;
}) {
  const totalAUM       = funds.filter(f => f.status === "active").reduce((s, f) => s + (f.aum ?? 0), 0);
  const achievement    = QUARTERLY_TARGET > 0 ? (totalAUM / QUARTERLY_TARGET) * 100 : 0;
  const variance       = totalAUM - QUARTERLY_TARGET;

  const approved        = clients.filter(c => c.state === "approved");
  const pendingReview   = clients.filter(c => ["submitted", "in_review", "compliance_review"].includes(c.state));
  const needsAttention  = clients.filter(c => c.riskFlag || c.state === "returned");

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
            {getGreeting()}, {firstName}.
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {dateStr} · {subsidiaryName} · Wealth Manager
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/investments/onboarding"
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 8px rgba(255,102,0,0.35)" }}>
            <Plus className="w-3.5 h-3.5" /> New Client
          </Link>
          <Link href="/ai"
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", boxShadow: "0 1px 6px rgba(124,58,237,0.3)" }}>
            <Brain className="w-3.5 h-3.5" /> AI
          </Link>
        </div>
      </div>

      {/* ── Performance strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Card 1: Current AUM */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
          <div className="h-[3px]" style={{ background: "#1d4ed8" }} />
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider"
               style={{ color: "var(--pg-text-3)" }}>Current AUM</p>
            <p className="text-[22px] font-bold leading-none mt-2 tabular"
               style={{ color: "var(--pg-text-1)" }}>
              {fmtCompact(totalAUM)}
            </p>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>
              Quarter-to-date · {subsidiaryName}
            </p>
          </div>
        </div>

        {/* Card 2: Q Target */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
          <div className="h-[3px]" style={{ background: "#7c3aed" }} />
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider"
               style={{ color: "var(--pg-text-3)" }}>Q Target</p>
            <p className="text-[22px] font-bold leading-none mt-2 tabular"
               style={{ color: "var(--pg-text-1)" }}>
              {fmtCompact(QUARTERLY_TARGET)}
            </p>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 rounded-full overflow-hidden"
                 style={{ background: "var(--pg-muted-bg)" }}>
              <div className="h-full rounded-full transition-all"
                   style={{
                     width: `${Math.min(achievement, 100).toFixed(1)}%`,
                     background: achievement >= 100 ? "#059669" : "#7c3aed",
                   }} />
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-3)" }}>
              {achievement.toFixed(1)}% achieved
            </p>
          </div>
        </div>

        {/* Card 3: AUM Variance */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
          <div className="h-[3px]" style={{ background: variance >= 0 ? "#059669" : "#dc2626" }} />
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider"
               style={{ color: "var(--pg-text-3)" }}>AUM Variance</p>
            <div className="flex items-center gap-1.5 mt-2">
              {variance >= 0
                ? <TrendingUp className="w-4 h-4" style={{ color: "#059669" }} />
                : <TrendingDown className="w-4 h-4" style={{ color: "#dc2626" }} />}
              <p className="text-[22px] font-bold leading-none tabular"
                 style={{ color: variance >= 0 ? "#059669" : "#dc2626" }}>
                {variance >= 0 ? "+" : ""}{fmtCompact(variance)}
              </p>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>
              vs quarterly target
            </p>
          </div>
        </div>

        {/* Card 4: Net Flows */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
          <div className="h-[3px]" style={{ background: "#059669" }} />
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider"
               style={{ color: "var(--pg-text-3)" }}>Net Flows</p>
            <p className="text-[22px] font-bold leading-none mt-2 tabular"
               style={{ color: "var(--pg-text-2)" }}>—</p>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>
              Month to date
            </p>
          </div>
        </div>
      </div>

      {/* ── Client activity strip (smaller) ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "My Clients",      value: clients.length,         icon: Users,        color: "#FF6600" },
          { label: "Approved",        value: approved.length,        icon: CheckCircle2, color: "#059669" },
          { label: "Pending Review",  value: pendingReview.length,   icon: Clock,        color: "#d97706" },
          { label: "Needs Attention", value: needsAttention.length,  icon: AlertCircle,  color: "#dc2626" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
            <div className="p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                   style={{ background: s.color + "15" }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider"
                   style={{ color: "var(--pg-text-3)" }}>{s.label}</p>
                <p className="text-[18px] font-bold leading-none mt-0.5 tabular"
                   style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main two-column layout ─────────────────────────────────────────────── */}
      <div className="grid xl:grid-cols-3 gap-5">

        {/* LEFT: 2/3 */}
        <div className="xl:col-span-2 space-y-5">
          {/* A. Upcoming Maturities */}
          <MaturitiesCard accounts={accounts} />

          {/* B. Client List */}
          <ClientListCard clients={clients} isLoading={isLoading} />
        </div>

        {/* RIGHT: 1/3 */}
        <div className="space-y-4">

          {/* C. Client Birthdays */}
          <div className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
            <div className="flex items-center gap-2 px-5 py-4"
                 style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <Gift className="w-4 h-4" style={{ color: "#FF6600" }} />
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                Client Birthdays
              </h2>
            </div>
            <div className="flex flex-col items-center justify-center py-8 text-center px-5">
              <Gift className="w-8 h-8 mb-2" style={{ color: "var(--pg-text-4)" }} />
              <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-2)" }}>
                Birthday reminders will appear here
              </p>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--pg-text-3)" }}>
                Connect client date-of-birth data to receive reminders
              </p>
              <p className="text-[10px] mt-3 px-2 py-1 rounded-lg"
                 style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
                Configured reminders: 1 day before
              </p>
            </div>
          </div>

          {/* D. Requires Attention */}
          <div className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" style={{ color: "#dc2626" }} />
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                  Requires Attention
                </h2>
              </div>
              {(needsAttention.length + (pendingReview.length > 0 ? 1 : 0)) > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "#fee2e2", color: "#991b1b" }}>
                  {needsAttention.length + (pendingReview.length > 0 ? 1 : 0)}
                </span>
              )}
            </div>
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {needsAttention.length === 0 && pendingReview.length === 0 ? (
                <div className="flex items-center gap-3 px-5 py-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                    All clients are up to date.
                  </p>
                </div>
              ) : (
                <>
                  {needsAttention.map(c => (
                    <Link key={c.id} href={`/wm/clients/${c.id}`}
                          className="flex items-start gap-3 px-5 py-3 transition-colors"
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"
                                   style={{ color: c.riskFlag ? "#dc2626" : "#f59e0b" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium" style={{ color: "var(--pg-text-1)" }}>
                          {c.name}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                          {c.riskFlag
                            ? "Risk flag — review needed"
                            : "Application returned for correction"}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-4)" }} />
                    </Link>
                  ))}
                  {pendingReview.length > 0 && (
                    <Link href="/wm/pipeline"
                          className="flex items-start gap-3 px-5 py-3 transition-colors"
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <Clock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium" style={{ color: "var(--pg-text-1)" }}>
                          {pendingReview.length} application{pendingReview.length > 1 ? "s" : ""} awaiting review
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                          View pipeline →
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-4)" }} />
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* E. Quick Actions */}
          <div className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                Quick Actions
              </h2>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[
                { label: "New Client",       icon: Plus,         href: "/investments/onboarding", color: "#FF6600" },
                { label: "Log Interaction",  icon: MessageSquare,href: "/wm/interactions",        color: "#7c3aed" },
                { label: "Maturities",       icon: Clock,        href: "/wm/maturities",          color: "#d97706" },
                { label: "Commission",       icon: DollarSign,   href: "/wm/commission",          color: "#059669" },
                { label: "All Clients",      icon: Users,        href: "/wm/clients",             color: "#0891b2" },
                { label: "Documents",        icon: FileText,     href: "/documents",              color: "#475569" },
              ].map(a => (
                <Link key={a.label} href={a.href}
                      className="flex items-center gap-2 p-3 rounded-xl transition-all"
                      style={{ background: a.color + "0f" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = a.color + "18"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = a.color + "0f"}>
                  <a.icon className="w-4 h-4 shrink-0" style={{ color: a.color }} />
                  <span className="text-[12px] font-semibold" style={{ color: a.color }}>
                    {a.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* F. AI Nudge */}
          <AINudge />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP HEAD DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

const TEAM_QUARTERLY_TARGET = 2_000_000_000; // ₦2B for team

function GroupHeadView({
  clients,
  isLoading,
  funds,
  accounts,
  subsidiaryName,
  dateStr,
}: {
  clients:        ClientRow[];
  isLoading:      boolean;
  funds:          Fund[];
  accounts:       any[];
  subsidiaryName: string;
  dateStr:        string;
}) {
  const totalAUM    = funds.filter(f => f.status === "active").reduce((s, f) => s + (f.aum ?? 0), 0);
  const achievement = TEAM_QUARTERLY_TARGET > 0 ? (totalAUM / TEAM_QUARTERLY_TARGET) * 100 : 0;

  const approved        = clients.filter(c => c.state === "approved");
  const submitted       = clients.filter(c => c.state === "submitted").length;
  const inReview        = clients.filter(c => c.state === "in_review").length;
  const complianceRev   = clients.filter(c => c.state === "compliance_review").length;
  const needsAttention  = clients.filter(c => c.riskFlag || c.state === "returned");

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
              Team Overview
            </h1>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full"
                  style={{ background: "#dbeafe", color: "#1d4ed8" }}>
              WM Group Head
            </span>
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {dateStr} · {subsidiaryName} · Wealth Management
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
                  style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
            <FileText className="w-3.5 h-3.5" /> Generate Report
          </button>
          <Link href="/ai"
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", boxShadow: "0 1px 6px rgba(124,58,237,0.3)" }}>
            <Brain className="w-3.5 h-3.5" /> AI
          </Link>
        </div>
      </div>

      {/* ── Team performance strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Team AUM */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
          <div className="h-[3px]" style={{ background: "#1d4ed8" }} />
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider"
               style={{ color: "var(--pg-text-3)" }}>Team AUM</p>
            <p className="text-[22px] font-bold leading-none mt-2 tabular"
               style={{ color: "var(--pg-text-1)" }}>{fmtCompact(totalAUM)}</p>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>All active funds</p>
          </div>
        </div>

        {/* Team Target */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
          <div className="h-[3px]" style={{ background: "#7c3aed" }} />
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider"
               style={{ color: "var(--pg-text-3)" }}>Team Target</p>
            <p className="text-[22px] font-bold leading-none mt-2 tabular"
               style={{ color: "var(--pg-text-1)" }}>{fmtCompact(TEAM_QUARTERLY_TARGET)}</p>
            <div className="mt-2 h-1.5 rounded-full overflow-hidden"
                 style={{ background: "var(--pg-muted-bg)" }}>
              <div className="h-full rounded-full"
                   style={{
                     width: `${Math.min(achievement, 100).toFixed(1)}%`,
                     background: achievement >= 100 ? "#059669" : "#7c3aed",
                   }} />
            </div>
          </div>
        </div>

        {/* Achievement */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
          <div className="h-[3px]" style={{ background: achievement >= 100 ? "#059669" : "#dc2626" }} />
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider"
               style={{ color: "var(--pg-text-3)" }}>Achievement</p>
            <p className="text-[22px] font-bold leading-none mt-2 tabular"
               style={{ color: achievement >= 100 ? "#059669" : "#dc2626" }}>
              {achievement.toFixed(1)}%
            </p>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>vs ₦2B team target</p>
          </div>
        </div>

        {/* Active Clients */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
          <div className="h-[3px]" style={{ background: "#FF6600" }} />
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider"
               style={{ color: "var(--pg-text-3)" }}>Active Clients</p>
            <p className="text-[22px] font-bold leading-none mt-2 tabular"
               style={{ color: "var(--pg-text-1)" }}>{approved.length}</p>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>Approved accounts</p>
          </div>
        </div>
      </div>

      {/* ── WM Performance Table ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Wealth Managers — Performance
          </h2>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-4 gap-4 pb-3"
               style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
            {["WM Name", "Clients", "AUM", "Status"].map(h => (
              <p key={h} className="text-[10px] font-bold uppercase tracking-wider"
                 style={{ color: "var(--pg-text-3)" }}>{h}</p>
            ))}
          </div>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BarChart2 className="w-8 h-8 mb-2" style={{ color: "var(--pg-text-4)" }} />
            <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-2)" }}>
              Individual WM breakdown requires team data integration.
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-3)" }}>
              Consolidated team view shown above.
            </p>
            <Link href="/wm/clients"
                  className="mt-3 text-[12px] font-semibold text-orange-600 hover:underline">
              View all clients →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Pipeline Overview ─────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Left: Onboarding stages */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              Pipeline Overview
            </h2>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {[
              { label: "Submitted",         count: submitted,     color: "#0369a1", bg: "#e0f2fe" },
              { label: "In Review",         count: inReview,      color: "#E05500", bg: "#fff0e0" },
              { label: "Compliance Review", count: complianceRev, color: "#6d28d9", bg: "#ede9fe" },
              { label: "Approved",          count: approved.length, color: "#065f46", bg: "#d1fae5" },
            ].map(s => (
              <div key={s.label}
                   className="flex items-center justify-between px-5 py-3.5">
                <p className="text-[13px]" style={{ color: "var(--pg-text-1)" }}>{s.label}</p>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                      style={{ background: s.bg, color: s.color }}>
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Needs attention */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
          <div className="flex items-center gap-2 px-5 py-4"
               style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
            <AlertCircle className="w-4 h-4" style={{ color: "#dc2626" }} />
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              Needs Attention
            </h2>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {needsAttention.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-4">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                  All clients are up to date.
                </p>
              </div>
            ) : needsAttention.map(c => (
              <Link key={c.id} href={`/wm/clients/${c.id}`}
                    className="flex items-start gap-3 px-5 py-3 transition-colors"
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"
                             style={{ color: c.riskFlag ? "#dc2626" : "#f59e0b" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium" style={{ color: "var(--pg-text-1)" }}>
                    {c.name}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                    {c.riskFlag ? "Risk flag — review needed" : "Application returned for correction"}
                  </p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-4)" }} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Upcoming Maturities ──────────────────────────────────────────────── */}
      <MaturitiesCard accounts={accounts} />

      {/* ── Quick Actions ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Quick Actions</h2>
        </div>
        <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "All Clients",      icon: Users,        href: "/wm/clients",     color: "#FF6600" },
            { label: "Approvals",        icon: CheckCircle2, href: "/approval",        color: "#059669" },
            { label: "All Maturities",   icon: Clock,        href: "/wm/maturities",  color: "#d97706" },
            { label: "Interaction Log",  icon: MessageSquare,href: "/wm/interactions",color: "#7c3aed" },
          ].map(a => (
            <Link key={a.label} href={a.href}
                  className="flex items-center gap-2 p-3 rounded-xl transition-all"
                  style={{ background: a.color + "0f" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = a.color + "18"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = a.color + "0f"}>
              <a.icon className="w-4 h-4 shrink-0" style={{ color: a.color }} />
              <span className="text-[12px] font-semibold" style={{ color: a.color }}>{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default function WMDashboard() {
  const { user, subsidiary } = useAuth();
  const { activePosition }   = usePosition();
  const subsidId             = subsidiary?.ID ?? "";
  const isGroupHead          = activePosition?.code === "GROUP_HEAD_WEALTH_MGMT";

  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const firstName      = user?.DisplayName?.split(" ")[0] ?? "there";
  const subsidiaryName = subsidiary?.Name ?? "";
  const dateStr        = now
    ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";

  // ── Fetch clients ──────────────────────────────────────────────────────────
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["wm-clients", subsidId, user?.ID, isGroupHead],
    enabled:  Boolean(subsidId) && Boolean(user?.ID),
    queryFn:  () => fetchClients(subsidId, user!.ID, !isGroupHead),
  });

  // ── Fetch funds ────────────────────────────────────────────────────────────
  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ["wm-funds", subsidId],
    enabled:  Boolean(subsidId),
    queryFn:  async () => {
      const res = await fetch(
        `${BASE}/api/v1/portfolio/funds?subsidiary_id=${subsidId}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return (await res.json()) ?? [];
    },
  });

  // ── Fetch accounts ─────────────────────────────────────────────────────────
  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ["wm-accounts"],
    queryFn:  async () => {
      const res = await fetch(`${BASE}/api/v1/portfolio/accounts`, { credentials: "include" });
      if (!res.ok) return [];
      return (await res.json()) ?? [];
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isGroupHead) {
    return (
      <GroupHeadView
        clients={clients}
        isLoading={isLoading}
        funds={funds}
        accounts={accounts}
        subsidiaryName={subsidiaryName}
        dateStr={dateStr}
      />
    );
  }

  return (
    <WMView
      clients={clients}
      isLoading={isLoading}
      funds={funds}
      accounts={accounts}
      firstName={firstName}
      subsidiaryName={subsidiaryName}
      dateStr={dateStr}
    />
  );
}
