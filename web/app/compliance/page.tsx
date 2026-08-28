"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  Shield, AlertTriangle, Clock, CheckCircle2, XCircle,
  ChevronRight, Loader2, Search, Users, Flag,
  ClipboardCheck, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { components } from "@/lib/api/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type OnboardingCase = components["schemas"]["OnboardingCase"];

const STATE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  submitted:         { label: "Submitted",         color: "#0369a1", bg: "#e0f2fe" },
  in_review:         { label: "In Review",         color: "#E05500", bg: "#fff0e0" },
  compliance_review: { label: "Compliance Review", color: "#6d28d9", bg: "#ede9fe" },
  approved:          { label: "Approved",          color: "#065f46", bg: "#d1fae5" },
  rejected:          { label: "Rejected",          color: "#991b1b", bg: "#fee2e2" },
  returned:          { label: "Returned to WM",    color: "#92400e", bg: "#fef3c7" },
  draft:             { label: "Draft",             color: "#475569", bg: "#f1f5f9" },
};

const FILTER_STATES = ["compliance_review", "in_review", "submitted"] as const;
type FilterTab = "pending" | "approved" | "rejected" | "all";

function daysSince(iso?: string) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function ComplianceQueuePage() {
  const { subsidiaries } = useAuth();
  const [search, setSearch] = useState("");
  const [tab, setTab]       = useState<FilterTab>("pending");

  // Group-level compliance officer: fetch all cases without subsidiary filter.
  const { data: cases = [], isLoading } = useQuery<OnboardingCase[]>({
    queryKey: ["compliance-cases-all"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/onboarding/cases`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as OnboardingCase[];
    },
  });

  const filtered = cases.filter(c => {
    if (tab === "pending")  return FILTER_STATES.includes(c.State as typeof FILTER_STATES[number]);
    if (tab === "approved") return c.State === "approved";
    if (tab === "rejected") return c.State === "rejected";
    return true;
  }).filter(c => {
    if (!search) return true;
    return c.ID.toLowerCase().includes(search.toLowerCase()) ||
           c.ClientType.toLowerCase().includes(search.toLowerCase());
  });

  // Sort: risk flags first, then oldest submitted_at first.
  const sorted = [...filtered].sort((a, b) => {
    if (a.RiskFlag && !b.RiskFlag) return -1;
    if (!a.RiskFlag && b.RiskFlag)  return 1;
    const da = a.SubmittedAt ? new Date(a.SubmittedAt).getTime() : 0;
    const db = b.SubmittedAt ? new Date(b.SubmittedAt).getTime() : 0;
    return da - db; // oldest first
  });

  const pending  = cases.filter(c => FILTER_STATES.includes(c.State as typeof FILTER_STATES[number])).length;
  const highRisk = cases.filter(c => c.RiskFlag && FILTER_STATES.includes(c.State as typeof FILTER_STATES[number])).length;
  const done     = cases.filter(c => c.State === "approved" || c.State === "rejected").length;

  const TABS: { id: FilterTab; label: string; count: number }[] = [
    { id: "pending",  label: "Pending Review", count: pending },
    { id: "approved", label: "Approved",       count: cases.filter(c => c.State === "approved").length },
    { id: "rejected", label: "Rejected",       count: cases.filter(c => c.State === "rejected").length },
    { id: "all",      label: "All Cases",      count: cases.length },
  ];

  return (
    <div className="max-w-[1000px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>Compliance Queue</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          Review and process client onboarding cases
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending Review",  value: pending,  color: "#6d28d9", bg: "#ede9fe", icon: Clock    },
          { label: "High Risk",       value: highRisk, color: "#dc2626", bg: "#fef2f2", icon: Flag     },
          { label: "Completed",       value: done,     color: "#059669", bg: "#ecfdf5", icon: CheckCircle2 },
        ].map(s => (
          <div key={s.label} className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
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
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl flex-1 max-w-xs"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by case ID or type…"
                 className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
                    className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-medium transition-all"
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

      {/* Queue table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        {/* Table header */}
        <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
             style={{ gridTemplateColumns: "2.5fr 1fr 1.2fr 80px 80px 100px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
          <span>Case ID</span>
          <span>Type</span>
          <span>Status</span>
          <span>Risk</span>
          <span>Age</span>
          <span />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2">
            <ClipboardCheck className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
              {tab === "pending" ? "No cases pending review." : "No cases found."}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {sorted.map(c => {
              const st      = STATE_CFG[c.State] ?? { label: c.State, color: "#64748b", bg: "#f1f5f9" };
              const age     = daysSince(c.SubmittedAt);
              const isOld   = age != null && age > 3;
              return (
                <div key={c.ID}
                     className="grid items-center gap-2 px-5 py-3.5 transition-colors"
                     style={{ gridTemplateColumns: "2.5fr 1fr 1.2fr 80px 80px 100px" }}
                     onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                     onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                         style={{ background: c.RiskFlag ? "#fee2e2" : "#ede9fe" }}>
                      <Shield className="w-4 h-4" style={{ color: c.RiskFlag ? "#dc2626" : "#6d28d9" }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-mono font-medium truncate" style={{ color: "var(--pg-text-1)" }}>
                        {c.ID.slice(0, 8)}…
                      </p>
                      {c.SubmittedAt && (
                        <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                          Submitted {new Date(c.SubmittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[12px] capitalize" style={{ color: "var(--pg-text-2)" }}>{c.ClientType}</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                        style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  <span>
                    {c.RiskFlag
                      ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}>High</span>
                      : <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>Normal</span>}
                  </span>
                  <span className={cn("text-[12px] font-medium", isOld && "text-amber-600")}
                        style={!isOld ? { color: "var(--pg-text-3)" } : undefined}>
                    {age != null ? `${age}d` : "—"}
                    {isOld && " ⚠"}
                  </span>
                  <Link href={`/compliance/${c.ID}`}
                        className="flex items-center justify-end gap-1 text-[12px] font-semibold text-violet-600 hover:underline">
                    Review <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
