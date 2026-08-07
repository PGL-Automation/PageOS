"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Plus, Trash2, Edit3, Check, X, AlertCircle,
  Play, Lock, Users, ClipboardList, BarChart2, User, Save,
  RefreshCw, GripVertical, Loader2, ChevronRight, UserCheck,
  CheckCircle2, Clock, Star, Settings2,
} from "lucide-react";
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

type Assignment = {
  id: string; cycle_id: string;
  appraisee_id: string; appraisee_name: string; appraisee_email: string;
  reviewer_id: string; reviewer_name: string;
};

type SkippedUser = {
  user_id: string; user_name: string; position_title: string;
  reason: "top_of_hierarchy" | "no_holder";
};

type AutoAssignResult = {
  assigned: number;
  skipped: SkippedUser[];
};

type SubmissionRow = {
  id: string; appraisee_name: string; appraisee_email: string;
  reviewer_name?: string; status: string;
  self_score?: number; manager_score?: number;
  self_submitted_at?: string; manager_submitted_at?: string;
};

type UserOption = {
  user_id: string; display_name: string; email: string;
  assignments: { position_title: string; subsidiary_name: string }[];
};

async function apiCall(path: string, method = "GET", body?: object) {
  const res = await fetch(`${BASE}/api/v1/appraisal${path}`, {
    method, credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message ?? err.error?.message ?? "Request failed");
  }
  return res.json();
}

function statusLabel(s: string) {
  switch (s) {
    case "pending":          return { label: "Not started",       color: "#94a3b8", bg: "#f1f5f9" };
    case "self_draft":       return { label: "In progress",       color: "#d97706", bg: "#fffbeb" };
    case "self_submitted":   return { label: "Self submitted",    color: "#2563eb", bg: "#eff6ff" };
    case "manager_scoring":  return { label: "Under review",      color: "#7c3aed", bg: "#f5f3ff" };
    case "completed":        return { label: "Completed",         color: "#059669", bg: "#ecfdf5" };
    default:                 return { label: s,                   color: "#64748b", bg: "#f1f5f9" };
  }
}

// ── Question form ──────────────────────────────────────────────────────────────

type QFormState = {
  category: string; text: string; description: string;
  max_score: number; weight: number; order_index: number;
};

const EMPTY_Q: QFormState = { category: "General", text: "", description: "", max_score: 5, weight: 1.0, order_index: 0 };

function QuestionForm({
  initial, onSave, onCancel, saving,
}: { initial: QFormState; onSave: (q: QFormState) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState<QFormState>(initial);
  const f = (k: keyof QFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: ["max_score","weight","order_index"].includes(k) ? Number(e.target.value) : e.target.value }));

  const CATEGORIES = ["General", "Technical Skills", "Leadership", "Collaboration", "Communication", "Delivery", "Values"];

  return (
    <div className="px-4 py-4 space-y-3 rounded-xl" style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Question Text *</label>
          <textarea value={form.text} onChange={f("text")} rows={2} required
                    placeholder="e.g. Describe how you handled a complex challenge this period…"
                    className="w-full px-3 py-2 rounded-lg text-[13px] outline-none resize-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Category</label>
          <select value={form.category} onChange={f("category")}
                  className="w-full h-9 px-2 rounded-lg text-[12px] outline-none appearance-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Max Score</label>
          <input type="number" min={1} max={10} value={form.max_score} onChange={f("max_score")}
                 className="w-full h-9 px-2 rounded-lg text-[12px] outline-none"
                 style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Weight (×)</label>
          <input type="number" min={0.1} max={5} step={0.5} value={form.weight} onChange={f("weight")}
                 className="w-full h-9 px-2 rounded-lg text-[12px] outline-none"
                 style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Description (hint)</label>
          <input value={form.description} onChange={f("description")} placeholder="Optional guidance…"
                 className="w-full h-9 px-2 rounded-lg text-[12px] outline-none"
                 style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} type="button"
                className="h-8 px-3 rounded-lg text-[12px] font-medium"
                style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
        <button onClick={() => onSave(form)} disabled={!form.text.trim() || saving}
                className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5 inline mr-1" />Save</>}
        </button>
      </div>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type Tab = "questions" | "reviewers" | "submissions";

