"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Send, Save, CheckCircle2, Star, Loader2,
  User, MessageSquare, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Question = {
  id: string; category: string; text: string; description: string;
  max_score: number; weight: number;
};

type Response = { question_id: string; score: number; comment: string; scorer_type: string };

type SubmissionDetail = {
  id: string; cycle_id: string; cycle_title: string;
  appraisee_id: string; appraisee_name: string; appraisee_email: string;
  status: string; self_score?: number; manager_score?: number;
  questions: Question[];
  self_responses: Response[];
  manager_responses: Response[];
};

function ScoreSelector({ value, max, onChange, disabled }: { value: number; max: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button key={n} type="button" disabled={disabled}
                onClick={() => onChange(n)}
                className={cn(
                  "w-9 h-9 rounded-xl text-[13px] font-bold border-2 transition-all disabled:cursor-not-allowed",
                  value === n
                    ? "border-violet-500 bg-violet-500 text-white scale-110"
                    : "border-slate-200 dark:border-slate-600 hover:border-violet-300 hover:bg-violet-50"
                )}
                style={value === n ? {} : { color: "var(--pg-text-2)" }}>
          {n}
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}>{value}/{max}</span>
      )}
    </div>
  );
}

export default function ManagerReviewPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const router           = useRouter();
  const { toast }        = useToast();
  const queryClient      = useQueryClient();

  const [responses, setResponses] = useState<Record<string, { score: number; comment: string }>>({});
  const [saving, setSaving]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: detail, isLoading } = useQuery<SubmissionDetail>({
    queryKey: ["submission-detail", submissionId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/submissions/${submissionId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Submission not found");
      return res.json();
    },
  });

  // Pre-fill from saved manager responses
  useEffect(() => {
    if (!detail?.manager_responses) return;
    const init: Record<string, { score: number; comment: string }> = {};
    detail.manager_responses.forEach(r => { init[r.question_id] = { score: r.score, comment: r.comment }; });
    setResponses(init);
  }, [detail?.id]);

  const questions = detail?.questions ?? [];
  const categories = [...new Set(questions.map(q => q.category))];
  useEffect(() => { if (categories.length > 0 && !activeCategory) setActiveCategory(categories[0]); }, [categories.length]);

  const visibleQuestions = activeCategory ? questions.filter(q => q.category === activeCategory) : questions;
  const answeredCount = Object.values(responses).filter(r => r.score > 0).length;
  const completionPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const isCompleted   = detail?.status === "completed";

  async function saveDraft() {
    if (!detail) return;
    setSaving(true);
    try {
      const payload = Object.entries(responses).map(([qid, r]) => ({
        question_id: qid, score: r.score, comment: r.comment,
      })).filter(r => r.score > 0);
      const res = await fetch(`${BASE}/api/v1/appraisal/submissions/${submissionId}/manager-responses`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? "Save failed");
      queryClient.invalidateQueries({ queryKey: ["submission-detail", submissionId] });
      queryClient.invalidateQueries({ queryKey: ["pending-reviews"] });
      toast({ title: "Draft saved" });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function submitReview() {
    if (answeredCount < questions.length) {
      toast({ title: "Incomplete", description: "Score all questions before submitting.", variant: "destructive" });
      return;
    }
    if (!confirm("Submit your review? This cannot be undone.")) return;
    setSubmitting(true);
    try {
      // Save responses first
      const payload = Object.entries(responses).map(([qid, r]) => ({
        question_id: qid, score: r.score, comment: r.comment,
      })).filter(r => r.score > 0);
      await fetch(`${BASE}/api/v1/appraisal/submissions/${submissionId}/manager-responses`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: payload }),
      });
      const res = await fetch(`${BASE}/api/v1/appraisal/submissions/${submissionId}/manager-submit`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? "Submit failed");
      queryClient.invalidateQueries({ queryKey: ["submission-detail", submissionId] });
      queryClient.invalidateQueries({ queryKey: ["pending-reviews"] });
      toast({ title: "Review Submitted!", description: "Your assessment has been recorded." });
      router.push("/appraisal/review");
    } catch (e) {
      toast({ title: "Submit failed", description: (e as Error).message, variant: "destructive" });
    } finally { setSubmitting(false); }
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="max-w-[960px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/appraisal/review" className="flex items-center gap-1.5 text-[12px] mb-2" style={{ color: "var(--pg-text-3)" }}>
            <ChevronLeft className="w-3.5 h-3.5" /> Team Reviews
          </Link>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Manager Review
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {detail.cycle_title}
          </p>
        </div>
        {detail.manager_score != null && (
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Your Score</p>
            <p className="text-[28px] font-bold" style={{ color: "#7c3aed" }}>{detail.manager_score.toFixed(1)}%</p>
          </div>
        )}
      </div>

      {/* Employee info card */}
      <div className="flex items-center gap-4 px-5 py-4 rounded-2xl"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
             style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
          {detail.appraisee_name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>{detail.appraisee_name}</p>
          <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>{detail.appraisee_email}</p>
        </div>
        {detail.self_score != null && (
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Self Score</p>
            <p className="text-[18px] font-bold" style={{ color: "#FF6600" }}>{detail.self_score.toFixed(1)}%</p>
          </div>
        )}
      </div>

      {isCompleted && (
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl"
             style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Review submitted — appraisal complete.
          </p>
        </div>
      )}

      {/* Progress */}
      {!isCompleted && (
        <div className="px-5 py-3 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>Progress</p>
            <p className="text-[12px] font-bold" style={{ color: completionPct === 100 ? "#059669" : "#7c3aed" }}>{completionPct}%</p>
          </div>
          <div className="h-2 rounded-full" style={{ background: "var(--pg-muted-bg)" }}>
            <div className="h-2 rounded-full transition-all duration-500"
                 style={{ width: `${completionPct}%`, background: completionPct === 100 ? "#059669" : "linear-gradient(90deg,#7c3aed,#FF6600)" }} />
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
                              ? { background: "linear-gradient(135deg,rgba(124,58,237,0.12),rgba(124,58,237,0.06))", color: "#7c3aed" }
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
              const managerResp = responses[q.id] ?? { score: 0, comment: "" };
              const selfResp    = detail.self_responses?.find(r => r.question_id === q.id);
              return (
                <div key={q.id} className="rounded-2xl overflow-hidden"
                     style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                  {/* Question header */}
                  <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
                            style={{ background: managerResp.score > 0 ? "#7c3aed" : "#94a3b8" }}>
                        {managerResp.score > 0 ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--pg-text-1)" }}>{q.text}</p>
                        {q.description && <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-3)" }}>{q.description}</p>}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>{q.category}</span>
                          <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>Max: {q.max_score} · Weight: {q.weight}×</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Employee's self-score (read-only reference) */}
                  {selfResp && (
                    <div className="px-5 py-3" style={{ background: "#fff7f0", borderBottom: "1px solid #fed7aa" }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#FF6600" }}>
                        Employee Self-Score
                      </p>
                      <div className="flex items-center gap-3">
                        <ScoreSelector value={selfResp.score} max={q.max_score} onChange={() => {}} disabled={true} />
                        {selfResp.comment && (
                          <p className="text-[11px] italic flex-1" style={{ color: "#E05500" }}>&ldquo;{selfResp.comment}&rdquo;</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Manager scoring */}
                  <div className="px-5 py-4 space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold mb-2" style={{ color: "#7c3aed" }}>Your Score</p>
                      <ScoreSelector value={managerResp.score} max={q.max_score}
                                     onChange={v => setResponses(prev => ({ ...prev, [q.id]: { ...prev[q.id], score: v } }))}
                                     disabled={isCompleted} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                        Comment <span style={{ color: "var(--pg-text-4)" }}>(optional)</span>
                      </label>
                      <textarea value={managerResp.comment} rows={2} disabled={isCompleted}
                                onChange={e => setResponses(prev => ({ ...prev, [q.id]: { ...prev[q.id], comment: e.target.value } }))}
                                placeholder="Feedback and observations…"
                                className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none disabled:opacity-60"
                                style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          {!isCompleted && questions.length > 0 && (
            <div className="flex items-center justify-between mt-5 pt-5" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
              <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                {answeredCount < questions.length
                  ? `${questions.length - answeredCount} question${questions.length - answeredCount > 1 ? "s" : ""} remaining`
                  : "All scored — ready to submit!"}
              </p>
              <div className="flex gap-2">
                <button onClick={saveDraft} disabled={saving || answeredCount === 0}
                        className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-50"
                        style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Draft
                </button>
                <button onClick={submitReview} disabled={submitting || answeredCount < questions.length}
                        className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50"
                        style={{ background: answeredCount === questions.length ? "linear-gradient(135deg,#7c3aed,#6d28d9)" : "linear-gradient(135deg,#94a3b8,#64748b)" }}>
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Submit Review
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
