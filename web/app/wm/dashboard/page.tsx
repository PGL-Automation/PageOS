"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api/client";
import {
  Users, TrendingUp, ArrowUpRight, Clock,
  Mail, AlertCircle, CheckCircle2,
  ChevronRight, Brain, Plus, Star, Loader2, FileText,
  Shield, Eye,
} from "lucide-react";
import { components } from "@/lib/api/types";

type OnboardingCase = components["schemas"]["OnboardingCase"];
type CaseDetails    = components["schemas"]["CaseDetails"];

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const CASE_PILL: Record<string, { label: string; bg: string; color: string }> = {
  draft:            { label: "Draft",       bg: "#f1f5f9", color: "#475569" },
  submitted:        { label: "Submitted",   bg: "#e0f2fe", color: "#0369a1" },
  in_review:        { label: "In Review",   bg: "#fff0e0", color: "#E05500" },
  compliance_review:{ label: "Compliance",  bg: "#ede9fe", color: "#6d28d9" },
  approved:         { label: "Approved",    bg: "#d1fae5", color: "#065f46" },
  rejected:         { label: "Rejected",    bg: "#fee2e2", color: "#991b1b" },
  returned:         { label: "Returned",    bg: "#fef3c7", color: "#92400e" },
};

interface ClientRow {
  id:         string;
  name:       string;
  type:       string;
  state:      string;
  riskFlag:   boolean;
}

export default function WMDashboard() {
  const { user, subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Fetch all cases for subsidiary, then fetch details for each to get names
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["wm-clients", subsidId, user?.ID],
    enabled: Boolean(subsidId) && Boolean(user?.ID),
    queryFn: async () => {
      const { data: cases, error } = await api.GET("/onboarding/cases", {
        params: { query: { subsidiary_id: subsidId } },
      });
      if (error || !cases) return [] as ClientRow[];

      // Filter to cases this WM initiated — strict match only.
      // The `!c.InitiatedBy` arm was removed because it caused all un-attributed
      // cases to appear in every RM's "My Clients" count, inflating the number.
      const mine = (cases as OnboardingCase[]).filter(
        c => c.InitiatedBy === user!.ID
      );

      // Fetch details in parallel to get names
      const details: (CaseDetails | null)[] = await Promise.all(
        mine.map(async c => {
          const { data } = await api.GET("/onboarding/cases/{id}", {
            params: { path: { id: c.ID } },
          });
          return data ?? null;
        })
      );

      return mine.map((c, i): ClientRow => ({
        id:       c.ID,
        name:     details[i]?.application?.full_name ?? `Case ${c.ID.slice(0, 6)}`,
        type:     c.ClientType,
        state:    c.State,
        riskFlag: c.RiskFlag,
      }));
    },
  });

  const approved       = clients.filter(c => c.state === "approved").length;
  const pendingReview  = clients.filter(c => ["submitted", "in_review", "compliance_review"].includes(c.state)).length;
  const needsAttention = clients.filter(c => c.riskFlag || c.state === "returned");

  const firstName = user?.DisplayName?.split(" ")[0] ?? "there";
  const dateStr   = now
    ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
            {now ? getGreeting() : "Welcome"}, {firstName}.
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {dateStr} · {subsidiary?.Name} · Wealth Manager
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

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "My Clients",       value: clients.length.toString(),   icon: Users,       color: "#FF6600", bg: "#fff7f0" },
          { label: "Approved",         value: approved.toString(),          icon: CheckCircle2,color: "#059669", bg: "#ecfdf5" },
          { label: "Pending Review",   value: pendingReview.toString(),     icon: Clock,       color: "#d97706", bg: "#fffbeb" },
          { label: "Needs Attention",  value: needsAttention.length.toString(), icon: AlertCircle, color: "#dc2626", bg: "#fef2f2" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
            <div className="h-[3px]" style={{ background: s.color }} />
            <div className="p-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: s.color }}>{s.label}</p>
                <p className="text-[22px] font-bold tabular leading-none mt-1.5" style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-3 gap-5">

        {/* Client list — 2/3 */}
        <div className="xl:col-span-2">
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>My Clients</h2>
              <Link href="/wm/clients" className="text-[11px] font-medium text-orange-600 hover:underline flex items-center gap-0.5">
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
                  const showComplianceTag = c.state === "compliance_review";
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
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}>
                              Risk
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] capitalize mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                          {c.type}
                          {showComplianceTag && <span className="ml-1.5 text-violet-600 font-medium">· Compliance checking</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: pill.bg, color: pill.color }}>
                          {pill.label}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--pg-text-3)" }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Needs attention */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Needs Attention</h2>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {needsAttention.length === 0 ? (
                <div className="flex items-center gap-3 px-5 py-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>All clients are up to date.</p>
                </div>
              ) : needsAttention.map(c => (
                <Link key={c.id} href={`/wm/clients/${c.id}`}
                      className="flex items-start gap-3 px-5 py-3 transition-colors"
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.riskFlag ? "#dc2626" : "#f59e0b" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium" style={{ color: "var(--pg-text-1)" }}>{c.name}</p>
                    <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                      {c.riskFlag ? "High risk flag — MD review needed" : "Application returned for correction"}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-4)" }} />
                </Link>
              ))}
            </div>
          </div>

          {/* Approved clients */}
          {approved > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                  Approved Clients
                </h2>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {clients.filter(c => c.state === "approved").map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{c.name}</p>
                      <p className="text-[11px] capitalize" style={{ color: "var(--pg-text-3)" }}>{c.type}</p>
                    </div>
                    <button className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium text-orange-600 transition-colors hover:bg-orange-50">
                      <Mail className="w-3 h-3" /> Contact
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Quick Actions</h2>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[
                { label: "New Client",    icon: Plus,      href: "/investments/onboarding", color: "#FF6600" },
                { label: "Commission",    icon: Star,      href: "/wm/commission",          color: "#059669" },
                { label: "All Clients",   icon: Users,     href: "/wm/clients",             color: "#7c3aed" },
                { label: "Documents",     icon: FileText,  href: "/documents",              color: "#0891b2" },
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

          {/* AI nudge */}
          <Link href="/ai"
                className="flex items-center gap-3 px-5 py-4 rounded-2xl transition-all"
                style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.08),rgba(255,102,0,0.08))", border: "1px solid rgba(124,58,237,0.15)" }}>
            <Brain className="w-5 h-5 shrink-0" style={{ color: "#7c3aed" }} />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--pg-text-1)" }}>AI Copilot</p>
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>Ask about your clients, commissions, or next steps</p>
            </div>
            <ArrowUpRight className="w-4 h-4 shrink-0" style={{ color: "#7c3aed" }} />
          </Link>

        </div>
      </div>
    </div>
  );
}