export default function CycleManagePage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const { toast }   = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab]         = useState<Tab>("questions");
  const [addingQ, setAddingQ] = useState(false);
  const [editQ, setEditQ]     = useState<Question | null>(null);
  const [savingQ, setSavingQ] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [lastAutoResult, setLastAutoResult] = useState<AutoAssignResult | null>(null);

  // Reviewer assignment state
  const [assignAppraiseeId, setAssignAppraiseeId] = useState("");
  const [assignReviewerId, setAssignReviewerId]   = useState("");
  const [assigningSaving, setAssigningSaving]     = useState(false);

  const { data: cycle } = useQuery<Cycle>({
    queryKey: ["cycle", cycleId],
    queryFn: () => apiCall(`/cycles/${cycleId}`),
  });

  const { data: questions = [], isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["cycle-questions", cycleId],
    queryFn: async () => (await apiCall(`/cycles/${cycleId}/questions`)) ?? [],
  });

  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ["cycle-assignments", cycleId],
    queryFn: async () => (await apiCall(`/cycles/${cycleId}/assignments`)) ?? [],
    enabled: tab === "reviewers",
  });

  const { data: submissions = [], isLoading: subsLoading } = useQuery<SubmissionRow[]>({
    queryKey: ["cycle-submissions", cycleId],
    queryFn: async () => (await apiCall(`/cycles/${cycleId}/submissions`)) ?? [],
    enabled: tab === "submissions",
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["org-users"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/users`, { credentials: "include" });
      if (!res.ok) return [];
      const json = ((await res.json()) ?? []) as Array<{ user_id: string; display_name: string; email: string; assignments?: { position_title: string; subsidiary_name: string }[] }>;
      return json.map(u => ({ ...u, assignments: u.assignments ?? [] }));
    },
    enabled: tab === "reviewers",
  });

  const isDraft = cycle?.status === "draft";
  const isOpen  = cycle?.status === "open";

  async function openCycle() {
    if (questions.length === 0) {
      toast({ title: "Add questions first", description: "A cycle needs at least one question before it can be opened.", variant: "destructive" });
      return;
    }
    try {
      await apiCall(`/cycles/${cycleId}/open`, "POST");
      queryClient.invalidateQueries({ queryKey: ["cycle", cycleId] });
      queryClient.invalidateQueries({ queryKey: ["appraisal-cycles-all"] });
      toast({ title: "Cycle Opened", description: "Employees can now submit self-assessments." });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
  }

  async function closeCycle() {
    if (!confirm("Close this cycle? Scoring will no longer be possible.")) return;
    try {
      await apiCall(`/cycles/${cycleId}/close`, "POST");
      queryClient.invalidateQueries({ queryKey: ["cycle", cycleId] });
      queryClient.invalidateQueries({ queryKey: ["appraisal-cycles-all"] });
      toast({ title: "Cycle Closed" });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
  }

  async function addQuestion(form: QFormState) {
    setSavingQ(true);
    try {
      await apiCall(`/cycles/${cycleId}/questions`, "POST", form);
      queryClient.invalidateQueries({ queryKey: ["cycle-questions", cycleId] });
      queryClient.invalidateQueries({ queryKey: ["cycle", cycleId] });
      setAddingQ(false);
      toast({ title: "Question Added" });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
    finally { setSavingQ(false); }
  }

  async function updateQuestion(q: Question, form: QFormState) {
    setSavingQ(true);
    try {
      await apiCall(`/cycles/${cycleId}/questions/${q.id}`, "PUT", form);
      queryClient.invalidateQueries({ queryKey: ["cycle-questions", cycleId] });
      setEditQ(null);
      toast({ title: "Question Updated" });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
    finally { setSavingQ(false); }
  }

  async function deleteQuestion(id: string) {
    if (!confirm("Delete this question?")) return;
    try {
      await apiCall(`/cycles/${cycleId}/questions/${id}`, "DELETE");
      queryClient.invalidateQueries({ queryKey: ["cycle-questions", cycleId] });
      queryClient.invalidateQueries({ queryKey: ["cycle", cycleId] });
      toast({ title: "Question Deleted" });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
  }

  async function autoAssign() {
    setAutoAssigning(true);
    try {
      const result: AutoAssignResult = await apiCall(`/cycles/${cycleId}/assignments/auto`, "POST");
      setLastAutoResult(result);
      queryClient.invalidateQueries({ queryKey: ["cycle-assignments", cycleId] });
      const skippedCount = result.skipped?.length ?? 0;
      if (skippedCount > 0) {
        toast({
          title: `${result.assigned} assigned — ${skippedCount} need manual assignment`,
          description: "Some positions are top-of-hierarchy or have no current holder. See the warning below.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Auto-assign complete", description: `${result.assigned} reviewer(s) assigned from org chart.` });
      }
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
    finally { setAutoAssigning(false); }
  }

  async function assignReviewer() {
    if (!assignAppraiseeId || !assignReviewerId) {
      toast({ title: "Select both employee and reviewer", variant: "destructive" }); return;
    }
    setAssigningSaving(true);
    try {
      await apiCall(`/cycles/${cycleId}/assignments`, "POST", {
        appraisee_id: assignAppraiseeId, reviewer_id: assignReviewerId,
      });
      queryClient.invalidateQueries({ queryKey: ["cycle-assignments", cycleId] });
      setAssignAppraiseeId(""); setAssignReviewerId("");
      toast({ title: "Reviewer Assigned" });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
    finally { setAssigningSaving(false); }
  }

  async function removeAssignment(id: string) {
    try {
      await apiCall(`/cycles/${cycleId}/assignments/${id}`, "DELETE");
      queryClient.invalidateQueries({ queryKey: ["cycle-assignments", cycleId] });
      toast({ title: "Assignment Removed" });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }); }
  }

  const groupedQuestions = questions.reduce<Record<string, Question[]>>((acc, q) => {
    if (!acc[q.category]) acc[q.category] = [];
    acc[q.category].push(q);
    return acc;
  }, {});

  const selfPct = cycle && cycle.submission_count > 0
    ? Math.round((cycle.self_submitted_count / cycle.submission_count) * 100)
    : 0;
  const completePct = cycle && cycle.submission_count > 0
    ? Math.round((cycle.completed_count / cycle.submission_count) * 100)
    : 0;

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/appraisal/dashboard" className="flex items-center gap-1.5 text-[12px] mb-2" style={{ color: "var(--pg-text-3)" }}>
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Appraisals
          </Link>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            {cycle?.title ?? "Loading…"}
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {cycle?.description || "Appraisal cycle management"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <button onClick={openCycle}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
              <Play className="w-3.5 h-3.5" /> Open Cycle
            </button>
          )}
          {isOpen && (
            <button onClick={closeCycle}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
                    style={{ border: "1px solid #fca5a5", color: "#dc2626" }}>
              <Lock className="w-3.5 h-3.5" /> Close Cycle
            </button>
          )}
        </div>
      </div>

      {/* Progress bar (open cycles) */}
      {isOpen && cycle && cycle.submission_count > 0 && (
        <div className="grid grid-cols-2 gap-4 px-5 py-4 rounded-2xl"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div>
            <div className="flex justify-between mb-1.5">
              <p className="text-[11px] font-semibold" style={{ color: "var(--pg-text-2)" }}>Self-assessment submitted</p>
              <p className="text-[11px] font-bold" style={{ color: "#2563eb" }}>{cycle.self_submitted_count}/{cycle.submission_count}</p>
            </div>
            <div className="h-2 rounded-full" style={{ background: "var(--pg-muted-bg)" }}>
              <div className="h-2 rounded-full" style={{ width: `${selfPct}%`, background: "#2563eb" }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1.5">
              <p className="text-[11px] font-semibold" style={{ color: "var(--pg-text-2)" }}>Fully completed</p>
              <p className="text-[11px] font-bold" style={{ color: "#059669" }}>{cycle.completed_count}/{cycle.submission_count}</p>
            </div>
            <div className="h-2 rounded-full" style={{ background: "var(--pg-muted-bg)" }}>
              <div className="h-2 rounded-full" style={{ width: `${completePct}%`, background: "#059669" }} />
            </div>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        {([
          ["questions", "Questions", ClipboardList, questions.length],
          ["reviewers", "Reviewers", UserCheck, assignments.length],
          ["submissions", "Submissions", BarChart2, cycle?.submission_count ?? 0],
        ] as const).map(([id, label, Icon, count]) => (
          <button key={id} onClick={() => setTab(id as Tab)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-all"
                  style={tab === id
                    ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "white" }
                    : { color: "var(--pg-text-2)" }}>
            <Icon className="w-3.5 h-3.5" />
            {label}
            {count > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={tab === id ? { background: "rgba(255,255,255,0.25)", color: "white" } : { background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Questions tab ────────────────────────────────────────────────── */}
      {tab === "questions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
              {questions.length} question{questions.length !== 1 ? "s" : ""}
              {questions.length > 0 && ` across ${Object.keys(groupedQuestions).length} categories`}
            </p>
            {(isDraft || isOpen) && (
              <button onClick={() => { setAddingQ(true); setEditQ(null); }}
                      disabled={addingQ}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                <Plus className="w-3.5 h-3.5" /> Add Question
              </button>
            )}
          </div>

          {addingQ && (
            <QuestionForm initial={EMPTY_Q}
                          onSave={addQuestion}
                          onCancel={() => setAddingQ(false)}
                          saving={savingQ} />
          )}

          {questionsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
          ) : questions.length === 0 && !addingQ ? (
            <div className="flex flex-col items-center py-12 rounded-2xl" style={{ background: "var(--pg-card)", border: "1px dashed var(--pg-card-border)" }}>
              <ClipboardList className="w-8 h-8 mb-2" style={{ color: "var(--pg-text-4)" }} />
              <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No questions yet.</p>
              <button onClick={() => setAddingQ(true)}
                      className="mt-3 text-[12px] font-medium text-blue-600 hover:underline">
                Add first question →
              </button>
            </div>
          ) : (
            Object.entries(groupedQuestions).map(([cat, qs]) => (
              <div key={cat} className="rounded-2xl overflow-hidden"
                   style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                <div className="flex items-center justify-between px-5 py-3"
                     style={{ borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}>
                  <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--pg-text-2)" }}>{cat}</p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#eff6ff", color: "#2563eb" }}>{qs.length}</span>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                  {qs.map((q, i) => (
                    <div key={q.id}>
                      {editQ?.id === q.id ? (
                        <div className="p-4">
                          <QuestionForm initial={q}
                                        onSave={form => updateQuestion(q, form)}
                                        onCancel={() => setEditQ(null)}
                                        saving={savingQ} />
                        </div>
                      ) : (
                        <div className="flex items-start gap-3 px-5 py-3.5 group">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
                                style={{ background: "#94a3b8" }}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{q.text}</p>
                            {q.description && (
                              <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{q.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>Max: {q.max_score}</span>
                              <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>Weight: {q.weight}×</span>
                            </div>
                          </div>
                          {(isDraft || isOpen) && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditQ(q)}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                                      style={{ color: "var(--pg-text-3)" }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteQuestion(q.id)}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                                      style={{ color: "#dc2626" }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fef2f2"}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Reviewers tab ────────────────────────────────────────────────── */}
      {tab === "reviewers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
              {assignments.length} reviewer assignment{assignments.length !== 1 ? "s" : ""}
            </p>
            {(isDraft || isOpen) && (
              <button onClick={autoAssign} disabled={autoAssigning}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold"
                      style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                {autoAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Auto-assign from Org Chart
              </button>
            )}
          </div>

          {/* Manual assignment form */}
          {(isDraft || isOpen) && (
            <div className="flex items-end gap-3 p-4 rounded-xl" style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
              <div className="flex-1">
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Employee</label>
                <select value={assignAppraiseeId} onChange={e => setAssignAppraiseeId(e.target.value)}
                        className="w-full h-9 px-2 rounded-lg text-[12px] outline-none appearance-none"
                        style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                  <option value="">Select employee…</option>
                  {users.map(u => <option key={u.user_id} value={u.user_id}>{u.display_name} ({u.email})</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Reviewer (Manager)</label>
                <select value={assignReviewerId} onChange={e => setAssignReviewerId(e.target.value)}
                        className="w-full h-9 px-2 rounded-lg text-[12px] outline-none appearance-none"
                        style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                  <option value="">Select reviewer…</option>
                  {users.filter(u => u.user_id !== assignAppraiseeId).map(u => <option key={u.user_id} value={u.user_id}>{u.display_name}</option>)}
                </select>
              </div>
              <button onClick={assignReviewer} disabled={assigningSaving || !assignAppraiseeId || !assignReviewerId}
                      className="h-9 px-4 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                {assigningSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Assign"}
              </button>
            </div>
          )}

          {/* Skipped-users warning — shown after auto-assign when some couldn't be resolved */}
          {lastAutoResult && lastAutoResult.skipped && lastAutoResult.skipped.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: "1px solid #fde68a" }}>
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-amber-800">
                    {lastAutoResult.skipped.length} employee{lastAutoResult.skipped.length > 1 ? "s" : ""} need manual reviewer assignment
                  </p>
                  <p className="text-[11px] text-amber-700">
                    These positions sit at the top of the hierarchy or their line manager&apos;s seat is vacant.
                    Assign a reviewer manually above.
                  </p>
                </div>
                <button onClick={() => setLastAutoResult(null)} className="w-5 h-5 flex items-center justify-center" style={{ color: "#92400e" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y" style={{ borderColor: "#fde68a" }}>
                {lastAutoResult.skipped.map(u => (
                  <div key={u.user_id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-amber-700 shrink-0" style={{ background: "#fde68a" }}>
                      {u.user_name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-amber-900">{u.user_name}</p>
                      <p className="text-[10px] text-amber-700">{u.position_title} · {u.reason === "top_of_hierarchy" ? "Top of hierarchy — no line manager" : "Line manager position currently vacant"}</p>
                    </div>
                    <button
                      onClick={() => setAssignAppraiseeId(u.user_id)}
                      className="h-6 px-2.5 rounded-lg text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-200">
                      Assign →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            {assignments.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <UserCheck className="w-8 h-8 mb-2" style={{ color: "var(--pg-text-4)" }} />
                <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No reviewer assignments yet.</p>
                <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-4)" }}>Use &ldquo;Auto-assign&rdquo; to derive from the org chart, or assign manually above.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {assignments.map(a => (
                  <div key={a.id} className="flex items-center gap-4 px-5 py-3 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{a.appraisee_name}</p>
                        <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>→</span>
                        <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>{a.reviewer_name}</p>
                      </div>
                      <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{a.appraisee_email}</p>
                    </div>
                    {(isDraft || isOpen) && (
                      <button onClick={() => removeAssignment(a.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: "#dc2626" }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fef2f2"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Submissions tab ───────────────────────────────────────────────── */}
      {tab === "submissions" && (
        <div>
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
                 style={{ gridTemplateColumns: "2fr 1.5fr 1fr 1fr 90px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
              <span>Employee</span>
              <span>Reviewer</span>
              <span>Self Score</span>
              <span>Mgr Score</span>
              <span>Status</span>
            </div>
            {subsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
            ) : submissions.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No submissions yet.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {submissions.map(sub => {
                  const st = statusLabel(sub.status);
                  return (
                    <div key={sub.id}
                         className="grid items-center gap-2 px-5 py-3.5 transition-colors"
                         style={{ gridTemplateColumns: "2fr 1.5fr 1fr 1fr 90px" }}
                         onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                         onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{sub.appraisee_name}</p>
                        <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>{sub.appraisee_email}</p>
                      </div>
                      <p className="text-[12px] truncate" style={{ color: "var(--pg-text-2)" }}>
                        {sub.reviewer_name ?? <span style={{ color: "var(--pg-text-4)" }}>Unassigned</span>}
                      </p>
                      <p className="text-[13px] font-semibold" style={{ color: sub.self_score != null ? "#2563eb" : "var(--pg-text-4)" }}>
                        {sub.self_score != null ? `${sub.self_score.toFixed(1)}%` : "—"}
                      </p>
                      <p className="text-[13px] font-semibold" style={{ color: sub.manager_score != null ? "#059669" : "var(--pg-text-4)" }}>
                        {sub.manager_score != null ? `${sub.manager_score.toFixed(1)}%` : "—"}
                      </p>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit"
                            style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
