"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardList, AlertTriangle, Clock, CheckCircle2, AlertCircle,
  TrendingUp, BarChart2, Loader2, ChevronRight, Shield, Search,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type DashboardStats = {
  due_today_count: number;
  overdue_count: number;
  pending_review_count: number;
  under_review_count: number;
  open_exception_count: number;
  exception_raised_count: number;
  completed_today_count: number;
};

type ReviewItem = {
  id: string;
  reference_no: string;
  title: string;
  item_type: string;
  business_unit: string;
  risk_level: string;
  status: string;
  priority: string;
  submitter_name: string;
  assigned_reviewer_name: string;
  due_date?: string;
  age_in_days: number;
  is_overdue: boolean;
  exception_count: number;
  document_count: number;
  checklist_total: number;
  checklist_done: number;
};

const PHASE2_MODULES = [
  { title: "RCSA", description: "Risk & Control Self-Assessment — document and rate key risks by business unit." },
  { title: "KRI Monitoring", description: "Track Key Risk Indicators against defined thresholds and trigger alerts." },
  { title: "Risk Register", description: "Centralised register of identified risks with owners and mitigants." },
  { title: "Portfolio Risk", description: "Aggregate exposure analysis across the investment portfolio." },
  { title: "Stop-Loss", description: "Configure and monitor stop-loss limits per desk, fund, or mandate." },
  { title: "Counterparty Exposure", description: "Real-time counterparty credit and settlement exposure tracking." },
  { title: "Audit Planning", description: "Risk-based annual audit plan with resource allocation and scheduling." },
  { title: "Findings Management", description: "Track audit findings from identification through to verified closure." },
];

function riskBadge(level: string) {
  switch (level?.toLowerCase()) {
    case "critical": return { label: "Critical", color: "#dc2626", bg: "#fef2f2" };
    case "high":     return { label: "High",     color: "#ea580c", bg: "#fff7ed" };
    case "medium":   return { label: "Medium",   color: "#d97706", bg: "#fffbeb" };
    case "low":      return { label: "Low",      color: "#16a34a", bg: "#f0fdf4" };
    default:         return { label: level || "—", color: "#64748b", bg: "#f1f5f9" };
  }
}

function statusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "pending_review": return { label: "Pending Review", color: "#d97706", bg: "#fffbeb" };
    case "under_review":   return { label: "Under Review",   color: "#1d4ed8", bg: "#eff6ff" };
    case "overdue":        return { label: "Overdue",        color: "#dc2626", bg: "#fef2f2" };
    case "completed":      return { label: "Completed",      color: "#059669", bg: "#ecfdf5" };
    case "approved":       return { label: "Approved",       color: "#059669", bg: "#ecfdf5" };
    case "rejected":       return { label: "Rejected",       color: "#dc2626", bg: "#fef2f2" };
    default:               return { label: status || "—",    color: "#64748b", bg: "#f1f5f9" };
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateLong(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  topColor: string;
  valueColor?: string;
};

