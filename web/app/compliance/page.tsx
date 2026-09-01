"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  Shield, Clock, CheckCircle2, XCircle,
  ChevronRight, Loader2, Search,
  Flag, ClipboardCheck, Banknote, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { components } from "@/lib/api/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type OnboardingCase = components["schemas"]["OnboardingCase"] & { ClientName?: string };

const STATE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  submitted:         { label: "Submitted",         color: "#0369a1", bg: "#e0f2fe" },
  in_review:         { label: "In Review",          color: "#E05500", bg: "#fff0e0" },
  compliance_review: { label: "Compliance Review",  color: "#6d28d9", bg: "#ede9fe" },
  pending_finance:   { label: "Awaiting Finance",   color: "#0369a1", bg: "#dbeafe" },
  approved:          { label: "Approved",           color: "#065f46", bg: "#d1fae5" },
  rejected:          { label: "Rejected",           color: "#991b1b", bg: "#fee2e2" },
  returned:          { label: "Returned to WM",     color: "#92400e", bg: "#fef3c7" },
  draft:             { label: "Draft",              color: "#475569", bg: "#f1f5f9" },
};

const REVIEW_STATES = ["compliance_review", "in_review", "submitted"];
type FilterTab = "pending" | "finance" | "approved" | "rejected" | "all";

function daysSince(iso?: string) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

