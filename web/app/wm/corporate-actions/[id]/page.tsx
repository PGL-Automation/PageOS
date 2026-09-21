"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Play,
  X,
  TrendingUp,
  DollarSign,
  BarChart3,
  AlertCircle,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

/* ─── Types ────────────────────────────────────────────────────────────── */

type CAStatus = "pending" | "processed" | "cancelled";

type ActionType =
  | "cash_dividend"
  | "stock_split"
  | "bonus_share"
  | "rights_issue"
  | "coupon_payment"
  | "stock_dividend"
  | "merger"
  | "spin_off";

type CorporateAction = {
  id: string;
  instrument_id: string;
  ticker: string;
  instrument_name: string;
  action_type: ActionType;
  ex_date: string;
  pay_date?: string;
  status: CAStatus;
  amount_per_unit?: number;
  split_ratio?: string;
  bonus_ratio?: string;
  rights_ratio?: string;
  rights_price?: number;
  notes?: string;
  created_by_name: string;
  created_at: string;
  processed_at?: string;
  processed_by_name?: string;
};

type ImpactRow = {
  fund_id: string;
  fund_name: string;
  fund_code: string;
  quantity_before: number;
  quantity_after: number;
  quantity_delta: number;
  cash_distributed?: number;
  status: "applied" | "pending" | "skipped";
};

/* ─── Demo Data ─────────────────────────────────────────────────────────── */

const DEMO_ACTIONS: Record<string, CorporateAction> = {
  ca1: {
    id: "ca1",
    instrument_id: "inst-1",
    ticker: "DANGCEM",
    instrument_name: "Dangote Cement Plc",
    action_type: "cash_dividend",
    ex_date: "2026-09-10",
    pay_date: "2026-09-25",
    status: "pending",
    amount_per_unit: 20.0,
    notes: "2025 Final dividend approved by the board on 5 Aug 2026.",
    created_by_name: "Admin",
    created_at: "2026-09-01T09:00:00Z",
  },
  ca2: {
    id: "ca2",
    instrument_id: "inst-2",
    ticker: "MTNN",
    instrument_name: "MTN Nigeria Plc",
    action_type: "coupon_payment",
    ex_date: "2026-08-15",
    pay_date: "2026-08-30",
    status: "processed",
    amount_per_unit: 85.5,
    notes: "H1 2025 coupon on MTNN bond",
    created_by_name: "Admin",
    created_at: "2026-08-05T11:30:00Z",
    processed_at: "2026-08-16T08:00:00Z",
    processed_by_name: "Admin",
  },
  ca3: {
    id: "ca3",
    instrument_id: "inst-3",
    ticker: "ZENITHBANK",
    instrument_name: "Zenith Bank Plc",
    action_type: "stock_split",
    ex_date: "2026-09-18",
    status: "pending",
    split_ratio: "2:1",
    notes: "2-for-1 stock split following board approval on 10 Sep 2026.",
    created_by_name: "Admin",
    created_at: "2026-09-08T14:00:00Z",
  },
  ca5: {
    id: "ca5",
    instrument_id: "inst-5",
    ticker: "FBNH",
    instrument_name: "FBN Holdings Plc",
    action_type: "rights_issue",
    ex_date: "2026-10-01",
    pay_date: "2026-10-20",
    status: "pending",
    rights_ratio: "1:5",
    rights_price: 14.5,
    notes: "Qualifying shareholders eligible. Sub list closes 18 Oct.",
    created_by_name: "Admin",
    created_at: "2026-09-15T09:30:00Z",
  },
};

