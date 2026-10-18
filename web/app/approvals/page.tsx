"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Clock, AlertCircle, Loader2, CheckCircle2,
  ChevronRight, FileText, ArrowRight, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

// ── Types ──────────────────────────────────────────────────────────────────────

type PendingStep = {
  id: string;
  request_id: string;
  step_order: number;
  step_type: string;
  status: string;
  due_by: string;
  notes: string;
  // embedded request fields
  instruction_id: string;
  request_type: string;
  amount_kobo: number;
  beneficiary_name: string;
  beneficiary_bank: string;
  beneficiary_account: string;
  purpose: string;
  subsidiary_id: string;
  raised_by_name?: string;
  updated_at?: string;
};

type PaymentRequest = {
  id: string;
  instruction_id: string;
  subsidiary_id: string;
  request_type: string;
  amount_kobo: number;
  beneficiary_name: string;
  beneficiary_bank: string;
  beneficiary_account: string;
  purpose: string;
  status: string;
  raised_by: string;
  raised_by_name?: string;
  updated_at: string;
  created_at: string;
  submitted_at?: string;
};

type StatusFilter = "all" | "mine" | string;

// ── Constants ──────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

const REQUEST_TYPES: Record<string, string> = {
  client_payout: "Client Payout",
  liquidation:   "Liquidation",
  transfer:      "Transfer",
  expense:       "Expense",
  placement:     "Placement",
};

const STATUS_LABELS: Record<string, string> = {
  draft:               "Draft",
  submitted:           "Submitted",
  head_concur:         "Head Concurrence",
  internal_control:    "Internal Control",
  compliance:          "Compliance",
  finance_check:       "Finance Check",
  pending_signatories: "Pending Signatories",
  approved:            "Approved",
  sent_to_bank:        "Sent to Bank",
  confirmed:           "Confirmed",
  reconciled:          "Reconciled",
  returned:            "Returned",
  rejected:            "Rejected",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:               { bg: "#f3f4f6", color: "#6b7280" },
  submitted:           { bg: "#fef3c7", color: "#d97706" },
  head_concur:         { bg: "#fef3c7", color: "#d97706" },
  internal_control:    { bg: "#fef3c7", color: "#d97706" },
  compliance:          { bg: "#fef3c7", color: "#d97706" },
  finance_check:       { bg: "#fef3c7", color: "#d97706" },
  pending_signatories: { bg: "#fef3c7", color: "#d97706" },
  approved:            { bg: "#dbeafe", color: "#1d4ed8" },
  sent_to_bank:        { bg: "#e0e7ff", color: "#4338ca" },
  confirmed:           { bg: "#d1fae5", color: "#065f46" },
  reconciled:          { bg: "#d1fae5", color: "#065f46" },
  returned:            { bg: "#fed7aa", color: "#9a3412" },
  rejected:            { bg: "#fee2e2", color: "#991b1b" },
};

const STEP_TYPE_LABELS: Record<string, string> = {
  head_concur:      "Head Concurrence",
  internal_control: "Internal Control",
  compliance:       "Compliance Review",
  finance_check:    "Finance Check",
  signatory_1:      "First Signatory",
  signatory_2:      "Second Signatory",
  md:               "Managing Director",
  ceo:              "CEO",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function kobo(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n / 100);
}