export default function ComplianceQueuePage() {
  const { subsidiaries } = useAuth();
  const [search, setSearch] = useState("");
  const [tab, setTab]       = useState<FilterTab>("pending");

  const { data: cases = [], isLoading } = useQuery<OnboardingCase[]>({
    queryKey: ["compliance-cases-all"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/onboarding/cases`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as OnboardingCase[];
    },
  });

  const searchLower = search.toLowerCase();
  const filtered = cases.filter(c => {
    if (tab === "pending")  return REVIEW_STATES.includes(c.State);
    if (tab === "finance")  return c.State === "pending_finance";
    if (tab === "approved") return c.State === "approved";
    if (tab === "rejected") return c.State === "rejected";
    return true;
  }).filter(c => {
    if (!search) return true;
    const name = (c as any).ClientName ?? "";
    return c.ID.toLowerCase().includes(searchLower) ||
           c.ClientType.toLowerCase().includes(searchLower) ||
           name.toLowerCase().includes(searchLower);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.RiskFlag && !b.RiskFlag) return -1;
    if (!a.RiskFlag && b.RiskFlag)  return 1;
    const da = a.SubmittedAt ? new Date(a.SubmittedAt).getTime() : 0;
    const db = b.SubmittedAt ? new Date(b.SubmittedAt).getTime() : 0;
    return da - db;
  });

  const pendingCount  = cases.filter(c => REVIEW_STATES.includes(c.State)).length;
  const financeCount  = cases.filter(c => c.State === "pending_finance").length;
  const highRiskCount = cases.filter(c => c.RiskFlag && REVIEW_STATES.includes(c.State)).length;
  const approvedCount = cases.filter(c => c.State === "approved").length;
  const rejectedCount = cases.filter(c => c.State === "rejected").length;

  const TABS: { id: FilterTab; label: string; count: number }[] = [
    { id: "pending",  label: "Pending Review",   count: pendingCount },
    { id: "finance",  label: "Awaiting Finance", count: financeCount },
    { id: "approved", label: "Approved",         count: approvedCount },
    { id: "rejected", label: "Rejected",         count: rejectedCount },
    { id: "all",      label: "All Cases",        count: cases.length },
  ];

  return (
    <div className="max-w-[1000px] mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>Compliance Queue</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          Review and process client onboarding applications across the organisation.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending Review",   value: pendingCount,  color: "#6d28d9", bg: "#ede9fe", icon: Clock,         onClick: () => setTab("pending")  },
          { label: "Awaiting Finance", value: financeCount,  color: "#0369a1", bg: "#dbeafe", icon: Banknote,      onClick: () => setTab("finance")  },
          { label: "High Risk",        value: highRiskCount, color: "#dc2626", bg: "#fef2f2", icon: Flag,          onClick: () => setTab("pending")  },
          { label: "Approved",         value: approvedCount, color: "#059669", bg: "#ecfdf5", icon: CheckCircle2,  onClick: () => setTab("approved") },
        ].map(s => (
          <button key={s.label} onClick={s.onClick}
                  className="rounded-2xl overflow-hidden text-left transition-all hover:scale-[1.02]"
                  style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
            <div className="h-[3px]" style={{ background: s.color }} />
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
                <p className="text-[24px] font-bold tabular leading-none mt-1" style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Finance action banner */}
      {financeCount > 0 && tab !== "finance" && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
             style={{ background: "#dbeafe", border: "1px solid #93c5fd" }}>
          <Banknote className="w-4 h-4 text-blue-600 shrink-0" />
          <p className="text-[13px] text-blue-800 flex-1">
            <strong>{financeCount}</strong> case{financeCount !== 1 ? "s" : ""} approved by you and awaiting finance processing.
          </p>
          <button onClick={() => setTab("finance")}
                  className="text-[12px] font-semibold text-blue-700 hover:underline shrink-0">
            View →
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl flex-1 max-w-xs"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Search by name, type or case ID…"
                 className="flex-1 text-[12px] bg-transparent outline-none"
                 style={{ color: "var(--pg-text-1)" }} />
        </div>
        <div className="flex gap-1 p-1 rounded-xl overflow-x-auto"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
                    className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap"
                    style={tab === t.id
                      ? { background: "linear-gradient(135deg,#6d28d9,#4f46e5)", color: "white" }
                      : { color: "var(--pg-text-2)" }}>
              {t.label}
              {t.count > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={tab === t.id
                        ? { background: "rgba(255,255,255,0.25)", color: "white" }
                        : { background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Case cards */}
      {isLoading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2 rounded-2xl"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <ClipboardCheck className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
            {tab === "pending" ? "No cases pending review." :
             tab === "finance" ? "No cases awaiting finance processing." :
             "No cases found."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(c => {
            const st    = STATE_CFG[c.State] ?? { label: c.State, color: "#64748b", bg: "#f1f5f9" };
            const age   = daysSince(c.SubmittedAt);
            const isOld = age != null && age > 3;
            const name  = (c as any).ClientName as string | undefined;

            return (
              <div key={c.ID}
                   className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-colors"
                   style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-card)"}>

                {/* Avatar */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                     style={{ background: c.RiskFlag ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "linear-gradient(135deg,#6d28d9,#4f46e5)" }}>
                  {name ? initials(name) : <User className="w-4 h-4" />}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>
                      {name || "—"}
                    </p>
                    {c.RiskFlag && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: "#fee2e2", color: "#dc2626" }}>High Risk</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[11px] capitalize" style={{ color: "var(--pg-text-3)" }}>
                      {c.ClientType} client
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>·</span>
                    <span className="text-[11px] font-mono" style={{ color: "var(--pg-text-4)" }}>
                      {c.ID.slice(0, 8).toUpperCase()}
                    </span>
                    {c.SubmittedAt && (
                      <>
                        <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>·</span>
                        <span className={cn("text-[11px]", isOld ? "text-amber-600 font-semibold" : "")}
                              style={!isOld ? { color: "var(--pg-text-4)" } : undefined}>
                          {age === 0 ? "Today" : `${age}d ago`}{isOld ? " ⚠" : ""}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                      style={{ background: st.bg, color: st.color }}>
                  {st.label}
                </span>

                {/* Action */}
                <Link href={`/compliance/${c.ID}`}
                      className="flex items-center gap-1 text-[12px] font-semibold shrink-0 hover:underline"
                      style={{ color: "#6d28d9" }}>
                  {REVIEW_STATES.includes(c.State) ? "Review" : "View"}
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
