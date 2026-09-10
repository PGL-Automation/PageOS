"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { usePosition, roleFamily } from "@/lib/position";
import { useTeamView } from "@/lib/team-view";
import {
  ChevronLeft, CheckCircle2, Clock, Save, Send, Lock,
  Loader2, Settings2, RotateCcw, Award, ClipboardList, AlertCircle, ThumbsUp, ThumbsDown,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ─── Types ────────────────────────────────────────────────────────────────────

type Cycle = {
  id: string; title: string; description: string; status: string;
  phase?: string; // "target" | "appraisal"
  self_deadline?: string; manager_deadline?: string;
};

type KPI = {
  id: string; perspective: string; seq: number;
  objective: string; measure: string; weight: number; target: string;
};

type BSCSubmission = {
  id: string; cycle_id: string; appraisee_id: string; status: string;
  manager_id?: string;   // identity user UUID of the line manager
  manager_name?: string;
  scorecard: KPI[];
  self_json: Record<string, number>;
  agreed_json: Record<string, number>;
  self_score?: number;
  manager_score?: number;
  band?: string;
  employee_comments?: string;
  manager_comments?: string;
  development_plan?: string;
  hc_comments?: string;
  stage: number; // 0=self, 1=manager, 2=hc, 3=finalized
  self_submitted_at?: string;
  manager_submitted_at?: string;
  reviewer_name?: string;
  target_status?: string; // not_set | set | accepted | rejected
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSPECTIVE_COLORS: Record<string, string> = {
  "Financial": "#1d4ed8",
  "Client": "#059669",
  "Customer": "#059669",
  "Internal Business Process": "#7c3aed",
  "Learning & Growth": "#d97706",
  "Learning and Growth": "#d97706",
};

function perspectiveColor(p: string): string {
  for (const [key, val] of Object.entries(PERSPECTIVE_COLORS)) {
    if (p.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return "#6b7280";
}

const RATING_COLORS: Record<number, string> = {
  1: "#dc2626",
  2: "#FF6600",
  3: "#1d4ed8",
  4: "#0d9488",
  5: "#065f46",
};

const RATING_LABELS: Record<number, string> = {
  1: "Unsatisfactory",
  2: "Needs Improvement",
  3: "Meets Expectations",
  4: "Exceeds Expectations",
  5: "Outstanding",
};

const BAND_COLORS: Record<string, string> = {
  "Outstanding": "#059669",
  "Exceeds Expectations": "#1d4ed8",
  "Meets Expectations": "#d97706",
  "Needs Improvement": "#dc2626",
  "Unsatisfactory": "#b91c1c",
};

const STAGE_LABELS = ["Self Assessment", "Line Manager", "Human Capital", "Complete"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StageRail({ stage }: { stage: number }) {
  return (
    <div className="flex items-center gap-0 rounded-2xl overflow-hidden"
         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      {STAGE_LABELS.map((label, i) => {
        const done = i < stage;
        const active = i === stage;
        return (
          <div key={label} className="flex-1 flex flex-col items-center py-3 px-2 relative"
               style={{
                 background: active ? "rgba(255,102,0,0.06)" : done ? "rgba(5,150,105,0.04)" : undefined,
                 borderRight: i < STAGE_LABELS.length - 1 ? "1px solid var(--pg-row-border)" : undefined,
               }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center mb-1.5 text-[11px] font-bold text-white"
                 style={{
                   background: done ? "#059669" : active ? "#FF6600" : "var(--pg-muted-bg)",
                   color: done || active ? "white" : "var(--pg-text-4)",
                 }}>
              {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className="text-[10px] font-semibold text-center leading-tight"
                  style={{ color: active ? "#FF6600" : done ? "#059669" : "var(--pg-text-3)" }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RatingButtons({
  value, onChange, disabled,
}: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => {
        const active = value === n;
        const color = RATING_COLORS[n];
        return (
          <button key={n} type="button" disabled={disabled}
                  title={RATING_LABELS[n]}
                  onClick={() => onChange(n)}
                  className="w-8 h-8 rounded-lg text-[12px] font-bold border-2 transition-all disabled:cursor-not-allowed"
                  style={{
                    borderColor: active ? color : "var(--pg-card-border)",
                    background: active ? color : "transparent",
                    color: active ? "white" : "var(--pg-text-3)",
                    transform: active ? "scale(1.1)" : undefined,
                  }}>
            {n}
          </button>
        );
      })}
      {value > 0 && (
        <span className="ml-1.5 text-[10px] font-medium" style={{ color: RATING_COLORS[value] }}>
          {RATING_LABELS[value]}
        </span>
      )}
    </div>
  );
}

function ScoreCard({ label, value, color }: { label: string; value?: number; color: string }) {
  if (value == null) return null;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="h-[3px]" style={{ background: color }} />
      <div className="px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>{label}</p>
        <p className="text-[22px] font-bold leading-none" style={{ color }}>{value.toFixed(2)} <span className="text-[13px] font-medium" style={{ color: "var(--pg-text-3)" }}>/ 5</span></p>
      </div>
    </div>
  );
}

// ─── Target Review Banner (employee accepts or rejects their KPI targets) ─────

function TargetReviewBanner({ submissionId, onAction }: { submissionId: string; onAction: () => void }) {
  const { toast } = useToast();
  const [acting, setActing] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  async function act(action: "accept-targets" | "reject-targets", body?: object) {
    setActing(true);
    try {
      const res = await fetch(`${BASE}/api/v1/appraisal/submissions/${submissionId}/${action}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.error?.message ?? "Action failed");
      }
      toast({ title: action === "accept-targets" ? "Targets accepted" : "Targets rejected", description: action === "accept-targets" ? "Your targets are confirmed. You can now complete your self-assessment." : "Your manager has been notified to revise the targets." });
      setShowReject(false);
      onAction();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid #fcd34d" }}>
      <div className="h-[3px]" style={{ background: "#d97706" }} />
      <div className="px-5 py-4">
        <div className="flex items-start gap-3 mb-4">
          <Clock className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "#d97706" }} />
          <div>
            <p className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>Your performance targets are ready to review</p>
            <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
              Your line manager has set your KPIs and targets for this appraisal cycle.
              Review the scorecard below, then accept or request a revision.
            </p>
          </div>
        </div>
        {!showReject ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => act("accept-targets")}
              disabled={acting}
              className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              Accept Targets
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={acting}
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
              style={{ border: "1px solid #fca5a5", color: "#dc2626" }}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
              Request Revision
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Briefly explain what you'd like revised (optional)…"
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-[13px] outline-none resize-none"
              style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => act("reject-targets", { reason })}
                disabled={acting}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}
              >
                {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsDown className="w-3.5 h-3.5" />}
                Send Revision Request
              </button>
              <button onClick={() => setShowReject(false)} className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CyclePage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const { toast }   = useToast();
  const queryClient = useQueryClient();
  const { user }    = useAuth();
  const { primaryCode } = usePosition();
  const tv = useTeamView();
  const isHR       = roleFamily(primaryCode) === "hr" || roleFamily(primaryCode) === "md";
  const isDeptHead = tv.isTeamHead;

  // Local editable state
  const [selfRatings, setSelfRatings]       = useState<Record<string, number>>({});
  const [agreedRatings, setAgreedRatings]   = useState<Record<string, number>>({});
  const [employeeComments, setEmployeeComments] = useState("");
  const [managerComments, setManagerComments]   = useState("");
  const [developmentPlan, setDevelopmentPlan]   = useState("");
  const [acting, setActing]                 = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: cycle } = useQuery<Cycle>({
    queryKey: ["cycle", cycleId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Cycle not found");
      return res.json();
    },
  });

  // Step 1: load the base submission to get the id
  const { data: baseSubmission, isLoading: loadingBase } = useQuery<{ id: string; status: string } | null>({
    queryKey: ["my-submission-base", cycleId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/my-submission`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load submission");
      return res.json();
    },
    enabled: Boolean(cycleId),
  });

  // Step 2: load BSC detail
  const { data: bsc, isLoading: loadingBSC } = useQuery<BSCSubmission | null>({
    queryKey: ["bsc-submission", baseSubmission?.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/submissions/${baseSubmission!.id}/bsc`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load BSC");
      return res.json();
    },
    enabled: Boolean(baseSubmission?.id),
  });

  const isLoading = loadingBase || (Boolean(baseSubmission?.id) && loadingBSC);

  // Pre-fill local state from server data
  useEffect(() => {
    if (!bsc) return;
    setSelfRatings(bsc.self_json ?? {});
    setAgreedRatings(bsc.agreed_json ?? {});
    setEmployeeComments(bsc.employee_comments ?? "");
    setManagerComments(bsc.manager_comments ?? "");
    setDevelopmentPlan(bsc.development_plan ?? "");
  }, [bsc?.id]);

  // ── Derived state ─────────────────────────────────────────────────────────────

  const scorecard = bsc?.scorecard ?? [];
  const perspectives = useMemo(() => [...new Set(scorecard.map(k => k.perspective))], [scorecard]);

  const stage = bsc?.stage ?? 0;
  const isClosed = cycle?.status === "closed" || cycle?.status === "archived";

  // Permissions by stage & role:
  // Employee can edit self ratings + employee comments when stage === 0 and targets accepted (or not set)
  // Manager (or HR) can edit agreed ratings when stage === 1
  // HC finalizes when stage === 2
  const targetOk = !bsc?.target_status || bsc.target_status === "not_set" || bsc.target_status === "accepted";
  const isManager = bsc?.manager_id ? user?.ID === bsc.manager_id : false;
  const canEditSelf    = !isHR && stage === 0 && !isClosed && targetOk;
  const canEditManager = (isHR || isManager) && stage === 1 && !isClosed;
  const canEditHC      = isHR && stage === 2 && !isClosed;

  const allSelfRated = scorecard.length > 0 && scorecard.every(k => (selfRatings[k.id] ?? 0) > 0);
  const allAgreedRated = scorecard.length > 0 && scorecard.every(k => (agreedRatings[k.id] ?? 0) > 0);

  // Compute weighted scores
  const computeScore = (ratings: Record<string, number>) => {
    if (scorecard.length === 0) return undefined;
    const total = scorecard.reduce((acc, k) => {
      const r = ratings[k.id] ?? 0;
      return acc + r * k.weight;
    }, 0);
    const totalWeight = scorecard.reduce((acc, k) => acc + k.weight, 0);
    return totalWeight > 0 ? total / totalWeight : undefined;
  };

  const computedSelfScore = computeScore(selfRatings);
  const computedAgreedScore = computeScore(agreedRatings);

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function doAction(action: string, extraPayload: Record<string, unknown> = {}) {
    if (!bsc) return;
    setActing(true);
    try {
      const res = await fetch(`${BASE}/api/v1/appraisal/submissions/${bsc.id}/bsc-action`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          self_json: selfRatings,
          agreed_json: agreedRatings,
          employee_comments: employeeComments,
          manager_comments: managerComments,
          development_plan: developmentPlan,
          ...extraPayload,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? err?.message ?? "Action failed");
      }
      queryClient.invalidateQueries({ queryKey: ["bsc-submission", bsc.id] });
      queryClient.invalidateQueries({ queryKey: ["my-submission-base", cycleId] });
      queryClient.invalidateQueries({ queryKey: ["appraisal-cycles"] });

      const labels: Record<string, string> = {
        "save-self": "Draft saved",
        "submit-self": "Submitted to manager",
        "save-manager": "Manager scores saved",
        "submit-manager": "Submitted to HR / Human Capital",
        "return-to-employee": "Returned to employee",
        "finalize": "Appraisal finalised",
        "return-to-manager": "Returned to manager",
      };
      toast({ title: labels[action] ?? "Done" });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  }

  function handleSubmitSelf() {
    if (!allSelfRated) {
      toast({ title: "Incomplete", description: "Please rate all KPIs before submitting.", variant: "destructive" });
      return;
    }
    if (!confirm("Submit your self-assessment? You cannot edit after submitting.")) return;
    doAction("submit-self");
  }

  function handleSubmitManager() {
    if (!allAgreedRated) {
      toast({ title: "Incomplete", description: "Please set agreed ratings for all KPIs.", variant: "destructive" });
      return;
    }
    if (!confirm("Submit to Human Capital? This will lock the agreed scores.")) return;
    doAction("submit-manager");
  }

  function handleFinalize() {
    if (!confirm("Finalise this appraisal? This cannot be undone.")) return;
    doAction("finalize");
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  // ── HR redirect (non-employee) — only if they don't have a submission themselves ──
  if (isHR && !bsc) {
    return (
      <div className="max-w-[900px] mx-auto space-y-6">
        <Link href="/appraisal" className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          <ChevronLeft className="w-4 h-4" /> Back to Appraisals
        </Link>
        {cycle && (
          <div className="rounded-2xl p-8 text-center" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <Settings2 className="w-10 h-10 mx-auto mb-3" style={{ color: "#FF6600" }} />
            <h2 className="text-[16px] font-bold mb-1" style={{ color: "var(--pg-text-1)" }}>{cycle.title}</h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--pg-text-3)" }}>You have HR access. Manage this cycle below.</p>
            <Link href={`/appraisal/${cycleId}/manage`}
                  className="inline-flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
              <Settings2 className="w-3.5 h-3.5" /> Manage Cycle
            </Link>
          </div>
        )}
      </div>
    );
  }

  // ── Phase gate — employees cannot see this during target-setting phase ───────
  if (!isHR && !isDeptHead && cycle?.status === "open" && cycle?.phase === "target") {
    return (
      <div className="max-w-[900px] mx-auto space-y-4">
        <Link href="/appraisal" className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl text-center"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Lock className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Appraisal not yet open for submissions
          </p>
          <p className="text-[13px] mt-2 max-w-sm" style={{ color: "var(--pg-text-3)" }}>
            HR and your department head are currently setting targets for your team.
            You will be notified when you can complete your self-assessment.
          </p>
          {cycle && (
            <p className="text-[11px] mt-4 px-3 py-1.5 rounded-xl font-medium"
               style={{ background: "#fffbeb", color: "#d97706" }}>
              {cycle.title} · Target Setting Phase
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── No submission / not open ──────────────────────────────────────────────────
  if (!bsc && cycle?.status !== "open") {
    return (
      <div className="max-w-[900px] mx-auto space-y-4">
        <Link href="/appraisal" className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Lock className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
            {isClosed ? "This appraisal cycle is closed." : "This cycle is not yet open."}
          </p>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  const bandColor = bsc?.band ? (BAND_COLORS[bsc.band] ?? "#6b7280") : undefined;

  return (
    <div className="max-w-[1040px] mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/appraisal" className="flex items-center gap-1.5 text-[12px] mb-2" style={{ color: "var(--pg-text-3)" }}>
            <ChevronLeft className="w-3.5 h-3.5" /> All Appraisals
          </Link>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            {cycle?.title ?? "BSC Appraisal"}
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Balanced Scorecard Self-Assessment
            {bsc?.reviewer_name && ` · Reviewer: ${bsc.reviewer_name}`}
          </p>
        </div>

        {/* Band badge */}
        {bsc?.band && bandColor && (
          <div className="rounded-2xl overflow-hidden shrink-0" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="h-[3px]" style={{ background: bandColor }} />
            <div className="px-4 py-2.5 flex items-center gap-2">
              <Award className="w-4 h-4" style={{ color: bandColor }} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Performance Band</p>
                <p className="text-[14px] font-bold" style={{ color: bandColor }}>{bsc.band}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Stage Rail ── */}
      <StageRail stage={stage} />

      {/* ── Score metric cards ── */}
      {(bsc?.self_score != null || bsc?.manager_score != null || computedSelfScore != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ScoreCard label="Self Score" value={computedSelfScore ?? bsc?.self_score} color="#FF6600" />
          {(computedAgreedScore != null || bsc?.manager_score != null) && (
            <ScoreCard label="Agreed Score" value={computedAgreedScore ?? bsc?.manager_score} color="#059669" />
          )}
        </div>
      )}

      {/* ── Status banner ── */}
      {stage > 0 && (
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl"
             style={{
               background: stage === 3 ? "#ecfdf5" : "#fff7f0",
               border: `1px solid ${stage === 3 ? "#a7f3d0" : "#fed7aa"}`,
             }}>
          {stage === 3
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            : <Clock className="w-5 h-5 text-orange-600 shrink-0" />}
          <div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              {stage === 3 ? "Appraisal finalised — all stages complete." :
               stage === 2 ? "Awaiting Human Capital review." :
               stage === 1 ? "Self-assessment submitted. Your line manager is reviewing." :
               "In progress — self-assessment stage."}
            </p>
            {bsc?.self_submitted_at && (
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                Self submitted {new Date(bsc.self_submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Progress bar (self stage only) ── */}
      {canEditSelf && scorecard.length > 0 && (() => {
        const rated = scorecard.filter(k => (selfRatings[k.id] ?? 0) > 0).length;
        const pct = Math.round((rated / scorecard.length) * 100);
        return (
          <div className="px-5 py-3 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>Progress — {rated}/{scorecard.length} KPIs rated</p>
              <p className="text-[12px] font-bold" style={{ color: pct === 100 ? "#059669" : "#FF6600" }}>{pct}%</p>
            </div>
            <div className="h-2 rounded-full" style={{ background: "var(--pg-muted-bg)" }}>
              <div className="h-2 rounded-full transition-all duration-500"
                   style={{ width: `${pct}%`, background: pct === 100 ? "#059669" : "linear-gradient(90deg,#FF6600,#7c3aed)" }} />
            </div>
          </div>
        );
      })()}

      {/* ── Target Review — employee accept/reject when targets are 'set' ── */}
      {bsc?.target_status === "set" && !isHR && scorecard.length > 0 && (
        <TargetReviewBanner submissionId={bsc.id} onAction={() => queryClient.invalidateQueries({ queryKey: ["bsc-submission", bsc.id] })} />
      )}
      {bsc?.target_status === "accepted" && !isHR && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
             style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-[13px] font-medium text-emerald-800">You have accepted these targets. You can now complete your self-assessment.</p>
        </div>
      )}
      {bsc?.target_status === "rejected" && !isHR && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
             style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-[13px] font-medium text-red-700">You rejected these targets. Your manager has been notified and will revise them.</p>
        </div>
      )}
      {bsc?.target_status === "set" && isHR && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
             style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-[13px] font-medium text-amber-800">Waiting for employee to review and accept their targets.</p>
        </div>
      )}

      {/* ── BSC Scorecard — empty state when no KPIs set yet ── */}
      {scorecard.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl text-center"
             style={{ background: "var(--pg-card)", border: "1px dashed var(--pg-card-border)" }}>
          <ClipboardList className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
            No KPIs set yet
          </p>
          <p className="text-[12px] mt-1.5 max-w-xs" style={{ color: "var(--pg-text-3)" }}>
            Your line manager has not set your individual KPI scorecard yet.
            You will be notified when your targets are ready to review.
          </p>
        </div>
      )}

      {/* ── BSC Scorecard ── */}
      <div className="space-y-5">
        {perspectives.map(persp => {
          const kpis = scorecard.filter(k => k.perspective === persp).sort((a, b) => a.seq - b.seq);
          const color = perspectiveColor(persp);
          const perspWeight = kpis.reduce((s, k) => s + k.weight, 0);

          return (
            <div key={persp} className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              {/* Perspective header */}
              <div className="h-[3px]" style={{ background: color }} />
              <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <p className="text-[13px] font-bold" style={{ color }}>{persp}</p>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: `${color}18`, color }}>
                  {Math.round(perspWeight * 100)}% weight
                </span>
              </div>

              {/* KPI table header */}
              <div className="grid gap-0" style={{ gridTemplateColumns: "2fr 2fr 1fr 120px 120px" }}>
                {["Objective", "Measure / KPI", "Target", "Self Rating", "Agreed Rating"].map(h => (
                  <div key={h} className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
                       style={{ color: "var(--pg-text-3)", borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}>
                    {h}
                  </div>
                ))}
              </div>

              {/* KPI rows */}
              {kpis.map((kpi, idx) => {
                const selfVal = selfRatings[kpi.id] ?? 0;
                const agreedVal = agreedRatings[kpi.id] ?? 0;
                const isLast = idx === kpis.length - 1;

                return (
                  <div key={kpi.id}
                       className="grid transition-colors"
                       style={{ gridTemplateColumns: "2fr 2fr 1fr 120px 120px",
                                borderBottom: !isLast ? "1px solid var(--pg-row-border)" : undefined }}>
                    {/* Objective */}
                    <div className="px-4 py-3.5">
                      <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--pg-text-1)" }}>{kpi.objective}</p>
                      <p className="text-[10px] mt-0.5 font-medium" style={{ color }}>
                        {Math.round(kpi.weight * 100)}% weight
                      </p>
                    </div>

                    {/* Measure */}
                    <div className="px-4 py-3.5 flex items-start">
                      <p className="text-[12px] leading-snug" style={{ color: "var(--pg-text-2)" }}>{kpi.measure}</p>
                    </div>

                    {/* Target */}
                    <div className="px-4 py-3.5 flex items-start">
                      <p className="text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}>{kpi.target}</p>
                    </div>

                    {/* Self rating */}
                    <div className="px-3 py-3.5 flex items-center">
                      {canEditSelf ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <button key={n} type="button"
                                      title={RATING_LABELS[n]}
                                      onClick={() => setSelfRatings(prev => ({ ...prev, [kpi.id]: n }))}
                                      className="w-7 h-7 rounded-lg text-[11px] font-bold border transition-all"
                                      style={{
                                        borderColor: selfVal === n ? RATING_COLORS[n] : "var(--pg-card-border)",
                                        background: selfVal === n ? RATING_COLORS[n] : "transparent",
                                        color: selfVal === n ? "white" : "var(--pg-text-4)",
                                        transform: selfVal === n ? "scale(1.1)" : undefined,
                                      }}>
                                {n}
                              </button>
                            ))}
                          </div>
                          {selfVal > 0 && (
                            <span className="text-[9px] font-medium" style={{ color: RATING_COLORS[selfVal] }}>
                              {RATING_LABELS[selfVal]}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div>
                          {selfVal > 0 ? (
                            <>
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[12px] font-bold text-white"
                                    style={{ background: RATING_COLORS[selfVal] }}>
                                {selfVal}
                              </span>
                              <p className="text-[9px] mt-0.5 font-medium" style={{ color: RATING_COLORS[selfVal] }}>
                                {RATING_LABELS[selfVal]}
                              </p>
                            </>
                          ) : (
                            <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>—</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Agreed rating */}
                    <div className="px-3 py-3.5 flex items-center"
                         style={{ background: canEditManager ? "rgba(124,58,237,0.03)" : undefined }}>
                      {canEditManager ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <button key={n} type="button"
                                      title={RATING_LABELS[n]}
                                      onClick={() => setAgreedRatings(prev => ({ ...prev, [kpi.id]: n }))}
                                      className="w-7 h-7 rounded-lg text-[11px] font-bold border transition-all"
                                      style={{
                                        borderColor: agreedVal === n ? "#7c3aed" : "var(--pg-card-border)",
                                        background: agreedVal === n ? "#7c3aed" : "transparent",
                                        color: agreedVal === n ? "white" : "var(--pg-text-4)",
                                        transform: agreedVal === n ? "scale(1.1)" : undefined,
                                      }}>
                                {n}
                              </button>
                            ))}
                          </div>
                          {agreedVal > 0 && (
                            <span className="text-[9px] font-medium" style={{ color: "#7c3aed" }}>
                              {RATING_LABELS[agreedVal]}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div>
                          {agreedVal > 0 ? (
                            <>
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[12px] font-bold text-white"
                                    style={{ background: "#7c3aed" }}>
                                {agreedVal}
                              </span>
                              <p className="text-[9px] mt-0.5 font-medium" style={{ color: "#7c3aed" }}>
                                {RATING_LABELS[agreedVal]}
                              </p>
                            </>
                          ) : (
                            <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>—</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── Comments & Development Plan ── */}
      {scorecard.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Employee Comments */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="h-[3px]" style={{ background: "#FF6600" }} />
            <div className="p-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--pg-text-3)" }}>
                Employee Comments
              </label>
              <textarea
                value={employeeComments}
                rows={4}
                disabled={!canEditSelf}
                onChange={e => setEmployeeComments(e.target.value)}
                placeholder={canEditSelf ? "Share your reflections, achievements, and challenges…" : "No comments provided."}
                className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none disabled:opacity-60"
                style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
              />
            </div>
          </div>

          {/* Development Plan */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="h-[3px]" style={{ background: "#1d4ed8" }} />
            <div className="p-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--pg-text-3)" }}>
                Development Plan
              </label>
              <textarea
                value={developmentPlan}
                rows={4}
                disabled={!canEditSelf && !canEditManager}
                onChange={e => setDevelopmentPlan(e.target.value)}
                placeholder={(canEditSelf || canEditManager) ? "Outline development goals and training needs…" : "No development plan provided."}
                className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none disabled:opacity-60"
                style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
              />
            </div>
          </div>

          {/* Manager Comments */}
          {(stage >= 1 || canEditManager) && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <div className="h-[3px]" style={{ background: "#7c3aed" }} />
              <div className="p-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--pg-text-3)" }}>
                  Manager Comments
                </label>
                <textarea
                  value={managerComments}
                  rows={4}
                  disabled={!canEditManager}
                  onChange={e => setManagerComments(e.target.value)}
                  placeholder={canEditManager ? "Provide your assessment and feedback…" : "Awaiting manager comments."}
                  className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none disabled:opacity-60"
                  style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
                />
              </div>
            </div>
          )}

          {/* HC Comments (read-only) */}
          {bsc?.hc_comments && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <div className="h-[3px]" style={{ background: "#059669" }} />
              <div className="p-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--pg-text-3)" }}>
                  Human Capital Comments
                </label>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--pg-text-2)" }}>{bsc.hc_comments}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Action Bar ── */}
      {scorecard.length > 0 && (
        <div className="flex items-center justify-between pt-5 pb-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
          <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
            {canEditSelf && !allSelfRated && `${scorecard.filter(k => !(selfRatings[k.id] ?? 0)).length} KPI${scorecard.filter(k => !(selfRatings[k.id] ?? 0)).length !== 1 ? "s" : ""} remaining`}
            {canEditSelf && allSelfRated && "All KPIs rated — ready to submit!"}
            {canEditManager && !allAgreedRated && `${scorecard.filter(k => !(agreedRatings[k.id] ?? 0)).length} agreed rating${scorecard.filter(k => !(agreedRatings[k.id] ?? 0)).length !== 1 ? "s" : ""} remaining`}
            {canEditManager && allAgreedRated && "All agreed ratings set — ready to submit to HC!"}
            {!canEditSelf && !canEditManager && !canEditHC && stage < 3 && "Awaiting next stage."}
            {stage === 3 && "Appraisal complete."}
          </p>

          <div className="flex items-center gap-2">
            {/* Self stage actions */}
            {canEditSelf && (
              <>
                <button
                  onClick={() => doAction("save-self")}
                  disabled={acting}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-50"
                  style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)", border: "1px solid var(--pg-card-border)" }}>
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Draft
                </button>
                <button
                  onClick={handleSubmitSelf}
                  disabled={acting || !allSelfRated}
                  className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50"
                  style={{ background: allSelfRated ? "linear-gradient(135deg,#059669,#047857)" : "linear-gradient(135deg,#FF6600,#E05500)" }}>
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Submit to Manager
                </button>
              </>
            )}

            {/* Manager stage actions */}
            {canEditManager && (
              <>
                <button
                  onClick={() => doAction("return-to-employee")}
                  disabled={acting}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-50"
                  style={{ background: "var(--pg-muted-bg)", color: "#dc2626", border: "1px solid #fecaca" }}>
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Return to Employee
                </button>
                <button
                  onClick={() => doAction("save-manager")}
                  disabled={acting}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-50"
                  style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)", border: "1px solid var(--pg-card-border)" }}>
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button
                  onClick={handleSubmitManager}
                  disabled={acting || !allAgreedRated}
                  className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Submit to HC
                </button>
              </>
            )}

            {/* HC stage actions */}
            {canEditHC && (
              <>
                <button
                  onClick={() => doAction("return-to-manager")}
                  disabled={acting}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-50"
                  style={{ background: "var(--pg-muted-bg)", color: "#dc2626", border: "1px solid #fecaca" }}>
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Return to Manager
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={acting}
                  className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Finalise
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
