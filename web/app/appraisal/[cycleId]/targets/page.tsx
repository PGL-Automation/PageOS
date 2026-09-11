"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, CheckCircle2, AlertCircle, Loader2, Users, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePosition } from "@/lib/position";

// Map role codes → BSC department names (mirrors kpis/page.tsx)
const ROLE_TO_DEPT: Record<string, string> = {
  "GROUP_HEAD_WEALTH_MGMT":   "Wealth Management",
  "HEAD_OF_INVESTMENT":       "Portfolio Management",
  "HEAD_INVESTMENT_MGMT":     "Portfolio Management",
  "HEAD_OF_OPERATIONS":       "Finance and Operations",
  "TREASURY_OPS_FINANCE_MGR": "Finance and Operations",
  "TL_FINANCIAL_REPORTING":   "Finance and Operations",
  "FINOPS_MANAGER":           "Finance and Operations",
  "HEAD_CORPORATE_COMPLIANCE":"Internal Control",
  "HEAD_RISK_TRADE_MGMT":     "Risk Management",
  "HEAD_HUMAN_CAPITAL":       "Human Capital Management",
  "HR_MANAGER":               "Human Capital Management",
  "HR_OPS_MANAGER":           "Human Capital Management",
  "MANAGING_DIRECTOR":        "Executive / Leadership",
  "GROUP_HEAD_BUSINESS_DEV":  "Business Development",
};

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Cycle = {
  id: string;
  title: string;
  description: string;
  status: string;
  phase?: string;
  start_date?: string;
  end_date?: string;
};

type TargetsProgressRow = {
  employee_id: string;
  employee_name: string;
  department: string;
  grade?: string;
  role?: string;
  manager_name?: string;
  targets_set: boolean;
};

