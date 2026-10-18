"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { usePosition } from "@/lib/position";
import {
  ArrowLeft, CheckCircle2, XCircle, RotateCcw, Clock, AlertTriangle,
  Printer, Loader2, Send, Banknote, FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

// ── Constants & Helpers ────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

async function payoutFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/payouts${path}`, {
    credentials: "include",
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      body?.error?.message ?? body?.message ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

function kobo(n: number) {
  return (n / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN" });
}

function fmt(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Types ──────────────────────────────────────────────────────────────────────

type RequestType = "client_payout" | "liquidation" | "transfer" | "expense" | "placement";

type PaymentRequest = {
  id: string;
  instruction_id: string;
  subsidiary_id: string;
  request_type: RequestType;
  payment_account_id: string;
  amount_kobo: number;
  beneficiary_name: string;
  beneficiary_bank: string;
  beneficiary_account: string;
  purpose: string;
  supporting_doc_path: string;
  status: string;
  compliance_flagged: boolean;
  raised_by: string;
  raised_by_name?: string;
  submitted_at: string | null;
  approved_at: string | null;
  bank_reference: string;
  confirmation_doc_path: string;
  created_at: string;
  updated_at: string;
  payment_account_name?: string;
  company_name?: string;
};

type ApprovalStep = {
  id: string;
  request_id: string;
  step_order: number;
  step_type: string;
  assigned_to: string;
  assigned_to_name?: string;
  stand_in_for: string | null;
  status: string;
  due_by: string;
  reminder_sent_at: string | null;
  escalated_at: string | null;
  decided_at: string | null;
  notes: string;
  created_at: string;
};

type ActionLog = {
  id: string;
  request_id: string;
  step_id: string | null;
  actor_user_id: string;
  actor_name?: string;
  action: string;
  notes: string;
  source: string;
  created_at: string;
};

type DetailResponse = {
  request: PaymentRequest;
  steps: ApprovalStep[];
  log: ActionLog[];
};

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:               { bg: "#f3f4f6", color: "#6b7280", label: "Draft" },
  submitted:           { bg: "#dbeafe", color: "#1d4ed8", label: "Submitted" },
  head_concur:         { bg: "#fef3c7", color: "#b45309", label: "Head Concurrence" },
  internal_control:    { bg: "#fef3c7", color: "#b45309", label: "Internal Control" },
  compliance:          { bg: "#ede9fe", color: "#7c3aed", label: "Compliance" },
  finance_check:       { bg: "#fef3c7", color: "#b45309", label: "Finance Check" },
  pending_signatories: { bg: "#fef3c7", color: "#b45309", label: "Pending Signatories" },
  approved:            { bg: "#d1fae5", color: "#065f46", label: "Approved" },
  sent_to_bank:        { bg: "#cffafe", color: "#0e7490", label: "Sent to Bank" },
  confirmed:           { bg: "#d1fae5", color: "#065f46", label: "Confirmed" },
  reconciled:          { bg: "#d1fae5", color: "#065f46", label: "Reconciled" },
  returned:            { bg: "#fef3c7", color: "#92400e", label: "Returned" },
  rejected:            { bg: "#fee2e2", color: "#dc2626", label: "Rejected" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_STYLE[status] ?? { bg: "#f3f4f6", color: "#6b7280", label: status };
  return (
    <span
      className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ── Step type labels ───────────────────────────────────────────────────────────

const STEP_LABEL: Record<string, string> = {
  head_concur:      "Head Concurrence",
  internal_control: "Internal Control",
  compliance:       "Compliance Review",
  finance_check:    "Finance Check",
  signatory_1:      "Signatory 1",
  signatory_2:      "Signatory 2",
  md:               "Managing Director",
  ceo:              "CEO",
};

const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  client_payout: "Client Payout",
  liquidation:   "Liquidation",
  transfer:      "Transfer",
  expense:       "Expense",
  placement:     "Placement",
};

// ── Step status icon ──────────────────────────────────────────────────────────

function StepIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "rejected") return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === "returned") return <RotateCcw className="w-4 h-4 text-amber-500" />;
  if (status === "skipped")  return <CheckCircle2 className="w-4 h-4 text-gray-300" />;
  return <Clock className="w-4 h-4 text-gray-400" />;
}

// ── Action log label ──────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  created:    "Created",
  submitted:  "Submitted",
  approved:   "Approved",
  returned:   "Returned",
  rejected:   "Rejected",
  escalated:  "Escalated",
  dispatched: "Sent to Bank",
  confirmed:  "Bank Confirmed",
};

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { primaryFamily } = usePosition();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sheet state for Return / Reject / Dispatch / Confirm
  const [returnOpen, setReturnOpen]   = useState(false);
  const [rejectOpen, setRejectOpen]   = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [notes, setNotes]               = useState("");
  const [bankRef, setBankRef]           = useState("");
  const [confirmDoc, setConfirmDoc]     = useState("");

  const isFinance = primaryFamily === "finance" || primaryFamily === "finops";

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const { data, isLoading, isError } = useQuery<DetailResponse>({
    queryKey: ["payout-detail", id],
    queryFn: () => payoutFetch(`/${id}`),
    refetchInterval: 30000,
    enabled: Boolean(id),
  });

  const request = data?.request;
  const steps   = data?.steps ?? [];
  const log     = data?.log   ?? [];

  // Find the current pending step assigned to the logged-in user
  const myPendingStep = steps.find(
    (s) => s.status === "pending" && s.assigned_to === user?.ID
  );

  // ── Mutations ─────────────────────────────────────────────────────────────────

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["payout-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["payout-pending"] });
  }

  const approveMutation = useMutation({
    mutationFn: () =>
      payoutFetch(`/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "" }),
      }),
    onSuccess: () => {
      toast({ title: "Step approved" });
      invalidate();
    },
    onError: (e) =>
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const returnMutation = useMutation({
    mutationFn: (n: string) =>
      payoutFetch(`/${id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: n }),
      }),
    onSuccess: () => {
      toast({ title: "Request returned to raiser" });
      setReturnOpen(false);
      setNotes("");
      invalidate();
    },
    onError: (e) =>
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (n: string) =>
      payoutFetch(`/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: n }),
      }),
    onSuccess: () => {
      toast({ title: "Request rejected" });
      setRejectOpen(false);
      setNotes("");
      invalidate();
    },
    onError: (e) =>
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const dispatchMutation = useMutation({
    mutationFn: (ref: string) =>
      payoutFetch(`/${id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank_reference: ref }),
      }),
    onSuccess: () => {
      toast({ title: "Marked as sent to bank" });
      setDispatchOpen(false);
      setBankRef("");
      invalidate();
    },
    onError: (e) =>
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: (doc: string) =>
      payoutFetch(`/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation_doc_path: doc }),
      }),
    onSuccess: () => {
      toast({ title: "Bank confirmation attached" });
      setConfirmOpen(false);
      setConfirmDoc("");
      invalidate();
    },
    onError: (e) =>
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
  });

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  if (isError || !request) {
    return (
      <div className="flex flex-col h-[60vh] items-center justify-center gap-2">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          Could not load request.
        </p>
        <button
          onClick={() => router.back()}
          className="text-[12px] underline"
          style={{ color: "var(--pg-text-3)" }}
        >
          Go back
        </button>
      </div>
    );
  }

  const isDraft = request.status === "draft";
  const isApproved = request.status === "approved";
  const isSentToBank = request.status === "sent_to_bank";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto pb-32 px-4 pt-4 space-y-5">

      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" style={{ color: "var(--pg-text-2)" }} />
        </button>
        <div className="flex-1 min-w-0">
          <h1
            className="text-[20px] font-bold tracking-tight truncate"
            style={{ color: "var(--pg-text-1)" }}
          >
            {request.instruction_id || "—"}
          </h1>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {/* ── 2. Request Info card ──────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
      >
        <div
          className="px-5 py-3"
          style={{ borderBottom: "1px solid var(--pg-row-border)" }}
        >
          <p
            className="text-[11px] font-bold uppercase tracking-widest"
            style={{ color: "var(--pg-text-3)" }}
          >
            Request Details
          </p>
        </div>

        {/* Compliance banner */}
        {request.compliance_flagged && (
          <div className="flex items-center gap-2.5 px-5 py-3 bg-amber-50"
               style={{ borderBottom: "1px solid #fde68a" }}>
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-[12px] font-medium text-amber-800">
              Compliance review required — this request has been flagged.
            </p>
          </div>
        )}

        <div className="px-5 py-4 grid sm:grid-cols-2 gap-x-8 gap-y-4">
          {[
            ["Type",             REQUEST_TYPE_LABEL[request.request_type] ?? request.request_type],
            ["Amount",           kobo(request.amount_kobo)],
            ["Beneficiary",      request.beneficiary_name],
            ["Bank",             request.beneficiary_bank],
            ["Account Number",   request.beneficiary_account],
            ["Purpose",          request.purpose],
            ["Company",          request.company_name ?? "—"],
            ["Payment Account",  request.payment_account_name ?? "—"],
            ["Raised by",        request.raised_by_name ?? request.raised_by],
            ["Submitted at",     fmt(request.submitted_at)],
          ].map(([label, value]) => (
            <div key={label}>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                style={{ color: "var(--pg-text-3)" }}
              >
                {label}
              </p>
              <p
                className={cn(
                  "text-[13px] font-medium break-words",
                  label === "Amount" && "text-[15px] font-bold"
                )}
                style={{ color: label === "Amount" ? "#FF6600" : "var(--pg-text-1)" }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Supporting doc link */}
        {request.supporting_doc_path && (
          <div
            className="px-5 py-3 flex items-center gap-2"
            style={{ borderTop: "1px solid var(--pg-row-border)" }}
          >
            <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              Supporting document:
            </p>
            <a
              href={request.supporting_doc_path}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-medium underline"
              style={{ color: "#FF6600" }}
            >
              View file
            </a>
          </div>
        )}

        {/* Bank reference (post-dispatch) */}
        {request.bank_reference && (
          <div
            className="px-5 py-3 flex items-center gap-2"
            style={{ borderTop: "1px solid var(--pg-row-border)", background: "#f0fdf4" }}
          >
            <p className="text-[11px] font-semibold text-emerald-700">Bank Reference:</p>
            <p className="text-[12px] font-mono font-bold text-emerald-800">{request.bank_reference}</p>
          </div>
        )}

        {/* Confirmation doc (post-confirm) */}
        {request.confirmation_doc_path && (
          <div
            className="px-5 py-3 flex items-center gap-2"
            style={{ borderTop: "1px solid var(--pg-row-border)", background: "#f0fdf4" }}
          >
            <p className="text-[11px] font-semibold text-emerald-700">Confirmation:</p>
            <a
              href={request.confirmation_doc_path}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-medium underline text-emerald-700"
            >
              View confirmation doc
            </a>
          </div>
        )}
      </div>

      {/* ── 3. Approval Timeline ──────────────────────────────────────────── */}
      {steps.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <div
            className="px-5 py-3"
            style={{ borderBottom: "1px solid var(--pg-row-border)" }}
          >
            <p
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: "var(--pg-text-3)" }}
            >
              Approval Timeline
            </p>
          </div>
          <div className="px-5 py-4">
            <ol className="relative space-y-0">
              {steps.map((step, idx) => {
                const isActive   = step.status === "pending";
                const isMyStep   = isActive && step.assigned_to === user?.ID;
                const isLast     = idx === steps.length - 1;
                const isDecided  = step.status === "approved" || step.status === "returned" || step.status === "rejected";

                return (
                  <li key={step.id} className="relative flex gap-4">
                    {/* Vertical line */}
                    {!isLast && (
                      <div
                        className="absolute left-[15px] top-8 bottom-0 w-[2px]"
                        style={{ background: isDecided ? "#d1fae5" : "var(--pg-row-border)" }}
                      />
                    )}

                    {/* Icon */}
                    <div
                      className={cn(
                        "relative z-10 flex items-center justify-center w-8 h-8 rounded-full shrink-0 ring-2",
                        isMyStep
                          ? "ring-orange-400"
                          : isActive
                          ? "ring-amber-300"
                          : isDecided
                          ? "ring-emerald-200"
                          : "ring-gray-200"
                      )}
                      style={{
                        background: isMyStep
                          ? "#fff7f0"
                          : isActive
                          ? "#fef3c7"
                          : isDecided && step.status === "approved"
                          ? "#d1fae5"
                          : "var(--pg-muted-bg)",
                      }}
                    >
                      <StepIcon status={step.status} />
                    </div>

                    {/* Content */}
                    <div
                      className={cn(
                        "flex-1 rounded-xl px-4 py-3 mb-3",
                        isMyStep && "ring-1 ring-orange-300"
                      )}
                      style={{
                        background: isMyStep
                          ? "rgba(255,102,0,0.04)"
                          : "var(--pg-muted-bg)",
                        border: "1px solid var(--pg-card-border)",
                      }}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <p
                            className="text-[13px] font-semibold"
                            style={{ color: "var(--pg-text-1)" }}
                          >
                            {STEP_LABEL[step.step_type] ?? step.step_type}
                          </p>
                          <p
                            className="text-[11px]"
                            style={{ color: "var(--pg-text-3)" }}
                          >
                            {step.assigned_to_name ?? step.assigned_to}
                            {step.stand_in_for && (
                              <span className="ml-1 text-amber-600">
                                (stand-in)
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {isMyStep && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                              Your turn
                            </span>
                          )}
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                            style={{
                              background:
                                step.status === "approved"
                                  ? "#d1fae5"
                                  : step.status === "rejected"
                                  ? "#fee2e2"
                                  : step.status === "returned"
                                  ? "#fef3c7"
                                  : step.status === "pending"
                                  ? "#dbeafe"
                                  : "#f3f4f6",
                              color:
                                step.status === "approved"
                                  ? "#065f46"
                                  : step.status === "rejected"
                                  ? "#dc2626"
                                  : step.status === "returned"
                                  ? "#92400e"
                                  : step.status === "pending"
                                  ? "#1d4ed8"
                                  : "#6b7280",
                            }}
                          >
                            {step.status}
                          </span>
                        </div>
                      </div>

                      {/* Timing info */}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                          Due: {fmt(step.due_by)}
                        </span>
                        {step.decided_at && (
                          <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                            Decided: {fmt(step.decided_at)}
                          </span>
                        )}
                        {step.escalated_at && (
                          <span className="text-[10px] text-amber-600 font-medium">
                            Escalated: {fmt(step.escalated_at)}
                          </span>
                        )}
                      </div>

                      {/* Notes */}
                      {step.notes && (
                        <p
                          className="mt-2 text-[11px] italic"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          &ldquo;{step.notes}&rdquo;
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}

      {/* ── 5. Action Log ────────────────────────────────────────────────── */}
      {log.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <div
            className="px-5 py-3"
            style={{ borderBottom: "1px solid var(--pg-row-border)" }}
          >
            <p
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: "var(--pg-text-3)" }}
            >
              Activity Log
            </p>
          </div>
          <ol className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {log.map((entry) => (
              <li key={entry.id} className="px-5 py-3 flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}
                >
                  <span className="text-[9px] font-bold" style={{ color: "var(--pg-text-3)" }}>
                    {(entry.actor_name ?? "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                      {entry.actor_name ?? entry.actor_user_id}
                    </span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize"
                      style={{
                        background:
                          entry.action === "approved"
                            ? "#d1fae5"
                            : entry.action === "rejected"
                            ? "#fee2e2"
                            : entry.action === "returned"
                            ? "#fef3c7"
                            : "#f3f4f6",
                        color:
                          entry.action === "approved"
                            ? "#065f46"
                            : entry.action === "rejected"
                            ? "#dc2626"
                            : entry.action === "returned"
                            ? "#92400e"
                            : "#6b7280",
                      }}
                    >
                      {ACTION_LABEL[entry.action] ?? entry.action}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                      {fmt(entry.created_at)}
                    </span>
                  </div>
                  {entry.notes && (
                    <p
                      className="mt-0.5 text-[11px] italic"
                      style={{ color: "var(--pg-text-3)" }}
                    >
                      {entry.notes}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── 6. Print Letter button ────────────────────────────────────────── */}
      {!isDraft && (
        <div className="flex justify-end">
          <button
            onClick={() =>
              window.open(`${BASE}/api/v1/payouts/${id}/letter`, "_blank")
            }
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-[12px] font-medium transition-colors"
            style={{
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-2)",
              background: "var(--pg-card)",
            }}
          >
            <Printer className="w-3.5 h-3.5" />
            Print Payment Letter
          </button>
        </div>
      )}

      {/* ── 4. Action Panel (sticky bottom) ──────────────────────────────── */}
      {(myPendingStep || (isApproved && isFinance) || (isSentToBank && isFinance)) && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 flex items-center gap-2 flex-wrap"
          style={{
            background: "var(--pg-card)",
            borderTop: "1px solid var(--pg-card-border)",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
          }}
        >
          <div className="flex-1 min-w-0">
            {myPendingStep && (
              <p className="text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}>
                {STEP_LABEL[myPendingStep.step_type] ?? myPendingStep.step_type} — action required
              </p>
            )}
            {isApproved && isFinance && !myPendingStep && (
              <p className="text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}>
                Approved — ready to send to bank
              </p>
            )}
            {isSentToBank && isFinance && !myPendingStep && (
              <p className="text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}>
                Sent to bank — attach confirmation when received
              </p>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {/* Approve / Return / Reject for approval step assignee */}
            {myPendingStep && (
              <>
                <button
                  onClick={() => {
                    if (!confirm(`Approve this step (${STEP_LABEL[myPendingStep.step_type] ?? myPendingStep.step_type})?`)) return;
                    approveMutation.mutate();
                  }}
                  disabled={approveMutation.isPending}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
                >
                  {approveMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Approve
                </button>
                <button
                  onClick={() => { setNotes(""); setReturnOpen(true); }}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
                  style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Return
                </button>
                <button
                  onClick={() => { setNotes(""); setRejectOpen(true); }}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
                  style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fecaca" }}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
              </>
            )}

            {/* Finance — send to bank after approval */}
            {isApproved && isFinance && (
              <button
                onClick={() => { setBankRef(""); setDispatchOpen(true); }}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)" }}
              >
                <Send className="w-3.5 h-3.5" />
                Mark as Sent to Bank
              </button>
            )}

            {/* Finance — attach bank confirmation */}
            {isSentToBank && isFinance && (
              <button
                onClick={() => { setConfirmDoc(""); setConfirmOpen(true); }}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
              >
                <FileCheck className="w-3.5 h-3.5" />
                Attach Bank Confirmation
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Sheet: Return ─────────────────────────────────────────────────── */}
      <Sheet open={returnOpen} onOpenChange={setReturnOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Return to Raiser</SheetTitle>
            <SheetDescription>
              Provide a reason — the raiser will be notified and can resubmit.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-3">
            <label
              className="block text-[12px] font-medium"
              style={{ color: "var(--pg-text-2)" }}
            >
              Reason (required)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Supporting document is missing…"
              className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none"
              style={{
                background: "var(--pg-input)",
                border: "1px solid var(--pg-input-border)",
                color: "var(--pg-text-1)",
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setReturnOpen(false)}
                className="h-9 px-4 rounded-xl text-[13px] font-medium"
                style={{
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-2)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!notes.trim()) {
                    toast({ title: "Reason is required", variant: "destructive" });
                    return;
                  }
                  returnMutation.mutate(notes.trim());
                }}
                disabled={returnMutation.isPending}
                className="h-9 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-60"
                style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}
              >
                {returnMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Return Request"}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Sheet: Reject ─────────────────────────────────────────────────── */}
      <Sheet open={rejectOpen} onOpenChange={setRejectOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Reject Request</SheetTitle>
            <SheetDescription>
              This action is permanent. The request will be closed and cannot be re-submitted.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-3">
            <label
              className="block text-[12px] font-medium"
              style={{ color: "var(--pg-text-2)" }}
            >
              Reason (required)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Duplicate request — already processed…"
              className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none"
              style={{
                background: "var(--pg-input)",
                border: "1px solid var(--pg-input-border)",
                color: "var(--pg-text-1)",
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRejectOpen(false)}
                className="h-9 px-4 rounded-xl text-[13px] font-medium"
                style={{
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-2)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!notes.trim()) {
                    toast({ title: "Reason is required", variant: "destructive" });
                    return;
                  }
                  rejectMutation.mutate(notes.trim());
                }}
                disabled={rejectMutation.isPending}
                className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: "#dc2626" }}
              >
                {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Permanently Reject"}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Sheet: Dispatch (Mark as Sent to Bank) ────────────────────────── */}
      <Sheet open={dispatchOpen} onOpenChange={setDispatchOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Mark as Sent to Bank</SheetTitle>
            <SheetDescription>
              Enter the bank transaction reference from your online banking or payment platform.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-3">
            <label
              className="block text-[12px] font-medium"
              style={{ color: "var(--pg-text-2)" }}
            >
              Bank Reference (required)
            </label>
            <input
              type="text"
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value)}
              placeholder="e.g. TXN20261014123456"
              className="w-full h-10 px-3 rounded-xl text-[13px] font-mono outline-none"
              style={{
                background: "var(--pg-input)",
                border: "1px solid var(--pg-input-border)",
                color: "var(--pg-text-1)",
              }}
            />
            <p className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>
              Use narration: {request.instruction_id} — {request.beneficiary_name}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDispatchOpen(false)}
                className="h-9 px-4 rounded-xl text-[13px] font-medium"
                style={{
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-2)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!bankRef.trim()) {
                    toast({ title: "Bank reference is required", variant: "destructive" });
                    return;
                  }
                  dispatchMutation.mutate(bankRef.trim());
                }}
                disabled={dispatchMutation.isPending}
                className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)" }}
              >
                {dispatchMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin inline" />
                  : "Confirm Dispatch"}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Sheet: Bank Confirmation ──────────────────────────────────────── */}
      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Attach Bank Confirmation</SheetTitle>
            <SheetDescription>
              Enter the path or URL to the bank confirmation document (debit advice, receipt, etc.).
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-3">
            <label
              className="block text-[12px] font-medium"
              style={{ color: "var(--pg-text-2)" }}
            >
              Confirmation Document Path / URL (required)
            </label>
            <input
              type="text"
              value={confirmDoc}
              onChange={(e) => setConfirmDoc(e.target.value)}
              placeholder="e.g. /uploads/confirmations/2026-10/debit-advice.pdf"
              className="w-full h-10 px-3 rounded-xl text-[13px] font-mono outline-none"
              style={{
                background: "var(--pg-input)",
                border: "1px solid var(--pg-input-border)",
                color: "var(--pg-text-1)",
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="h-9 px-4 rounded-xl text-[13px] font-medium"
                style={{
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-2)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!confirmDoc.trim()) {
                    toast({ title: "Document path is required", variant: "destructive" });
                    return;
                  }
                  confirmMutation.mutate(confirmDoc.trim());
                }}
                disabled={confirmMutation.isPending}
                className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
              >
                {confirmMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin inline" />
                  : "Save Confirmation"}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
