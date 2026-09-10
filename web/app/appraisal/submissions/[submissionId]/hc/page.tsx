"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ─── Types ───────────────────────────────────────────────────────────────────

type KPI = {
  id: string;
  objective: string;
  measure: string;
  target: string;
  weight: number;
  perspective: string;
  self_rating?: number;
  agreed_rating?: number;
};

type BscSubmission = {
  id: string;
  cycle_id: string;
  cycle_title: string;
  employee_id: string;
  employee_name: string;
  department?: string;
  grade?: string;
  level?: string;
  line_manager?: string;
  status: string;
  self_score?: number;
  agreed_score?: number;
  performance_band?: string;
  kpis: KPI[];
  employee_comments?: string;
  manager_comments?: string;
  development_plan?: string;
  hc_comments?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSPECTIVES = [
  "Financial",
  "Client / Customer",
  "Internal Business Process",
  "Learning & Growth",
] as const;

const PERSPECTIVE_COLORS: Record<string, string> = {
  Financial: "#1d4ed8",
  "Client / Customer": "#059669",
  "Internal Business Process": "#7c3aed",
  "Learning & Growth": "#d97706",
};

const BAND_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  Outstanding: { color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  "Exceeds Expectations": { color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  "Meets Expectations": { color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  "Needs Improvement": { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  Unsatisfactory: { color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  submitted_to_hc: { label: "Pending HC Review", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  finalized: { label: "Finalised", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  returned_to_manager: { label: "Returned to Manager", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function ratingColor(rating: number): string {
  if (rating <= 1) return "#dc2626";
  if (rating === 2) return "#f97316";
  if (rating === 3) return "#d97706";
  if (rating === 4) return "#1d4ed8";
  return "#059669";
}

function RatingBadge({ value }: { value?: number }) {
  if (value == null || value === 0) {
    return (
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[12px] font-bold"
        style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-4)" }}
      >
        —
      </span>
    );
  }
  const bg = ratingColor(value);
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[12px] font-bold text-white"
      style={{ background: bg }}
    >
      {value}
    </span>
  );
}

// ─── Workflow Rail ────────────────────────────────────────────────────────────

function WorkflowRail({ status }: { status: string }) {
  const steps = [
    { key: "self_assessment", label: "Self Assessment" },
    { key: "line_manager", label: "Line Manager" },
    { key: "hc", label: "Human Capital" },
    { key: "complete", label: "Complete" },
  ];

  function stepState(key: string): "done" | "active" | "pending" {
    const order = ["self_assessment", "line_manager", "hc", "complete"];
    const statusMap: Record<string, number> = {
      draft: 0,
      submitted: 1,
      manager_review: 1,
      submitted_to_hc: 2,
      returned_to_manager: 1,
      finalized: 3,
      complete: 3,
    };
    const current = statusMap[status] ?? 0;
    const idx = order.indexOf(key);
    if (idx < current) return "done";
    if (idx === current) return "active";
    return "pending";
  }

  return (
    <div
      className="rounded-2xl px-6 py-4 flex items-center justify-between gap-2"
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      {steps.map((step, i) => {
        const state = stepState(step.key);
        return (
          <div key={step.key} className="flex items-center gap-2 flex-1">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                style={
                  state === "done"
                    ? { background: "#059669", color: "#fff" }
                    : state === "active"
                    ? { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "#fff" }
                    : { background: "var(--pg-muted-bg)", color: "var(--pg-text-4)" }
                }
              >
                {state === "done" ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  i + 1
                )}
              </div>
              <p
                className="text-[10px] font-semibold text-center leading-tight whitespace-nowrap"
                style={{
                  color:
                    state === "done"
                      ? "#059669"
                      : state === "active"
                      ? "#FF6600"
                      : "var(--pg-text-4)",
                }}
              >
                {step.label}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-[2px] mb-5 rounded-full"
                style={{
                  background:
                    stepState(steps[i + 1].key) !== "pending" || state === "done"
                      ? "#059669"
                      : "var(--pg-muted-bg)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── BSC Scorecard Table ──────────────────────────────────────────────────────

function BscScorecardTable({ kpis }: { kpis: KPI[] }) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div
        className="h-[3px]"
        style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
      />
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
          BSC Scorecard
        </p>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          Read-only view — all perspectives and scores
        </p>
      </div>

      {PERSPECTIVES.map((perspective) => {
        const perspKpis = kpis.filter((k) => k.perspective === perspective);
        if (perspKpis.length === 0) return null;

        const color = PERSPECTIVE_COLORS[perspective] ?? "#64748b";
        const totalWeight = perspKpis.reduce((sum, k) => sum + (k.weight ?? 0), 0);

        return (
          <div key={perspective}>
            {/* Perspective header */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{
                background: `${color}10`,
                borderBottom: "1px solid var(--pg-row-border)",
                borderTop: "1px solid var(--pg-row-border)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: color }}
                />
                <p
                  className="text-[12px] font-bold"
                  style={{ color }}
                >
                  {perspective}
                </p>
              </div>
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: `${color}18`, color }}
              >
                Total Weight: {totalWeight}%
              </span>
            </div>

            {/* Column headers */}
            <div
              className="grid px-5 py-2.5"
              style={{
                gridTemplateColumns: "2fr 1.5fr 1.2fr 60px 60px 80px",
                borderBottom: "1px solid var(--pg-row-border)",
                background: "var(--pg-muted-bg)",
              }}
            >
              {["Objective", "Measure", "Target", "Self", "Agreed", "Weight"].map((col) => (
                <p
                  key={col}
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  {col}
                </p>
              ))}
            </div>

            {/* KPI rows */}
            {perspKpis.map((kpi, i) => (
              <div
                key={kpi.id}
                className="grid px-5 py-3.5 items-center transition-colors"
                style={{
                  gridTemplateColumns: "2fr 1.5fr 1.2fr 60px 60px 80px",
                  borderBottom:
                    i < perspKpis.length - 1
                      ? "1px solid var(--pg-row-border)"
                      : "none",
                  background:
                    hoveredRow === kpi.id
                      ? "var(--pg-row-hover)"
                      : "transparent",
                }}
                onMouseEnter={() => setHoveredRow(kpi.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <p
                  className="text-[13px] font-medium leading-snug pr-3"
                  style={{ color: "var(--pg-text-1)" }}
                >
                  {kpi.objective}
                </p>
                <p
                  className="text-[12px] pr-3"
                  style={{ color: "var(--pg-text-2)" }}
                >
                  {kpi.measure || "—"}
                </p>
                <p
                  className="text-[12px] pr-3"
                  style={{ color: "var(--pg-text-2)" }}
                >
                  {kpi.target || "—"}
                </p>
                <RatingBadge value={kpi.self_rating} />
                <RatingBadge value={kpi.agreed_rating} />
                <span
                  className="text-[12px] font-semibold"
                  style={{ color: "var(--pg-text-2)" }}
                >
                  {kpi.weight != null ? `${kpi.weight}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        );
      })}

      {kpis.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-16"
          style={{ color: "var(--pg-text-4)" }}
        >
          <AlertCircle className="w-8 h-8 mb-2" />
          <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-3)" }}>
            No KPIs found for this submission.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Comments Block ───────────────────────────────────────────────────────────

function ReadOnlyComment({
  label,
  value,
  color,
}: {
  label: string;
  value?: string;
  color?: string;
}) {
  return (
    <div>
      <p
        className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
        style={{ color: color ?? "var(--pg-text-3)" }}
      >
        {label}
      </p>
      <div
        className="px-3 py-3 rounded-xl text-[13px] min-h-[72px]"
        style={{
          background: "var(--pg-muted-bg)",
          border: "1px solid var(--pg-card-border)",
          color: value ? "var(--pg-text-2)" : "var(--pg-text-4)",
          lineHeight: 1.6,
        }}
      >
        {value || "No comment provided."}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HcReviewPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<BscSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hcComments, setHcComments] = useState("");
  const [finalising, setFinalising] = useState(false);
  const [returning, setReturning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${BASE}/api/v1/appraisal/submissions/${submissionId}/bsc`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load submission");
      const data: BscSubmission = await res.json();
      setDetail(data);
      setHcComments(data.hc_comments ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function postAction(action: string, extraBody?: Record<string, string>) {
    const res = await fetch(
      `${BASE}/api/v1/appraisal/submissions/${submissionId}/bsc-action`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extraBody }),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message ?? data?.message ?? "Action failed");
    }
  }

  async function handleFinalise() {
    if (!confirm("Finalise this submission? This will lock the appraisal.")) return;
    setFinalising(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await postAction("finalize", { hc_comments: hcComments });
      setActionSuccess("Submission finalised successfully.");
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setFinalising(false);
    }
  }

  async function handleReturnToManager() {
    if (!confirm("Return this submission to the line manager for revision?")) return;
    setReturning(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await postAction("return-to-manager");
      setActionSuccess("Submission returned to line manager.");
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setReturning(false);
    }
  }

  // ─── Loading / error states ──────────────────────────────────────────────

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

  if (error || !detail) {
    return (
      <div className="max-w-[960px] mx-auto space-y-4 pt-6">
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
          <p className="text-[13px] font-medium text-red-700">
            {error ?? "Submission not found."}
          </p>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[detail.status] ?? {
    label: detail.status,
    color: "var(--pg-text-3)",
    bg: "var(--pg-muted-bg)",
    border: "var(--pg-card-border)",
  };

  const bandCfg = detail.performance_band
    ? BAND_CONFIG[detail.performance_band]
    : null;

  const isPending = detail.status === "submitted_to_hc";

  return (
    <div className="max-w-[1040px] mx-auto space-y-5 pb-10">
      {/* ── 1. HEADER ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/appraisal/${detail.cycle_id}/submissions`}
            className="flex items-center gap-1.5 text-[12px] mb-2"
            style={{ color: "var(--pg-text-3)" }}
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Submissions
          </Link>
          <h1
            className="text-[20px] font-bold leading-tight"
            style={{ color: "var(--pg-text-1)" }}
          >
            HC Review — {detail.employee_name}
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {detail.cycle_title}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status badge */}
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold"
            style={{
              background: statusCfg.bg,
              color: statusCfg.color,
              border: `1px solid ${statusCfg.border}`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: statusCfg.color }}
            />
            {statusCfg.label}
          </span>

          {/* Band badge */}
          {detail.performance_band && bandCfg && (
            <span
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-bold"
              style={{
                background: bandCfg.bg,
                color: bandCfg.color,
                border: `1px solid ${bandCfg.border}`,
              }}
            >
              {detail.performance_band}
            </span>
          )}
        </div>
      </div>

      {/* ── 2. EMPLOYEE INFO ROW ─────────────────────────────────────────── */}
      <div
        className="flex items-center gap-4 px-5 py-4 rounded-2xl flex-wrap"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
        >
          {initials(detail.employee_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[15px] font-bold truncate"
            style={{ color: "var(--pg-text-1)" }}
          >
            {detail.employee_name}
          </p>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          {[
            { label: "Department", value: detail.department },
            { label: "Grade", value: detail.grade },
            { label: "Level", value: detail.level },
            { label: "Line Manager", value: detail.line_manager },
          ].map(({ label, value }) => (
            <div key={label}>
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: "var(--pg-text-3)" }}
              >
                {label}
              </p>
              <p
                className="text-[13px] font-medium mt-0.5"
                style={{ color: "var(--pg-text-1)" }}
              >
                {value || "—"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. SCORE SUMMARY CARDS ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Self-Assessment Score */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          <div className="h-[3px]" style={{ background: "#FF6600" }} />
          <div className="px-5 py-4">
            <p
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--pg-text-3)" }}
            >
              Self-Assessment Score
            </p>
            <p
              className="text-[22px] font-bold leading-none mt-2"
              style={{ color: "#FF6600" }}
            >
              {detail.self_score != null
                ? `${detail.self_score.toFixed(2)} / 5`
                : "—"}
            </p>
          </div>
        </div>

        {/* Agreed Score */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          <div className="h-[3px]" style={{ background: "#1d4ed8" }} />
          <div className="px-5 py-4">
            <p
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--pg-text-3)" }}
            >
              Agreed Score
            </p>
            <p
              className="text-[22px] font-bold leading-none mt-2"
              style={{ color: "#1d4ed8" }}
            >
              {detail.agreed_score != null
                ? `${detail.agreed_score.toFixed(2)} / 5`
                : "—"}
            </p>
          </div>
        </div>

        {/* Performance Band */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          <div
            className="h-[3px]"
            style={{ background: bandCfg?.color ?? "#64748b" }}
          />
          <div className="px-5 py-4">
            <p
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--pg-text-3)" }}
            >
              Performance Band
            </p>
            {detail.performance_band && bandCfg ? (
              <span
                className="inline-flex mt-2 items-center px-4 py-1.5 rounded-full text-[14px] font-bold"
                style={{
                  background: bandCfg.bg,
                  color: bandCfg.color,
                  border: `1px solid ${bandCfg.border}`,
                }}
              >
                {detail.performance_band}
              </span>
            ) : (
              <p
                className="text-[22px] font-bold leading-none mt-2"
                style={{ color: "var(--pg-text-4)" }}
              >
                —
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. WORKFLOW RAIL ─────────────────────────────────────────────── */}
      <WorkflowRail status={detail.status} />

      {/* ── 5. BSC SCORECARD TABLE ───────────────────────────────────────── */}
      <BscScorecardTable kpis={detail.kpis ?? []} />

      {/* ── 6. COMMENTS SECTION ──────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div className="h-[3px]" style={{ background: "#7c3aed" }} />
        <div
          className="px-5 py-4"
          style={{ borderBottom: "1px solid var(--pg-row-border)" }}
        >
          <p
            className="text-[15px] font-bold"
            style={{ color: "var(--pg-text-1)" }}
          >
            Comments
          </p>
        </div>
        <div className="px-5 py-5 space-y-5">
          <ReadOnlyComment
            label="Employee Comments"
            value={detail.employee_comments}
            color="#FF6600"
          />
          <ReadOnlyComment
            label="Manager Comments"
            value={detail.manager_comments}
            color="#1d4ed8"
          />
          <ReadOnlyComment
            label="Development Plan"
            value={detail.development_plan}
            color="#059669"
          />

          {/* HC Comments — editable */}
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
              style={{ color: "#7c3aed" }}
            >
              HC Comments
            </p>
            <textarea
              value={hcComments}
              rows={4}
              onChange={(e) => setHcComments(e.target.value)}
              disabled={!isPending}
              placeholder={
                isPending
                  ? "Add HC review comments here…"
                  : "No HC comments provided."
              }
              className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none disabled:opacity-70"
              style={{
                background: isPending ? "var(--pg-muted-bg)" : "var(--pg-muted-bg)",
                border: isPending ? "1px solid #c4b5fd" : "1px solid var(--pg-card-border)",
                color: "var(--pg-text-1)",
                lineHeight: 1.6,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── 7. HC ACTIONS ────────────────────────────────────────────────── */}
      {isPending && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          <div
            className="h-[3px]"
            style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
          />
          <div className="px-5 py-5">
            <p
              className="text-[13px] font-semibold mb-4"
              style={{ color: "var(--pg-text-1)" }}
            >
              HC Decision
            </p>

            {actionError && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
                style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
              >
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-[13px] font-medium text-red-700">{actionError}</p>
              </div>
            )}

            {actionSuccess && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
                style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-[13px] font-semibold text-emerald-700">
                  {actionSuccess}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleFinalise}
                disabled={finalising || returning}
                className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
              >
                {finalising ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                Finalise
              </button>

              <button
                onClick={handleReturnToManager}
                disabled={finalising || returning}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-50"
                style={{
                  background: "var(--pg-muted-bg)",
                  color: "var(--pg-text-2)",
                  border: "1px solid var(--pg-card-border)",
                }}
              >
                {returning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                Return to Manager
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalised banner */}
      {detail.status === "finalized" && (
        <div
          className="flex items-center gap-3 px-4 py-3.5 rounded-xl"
          style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p
            className="text-[13px] font-semibold"
            style={{ color: "var(--pg-text-1)" }}
          >
            This submission has been finalised by Human Capital.
          </p>
        </div>
      )}

      {/* Returned banner */}
      {detail.status === "returned_to_manager" && (
        <div
          className="flex items-center gap-3 px-4 py-3.5 rounded-xl"
          style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
        >
          <RotateCcw className="w-5 h-5 text-red-500 shrink-0" />
          <p
            className="text-[13px] font-semibold"
            style={{ color: "var(--pg-text-1)" }}
          >
            This submission has been returned to the line manager for revision.
          </p>
        </div>
      )}
    </div>
  );
}
