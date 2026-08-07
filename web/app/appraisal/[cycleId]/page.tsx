"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { usePosition, roleFamily } from "@/lib/position";
import {
  ChevronLeft, CheckCircle2, AlertCircle, Clock, Save,
  Send, Lock, Star, MessageSquare, Loader2, ChevronRight,
  BarChart2, Users, Settings2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Cycle = {
  id: string; title: string; description: string; status: string;
  self_deadline?: string; manager_deadline?: string;
  question_count: number; submission_count: number;
  self_submitted_count: number; completed_count: number;
};

type Question = {
  id: string; cycle_id: string; category: string; text: string;
  description: string; max_score: number; weight: number; order_index: number;
};

type Response = { question_id: string; score: number; comment: string; scorer_type: string };

type SubmissionDetail = {
  id: string; cycle_id: string; appraisee_id: string; status: string;
  self_score?: number; manager_score?: number;
  self_submitted_at?: string; manager_submitted_at?: string;
  questions: Question[];
  self_responses: Response[];
  manager_responses: Response[];
  reviewer_name?: string;
};

function ScoreSelector({
  value, max, onChange, disabled,
}: { value: number; max: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button key={n} type="button" disabled={disabled}
                onClick={() => onChange(n)}
                className={cn(
                  "w-9 h-9 rounded-xl text-[13px] font-bold border-2 transition-all disabled:cursor-not-allowed",
                  value === n
                    ? "border-blue-500 bg-blue-500 text-white scale-110"
                    : "border-slate-200 dark:border-slate-600 hover:border-blue-300 hover:bg-blue-50"
                )}
                style={value === n ? {} : { color: "var(--pg-text-2)" }}>
          {n}
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}>
          {value}/{max}
        </span>
      )}
    </div>
  );
}