function StatCard({ label, value, icon: Icon, topColor, valueColor }: StatCardProps) {
  return (
    <div
      className="rounded-2xl overflow-hidden flex-1 min-w-0"
      style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
    >
      <div style={{ height: 4, background: topColor }} />
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[28px] font-bold leading-none" style={{ color: valueColor ?? topColor }}>
            {value ?? "—"}
          </p>
          <p className="text-[12px] mt-1.5 font-medium" style={{ color: "var(--pg-text-3)" }}>{label}</p>
        </div>
        <div className="mt-1 p-2 rounded-xl" style={{ background: topColor + "20" }}>
          <Icon className="w-5 h-5" style={{ color: topColor }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AuditDashboardPage() {
  const router = useRouter();
  const today = todayStr();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["audit-dashboard-stats"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/internal-audit/dashboard`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: allItems = [], isLoading: itemsLoading } = useQuery<ReviewItem[]>({
    queryKey: ["audit-review-items-all"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/internal-audit/review-items?status=&due_today=true`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json.items ?? []);
    },
    staleTime: 30_000,
  });

  const dueToday = allItems.filter(it => it.due_date?.slice(0, 10) === today);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1280px] mx-auto w-full">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Internal Audit, Control &amp; Risk
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Daily control review workspace — {fmtDateLong(new Date())}
          </p>
        </div>
        <Link
          href="/audit/control-review"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: "#0891b2", color: "#fff" }}
        >
          Open Review Queue
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* ── Stat Cards ── */}
      {statsLoading ? (
        <div className="flex items-center gap-2" style={{ color: "var(--pg-text-3)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-[13px]">Loading stats…</span>
        </div>
      ) : (
        <div className="flex gap-3 flex-wrap">
          <StatCard label="Reviews Due Today"  value={stats?.due_today_count}       icon={Clock}         topColor="#f97316" />
          <StatCard label="Overdue"            value={stats?.overdue_count}         icon={AlertTriangle} topColor="#dc2626" />
          <StatCard label="Pending Review"     value={stats?.pending_review_count}  icon={ClipboardList} topColor="#d97706" />
          <StatCard label="Under Review"       value={stats?.under_review_count}    icon={Search}        topColor="#2563eb" />
          <StatCard label="Open Exceptions"    value={stats?.open_exception_count}  icon={AlertCircle}   topColor="#dc2626" />
          <StatCard label="Completed Today"    value={stats?.completed_today_count} icon={CheckCircle2}  topColor="#059669" />
        </div>
      )}

      {/* ── Due Today Table ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--pg-row-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4" style={{ color: "#f97316" }} />
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              Due Today
            </h2>
            {!itemsLoading && (
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "#fff7ed", color: "#c2410c" }}
              >
                {dueToday.length}
              </span>
            )}
          </div>
          <Link
            href="/audit/control-review"
            className="text-[12px] font-medium flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: "#0891b2" }}
          >
            View all <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {itemsLoading ? (
          <div className="flex items-center gap-2 px-5 py-6" style={{ color: "var(--pg-text-3)" }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[13px]">Loading items…</span>
          </div>
        ) : dueToday.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: "#059669" }} />
            <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-2)" }}>No items due today</p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>All clear for today&apos;s control review window.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  {["Ref", "Title", "Business Unit", "Risk", "Reviewer", "Status"].map(col => (
                    <th
                      key={col}
                      className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--pg-text-3)" }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dueToday.map((item, i) => {
                  const risk = riskBadge(item.risk_level);
                  const st   = statusBadge(item.status);
                  return (
                    <tr
                      key={item.id}
                      className="cursor-pointer transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                      style={{ borderBottom: i < dueToday.length - 1 ? "1px solid var(--pg-row-border)" : "none" }}
                      onClick={() => router.push(`/audit/control-review/${item.id}`)}
                    >
                      <td className="px-5 py-3 font-mono text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                        {item.reference_no}
                      </td>
                      <td className="px-5 py-3 max-w-[260px]">
                        <p className="font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{item.title}</p>
                        {item.due_date && (
                          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                            Due {fmtDate(item.due_date)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--pg-text-2)" }}>{item.business_unit || "—"}</td>
                      <td className="px-5 py-3">
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: risk.bg, color: risk.color }}
                        >
                          {risk.label}
                        </span>
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--pg-text-2)" }}>
                        {item.assigned_reviewer_name || "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: st.bg, color: st.color }}
                        >
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Phase 2 Modules ── */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <BarChart2 className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
            Phase 2 Modules
          </h2>
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "#f1f5f9", color: "#64748b" }}
          >
            Roadmap
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PHASE2_MODULES.map(mod => (
            <div
              key={mod.title}
              className="rounded-2xl p-4 flex flex-col gap-2 opacity-60"
              style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>{mod.title}</p>
                <span
                  className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ background: "#f1f5f9", color: "#94a3b8" }}
                >
                  Phase 2
                </span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--pg-text-3)" }}>
                {mod.description}
              </p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