async function payoutFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1/payouts${path}`, {
    credentials: "include",
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? body?.message ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function formatDueTime(dueBy: string): { label: string; overdue: boolean } {
  const due  = new Date(dueBy);
  const now  = new Date();
  const diff = due.getTime() - now.getTime();

  if (diff < 0) {
    const mins = Math.round(Math.abs(diff) / 60_000);
    if (mins < 60)  return { label: `${mins}m overdue`, overdue: true };
    const hrs = Math.floor(mins / 60);
    return { label: `${hrs}h overdue`, overdue: true };
  }

  const mins = Math.round(diff / 60_000);
  if (mins < 60)  return { label: `${mins}m left`, overdue: false };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return { label: `${hrs}h left`, overdue: false };
  const days = Math.floor(hrs / 24);
  return { label: `${days}d left`, overdue: false };
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const label = REQUEST_TYPES[type] ?? type;
  const colorMap: Record<string, { bg: string; color: string }> = {
    client_payout: { bg: "#dbeafe", color: "#1d4ed8" },
    liquidation:   { bg: "#f3e8ff", color: "#7c3aed" },
    transfer:      { bg: "#ecfeff", color: "#0891b2" },
    expense:       { bg: "#fef9c3", color: "#ca8a04" },
    placement:     { bg: "#dcfce7", color: "#15803d" },
  };
  const { bg, color } = colorMap[type] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span
      className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const { bg, color } = STATUS_COLORS[status] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span
      className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

function PendingCard({ step, onClick }: { step: PendingStep; onClick: () => void }) {
  const due = formatDueTime(step.due_by);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-all hover:shadow-md group"
      style={{
        background: "var(--pg-card)",
        border: due.overdue ? "1.5px solid #fca5a5" : "1px solid var(--pg-card-border)",
      }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono font-bold" style={{ color: "var(--pg-text-3)" }}>
            {step.instruction_id || "—"}
          </span>
          <TypeBadge type={step.request_type} />
        </div>
        <ChevronRight
          className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: "var(--pg-text-4)" }}
        />
      </div>

      {/* Amount */}
      <p className="text-[20px] font-bold tabular-nums mb-0.5" style={{ color: "var(--pg-text-1)" }}>
        {kobo(step.amount_kobo)}
      </p>

      {/* Beneficiary */}
      <p className="text-[12px] font-medium truncate mb-0.5" style={{ color: "var(--pg-text-2)" }}>
        {step.beneficiary_name}
      </p>
      <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>
        {step.beneficiary_bank} &middot; {step.beneficiary_account}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
        <span className="text-[11px] font-semibold" style={{ color: "var(--pg-text-3)" }}>
          {STEP_TYPE_LABELS[step.step_type] ?? step.step_type}
        </span>
        <span
          className="flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: due.overdue ? "#dc2626" : "#d97706" }}
        >
          {due.overdue
            ? <AlertCircle className="w-3.5 h-3.5" />
            : <Clock className="w-3.5 h-3.5" />
          }
          {due.label}
        </span>
      </div>
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { subsidiary } = useAuth();
  const router = useRouter();

  const subsidId = subsidiary?.ID ?? "";

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [mineOnly, setMineOnly]         = useState(false);

  // My pending steps
  const {
    data: pendingSteps = [],
    isLoading: pendingLoading,
    error: pendingError,
  } = useQuery<PendingStep[]>({
    queryKey: ["approvals-pending"],
    queryFn: () => payoutFetch<PendingStep[]>("/pending"),
    refetchInterval: 60_000,
  });

  // All requests
  const {
    data: allRequests = [],
    isLoading: requestsLoading,
    error: requestsError,
  } = useQuery<PaymentRequest[]>({
    queryKey: ["approvals-all", subsidId, statusFilter, mineOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (subsidId)                     params.set("subsidiary_id", subsidId);
      if (statusFilter !== "all")       params.set("status", statusFilter);
      if (mineOnly)                     params.set("mine", "true");
      return payoutFetch<PaymentRequest[]>(`/?${params.toString()}`);
    },
    enabled: true,
    refetchInterval: 120_000,
  });

  const statusOptions = [
    "all",
    "draft",
    "submitted",
    "head_concur",
    "internal_control",
    "compliance",
    "finance_check",
    "pending_signatories",
    "approved",
    "sent_to_bank",
    "confirmed",
    "reconciled",
    "returned",
    "rejected",
  ];

  return (
    <div className="max-w-[1200px] mx-auto space-y-8 px-4 py-6">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <CheckCircle2 className="w-4 h-4" style={{ color: "#FF6600" }} />
            <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              Approvals
            </h1>
          </div>
          <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
            {subsidiary?.Name ?? "Page Group"} &middot; Payment requests and approval actions
          </p>
        </div>
        <Link
          href="/approvals/new"
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white shrink-0"
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
        >
          <Plus className="w-4 h-4" />
          Raise Request
        </Link>
      </div>

      {/* ── My Pending Actions ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            My Pending Actions
          </h2>
          {pendingSteps.length > 0 && (
            <span
              className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: "#fef3c7", color: "#d97706" }}
            >
              {pendingSteps.length} waiting
            </span>
          )}
        </div>

        {pendingLoading && (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
          </div>
        )}

        {!pendingLoading && pendingError && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-2xl text-[12px]"
            style={{ background: "#fee2e2", color: "#991b1b" }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            Failed to load pending actions. Retry by refreshing.
          </div>
        )}

        {!pendingLoading && !pendingError && pendingSteps.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-24 rounded-2xl gap-2"
            style={{ background: "var(--pg-muted-bg)", border: "1px dashed var(--pg-card-border)" }}
          >
            <CheckCircle2 className="w-5 h-5" style={{ color: "#059669" }} />
            <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              No pending actions — you are all caught up.
            </p>
          </div>
        )}

        {!pendingLoading && pendingSteps.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingSteps.map((step) => (
              <PendingCard
                key={step.id}
                step={step}
                onClick={() => router.push(`/approvals/${step.request_id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── All Requests ─────────────────────────────────────────────────────── */}
      <section>
        {/* Section header + filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            All Requests
          </h2>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mine / All toggle */}
            <div
              className="flex rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--pg-card-border)" }}
            >
              {(["all_req", "mine_req"] as const).map((opt) => {
                const isMine = opt === "mine_req";
                const active = mineOnly === isMine;
                return (
                  <button
                    key={opt}
                    onClick={() => setMineOnly(isMine)}
                    className="h-8 px-3 text-[11px] font-semibold transition-colors"
                    style={{
                      background: active ? "#FF6600" : "var(--pg-card)",
                      color: active ? "#fff" : "var(--pg-text-2)",
                    }}
                  >
                    {isMine ? "My Requests" : "All"}
                  </button>
                );
              })}
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px]"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <Filter className="w-3 h-3" style={{ color: "var(--pg-text-3)" }} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent outline-none text-[11px] font-medium cursor-pointer"
                style={{ color: "var(--pg-text-1)" }}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All Statuses" : (STATUS_LABELS[s] ?? s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          {requestsLoading && (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
            </div>
          )}

          {!requestsLoading && requestsError && (
            <div
              className="flex items-center gap-2 m-4 px-4 py-3 rounded-xl text-[12px]"
              style={{ background: "#fee2e2", color: "#991b1b" }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              Failed to load requests. Refresh to try again.
            </div>
          )}

          {!requestsLoading && !requestsError && allRequests.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <FileText className="w-6 h-6" style={{ color: "var(--pg-text-4)" }} />
              <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                No payment requests found.
              </p>
              <Link
                href="/approvals/new"
                className="flex items-center gap-1 text-[11px] font-semibold mt-1"
                style={{ color: "#FF6600" }}
              >
                Raise one now <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {!requestsLoading && allRequests.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                    {["ID", "Type", "Amount", "Beneficiary", "Status", "Raised By", "Updated"].map(
                      (col) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          {col}
                        </th>
                      )
                    )}
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {allRequests.map((req) => (
                    <tr
                      key={req.id}
                      className="border-b cursor-pointer transition-colors"
                      style={{ borderColor: "var(--pg-row-border)" }}
                      onClick={() => router.push(`/approvals/${req.id}`)}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "";
                      }}
                    >
                      {/* ID */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="text-[11px] font-mono font-semibold"
                          style={{ color: "var(--pg-text-2)" }}
                        >
                          {req.instruction_id || "—"}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3">
                        <TypeBadge type={req.request_type} />
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="text-[13px] font-semibold tabular-nums"
                          style={{ color: "var(--pg-text-1)" }}
                        >
                          {kobo(req.amount_kobo)}
                        </span>
                      </td>

                      {/* Beneficiary */}
                      <td className="px-4 py-3 max-w-[180px]">
                        <p
                          className="text-[12px] font-medium truncate"
                          style={{ color: "var(--pg-text-1)" }}
                        >
                          {req.beneficiary_name}
                        </p>
                        <p
                          className="text-[10px] truncate"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          {req.beneficiary_bank}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={req.status} />
                      </td>

                      {/* Raised By */}
                      <td className="px-4 py-3">
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--pg-text-2)" }}
                        >
                          {req.raised_by_name || "—"}
                        </span>
                      </td>

                      {/* Updated */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          {fmtDate(req.updated_at)}
                        </span>
                      </td>

                      {/* Arrow */}
                      <td className="px-4 py-3">
                        <ChevronRight
                          className="w-4 h-4"
                          style={{ color: "var(--pg-text-4)" }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
