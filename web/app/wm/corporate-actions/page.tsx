"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  Plus,
  Download,
  Filter,
  Loader2,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  BarChart3,
  X,
  ChevronRight,
  Zap,
} from "lucide-react";
import { CreateCorporateActionForm } from "./components/CreateCorporateActionForm";

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
  affected_funds?: number;
};

/* ─── Demo Data ─────────────────────────────────────────────────────────── */

const DEMO_ACTIONS: CorporateAction[] = [
  {
    id: "ca1",
    instrument_id: "inst-1",
    ticker: "DANGCEM",
    instrument_name: "Dangote Cement Plc",
    action_type: "cash_dividend",
    ex_date: "2026-09-10",
    pay_date: "2026-09-25",
    status: "pending",
    amount_per_unit: 20.0,
    notes: "2025 Final dividend",
    created_by_name: "Admin",
    created_at: "2026-09-01T09:00:00Z",
    affected_funds: 4,
  },
  {
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
    affected_funds: 3,
  },
  {
    id: "ca3",
    instrument_id: "inst-3",
    ticker: "ZENITHBANK",
    instrument_name: "Zenith Bank Plc",
    action_type: "stock_split",
    ex_date: "2026-09-18",
    status: "pending",
    split_ratio: "2:1",
    notes: "2-for-1 stock split",
    created_by_name: "Admin",
    created_at: "2026-09-08T14:00:00Z",
    affected_funds: 5,
  },
  {
    id: "ca4",
    instrument_id: "inst-4",
    ticker: "ACCESSCORP",
    instrument_name: "Access Holdings Plc",
    action_type: "bonus_share",
    ex_date: "2026-07-20",
    pay_date: "2026-08-05",
    status: "processed",
    bonus_ratio: "1:10",
    notes: "1 bonus share for every 10 held",
    created_by_name: "Admin",
    created_at: "2026-07-10T10:00:00Z",
    affected_funds: 2,
  },
  {
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
    notes: "Qualifying shareholders eligible",
    created_by_name: "Admin",
    created_at: "2026-09-15T09:30:00Z",
    affected_funds: 3,
  },
  {
    id: "ca6",
    instrument_id: "inst-6",
    ticker: "GTCO",
    instrument_name: "Guaranty Trust Holding Co.",
    action_type: "cash_dividend",
    ex_date: "2026-06-10",
    pay_date: "2026-06-28",
    status: "cancelled",
    amount_per_unit: 3.5,
    notes: "Cancelled — pending regulatory approval",
    created_by_name: "Admin",
    created_at: "2026-06-01T08:00:00Z",
    affected_funds: 0,
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

function fmtAmount(n: number | undefined) {
  if (n == null) return "—";
  return "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function amountDisplay(action: CorporateAction): string {
  if (action.amount_per_unit != null)
    return fmtAmount(action.amount_per_unit) + " / unit";
  if (action.split_ratio)  return "Split " + action.split_ratio;
  if (action.bonus_ratio)  return "Bonus " + action.bonus_ratio;
  if (action.rights_ratio) return "Rights " + action.rights_ratio + (action.rights_price ? ` @ ₦${action.rights_price}` : "");
  return "—";
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function CorporateActionsPage() {
  const { subsidiary } = useAuth();
  const subsidName = subsidiary?.Name ?? "Page Asset Management";
  const subsidId   = subsidiary?.ID ?? "";

  /* Remote fetch — falls back to demo data gracefully */
  const { data: remoteActions, isLoading } = useQuery<CorporateAction[]>({
    queryKey: ["corporate-actions", subsidId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/portfolio/corporate-actions`, { credentials: "include" });
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    retry: false,
  });

  const actions = Array.isArray(remoteActions) && remoteActions.length > 0
    ? remoteActions
    : DEMO_ACTIONS;
  const isDemo = !remoteActions || remoteActions.length === 0;

  /* Local state */
  const [statusFilter, setStatusFilter] = useState<CAStatus | "all">("all");
  const [typeFilter,   setTypeFilter]   = useState<ActionType | "all">("all");
  const [showCreate,   setShowCreate]   = useState(false);

  /* Filtered */
  const filtered = actions.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (typeFilter   !== "all" && a.action_type !== typeFilter) return false;
    return true;
  });

  /* Summary stats */
  const pending   = actions.filter((a) => a.status === "pending").length;
  const processed = actions.filter((a) => a.status === "processed").length;
  const cancelled = actions.filter((a) => a.status === "cancelled").length;

  const STATUS_TABS: { key: CAStatus | "all"; label: string; count: number }[] = [
    { key: "all",       label: "All",       count: actions.length },
    { key: "pending",   label: "Pending",   count: pending },
    { key: "processed", label: "Processed", count: processed },
    { key: "cancelled", label: "Cancelled", count: cancelled },
  ];

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Zap size={20} color="#FF6600" />
            <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
              Corporate Actions
            </h1>
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {subsidName} · Dividends, Splits, Rights &amp; More
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
              border: "1px solid var(--pg-card-border)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Download size={14} />
            Export
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
            style={{
              background: "linear-gradient(135deg,#FF6600,#E05500)",
              boxShadow: "0 1px 8px rgba(255,102,0,0.35)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Create Corporate Action
          </button>
        </div>
      </div>

      {/* ── Demo Banner ── */}
      {isDemo && !isLoading && (
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
            Sample corporate action data shown. Connect portfolio data to see live events.
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

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Actions",   value: actions.length, color: "#FF6600", Icon: BarChart3 },
          { label: "Pending",         value: pending,        color: "#d97706", Icon: Clock },
          { label: "Processed",       value: processed,      color: "#059669", Icon: CheckCircle2 },
          { label: "Cancelled",       value: cancelled,      color: "#dc2626", Icon: XCircle },
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
                className="text-[22px] font-bold leading-tight"
                style={{ color: "var(--pg-text-1)" }}
              >
                {isLoading ? "—" : card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 16,
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {/* Status tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--pg-muted-bg)" }}>
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold transition-all"
                style={{
                  background: active ? "var(--pg-card)" : "transparent",
                  color: active ? "var(--pg-text-1)" : "var(--pg-text-3)",
                  boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {tab.label}
                <span
                  className="text-[10px] font-bold px-1.5 rounded-full"
                  style={{
                    background: active ? "#FF660015" : "transparent",
                    color: active ? "#FF6600" : "var(--pg-text-3)",
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ width: 1, height: 24, background: "var(--pg-card-border)" }} />

        {/* Action type filter */}
        <div className="flex items-center gap-2">
          <Filter size={13} style={{ color: "var(--pg-text-3)" }} />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ActionType | "all")}
            style={{
              height: 32,
              padding: "0 10px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              outline: "none",
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-2)",
              cursor: "pointer",
            }}
          >
            <option value="all">All Types</option>
            {(Object.entries(ACTION_TYPE_LABEL) as [ActionType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <span className="ml-auto text-[12px]" style={{ color: "var(--pg-text-3)" }}>
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 16,
          boxShadow: "0 1px 4px var(--pg-card-shadow)",
          overflow: "hidden",
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                {["Instrument", "Type", "Ex Date", "Pay Date", "Status", "Amount / Ratio", "Funds", "Actions"].map(
                  (col) => (
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
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: "48px 16px",
                      textAlign: "center",
                      color: "var(--pg-text-3)",
                      fontSize: 13,
                    }}
                  >
                    No corporate actions match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((action, i) => (
                  <CARow
                    key={action.id}
                    action={action}
                    isLast={i === filtered.length - 1}
                  />
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create Drawer/Modal ── */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <div style={{ width: 560, maxWidth: "95vw" }}>
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid var(--pg-card-border)" }}
            >
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                  Create Corporate Action
                </h2>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                  {subsidName}
                </p>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "var(--pg-muted-bg)" }}
              >
                <X className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
              </button>
            </div>
            <div className="px-6 py-5">
              <CreateCorporateActionForm
                onSuccess={() => setShowCreate(false)}
                onCancel={() => setShowCreate(false)}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ─── CARow Component ───────────────────────────────────────────────────── */

function CARow({
  action,
  isLast,
}: {
  action: CorporateAction;
  isLast: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const typeMeta   = ACTION_TYPE_COLORS[action.action_type] ?? { bg: "#f1f5f9", color: "#475569" };
  const statusMeta = STATUS_META[action.status];

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
      {/* Instrument */}
      <td style={{ padding: "12px 16px" }}>
        <div>
          <span
            className="text-[13px] font-bold"
            style={{ color: "#FF6600" }}
          >
            {action.ticker}
          </span>
          <span
            className="block text-[12px]"
            style={{ color: "var(--pg-text-2)" }}
          >
            {action.instrument_name}
          </span>
        </div>
      </td>

      {/* Type */}
      <td style={{ padding: "12px 16px" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 9px",
            borderRadius: 20,
            background: typeMeta.bg,
            color: typeMeta.color,
            whiteSpace: "nowrap",
          }}
        >
          {ACTION_TYPE_LABEL[action.action_type]}
        </span>
      </td>

      {/* Ex Date */}
      <td style={{ padding: "12px 16px" }}>
        <span className="text-[13px]" style={{ color: "var(--pg-text-1)" }}>
          {fmtDate(action.ex_date)}
        </span>
      </td>

      {/* Pay Date */}
      <td style={{ padding: "12px 16px" }}>
        <span className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
          {fmtDate(action.pay_date)}
        </span>
      </td>

      {/* Status */}
      <td style={{ padding: "12px 16px" }}>
        <div className="flex items-center gap-1.5">
          <statusMeta.Icon
            size={13}
            style={{ color: statusMeta.color, flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 9px",
              borderRadius: 20,
              background: statusMeta.bg,
              color: statusMeta.color,
              whiteSpace: "nowrap",
            }}
          >
            {statusMeta.label}
          </span>
        </div>
      </td>

      {/* Amount / Ratio */}
      <td style={{ padding: "12px 16px" }}>
        <span
          className="text-[13px] font-semibold"
          style={{ color: "var(--pg-text-1)" }}
        >
          {amountDisplay(action)}
        </span>
      </td>

      {/* Affected Funds */}
      <td style={{ padding: "12px 16px" }}>
        <span className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
          {action.affected_funds ?? 0} fund{action.affected_funds !== 1 ? "s" : ""}
        </span>
      </td>

      {/* Actions */}
      <td style={{ padding: "12px 16px" }}>
        <Link
          href={`/wm/corporate-actions/${action.id}`}
          style={{
            height: 28,
            padding: "0 12px",
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 600,
            background: "var(--pg-muted-bg)",
            color: "var(--pg-text-2)",
            border: "1px solid var(--pg-card-border)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            textDecoration: "none",
          }}
        >
          <Eye size={12} />
          View
        </Link>
      </td>
    </tr>
  );
}

/* ─── Modal Wrapper ─────────────────────────────────────────────────────── */

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
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
          overflow: "auto",
          maxHeight: "90vh",
          maxWidth: "95vw",
        }}
      >
        {children}
      </div>
    </div>
  );
}
