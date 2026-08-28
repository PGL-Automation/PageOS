"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { UserCheck, Clock, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type PendingReview = {
  id: string; cycle_id: string; cycle_title: string;
  appraisee_id: string; appraisee_name: string; appraisee_email: string;
  status: string; self_submitted_at?: string; self_score?: number;
};

function statusLabel(s: string) {
  if (s === "manager_scoring") return { label: "In progress", color: "#7c3aed", bg: "#f5f3ff" };
  return { label: "Ready to review", color: "#FF6600", bg: "#fff7f0" };
}

export default function ReviewListPage() {
  const { data: reviews = [], isLoading } = useQuery<PendingReview[]>({
    queryKey: ["pending-reviews"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/appraisal/reviews/pending`, { credentials: "include" });
      if (!res.ok) return [];
      return (await res.json()) ?? [];
    },
  });

  return (
    <div className="max-w-[900px] mx-auto space-y-5">
      <div>
        <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Team Reviews</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          {reviews.length > 0 ? `${reviews.length} pending review${reviews.length > 1 ? "s" : ""} assigned to you` : "No pending reviews"}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl"
             style={{ background: "var(--pg-card)", border: "1px dashed var(--pg-card-border)" }}>
          <CheckCircle2 className="w-10 h-10 mb-3" style={{ color: "#059669" }} />
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>All caught up!</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-4)" }}>No team members are waiting for your review.</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {reviews.map(r => {
              const st = statusLabel(r.status);
              return (
                <div key={r.id} className="flex items-center gap-4 px-5 py-4 transition-colors"
                     onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                     onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                       style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
                    {r.appraisee_name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{r.appraisee_name}</p>
                    <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                      {r.cycle_title}
                      {r.self_submitted_at && ` · Submitted ${new Date(r.self_submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                    </p>
                  </div>
                  {r.self_score != null && (
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Self Score</p>
                      <p className="text-[15px] font-bold" style={{ color: "#FF6600" }}>{r.self_score.toFixed(1)}%</p>
                    </div>
                  )}
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  <Link href={`/appraisal/review/${r.id}`}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white shrink-0"
                        style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
                    <UserCheck className="w-3.5 h-3.5" /> Review
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