export default function CyclePage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const router      = useRouter();
  const { toast }   = useToast();
  const queryClient = useQueryClient();
  const { user }          = useAuth();
  const { primaryCode }   = usePosition();
  const isHR = roleFamily(primaryCode) === "hr" || roleFamily(primaryCode) === "md";

  const [responses, setResponses]       = useState<Record<string, { score: number; comment: string }>>({});
  const [saving, setSaving]             = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: cycle } = useQuery<Cycle>({
    queryKey: ["cycle", cycleId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Cycle not found");
      return res.json();
    },
  });

  const { data: submission, isLoading } = useQuery<SubmissionDetail | null>({
    queryKey: ["my-submission", cycleId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/my-submission`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load submission");
      return res.json();
    },
    enabled: Boolean(cycleId),
  });

  // Pre-fill responses from saved self_responses
  useEffect(() => {
    if (!submission?.self_responses) return;
    const init: Record<string, { score: number; comment: string }> = {};
    submission.self_responses.forEach(r => { init[r.question_id] = { score: r.score, comment: r.comment }; });
    setResponses(init);
  }, [submission?.id]);

  const questions = submission?.questions ?? [];
  const categories = [...new Set(questions.map(q => q.category))];

  // Set first category as active
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) setActiveCategory(categories[0]);
  }, [categories.length]);

  const visibleQuestions = activeCategory
    ? questions.filter(q => q.category === activeCategory)
    : questions;

  const answeredCount   = Object.values(responses).filter(r => r.score > 0).length;
  const completionPct   = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const isSubmitted     = submission?.status === "self_submitted" || submission?.status === "manager_scoring" || submission?.status === "completed";
  const isClosed        = cycle?.status === "closed" || cycle?.status === "archived";
  const canEdit         = !isSubmitted && !isClosed;

  async function saveDraft() {
    if (!submission) return;
    setSaving(true);
    try {
      const payload = Object.entries(responses).map(([qid, r]) => ({
        question_id: qid, score: r.score, comment: r.comment,
      })).filter(r => r.score > 0);
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/my-submission/responses`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? "Failed to save");
      queryClient.invalidateQueries({ queryKey: ["my-submission", cycleId] });
      toast({ title: "Draft saved" });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function submitSelf() {
    if (answeredCount < questions.length) {
      toast({ title: "Incomplete", description: "Please score all questions before submitting.", variant: "destructive" });
      return;
    }
    if (!confirm("Submit your self-assessment? You cannot edit after submitting.")) return;
    setSubmitting(true);
    try {
      // Save responses first, then submit
      const payload = Object.entries(responses).map(([qid, r]) => ({
        question_id: qid, score: r.score, comment: r.comment,
      })).filter(r => r.score > 0);
      await fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/my-submission/responses`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: payload }),
      });
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/my-submission/submit`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? "Failed to submit");
      queryClient.invalidateQueries({ queryKey: ["my-submission", cycleId] });
      queryClient.invalidateQueries({ queryKey: ["appraisal-cycles"] });
      toast({ title: "Assessment Submitted!", description: "Your self-assessment has been submitted successfully." });
    } catch (e) {
      toast({ title: "Submit failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  // HR redirect banner
  if (isHR) {
    return (
      <div className="max-w-[900px] mx-auto space-y-6">
        <Link href="/appraisal" className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          <ChevronLeft className="w-4 h-4" /> Back to Appraisals
        </Link>
        {cycle && (
          <div className="rounded-2xl p-8 text-center" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <Settings2 className="w-10 h-10 mx-auto mb-3" style={{ color: "#2563eb" }} />
            <h2 className="text-[16px] font-bold mb-1" style={{ color: "var(--pg-text-1)" }}>{cycle.title}</h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--pg-text-3)" }}>You have HR access. Manage this cycle below.</p>
            <div className="flex items-center justify-center gap-3">
              <Link href={`/appraisal/${cycleId}/manage`}
                    className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                <Settings2 className="w-3.5 h-3.5" /> Manage Cycle
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!submission && cycle?.status !== "open") {
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

  return (
    <div className="max-w-[960px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/appraisal" className="flex items-center gap-1.5 text-[12px] mb-2" style={{ color: "var(--pg-text-3)" }}>
            <ChevronLeft className="w-3.5 h-3.5" /> All Appraisals
          </Link>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            {cycle?.title ?? "Self Assessment"}
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {isSubmitted ? "Your assessment has been submitted." : `${answeredCount}/${questions.length} questions answered`}
            {submission?.reviewer_name && ` · Reviewer: ${submission.reviewer_name}`}
          </p>
        </div>
        {isSubmitted && submission?.self_score != null && (
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Your Score</p>
            <p className="text-[28px] font-bold" style={{ color: "#2563eb" }}>{submission.self_score.toFixed(1)}%</p>
            {submission.manager_score != null && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: "var(--pg-text-3)" }}>Manager Score</p>
                <p className="text-[18px] font-bold" style={{ color: "#059669" }}>{submission.manager_score.toFixed(1)}%</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Status banner */}
      {isSubmitted && (
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl"
             style={{ background: submission?.status === "completed" ? "#ecfdf5" : "#eff6ff",
                      border: `1px solid ${submission?.status === "completed" ? "#a7f3d0" : "#bfdbfe"}` }}>
          {submission?.status === "completed"
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            : <Clock className="w-5 h-5 text-blue-600 shrink-0" />}
          <div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              {submission?.status === "completed" ? "Appraisal complete — both scores are in." :
               submission?.status === "manager_scoring" ? "Your manager is reviewing your submission." :
               "Self-assessment submitted. Awaiting manager review."}
            </p>
            {submission?.self_submitted_at && (
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                Submitted {new Date(submission.self_submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Progress bar */}
      {!isSubmitted && questions.length > 0 && (
        <div className="px-5 py-3 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>Progress</p>
            <p className="text-[12px] font-bold" style={{ color: completionPct === 100 ? "#059669" : "#2563eb" }}>{completionPct}%</p>
          </div>
          <div className="h-2 rounded-full" style={{ background: "var(--pg-muted-bg)" }}>
            <div className="h-2 rounded-full transition-all duration-500"
                 style={{ width: `${completionPct}%`, background: completionPct === 100 ? "#059669" : "linear-gradient(90deg,#2563eb,#7c3aed)" }} />
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-4 gap-5">
        {/* Category sidebar */}
        {categories.length > 1 && (
          <div className="xl:col-span-1">
            <div className="rounded-2xl overflow-hidden sticky top-4"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--pg-text-3)" }}>Categories</p>
              </div>
              <div className="p-2">
                {categories.map(cat => {
                  const catQs = questions.filter(q => q.category === cat);
                  const answered = catQs.filter(q => responses[q.id]?.score > 0).length;
                  const done = answered === catQs.length;
                  return (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left transition-all"
                            style={activeCategory === cat
                              ? { background: "linear-gradient(135deg,rgba(37,99,235,0.12),rgba(37,99,235,0.06))", color: "#2563eb" }
                              : { color: "var(--pg-text-2)" }}>
                      <span className="text-[12px] font-medium truncate">{cat}</span>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                                          done ? "text-emerald-600 bg-emerald-50" : "text-slate-500 bg-slate-100")}>
                        {answered}/{catQs.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Questions */}
        <div className={categories.length > 1 ? "xl:col-span-3" : "xl:col-span-4"}>
          <div className="space-y-4">
            {visibleQuestions.map((q, idx) => {
              const resp = responses[q.id] ?? { score: 0, comment: "" };
              const managerResp = submission?.manager_responses?.find(r => r.question_id === q.id);
              return (
                <div key={q.id} className="rounded-2xl overflow-hidden"
                     style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                  {/* Question header */}
                  <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
                            style={{ background: resp.score > 0 ? "#059669" : "#94a3b8" }}>
                        {resp.score > 0 ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--pg-text-1)" }}>{q.text}</p>
                        {q.description && (
                          <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-3)" }}>{q.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                                style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>{q.category}</span>
                          <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                            Weight: {q.weight}x · Max: {q.max_score}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Self scoring */}
                  <div className="px-5 py-4 space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold mb-2" style={{ color: "var(--pg-text-2)" }}>Your Score</p>
                      <ScoreSelector value={resp.score} max={q.max_score}
                                     onChange={v => setResponses(prev => ({ ...prev, [q.id]: { ...prev[q.id], score: v } }))}
                                     disabled={!canEdit} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                        Comment <span style={{ color: "var(--pg-text-4)" }}>(optional)</span>
                      </label>
                      <textarea value={resp.comment} rows={2} disabled={!canEdit}
                                onChange={e => setResponses(prev => ({ ...prev, [q.id]: { ...prev[q.id], comment: e.target.value } }))}
                                placeholder="Add context or justification…"
                                className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none disabled:opacity-60"
                                style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                    </div>
                  </div>

                  {/* Manager score (read-only, shown after completion) */}
                  {managerResp && (
                    <div className="px-5 py-3 border-t" style={{ borderColor: "var(--pg-row-border)", background: "var(--pg-muted-bg)" }}>
                      <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#7c3aed" }}>Manager Score</p>
                      <ScoreSelector value={managerResp.score} max={q.max_score} onChange={() => {}} disabled={true} />
                      {managerResp.comment && (
                        <p className="text-[11px] mt-2 italic" style={{ color: "var(--pg-text-3)" }}>{managerResp.comment}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          {canEdit && questions.length > 0 && (
            <div className="flex items-center justify-between mt-5 pt-5" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
              <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                {answeredCount < questions.length
                  ? `${questions.length - answeredCount} question${questions.length - answeredCount > 1 ? "s" : ""} remaining`
                  : "All questions answered — ready to submit!"}
              </p>
              <div className="flex gap-2">
                <button onClick={saveDraft} disabled={saving || answeredCount === 0}
                        className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-50"
                        style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Draft
                </button>
                <button onClick={submitSelf} disabled={submitting || answeredCount < questions.length}
                        className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50"
                        style={{ background: answeredCount === questions.length ? "linear-gradient(135deg,#059669,#047857)" : "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Submit Assessment
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
