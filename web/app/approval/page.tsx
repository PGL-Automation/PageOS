"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useToast } from "@/hooks/use-toast";
import { ApplicationForm } from "@/components/onboarding/application-form";
import { RequirementsPanel } from "@/components/onboarding/requirements-panel";
import { Loader2, CheckCircle2, XCircle, RotateCcw, ClipboardList, ArrowLeft, AlertTriangle, User, Building2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { components } from "@/lib/api/types";

type QueueItem    = components["schemas"]["ApprovalQueueItem"];
type ApprovalStep = components["schemas"]["ApprovalStep"];

/* ─── helpers ───────────────────────────────────────────────────── */

function ctx(item: QueueItem): Record<string, unknown> {
  return (item.context as Record<string, unknown>) ?? {};
}

function resourceLabel(type: string) {
  const map: Record<string, string> = {
    onboarding_case: "Client Onboarding",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

/* ─── Step chain ────────────────────────────────────────────────── */
function StepChain({ steps, activeId }: { steps: ApprovalStep[]; activeId: string }) {
  const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
    approved: { bg: "#ecfdf5", text: "#059669", border: "#a7f3d0" },
    rejected: { bg: "#fef2f2", text: "#dc2626", border: "#fca5a5" },
    returned: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
    skipped:  { bg: "#f1f5f9", text: "#94a3b8", border: "#e2e8f0" },
    pending:  { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
  };

  return (
    <div className="flex items-center gap-0 flex-wrap">
      {steps.map((step, i) => {
        const isActive  = step.ID === activeId;
        const status    = isActive ? "active" : step.Status;
        const style     = isActive
          ? { bg: "#2563eb", text: "#fff", border: "#1d4ed8" }
          : STATUS_COLOR[step.Status] ?? STATUS_COLOR.pending;

        return (
          <div key={step.ID} className="flex items-center">
            {i > 0 && (
              <div className="w-6 h-px mx-1" style={{ background: "var(--pg-card-border)" }} />
            )}
            <div
              className="flex flex-col items-center gap-1"
            >
              <div
                className="px-3 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
              >
                {isActive ? "▶ You" : style === STATUS_COLOR.skipped ? "Skipped" : step.Status.charAt(0).toUpperCase() + step.Status.slice(1)}
              </div>
              <span className="text-[10px] text-center max-w-[80px]" style={{ color: "var(--pg-text-3)" }}>
                {step.Label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Queue row ─────────────────────────────────────────────────── */
function QueueRow({ item, onReview }: { item: QueueItem; onReview: () => void }) {
  const c         = ctx(item);
  const isRisk    = Boolean(c.risk_flag);
  const clientType = String(c.client_type ?? "");
  const Icon      = clientType === "corporate" ? Building2 : User;

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 group transition-colors cursor-pointer"
      style={{ borderBottom: "1px solid var(--pg-row-border)" }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
      onClick={onReview}
    >
      {/* Type icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: isRisk ? "#fef2f2" : "var(--pg-muted-bg)" }}
      >
        <ClipboardList className="w-4 h-4" style={{ color: isRisk ? "#dc2626" : "var(--pg-text-3)" }} />
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>
            {item.step.Label}
          </p>
          {isRisk && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
              style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" }}>
              <AlertTriangle className="w-2.5 h-2.5" /> High Risk
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Icon className="w-3 h-3 shrink-0" style={{ color: "var(--pg-text-4)" }} />
          <span className="text-[11px] capitalize" style={{ color: "var(--pg-text-3)" }}>
            {resourceLabel(item.resource_type)}{clientType ? ` · ${clientType}` : ""}
          </span>
          <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>·</span>
          <span className="text-[11px] font-mono" style={{ color: "var(--pg-text-4)" }}>
            {item.resource_id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--pg-text-3)" }} />
    </div>
  );
}

/* ─── Decision panel ────────────────────────────────────────────── */
function DecisionPanel({
  isPending,
  notes,
  onNotesChange,
  onDecide,
}: {
  isPending:     boolean;
  notes:         string;
  onNotesChange: (v: string) => void;
  onDecide:      (a: "approve" | "reject" | "return") => void;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden sticky top-6"
      style={{ border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}
    >
      <div className="px-5 py-3.5" style={{ background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)" }}>
        <h3 className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>Record Decision</h3>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          Notes are required to return; optional for approve or reject.
        </p>
      </div>

      <div className="p-5 space-y-4" style={{ background: "var(--pg-card)" }}>
        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
            Notes
          </label>
          <textarea
            rows={4}
            placeholder="Add notes for this decision…"
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-[13px] resize-none outline-none transition-colors"
            style={{
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-1)",
            }}
            onFocus={e => (e.target.style.borderColor = "#2563eb")}
            onBlur={e  => (e.target.style.borderColor = "var(--pg-card-border)")}
          />
        </div>

        {/* Buttons */}
        <div className="space-y-2">
          <button
            onClick={() => onDecide("approve")}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60 transition-opacity"
            style={{ background: "linear-gradient(135deg,#059669,#047857)", boxShadow: "0 1px 6px rgba(5,150,105,0.3)" }}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Approve
          </button>

          <button
            onClick={() => onDecide("return")}
            disabled={isPending || !notes.trim()}
            title={!notes.trim() ? "Add notes before returning" : undefined}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-opacity"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-1)",
            }}
          >
            <RotateCcw className="w-4 h-4" />
            Return for Correction
          </button>

          <button
            onClick={() => onDecide("reject")}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-[13px] font-semibold disabled:opacity-60 transition-opacity"
            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" }}
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────── */
export default function ApprovalPage() {
  const { toast }    = useToast();
  const queryClient  = useQueryClient();
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [notes, setNotes]       = useState("");

  /* Queue */
  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["approval-queue"],
    queryFn: async () => {
      const { data, error } = await api.GET("/approval/queue");
      if (error) throw new Error("Failed to fetch queue");
      return data ?? [];
    },
  });

  /* Request details (step chain) */
  const { data: reqDetails } = useQuery({
    queryKey: ["approval-request", selected?.step.RequestID],
    queryFn: async () => {
      if (!selected) return null;
      const { data } = await api.GET("/approval/requests/{id}", {
        params: { path: { id: selected.step.RequestID } },
      });
      return data ?? null;
    },
    enabled: Boolean(selected),
  });

  /* Case details (application + requirements) */
  const { data: caseDetails } = useQuery({
    queryKey: ["case", selected?.resource_id],
    queryFn: async () => {
      if (!selected || selected.resource_type !== "onboarding_case") return null;
      const { data } = await api.GET("/onboarding/cases/{id}", {
        params: { path: { id: selected.resource_id } },
      });
      return data ?? null;
    },
    enabled: Boolean(selected) && selected?.resource_type === "onboarding_case",
  });

  /* Decision */
  const decideMutation = useMutation({
    mutationFn: async ({ action }: { action: "approve" | "reject" | "return" }) => {
      if (!selected) throw new Error("No step selected");
      const { error } = await api.POST("/approval/requests/{id}/steps/{stepId}/decide", {
        params: { path: { id: selected.step.RequestID, stepId: selected.step.ID } },
        body: { action, notes },
      });
      if (error) throw new Error((error as Record<string, string>).message ?? "Decision failed");
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["approval-queue"] });
      const label = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Returned";
      toast({ title: `Case ${label}`, description: "Your decision has been recorded." });
      setSelected(null);
      setNotes("");
    },
    onError: err => {
      toast({ title: "Decision Failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  const clientName = caseDetails?.application?.full_name;
  const selCtx     = selected ? ctx(selected) : {};
  const clientType = String(selCtx.client_type ?? "");
  const isRisk     = Boolean(selCtx.risk_flag);

  /* ── Queue list ──────────────────────────────────────────────── */
  if (!selected) {
    return (
      <div className="max-w-[900px] mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Approval Queue
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--pg-text-3)" }}>
            Submitted cases awaiting your review and decision.
          </p>
        </div>

        {/* Queue card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}
        >
          {/* Card header */}
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)" }}
          >
            <h2 className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              Pending Steps
            </h2>
            {queue.length > 0 && (
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" }}
              >
                {queue.length}
              </span>
            )}
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16" style={{ background: "var(--pg-card)" }}>
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
            </div>
          ) : queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6"
              style={{ background: "var(--pg-card)" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "var(--pg-muted-bg)" }}>
                <ClipboardList className="w-7 h-7" style={{ color: "var(--pg-text-4)" }} />
              </div>
              <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--pg-text-2)" }}>
                Queue is empty
              </p>
              <p className="text-[12px]" style={{ color: "var(--pg-text-4)" }}>
                No cases are awaiting your decision right now.
              </p>
            </div>
          ) : (
            <div style={{ background: "var(--pg-card)" }}>
              {(queue as QueueItem[]).map(item => (
                <QueueRow
                  key={item.step.ID}
                  item={item}
                  onReview={() => { setSelected(item); setNotes(""); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Review workspace ────────────────────────────────────────── */
  return (
    <div className="space-y-5">

      {/* Top bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-[13px] font-medium transition-colors"
          style={{ color: "var(--pg-text-3)" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--pg-text-1)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--pg-text-3)"}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Queue
        </button>

        <div className="h-4 w-px" style={{ background: "var(--pg-card-border)" }} />

        <div className="flex items-center gap-2 flex-wrap">
          {clientName && (
            <span className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              {clientName}
            </span>
          )}
          {clientType && (
            <span className="text-[11px] capitalize px-2 py-0.5 rounded-full font-medium"
              style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)", border: "1px solid var(--pg-card-border)" }}>
              {clientType}
            </span>
          )}
          {isRisk && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" }}>
              <AlertTriangle className="w-2.5 h-2.5" /> High Risk
            </span>
          )}
          <span className="text-[11px] font-mono" style={{ color: "var(--pg-text-4)" }}>
            #{selected.resource_id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Approval chain */}
      {reqDetails && (
        <div
          className="rounded-2xl px-5 py-4"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-4)" }}>
            Approval Chain
          </p>
          <StepChain
            steps={reqDetails.steps ?? []}
            activeId={selected.step.ID}
          />
        </div>
      )}

      {/* Main split layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">

        {/* Left — application + documents */}
        <div className="xl:col-span-2 space-y-5">
          {selected.resource_type === "onboarding_case" && (
            <>
              <ApplicationForm
                caseId={selected.resource_id}
                initialData={caseDetails?.application as Record<string, unknown> | undefined}
                readOnly
              />
              <RequirementsPanel
                caseId={selected.resource_id}
                requirements={caseDetails?.requirements ?? []}
                canUpload={false}
              />
            </>
          )}
          {selected.resource_type !== "onboarding_case" && (
            <div
              className="rounded-2xl flex items-center justify-center py-16 text-center"
              style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}
            >
              <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
                Preview not available for resource type &ldquo;{selected.resource_type}&rdquo;.
              </p>
            </div>
          )}
        </div>

        {/* Right — decision panel */}
        <div>
          <DecisionPanel
            isPending={decideMutation.isPending}
            notes={notes}
            onNotesChange={setNotes}
            onDecide={action => decideMutation.mutate({ action })}
          />
        </div>
      </div>
    </div>
  );
}
