"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  BarChart2,
  Target,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Filter,
  Download,
  Calendar,
  MessageSquare,
  DollarSign,
  Loader2,
  ArrowUpRight,
  User,
  Shield,
  Zap,
  Star,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Fund = {
  id: string;
  name: string;
  code: string;
  aum: number;
  currency: string;
  status: string;
  created_by_name: string;
};

type OnboardingCase = {
  ID: string;
  State: string;
  ClientType: string;
  RiskFlag: boolean;
  InitiatedBy: string;
  InitiatedByName?: string;
};

function fmtCompact(n: number, cur: string = "NGN") {
  const sym = cur === "USD" ? "$" : "₦";
  if (n >= 1e9) return sym + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sym + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return sym + (n / 1e3).toFixed(1) + "K";
  return sym + n.toLocaleString("en-NG");
}

function fmtDate(iso: string | undefined | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
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

const TEAM_TARGET = 3_000_000_000;

const DEMO_MATURITIES = [
  {
    client_name: "Adaeze Okonkwo",
    product: "Zenith Bank FD",
    days_remaining: 6,
    has_instruction: false,
    principal: 500_000_000,
    wm_name: "T. Adeleke",
  },
  {
    client_name: "Emeka Nwosu",
    product: "NGT T-Bill",
    days_remaining: 2,
    has_instruction: true,
    principal: 250_000_000,
    wm_name: "T. Adeleke",
  },
  {
    client_name: "Chukwudi Obi",
    product: "Access Bank Call",
    days_remaining: 14,
    has_instruction: false,
    principal: 150_000_000,
    wm_name: "A. Okafor",
  },
];

const STAGE_CONFIG: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  draft: { label: "Draft", bg: "#f1f5f9", color: "#475569" },
  submitted: { label: "Submitted", bg: "#dbeafe", color: "#1d4ed8" },
  in_review: { label: "In Review", bg: "#fff0e0", color: "#E05500" },
  compliance_review: { label: "Compliance", bg: "#ede9fe", color: "#6d28d9" },
  approved: { label: "Approved", bg: "#d1fae5", color: "#065f46" },
  rejected: { label: "Rejected", bg: "#fee2e2", color: "#991b1b" },
  returned: { label: "Returned", bg: "#fef3c7", color: "#92400e" },
};

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function GroupHeadPage() {
  const { user, subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredMatRow, setHoveredMatRow] = useState<number | null>(null);
  const [hoveredWmRow, setHoveredWmRow] = useState<string | null>(null);

  // Fetch funds
  const { data: fundsData, isLoading: fundsLoading } = useQuery({
    queryKey: ["gh-funds", subsidId],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/portfolio/funds?subsidiary_id=${subsidId}`
      );
      if (!res.ok) throw new Error("Failed to fetch funds");
      return res.json();
    },
    enabled: !!subsidId,
  });

  // Fetch all cases
  const { data: casesData, isLoading: casesLoading } = useQuery({
    queryKey: ["gh-cases", subsidId],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/onboarding/cases?subsidiary_id=${subsidId}`
      );
      if (!res.ok) throw new Error("Failed to fetch cases");
      return res.json();
    },
    enabled: !!subsidId,
  });

  // Fetch accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ["gh-accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/portfolio/accounts`);
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
  });

  const funds: Fund[] = Array.isArray(fundsData)
    ? fundsData
    : fundsData?.funds ?? fundsData?.data ?? [];
  const allCases: OnboardingCase[] = Array.isArray(casesData)
    ? casesData
    : casesData?.cases ?? casesData?.data ?? [];

  const activeFunds = funds.filter((f) => f.status === "active");
  const totalAUM = activeFunds.reduce((sum, f) => sum + (f.aum ?? 0), 0);
  const teamAchievement = (totalAUM / TEAM_TARGET) * 100;

  const approved = allCases.filter((c) => c.State === "approved");
  const inReview = allCases.filter((c) =>
    ["submitted", "in_review", "compliance_review"].includes(c.State)
  );
  const needsAttention = allCases.filter(
    (c) => c.RiskFlag || c.State === "returned"
  );
  const overdue = allCases.filter((c) => c.State === "returned");

  // Group by WM
  const wmMap: Record<
    string,
    {
      id: string;
      name: string;
      clientCount: number;
      approvedCount: number;
      pendingCount: number;
      attentionCount: number;
    }
  > = {};
  allCases.forEach((c) => {
    const key = c.InitiatedBy;
    if (!key) return;
    if (!wmMap[key]) {
      wmMap[key] = {
        id: key,
        name: c.InitiatedByName ?? key,
        clientCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        attentionCount: 0,
      };
    }
    wmMap[key].clientCount++;
    if (c.State === "approved") wmMap[key].approvedCount++;
    if (["submitted", "in_review", "compliance_review"].includes(c.State))
      wmMap[key].pendingCount++;
    if (c.RiskFlag || c.State === "returned") wmMap[key].attentionCount++;
  });
  const wmList = Object.values(wmMap);

  // Stage counts
  const stageCounts: Record<string, number> = {};
  allCases.forEach((c) => {
    stageCounts[c.State] = (stageCounts[c.State] ?? 0) + 1;
  });

  const achievementColor =
    teamAchievement >= 80
      ? "#059669"
      : teamAchievement >= 50
      ? "#d97706"
      : "#dc2626";

  const isLoading = fundsLoading || casesLoading;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: "var(--pg-bg)" }}
    >
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1
              className="text-[22px] font-bold leading-none"
              style={{ color: "var(--pg-text-1)" }}
            >
              Team Overview
            </h1>
            <span
              className="px-3 py-1 rounded-full text-[11px] font-semibold"
              style={{
                background: "#dbeafe",
                color: "#1d4ed8",
              }}
            >
              Group Head · Wealth Management
            </span>
          </div>
          <p
            className="text-[13px] mt-1"
            style={{ color: "var(--pg-text-3)" }}
          >
            {subsidiary?.Name ?? "—"} · All Wealth Managers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-9 px-4 rounded-xl text-[13px] font-semibold flex items-center gap-2"
            style={{
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
            }}
          >
            <BarChart2 size={14} />
            Full Report
          </button>
          <button
            className="h-9 px-4 rounded-xl text-[13px] font-semibold flex items-center gap-2 text-white"
            style={{
              background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
            }}
          >
            <Zap size={14} />
            AI
          </button>
        </div>
      </div>

      {/* TEAM PERFORMANCE STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Team AUM */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
          }}
        >
          <div className="h-[3px]" style={{ background: "#1d4ed8" }} />
          <div className="p-4 space-y-2">
            <p
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--pg-text-3)" }}
            >
              Team AUM
            </p>
            {isLoading ? (
              <Loader2
                size={18}
                className="animate-spin"
                style={{ color: "var(--pg-text-3)" }}
              />
            ) : (
              <p
                className="text-[22px] font-bold leading-none"
                style={{ color: "var(--pg-text-1)" }}
              >
                {fmtCompact(totalAUM)}
              </p>
            )}
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--pg-muted-bg)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(teamAchievement, 100)}%`,
                  background: "#1d4ed8",
                }}
              />
            </div>
            <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              ₦3B quarterly target
            </p>
          </div>
        </div>

        {/* Card 2: Achievement */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
          }}
        >
          <div className="h-[3px]" style={{ background: achievementColor }} />
          <div className="p-4 space-y-2">
            <p
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--pg-text-3)" }}
            >
              Achievement
            </p>
            {isLoading ? (
              <Loader2
                size={18}
                className="animate-spin"
                style={{ color: "var(--pg-text-3)" }}
              />
            ) : (
              <p
                className="text-[22px] font-bold leading-none"
                style={{ color: achievementColor }}
              >
                {teamAchievement.toFixed(1)}%
              </p>
            )}
            <div className="flex items-center gap-1">
              <Target size={11} style={{ color: achievementColor }} />
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                of quarterly target
              </p>
            </div>
          </div>
        </div>

        {/* Card 3: Active Clients */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
          }}
        >
          <div className="h-[3px]" style={{ background: "#FF6600" }} />
          <div className="p-4 space-y-2">
            <p
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--pg-text-3)" }}
            >
              Active Clients
            </p>
            {isLoading ? (
              <Loader2
                size={18}
                className="animate-spin"
                style={{ color: "var(--pg-text-3)" }}
              />
            ) : (
              <p
                className="text-[22px] font-bold leading-none"
                style={{ color: "var(--pg-text-1)" }}
              >
                {approved.length}
              </p>
            )}
            <div className="flex items-center gap-1">
              <Users size={11} style={{ color: "#FF6600" }} />
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                approved accounts
              </p>
            </div>
          </div>
        </div>

        {/* Card 4: Needs Attention */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
          }}
        >
          <div
            className="h-[3px]"
            style={{
              background: needsAttention.length > 0 ? "#dc2626" : "#059669",
            }}
          />
          <div className="p-4 space-y-2">
            <p
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--pg-text-3)" }}
            >
              Needs Attention
            </p>
            {isLoading ? (
              <Loader2
                size={18}
                className="animate-spin"
                style={{ color: "var(--pg-text-3)" }}
              />
            ) : (
              <p
                className="text-[22px] font-bold leading-none"
                style={{
                  color:
                    needsAttention.length > 0 ? "#dc2626" : "#059669",
                }}
              >
                {needsAttention.length}
              </p>
            )}
            <div className="flex items-center gap-1">
              <AlertCircle
                size={11}
                style={{
                  color:
                    needsAttention.length > 0 ? "#dc2626" : "#059669",
                }}
              />
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                risk flags + returned
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* WM BREAKDOWN */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px var(--pg-card-shadow)",
        }}
      >
        <div className="h-[3px]" style={{ background: "#FF6600" }} />
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-[13px] font-semibold"
              style={{ color: "var(--pg-text-1)" }}
            >
              Team Performance — By Wealth Manager
            </h2>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}
            >
              {wmList.length} WMs
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2
                size={20}
                className="animate-spin"
                style={{ color: "var(--pg-text-3)" }}
              />
            </div>
          ) : wmList.length === 0 ? (
            <div
              className="text-center py-10 text-[13px]"
              style={{ color: "var(--pg-text-3)" }}
            >
              No cases initiated yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--pg-row-border)",
                    }}
                  >
                    {[
                      "WM Name",
                      "Clients",
                      "Approved",
                      "In Review",
                      "Needs Attention",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left pb-2 pr-4 text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--pg-text-3)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wmList.map((wm) => (
                    <tr
                      key={wm.id}
                      className="transition-colors"
                      style={{
                        background:
                          hoveredWmRow === wm.id
                            ? "var(--pg-row-hover)"
                            : "transparent",
                        borderBottom: "1px solid var(--pg-row-border)",
                      }}
                      onMouseEnter={() => setHoveredWmRow(wm.id)}
                      onMouseLeave={() => setHoveredWmRow(null)}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                            style={{ background: "#FF6600" }}
                          >
                            {initials(wm.name)}
                          </div>
                          <span
                            className="text-[13px] font-medium"
                            style={{ color: "var(--pg-text-1)" }}
                          >
                            {wm.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-[13px]" style={{ color: "var(--pg-text-1)" }}>
                        {wm.clientCount}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ background: "#d1fae5", color: "#065f46" }}
                        >
                          {wm.approvedCount}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ background: "#fff0e0", color: "#E05500" }}
                        >
                          {wm.pendingCount}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {wm.attentionCount > 0 ? (
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ background: "#fee2e2", color: "#991b1b" }}
                          >
                            {wm.attentionCount}
                          </span>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ background: "#d1fae5", color: "#065f46" }}
                          >
                            0
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <Link
                          href={`/wm/clients?wm=${wm.id}`}
                          className="flex items-center gap-1 text-[12px] font-semibold"
                          style={{ color: "#FF6600" }}
                        >
                          View <ChevronRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            className="mt-3 px-3 py-2 rounded-xl text-[11px] flex items-center gap-2"
            style={{ background: "#fef3c7", color: "#92400e" }}
          >
            <AlertCircle size={12} />
            AUM per WM requires portfolio-to-WM assignment data
          </div>
        </div>
      </div>

      {/* TWO-COLUMN SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* LEFT: Pipeline Overview */}
        <div
          className="md:col-span-2 rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
          }}
        >
          <div className="h-[3px]" style={{ background: "#1d4ed8" }} />
          <div className="p-5">
            <h2
              className="text-[13px] font-semibold mb-4"
              style={{ color: "var(--pg-text-1)" }}
            >
              Pipeline Overview
            </h2>

            <div className="space-y-2">
              {[
                { key: "draft", label: "Draft", bg: "#f1f5f9", color: "#475569" },
                { key: "submitted", label: "Submitted", bg: "#dbeafe", color: "#1d4ed8" },
                { key: "in_review", label: "In Review", bg: "#fff0e0", color: "#E05500" },
                { key: "compliance_review", label: "Compliance", bg: "#ede9fe", color: "#6d28d9" },
                { key: "approved", label: "Approved", bg: "#d1fae5", color: "#065f46" },
                { key: "returned", label: "Rejected/Returned", bg: "#fef3c7", color: "#92400e" },
              ].map((stage) => {
                const count = stageCounts[stage.key] ?? 0;
                return (
                  <Link
                    key={stage.key}
                    href="/wm/pipeline"
                    className="flex items-center gap-3 py-2 px-3 rounded-xl transition-colors hover:opacity-80"
                    style={{ background: "var(--pg-muted-bg)" }}
                  >
                    <span
                      className="px-2 py-0.5 rounded-full text-[11px] font-semibold w-8 text-center"
                      style={{ background: stage.bg, color: stage.color }}
                    >
                      {isLoading ? "—" : count}
                    </span>
                    <span
                      className="text-[13px] flex-1"
                      style={{ color: "var(--pg-text-1)" }}
                    >
                      {stage.label}
                    </span>
                    <ChevronRight size={14} style={{ color: "var(--pg-text-3)" }} />
                  </Link>
                );
              })}
            </div>

            {/* Distribution bar */}
            {!isLoading && allCases.length > 0 && (
              <div className="mt-4">
                <p
                  className="text-[10px] font-bold uppercase tracking-wider mb-2"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  Distribution
                </p>
                <div className="h-3 rounded-full overflow-hidden flex">
                  {[
                    { key: "draft", color: "#94a3b8" },
                    { key: "submitted", color: "#1d4ed8" },
                    { key: "in_review", color: "#FF6600" },
                    { key: "compliance_review", color: "#7c3aed" },
                    { key: "approved", color: "#059669" },
                    { key: "returned", color: "#dc2626" },
                  ].map((s) => {
                    const pct =
                      ((stageCounts[s.key] ?? 0) / allCases.length) * 100;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={s.key}
                        style={{ width: `${pct}%`, background: s.color }}
                        title={`${s.key}: ${(stageCounts[s.key] ?? 0)}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Attention Required */}
        <div
          className="md:col-span-1 rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
          }}
        >
          <div className="h-[3px]" style={{ background: "#dc2626" }} />
          <div className="p-5">
            <h2
              className="text-[13px] font-semibold mb-4"
              style={{ color: "var(--pg-text-1)" }}
            >
              Attention Required
            </h2>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2
                  size={18}
                  className="animate-spin"
                  style={{ color: "var(--pg-text-3)" }}
                />
              </div>
            ) : needsAttention.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <CheckCircle2 size={24} style={{ color: "#059669" }} />
                <p
                  className="text-[12px]"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  No immediate issues
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {needsAttention.slice(0, 6).map((c) => (
                  <div
                    key={c.ID}
                    className="flex items-start justify-between gap-2 p-2 rounded-xl"
                    style={{ background: "var(--pg-muted-bg)" }}
                  >
                    <div className="flex items-start gap-2">
                      {c.RiskFlag ? (
                        <AlertCircle
                          size={13}
                          className="mt-0.5 flex-shrink-0"
                          style={{ color: "#dc2626" }}
                        />
                      ) : (
                        <Clock
                          size={13}
                          className="mt-0.5 flex-shrink-0"
                          style={{ color: "#d97706" }}
                        />
                      )}
                      <div>
                        <p
                          className="text-[12px] font-medium"
                          style={{ color: "var(--pg-text-1)" }}
                        >
                          Case {c.ID.slice(0, 8)}…
                        </p>
                        <p
                          className="text-[11px]"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          {c.RiskFlag ? "Risk flag" : "Returned"}
                          {c.RiskFlag && c.State === "returned"
                            ? " + Returned"
                            : ""}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/wm/pipeline`}
                      className="text-[11px] font-semibold flex-shrink-0"
                      style={{ color: "#FF6600" }}
                    >
                      Review
                    </Link>
                  </div>
                ))}
                {needsAttention.length > 6 && (
                  <p
                    className="text-[11px] text-center pt-1"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    +{needsAttention.length - 6} more
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MATURITIES SECTION */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px var(--pg-card-shadow)",
        }}
      >
        <div className="h-[3px]" style={{ background: "#d97706" }} />
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2
                className="text-[13px] font-semibold"
                style={{ color: "var(--pg-text-1)" }}
              >
                Upcoming Maturities — All Books
              </h2>
              <p
                className="text-[11px] mt-0.5"
                style={{ color: "var(--pg-text-3)" }}
              >
                Across all WM books
              </p>
            </div>
            <Link
              href="/wm/maturities"
              className="text-[12px] font-semibold flex items-center gap-1"
              style={{ color: "#FF6600" }}
            >
              View all <ArrowUpRight size={12} />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  {["Client", "WM", "Product", "Principal", "Days Left", "Instruction"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left pb-2 pr-4 text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--pg-text-3)" }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {DEMO_MATURITIES.map((mat, idx) => (
                  <tr
                    key={idx}
                    className="transition-colors"
                    style={{
                      background:
                        hoveredMatRow === idx
                          ? "var(--pg-row-hover)"
                          : "transparent",
                      borderBottom: "1px solid var(--pg-row-border)",
                    }}
                    onMouseEnter={() => setHoveredMatRow(idx)}
                    onMouseLeave={() => setHoveredMatRow(null)}
                  >
                    <td
                      className="py-3 pr-4 text-[13px] font-medium"
                      style={{ color: "var(--pg-text-1)" }}
                    >
                      {mat.client_name}
                    </td>
                    <td
                      className="py-3 pr-4 text-[13px]"
                      style={{ color: "var(--pg-text-2)" }}
                    >
                      {mat.wm_name}
                    </td>
                    <td
                      className="py-3 pr-4 text-[13px]"
                      style={{ color: "var(--pg-text-2)" }}
                    >
                      {mat.product}
                    </td>
                    <td
                      className="py-3 pr-4 text-[13px] font-medium"
                      style={{ color: "var(--pg-text-1)" }}
                    >
                      {fmtCompact(mat.principal)}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={
                          mat.days_remaining <= 3
                            ? { background: "#fee2e2", color: "#991b1b" }
                            : mat.days_remaining <= 7
                            ? { background: "#fef3c7", color: "#92400e" }
                            : { background: "#d1fae5", color: "#065f46" }
                        }
                      >
                        {mat.days_remaining}d
                      </span>
                    </td>
                    <td className="py-3">
                      {mat.has_instruction ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ background: "#d1fae5", color: "#065f46" }}
                        >
                          Instruction set
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ background: "#fee2e2", color: "#991b1b" }}
                          >
                            No instruction
                          </span>
                          <span
                            className="text-[10px]"
                            style={{ color: "#dc2626" }}
                          >
                            Escalate
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TEAM INTERACTION SUMMARY */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px var(--pg-card-shadow)",
        }}
      >
        <div className="h-[3px]" style={{ background: "#0891b2" }} />
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-[13px] font-semibold"
              style={{ color: "var(--pg-text-1)" }}
            >
              Team Client Activity
            </h2>
            <Link
              href="/wm/interactions"
              className="text-[12px] font-semibold flex items-center gap-1"
              style={{ color: "#FF6600" }}
            >
              View interaction log <ArrowUpRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: "Interactions This Month", icon: MessageSquare },
              { label: "Client Visits", icon: Users },
              { label: "Open Follow-ups", icon: Clock },
              { label: "Unresolved Complaints", icon: AlertCircle },
            ].map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="p-4 rounded-xl"
                style={{ background: "var(--pg-muted-bg)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} style={{ color: "var(--pg-text-3)" }} />
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    {label}
                  </p>
                </div>
                <p
                  className="text-[22px] font-bold leading-none"
                  style={{ color: "var(--pg-text-1)" }}
                >
                  —
                </p>
              </div>
            ))}
          </div>

          <div
            className="px-3 py-2 rounded-xl text-[11px] flex items-center gap-2"
            style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}
          >
            <Shield size={12} />
            Connect interaction log to see team activity metrics
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px var(--pg-card-shadow)",
        }}
      >
        <div className="h-[3px]" style={{ background: "#FF6600" }} />
        <div className="p-5">
          <h2
            className="text-[13px] font-semibold mb-4"
            style={{ color: "var(--pg-text-1)" }}
          >
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/wm/clients"
              className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2"
              style={{
                background: "linear-gradient(135deg,#FF6600,#E05500)",
              }}
            >
              <Users size={14} />
              All Clients
            </Link>
            <Link
              href="/wm/maturities"
              className="h-9 px-4 rounded-xl text-[13px] font-semibold flex items-center gap-2"
              style={{
                background: "var(--pg-muted-bg)",
                color: "var(--pg-text-2)",
              }}
            >
              <Calendar size={14} />
              All Maturities
            </Link>
            <Link
              href="/wm/interactions"
              className="h-9 px-4 rounded-xl text-[13px] font-semibold flex items-center gap-2"
              style={{
                background: "var(--pg-muted-bg)",
                color: "var(--pg-text-2)",
              }}
            >
              <MessageSquare size={14} />
              Interaction Log
            </Link>
            <Link
              href="/approval"
              className="h-9 px-4 rounded-xl text-[13px] font-semibold flex items-center gap-2"
              style={{
                background: "var(--pg-muted-bg)",
                color: "var(--pg-text-2)",
              }}
            >
              <CheckCircle2 size={14} />
              Approvals
            </Link>
            <Link
              href="/reports"
              className="h-9 px-4 rounded-xl text-[13px] font-semibold flex items-center gap-2"
              style={{
                background: "var(--pg-muted-bg)",
                color: "var(--pg-text-2)",
              }}
            >
              <Download size={14} />
              Generate Report
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