const DEMO_IMPACT: ImpactRow[] = [
  {
    fund_id: "fund-1",
    fund_name: "Page Equity Growth Fund",
    fund_code: "PAGE-EQ",
    quantity_before: 500000,
    quantity_after: 500000,
    quantity_delta: 0,
    cash_distributed: 10000000,
    status: "pending",
  },
  {
    fund_id: "fund-2",
    fund_name: "Page Balanced Fund",
    fund_code: "PAGE-BAL",
    quantity_before: 200000,
    quantity_after: 200000,
    quantity_delta: 0,
    cash_distributed: 4000000,
    status: "pending",
  },
  {
    fund_id: "fund-3",
    fund_name: "Adaeze Okonkwo — Segregated",
    fund_code: "SEG-AO",
    quantity_before: 100000,
    quantity_after: 100000,
    quantity_delta: 0,
    cash_distributed: 2000000,
    status: "pending",
  },
  {
    fund_id: "fund-4",
    fund_name: "Page Fixed Income Fund",
    fund_code: "PAGE-FI",
    quantity_before: 50000,
    quantity_after: 50000,
    quantity_delta: 0,
    cash_distributed: 1000000,
    status: "pending",
  },
];

/* ─── Formatters ─────────────────────────────────────────────────────────── */

function fmtDate(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoney(n: number | undefined) {
  if (n == null) return "—";
  return "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number) {
  return n.toLocaleString("en-NG");
}

const ACTION_TYPE_LABEL: Record<ActionType, string> = {
  cash_dividend:  "Cash Dividend",
  stock_split:    "Stock Split",
  bonus_share:    "Bonus Share",
  rights_issue:   "Rights Issue",
  coupon_payment: "Coupon Payment",
  stock_dividend: "Stock Dividend",
  merger:         "Merger",
  spin_off:       "Spin-Off",
};

const ACTION_TYPE_COLORS: Record<ActionType, { bg: string; color: string }> = {
  cash_dividend:  { bg: "#d1fae5", color: "#065f46" },
  coupon_payment: { bg: "#dbeafe", color: "#1d4ed8" },
  stock_split:    { bg: "#ede9fe", color: "#6d28d9" },
  bonus_share:    { bg: "#fef3c7", color: "#92400e" },
  rights_issue:   { bg: "#fff0e0", color: "#E05500" },
  stock_dividend: { bg: "#d1fae5", color: "#065f46" },
  merger:         { bg: "#fee2e2", color: "#991b1b" },
  spin_off:       { bg: "#f1f5f9", color: "#475569" },
};

const STATUS_META: Record<CAStatus, { bg: string; color: string; label: string; Icon: typeof CheckCircle2 }> = {
  pending:   { bg: "#fef3c7", color: "#92400e", label: "Pending",   Icon: Clock },
  processed: { bg: "#d1fae5", color: "#065f46", label: "Processed", Icon: CheckCircle2 },
  cancelled: { bg: "#fee2e2", color: "#991b1b", label: "Cancelled", Icon: XCircle },
};

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function CorporateActionDetailPage() {
  const params    = useParams<{ id: string }>();
  const router    = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const id = params?.id ?? "";

  const [showConfirm, setShowConfirm] = useState(false);

  /* Fetch action */
  const { data: remoteAction, isLoading: actionLoading } = useQuery<CorporateAction>({
    queryKey: ["corporate-action", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/portfolio/corporate-actions/${id}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    retry: false,
    enabled: !!id,
  });

  /* Fetch impact */
  const { data: remoteImpact, isLoading: impactLoading } = useQuery<ImpactRow[]>({
    queryKey: ["corporate-action-impact", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/portfolio/corporate-actions/${id}/impact`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Not found");
      const json = await r.json();
      return Array.isArray(json) ? json : [];
    },
    retry: false,
    enabled: !!id,
  });

  /* Use demo data as fallback */
  const action = remoteAction ?? DEMO_ACTIONS[id] ?? null;
  const impact = Array.isArray(remoteImpact) && remoteImpact.length > 0
    ? remoteImpact
    : DEMO_IMPACT;
  const isDemo = !remoteAction || !remoteImpact;

  /* Process mutation */
  const processMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/v1/portfolio/corporate-actions/${id}/process`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const err = await r.text();
        throw new Error(err || "Failed to process");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["corporate-action", id] });
      queryClient.invalidateQueries({ queryKey: ["corporate-action-impact", id] });
      queryClient.invalidateQueries({ queryKey: ["corporate-actions"] });
      toast({
        title: "Corporate action processed",
        description: `All fund holdings have been updated for ${action?.ticker}.`,
      });
      setShowConfirm(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error processing", description: err.message });
    },
  });

  /* Loading */
  if (actionLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
      </div>
    );
  }

  if (!action) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertCircle className="w-8 h-8" style={{ color: "var(--pg-text-3)" }} />
        <p className="text-[14px]" style={{ color: "var(--pg-text-2)" }}>
          Corporate action not found.
        </p>
        <Link
          href="/wm/corporate-actions"
          className="text-[13px] font-semibold"
          style={{ color: "#FF6600" }}
        >
          Back to list
        </Link>
      </div>
    );
  }

  const typeMeta   = ACTION_TYPE_COLORS[action.action_type] ?? { bg: "#f1f5f9", color: "#475569" };
  const statusMeta = STATUS_META[action.status];
  const totalCash  = impact.reduce((s, r) => s + (r.cash_distributed ?? 0), 0);

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">

      {/* ── Back + Header ── */}
      <div>
        <Link
          href="/wm/corporate-actions"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold mb-4"
          style={{ color: "var(--pg-text-3)", textDecoration: "none" }}
        >
          <ChevronLeft size={14} />
          Corporate Actions
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
            >
              <Zap size={20} color="#fff" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-[18px] font-bold"
                  style={{ color: "var(--pg-text-1)" }}
                >
                  {action.ticker}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 9px",
                    borderRadius: 20,
                    background: typeMeta.bg,
                    color: typeMeta.color,
                  }}
                >
                  {ACTION_TYPE_LABEL[action.action_type]}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 9px",
                    borderRadius: 20,
                    background: statusMeta.bg,
                    color: statusMeta.color,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <statusMeta.Icon size={11} />
                  {statusMeta.label}
                </span>
              </div>
              <p className="text-[13px] mt-0.5" style={{ color: "var(--pg-text-2)" }}>
                {action.instrument_name}
              </p>
            </div>
          </div>

          {/* Process button */}
          {action.status === "pending" && (
            <button
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white"
              style={{
                background: "linear-gradient(135deg,#059669,#047857)",
                boxShadow: "0 1px 8px rgba(5,150,105,0.35)",
              }}
            >
              <Play className="w-3.5 h-3.5" />
              Process Action
            </button>
          )}
        </div>
      </div>

      {/* ── Demo Banner ── */}
      {isDemo && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            borderRadius: 12,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <AlertTriangle size={15} color="#92400e" />
          <span style={{ fontSize: 13, color: "#92400e" }}>
            Sample data shown. Connect portfolio data to see live impact.
          </span>
          <span
            style={{
              marginLeft: 4,
              background: "#d97706",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 20,
              letterSpacing: "0.05em",
            }}
          >
            DEMO
          </span>
        </div>
      )}

      {/* ── Details + Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Action Details */}
        <div
          className="md:col-span-2 rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          <div className="h-[3px]" style={{ background: "#FF6600" }} />
          <div className="px-6 py-4 space-y-0">
            <p
              className="text-[10px] font-bold uppercase tracking-wider mb-4"
              style={{ color: "var(--pg-text-3)" }}
            >
              Action Details
            </p>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <DetailField label="Instrument" value={`${action.ticker} — ${action.instrument_name}`} />
              <DetailField label="Action Type"  value={ACTION_TYPE_LABEL[action.action_type]} />
              <DetailField label="Ex Date"       value={fmtDate(action.ex_date)} />
              <DetailField label="Pay Date"      value={fmtDate(action.pay_date)} />

              {/* Dynamic fields */}
              {action.amount_per_unit != null && (
                <DetailField label="Amount Per Unit" value={fmtMoney(action.amount_per_unit)} accent />
              )}
              {action.split_ratio && (
                <DetailField label="Split Ratio" value={action.split_ratio} accent />
              )}
              {action.bonus_ratio && (
                <DetailField label="Bonus Ratio" value={action.bonus_ratio} accent />
              )}
              {action.rights_ratio && (
                <DetailField label="Rights Ratio" value={action.rights_ratio} accent />
              )}
              {action.rights_price != null && (
                <DetailField label="Rights Price" value={fmtMoney(action.rights_price)} accent />
              )}

              <DetailField label="Created By"  value={action.created_by_name} />
              <DetailField label="Created"     value={fmtDateTime(action.created_at)} />

              {action.processed_at && (
                <>
                  <DetailField label="Processed By" value={action.processed_by_name ?? "—"} />
                  <DetailField label="Processed At"  value={fmtDateTime(action.processed_at)} />
                </>
              )}
            </div>

            {action.notes && (
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--pg-card-border)" }}>
                <p
                  className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  Notes
                </p>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--pg-text-2)" }}>
                  {action.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Impact Summary */}
        <div className="space-y-4">
          {[
            {
              label: "Affected Funds",
              value: impact.length.toString(),
              color: "#FF6600",
              Icon: BarChart3,
            },
            {
              label: "Total Cash Distributed",
              value: totalCash > 0 ? fmtMoney(totalCash) : "—",
              color: "#059669",
              Icon: DollarSign,
            },
            {
              label: "Status",
              value: statusMeta.label,
              color: statusMeta.color,
              Icon: statusMeta.Icon,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "var(--pg-card)",
                border: "1px solid var(--pg-card-border)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}
            >
              <div className="h-[3px]" style={{ background: card.color }} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: card.color }}
                  >
                    {card.label}
                  </p>
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: card.color + "15" }}
                  >
                    <card.Icon className="w-4 h-4" style={{ color: card.color }} />
                  </div>
                </div>
                <p
                  className="text-[18px] font-bold leading-tight"
                  style={{ color: "var(--pg-text-1)" }}
                >
                  {card.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Impact Table ── */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 16,
          boxShadow: "0 1px 4px var(--pg-card-shadow)",
          overflow: "hidden",
        }}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--pg-card-border)" }}
        >
          <div>
            <p
              className="text-[13px] font-bold"
              style={{ color: "var(--pg-text-1)" }}
            >
              Fund Impact
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Holdings affected by this corporate action
            </p>
          </div>
          {impactLoading && (
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pg-text-3)" }} />
          )}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              {[
                "Fund",
                "Qty Before",
                "Qty After",
                "Change",
                "Cash Distributed",
                "Status",
              ].map((col) => (
                <th
                  key={col}
                  style={{
                    padding: "11px 16px",
                    textAlign: "left",
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--pg-text-3)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {impact.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: "40px 16px",
                    textAlign: "center",
                    color: "var(--pg-text-3)",
                    fontSize: 13,
                  }}
                >
                  No fund impact data available.
                </td>
              </tr>
            ) : (
              impact.map((row, i) => (
                <ImpactRow
                  key={row.fund_id}
                  row={row}
                  isLast={i === impact.length - 1}
                  actionType={action.action_type}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Confirmation Dialog ── */}
      {showConfirm && (
        <ConfirmModal
          action={action}
          impactCount={impact.length}
          totalCash={totalCash}
          isPending={processMutation.isPending}
          onConfirm={() => processMutation.mutate()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

/* ─── Detail Field ──────────────────────────────────────────────────────── */

function DetailField({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--pg-text-3)",
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 13,
          fontWeight: accent ? 700 : 500,
          color: accent ? "#FF6600" : "var(--pg-text-1)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

/* ─── Impact Row ────────────────────────────────────────────────────────── */

function ImpactRow({
  row,
  isLast,
  actionType,
}: {
  row: ImpactRow;
  isLast: boolean;
  actionType: ActionType;
}) {
  const [hovered, setHovered] = useState(false);

  const impactStatusMeta = {
    applied: { bg: "#d1fae5", color: "#065f46", label: "Applied" },
    pending: { bg: "#fef3c7", color: "#92400e", label: "Pending" },
    skipped: { bg: "#f1f5f9", color: "#475569", label: "Skipped" },
  }[row.status];

  const delta = row.quantity_delta;
  const showDelta = actionType === "stock_split" || actionType === "bonus_share" || actionType === "stock_dividend";

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--pg-row-hover)" : "transparent",
        borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)",
        transition: "background 0.12s",
      }}
    >
      {/* Fund */}
      <td style={{ padding: "12px 16px" }}>
        <div>
          <span
            className="text-[11px] font-bold"
            style={{ color: "#FF6600" }}
          >
            {row.fund_code}
          </span>
          <span
            className="block text-[12px]"
            style={{ color: "var(--pg-text-2)" }}
          >
            {row.fund_name}
          </span>
        </div>
      </td>

      {/* Qty Before */}
      <td style={{ padding: "12px 16px" }}>
        <span className="text-[13px] tabular-nums" style={{ color: "var(--pg-text-1)" }}>
          {fmtQty(row.quantity_before)}
        </span>
      </td>

      {/* Qty After */}
      <td style={{ padding: "12px 16px" }}>
        <span
          className="text-[13px] font-semibold tabular-nums"
          style={{
            color: showDelta && row.quantity_after > row.quantity_before
              ? "#059669"
              : "var(--pg-text-1)",
          }}
        >
          {fmtQty(row.quantity_after)}
        </span>
      </td>

      {/* Change */}
      <td style={{ padding: "12px 16px" }}>
        {showDelta ? (
          <span
            className="text-[12px] font-semibold"
            style={{ color: delta > 0 ? "#059669" : delta < 0 ? "#dc2626" : "var(--pg-text-3)" }}
          >
            {delta > 0 ? "+" : ""}{fmtQty(delta)}
          </span>
        ) : (
          <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>—</span>
        )}
      </td>

      {/* Cash Distributed */}
      <td style={{ padding: "12px 16px" }}>
        <span
          className="text-[13px] font-semibold"
          style={{ color: row.cash_distributed ? "#059669" : "var(--pg-text-3)" }}
        >
          {row.cash_distributed ? fmtMoney(row.cash_distributed) : "—"}
        </span>
      </td>

      {/* Status */}
      <td style={{ padding: "12px 16px" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 9px",
            borderRadius: 20,
            background: impactStatusMeta.bg,
            color: impactStatusMeta.color,
            whiteSpace: "nowrap",
          }}
        >
          {impactStatusMeta.label}
        </span>
      </td>
    </tr>
  );
}

/* ─── Confirmation Modal ─────────────────────────────────────────────────── */

function ConfirmModal({
  action,
  impactCount,
  totalCash,
  isPending,
  onConfirm,
  onCancel,
}: {
  action: CorporateAction;
  impactCount: number;
  totalCash: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--pg-card)",
          borderRadius: 20,
          boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          border: "1px solid var(--pg-card-border)",
          width: 480,
          maxWidth: "95vw",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--pg-card-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "#d1fae5" }}
            >
              <Play className="w-4 h-4" style={{ color: "#059669" }} />
            </div>
            <div>
              <p className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                Process Corporate Action
              </p>
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                This action cannot be undone.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "var(--pg-muted-bg)" }}
          >
            <X className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div
            style={{
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              borderRadius: 12,
              padding: "12px 14px",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <AlertTriangle size={15} color="#92400e" style={{ marginTop: 1, flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: "#92400e", lineHeight: 1.5 }}>
              You are about to process a <strong>{ACTION_TYPE_LABEL[action.action_type]}</strong> for{" "}
              <strong>{action.ticker}</strong>. This will update holdings across{" "}
              <strong>{impactCount} fund{impactCount !== 1 ? "s" : ""}</strong>
              {totalCash > 0 && (
                <> and distribute <strong>{fmtMoney(totalCash)}</strong> in cash</>
              )}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-xl p-3"
              style={{
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-card-border)",
              }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>
                Instrument
              </p>
              <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                {action.ticker}
              </p>
            </div>
            <div
              className="rounded-xl p-3"
              style={{
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-card-border)",
              }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>
                Ex Date
              </p>
              <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                {fmtDate(action.ex_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4"
          style={{ borderTop: "1px solid var(--pg-card-border)" }}
        >
          <button
            onClick={onCancel}
            disabled={isPending}
            className="h-9 px-5 rounded-xl text-[13px] font-semibold transition-colors"
            style={{
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
              border: "1px solid var(--pg-card-border)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg,#059669,#047857)",
              boxShadow: "0 1px 8px rgba(5,150,105,0.35)",
            }}
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Confirm &amp; Process
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
