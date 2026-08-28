"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePosition, roleFamily } from "@/lib/position";
import { useAuth } from "@/lib/auth";
import {
  ClipboardList, ChevronRight, Clock, CheckCircle2, AlertCircle,
  Users, Star, Calendar, Lock, Eye, Settings2, UserCheck,
  BarChart2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Cycle = {
  id: string; title: string; description: string; status: string;
  self_deadline?: string; manager_deadline?: string;
  subsidiary_id?: string;
  question_count: number; submission_count: number;
  self_submitted_count: number; completed_count: number;
};

type Submission = {
  id: string; cycle_id: string; cycle_title: string;
  status: string; self_score?: number; manager_score?: number;
  self_submitted_at?: string; appraisee_name?: string;
  reviewer_name?: string;
};

function statusLabel(s: string) {
  switch (s) {
    case "pending":         return { label: "Not started",        color: "#94a3b8", bg: "#f1f5f9" };
    case "self_draft":      return { label: "In progress",        color: "#d97706", bg: "#fffbeb" };
    case "self_submitted":  return { label: "Submitted",          color: "#FF6600", bg: "#fff7f0" };
    case "manager_scoring": return { label: "Manager reviewing",  color: "#7c3aed", bg: "#f5f3ff" };
    case "completed":       return { label: "Completed",          color: "#059669", bg: "#ecfdf5" };
    default:                return { label: s,                    color: "#64748b", bg: "#f1f5f9" };
  }
}

function cycleStatusBadge(status: string) {
  switch (status) {
    case "draft":    return { label: "Draft",    color: "#94a3b8", bg: "#f1f5f9" };
    case "open":     return { label: "Open",     color: "#059669", bg: "#ecfdf5" };
    case "closed":   return { label: "Closed",   color: "#dc2626", bg: "#fef2f2" };
    case "archived": return { label: "Archived", color: "#64748b", bg: "#f1f5f9" };
    default:         return { label: status,     color: "#64748b", bg: "#f1f5f9" };
  }
}

function formatDeadline(d?: string) {
  if (!d) return null;
  const date = new Date(d);
  const now  = new Date();
  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: "Deadline passed", urgent: true };
  if (diff === 0) return { text: "Due today", urgent: true };
  if (diff <= 3)  return { text: `${diff} day${diff > 1 ? "s" : ""} left`, urgent: true };
  return { text: `Due ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, urgent: false };
}

export default function AppraisalPage() {
  const { user }              = useAuth();
  const { primaryCode, isLoading: posLoading } = usePosition();
  const isHR = roleFamily(primaryCode) === "hr" || roleFamily(primaryCode) === "md";

  const { data: cycles = [], isLoading: cyclesLoading } = useQuery<Cycle[]>({
    queryKey: ["appraisal-cycles"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles`, { credentials: "include" });
      if (!res.ok) return [];
      return (await res.json()) ?? [];
    },
    enabled: !posLoading,
  });

  const { data: mySubmissions = [] } = useQuery<Submission[]>({
    queryKey: ["my-appraisal-submissions"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/my-submissions`, { credentials: "include" });
      if (!res.ok) return [];
      return (await res.json()) ?? [];
    },
    enabled: !posLoading,
  });

  const { data: pendingReviews = [] } = useQuery<Submission[]>({
    queryKey: ["pending-reviews"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/reviews/pending`, { credentials: "include" });
      if (!res.ok) return [];
      return (await res.json()) ?? [];
    },
    enabled: !posLoading,
  });

  const openCycles   = cycles.filter(c => c.status === "open");
  const activeSub    = mySubmissions.find(s => openCycles.some(c => c.id === s.cycle_id));
  const firstName    = user?.DisplayName?.split(" ")[0] ?? "there";

  if (posLoading || cyclesLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto space-y-7">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Performance Appraisal
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {openCycles.length > 0 ? `${openCycles.length} active cycle${openCycles.length > 1 ? "s" : ""}` : "No active cycles"}
          </p>
        </div>
        {isHR && (
          <Link href="/appraisal/dashboard"
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
            <Settings2 className="w-3.5 h-3.5" /> Manage Appraisals
          </Link>
        )}
      </div>

      {/* My assessment card — if there's an active open cycle */}
      {openCycles.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>
            My Assessment
          </p>
          <div className="space-y-3">
            {openCycles.map(cycle => {
              const mySub = mySubmissions.find(s => s.cycle_id === cycle.id);
              const st    = statusLabel(mySub?.status ?? "pending");
              const dl    = formatDeadline(cycle.self_deadline);
              const isDone = mySub?.status === "self_submitted" || mySub?.status === "completed" || mySub?.status === "manager_scoring";
              return (
                <div key={cycle.id} className="rounded-2xl overflow-hidden"
                     style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 6px var(--pg-card-shadow)" }}>
                  <div className="flex items-center justify-between px-5 py-4"
                       style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                           style={{ background: isDone ? "#ecfdf5" : "#fff7f0" }}>
                        {isDone
                          ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
                          : <ClipboardList className="w-4.5 h-4.5 text-orange-600" />}
                      </div>
                      <div>
                        <p className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>{cycle.title}</p>
                        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                          {cycle.question_count} question{cycle.question_count !== 1 ? "s" : ""}
                          {cycle.description && ` · ${cycle.description}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {dl && (
                        <span className="flex items-center gap-1 text-[11px] font-medium"
                              style={{ color: dl.urgent ? "#dc2626" : "var(--pg-text-3)" }}>
                          <Clock className="w-3 h-3" /> {dl.text}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3.5">
                    {mySub?.self_score != null && (
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Self Score</p>
                          <p className="text-[18px] font-bold" style={{ color: "#FF6600" }}>{mySub.self_score.toFixed(1)}%</p>
                        </div>
                        {mySub.manager_score != null && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Manager Score</p>
                            <p className="text-[18px] font-bold" style={{ color: "#059669" }}>{mySub.manager_score.toFixed(1)}%</p>
                          </div>
                        )}
                      </div>
                    )}
                    {!mySub?.self_score && <div />}
                    <Link href={`/appraisal/${cycle.id}`}
                          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
                          style={isDone
                            ? { border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }
                            : { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "white" }}>
                      {isDone ? <><Eye className="w-3.5 h-3.5" /> View</> : <><ClipboardList className="w-3.5 h-3.5" /> {mySub?.status === "self_draft" ? "Continue" : "Start Assessment"}</>}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending reviews for managers */}
      {pendingReviews.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>
            Pending Team Reviews <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: "#FF6600" }}>{pendingReviews.length}</span>
          </p>
          <div className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {pendingReviews.map(sub => {
                const st = statusLabel(sub.status);
                return (
                  <div key={sub.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                         style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
                      {(sub.appraisee_name ?? "?").split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{sub.appraisee_name}</p>
                      <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{sub.cycle_title}</p>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    <Link href={`/appraisal/review/${sub.id}`}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white"
                          style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
                      <UserCheck className="w-3.5 h-3.5" /> Review
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* HR: cycle overview */}
      {isHR && cycles.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--pg-text-3)" }}>All Cycles</p>
            <Link href="/appraisal/dashboard" className="text-[11px] font-medium text-orange-600 hover:underline flex items-center gap-0.5">
              Manage <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid gap-3">
            {cycles.slice(0, 5).map(cycle => {
              const cs = cycleStatusBadge(cycle.status);
              const completion = cycle.submission_count > 0
                ? Math.round((cycle.completed_count / cycle.submission_count) * 100)
                : 0;
              return (
                <div key={cycle.id} className="flex items-center gap-4 px-5 py-4 rounded-2xl"
                     style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#fff7f0" }}>
                    {cycle.status === "closed"
                      ? <Lock className="w-4 h-4 text-slate-500" />
                      : <BarChart2 className="w-4 h-4 text-orange-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{cycle.title}</p>
                    <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                      {cycle.question_count} questions · {cycle.submission_count} participants
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {cycle.status === "open" && (
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Completed</p>
                        <p className="text-[16px] font-bold" style={{ color: completion >= 80 ? "#059669" : "#d97706" }}>{completion}%</p>
                      </div>
                    )}
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: cs.bg, color: cs.color }}>{cs.label}</span>
                    <Link href={cycle.status === "open" || cycle.status === "draft" ? `/appraisal/${cycle.id}/manage` : `/appraisal/${cycle.id}/manage`}
                          className="flex items-center gap-1 h-8 px-3 rounded-xl text-[12px] font-medium transition-colors"
                          style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!cyclesLoading && openCycles.length === 0 && pendingReviews.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl"
             style={{ background: "var(--pg-card)", border: "1px dashed var(--pg-card-border)" }}>
          <ClipboardList className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
            No active appraisal cycles
          </p>
          <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-4)" }}>
            {isHR ? "Create a new cycle to get started." : "HR will notify you when a new cycle opens."}
          </p>
          {isHR && (
            <Link href="/appraisal/dashboard"
                  className="mt-4 flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
              <Settings2 className="w-3.5 h-3.5" /> Manage Appraisals
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