type TargetsProgress = {
  rows: TargetsProgressRow[];
  set: number;
  total: number;
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function TeamTargetsPage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const router = useRouter();
  const { activePosition } = usePosition();

  // The dept head's own department — used to filter to only their team
  const myDept = activePosition?.code ? (ROLE_TO_DEPT[activePosition.code] ?? "") : "";

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [progress, setProgress] = useState<TargetsProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  async function loadData(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const [cycleRes, progressRes] = await Promise.all([
        fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}`, { credentials: "include", signal }),
        fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/targets-progress`, { credentials: "include", signal }),
      ]);
      if (!cycleRes.ok) throw new Error("Failed to load cycle");
      setCycle(await cycleRes.json());
      if (!progressRes.ok) throw new Error("Failed to load targets progress");
      setProgress(await progressRes.json());
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!cycleId) return;
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  async function generateSubmissions() {
    setGenerating(true);
    try {
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/generate-submissions`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate submissions");
      await loadData(); // reload to show new rows (no abort — user-triggered)
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  const isTargetPhase = !cycle?.phase || cycle.phase === "target";
  const isAppraisalPhase = cycle?.phase === "appraisal";

  // Filter rows to only the dept head's department (if known)
  // HR/MD sees all departments; dept heads see only their own team
  const isHRRole = !myDept; // no dept mapping = HR/admin = see all
  const visibleRows = (progress?.rows ?? []).filter(row =>
    isHRRole || !myDept || !row.department || row.department === myDept
  );

  const setPct =
    visibleRows.length > 0
      ? Math.round((visibleRows.filter(r => r.targets_set).length / visibleRows.length) * 100)
      : 0;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2
          className="w-5 h-5 animate-spin"
          style={{ color: "var(--pg-text-4)" }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[900px] mx-auto space-y-4 pt-6">
        <Link
          href="/appraisal"
          className="flex items-center gap-1.5 text-[13px]"
          style={{ color: "var(--pg-text-3)" }}
        >
          <ChevronLeft className="w-4 h-4" /> Back to Appraisals
        </Link>
        <div
          className="flex items-center gap-3 px-4 py-3.5 rounded-xl"
          style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
        >
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-[13px] font-medium text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <Link
          href="/appraisal"
          className="flex items-center gap-1.5 text-[12px] mb-3"
          style={{ color: "var(--pg-text-3)" }}
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Appraisals
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="text-[20px] font-bold leading-tight"
              style={{ color: "var(--pg-text-1)" }}
            >
              Target Setting — Your Team
            </h1>
            {cycle && (
              <p
                className="text-[12px] mt-1"
                style={{ color: "var(--pg-text-3)" }}
              >
                {cycle.title}
                {cycle.start_date && cycle.end_date && (
                  <>
                    {" "}
                    &middot;{" "}
                    {new Date(cycle.start_date).toLocaleDateString("en-GB", {
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    &ndash;{" "}
                    {new Date(cycle.end_date).toLocaleDateString("en-GB", {
                      month: "short",
                      year: "numeric",
                    })}
                  </>
                )}
              </p>
            )}
          </div>

          {/* Generate / refresh button in header */}
          <button
            onClick={generateSubmissions}
            disabled={generating}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold disabled:opacity-60"
            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
            title="Generate or refresh team member records"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {generating ? "Generating…" : "Generate Team"}
          </button>

          {/* Phase badge */}
          {isTargetPhase && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold"
              style={{ background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#d97706" }}
              />
              Target Setting Phase
            </span>
          )}
          {isAppraisalPhase && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold"
              style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#1d4ed8" }}
              />
              Appraisal Phase
            </span>
          )}
        </div>
      </div>

      {/* Info banner — target setting phase */}
      {isTargetPhase && (
        <div
          className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
          style={{ background: "#fffbeb", border: "1px solid #fde68a" }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#d97706" }} />
          <p className="text-[13px]" style={{ color: "#92400e" }}>
            Set individual KPIs and targets for each direct report before the
            appraisal phase opens.
          </p>
        </div>
      )}

      {/* Progress summary */}
      {progress && (
        <div
          className="rounded-2xl p-5"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          <div className="h-[3px] -mx-5 -mt-5 mb-5 rounded-t-2xl" style={{ background: "#059669" }} />
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" style={{ color: "#059669" }} />
              <p
                className="text-[13px] font-semibold"
                style={{ color: "var(--pg-text-1)" }}
              >
                {visibleRows.filter(r => r.targets_set).length} of {visibleRows.length} team member
                {visibleRows.length !== 1 ? "s" : ""} have targets set
                {myDept && <span className="text-[11px] ml-1 opacity-60">({myDept})</span>}
              </p>
            </div>
            <span
              className="text-[13px] font-bold"
              style={{ color: setPct === 100 ? "#059669" : "#d97706" }}
            >
              {setPct}%
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "var(--pg-muted-bg)" }}
          >
            <div
              className="h-2 rounded-full transition-all duration-700"
              style={{
                width: `${setPct}%`,
                background:
                  setPct === 100
                    ? "#059669"
                    : "linear-gradient(90deg,#d97706,#f59e0b)",
              }}
            />
          </div>
        </div>
      )}

      {/* Direct reports table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div className="h-[3px]" style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }} />

        {/* Table header */}
        <div
          className="grid grid-cols-[1fr_140px_100px_130px_120px] px-5 py-3"
          style={{
            borderBottom: "1px solid var(--pg-row-border)",
            background: "var(--pg-muted-bg)",
          }}
        >
          {["Employee", "Department", "Grade", "KPIs Set", "Action"].map(
            (col) => (
              <p
                key={col}
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: "var(--pg-text-3)" }}
              >
                {col}
              </p>
            )
          )}
        </div>

        {/* Rows */}
        {visibleRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Users className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-4)" }} />
            <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--pg-text-2)" }}>
              No team members loaded yet
            </p>
            <p className="text-[12px] max-w-sm mb-5" style={{ color: "var(--pg-text-3)" }}>
              Click "Generate Team" to load all active employees from the organisation.
              This creates their appraisal records so you can set individual targets.
            </p>
            <button
              onClick={generateSubmissions}
              disabled={generating}
              className="flex items-center gap-2 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Users className="w-3.5 h-3.5" />
              )}
              {generating ? "Generating…" : "Generate Team"}
            </button>
          </div>
        ) : (
          visibleRows.map((row, i) => (
            <div
              key={row.employee_id}
              className="grid grid-cols-[1fr_140px_100px_130px_120px] px-5 py-3.5 items-center transition-colors"
              style={{
                borderBottom:
                  i < visibleRows.length - 1
                    ? "1px solid var(--pg-row-border)"
                    : "none",
                background:
                  hoveredRow === row.employee_id
                    ? "var(--pg-row-hover)"
                    : "transparent",
              }}
              onMouseEnter={() => setHoveredRow(row.employee_id)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {/* Employee */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{
                    background: row.targets_set
                      ? "linear-gradient(135deg,#059669,#047857)"
                      : "linear-gradient(135deg,#94a3b8,#64748b)",
                  }}
                >
                  {initials(row.employee_name)}
                </div>
                <div className="min-w-0">
                  <p
                    className="text-[13px] font-semibold truncate"
                    style={{ color: "var(--pg-text-1)" }}
                  >
                    {row.employee_name}
                  </p>
                  {row.role && (
                    <p
                      className="text-[11px] truncate"
                      style={{ color: "var(--pg-text-3)" }}
                    >
                      {row.role}
                    </p>
                  )}
                </div>
              </div>

              {/* Department */}
              <p
                className="text-[12px] truncate"
                style={{ color: "var(--pg-text-2)" }}
              >
                {row.department || "—"}
              </p>

              {/* Grade */}
              <p
                className="text-[12px]"
                style={{ color: "var(--pg-text-2)" }}
              >
                {row.grade || "—"}
              </p>

              {/* KPIs Set */}
              <div className="flex items-center gap-1.5">
                {row.targets_set ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#059669" }} />
                    <span
                      className="text-[12px] font-medium"
                      style={{ color: "#059669" }}
                    >
                      Targets set
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "#d97706" }} />
                    <span
                      className="text-[12px] font-medium"
                      style={{ color: "#d97706" }}
                    >
                      Not set yet
                    </span>
                  </>
                )}
              </div>

              {/* Action */}
              <div>
                <button
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (row.department) params.set("dept", row.department);
                    if (row.role) params.set("role", row.role);
                    if (row.grade) params.set("grade", row.grade);
                    router.push(
                      `/appraisal/${cycleId}/targets/${row.employee_id}${params.toString() ? `?${params.toString()}` : ""}`
                    );
                  }}
                  className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white flex items-center gap-1.5 whitespace-nowrap"
                  style={{
                    background: "linear-gradient(135deg,#FF6600,#E05500)",
                  }}
                >
                  Set Targets
                  <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
