"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  Clock,
  User,
  X,
  Settings,
  Filter,
  ChevronDown,
  CheckSquare,
  MoreHorizontal,
  MessageSquare,
  Zap,
  Loader2,
  ChevronRight,
  RefreshCw,
  TrendingDown,
  Calendar,
  BarChart2,
} from "lucide-react";

const BASE = "http://localhost:8081";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtCompact(n: number, cur = "NGN") {
  const sym = cur === "USD" ? "$" : "₦";
  if (n >= 1e9) return sym + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sym + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return sym + (n / 1e3).toFixed(1) + "K";
  return sym + n.toLocaleString("en-NG");
}

function fmtDate(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AlertSeverity = "critical" | "high" | "warning" | "info";
type AlertStatus = "active" | "acknowledged" | "resolved";
type AlertType =
  | "maturity"
  | "liquidity"
  | "concentration"
  | "settlement"
  | "data_quality"
  | "approval";

type PMAlert = {
  id: string;
  severity: AlertSeverity;
  alert_type: AlertType;
  title: string;
  description: string;
  affected_record?: string;
  affected_link?: string;
  due_date?: string;
  owner: string;
  status: AlertStatus;
  created_at: string;
  is_demo: boolean;
};

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------
const DEMO_ALERTS: PMAlert[] = [
  {
    id: "a1",
    severity: "critical",
    alert_type: "maturity",
    title: "Asset maturity tomorrow",
    description:
      "NGT 364-Day T-Bill (₦500M) matures in 1 day. Rollover or redemption instruction required immediately.",
    affected_record: "Asset NGT-001",
    affected_link: "/pm/assets",
    due_date: "2026-09-08",
    owner: "Portfolio Manager",
    status: "active",
    created_at: "2026-09-07T08:00:00Z",
    is_demo: true,
  },
  {
    id: "a2",
    severity: "high",
    alert_type: "liquidity",
    title: "Available liquidity below threshold",
    description:
      "Current investable liquidity (₦1.2B) is below the approved minimum threshold (₦2.0B).",
    affected_record: "Liquidity Dashboard",
    affected_link: "/pm/liquidity",
    owner: "Treasury Ops",
    status: "active",
    created_at: "2026-09-07T06:00:00Z",
    is_demo: true,
  },
  {
    id: "a3",
    severity: "warning",
    alert_type: "concentration",
    title: "Counterparty concentration approaching limit",
    description:
      "Zenith Bank exposure is at 23.4% of portfolio — approaching the approved 25% limit.",
    affected_record: "Zenith Bank",
    affected_link: "/pm/alm",
    owner: "Risk",
    status: "acknowledged",
    created_at: "2026-09-07T04:00:00Z",
    is_demo: true,
  },
  {
    id: "a4",
    severity: "warning",
    alert_type: "maturity",
    title: "Liability due in 7 days",
    description:
      "Client fixed deposit obligation (₦800M) is due on 14 Sep 2026. Ensure funding is in place.",
    affected_record: "Liability LBL-042",
    affected_link: "/pm/liabilities",
    due_date: "2026-09-14",
    owner: "Portfolio Manager",
    status: "active",
    created_at: "2026-09-07T07:00:00Z",
    is_demo: true,
  },
  {
    id: "a5",
    severity: "info",
    alert_type: "approval",
    title: "Transaction pending approval",
    description:
      "Asset transaction TXN-2901 (₦350M FD placement) has been awaiting approval for 3 days.",
    affected_record: "Transaction TXN-2901",
    affected_link: "/pm/assets",
    owner: "Head of Investment",
    status: "active",
    created_at: "2026-09-04T09:00:00Z",
    is_demo: true,
  },
  {
    id: "a6",
    severity: "info",
    alert_type: "data_quality",
    title: "Stale instrument prices",
    description:
      "3 instruments have not had prices updated in the last 3 business days.",
    affected_record: "Asset Register",
    affected_link: "/pm/assets",
    owner: "Portfolio Manager",
    status: "active",
    created_at: "2026-09-07T02:00:00Z",
    is_demo: true,
  },
];

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SEV: Record<
  AlertSeverity,
  { color: string; bg: string; label: string; icon: React.ElementType }
> = {
  critical: { color: "#dc2626", bg: "#fee2e2", label: "Critical", icon: AlertCircle },
  high: { color: "#ea580c", bg: "#ffedd5", label: "High", icon: AlertTriangle },
  warning: { color: "#d97706", bg: "#fef3c7", label: "Warning", icon: AlertTriangle },
  info: { color: "#1d4ed8", bg: "#dbeafe", label: "Info", icon: Info },
};

const TYPE_ICONS: Record<AlertType, React.ElementType> = {
  maturity: Calendar,
  liquidity: TrendingDown,
  concentration: BarChart2,
  settlement: CheckSquare,
  data_quality: AlertCircle,
  approval: CheckCircle2,
};

const TYPE_LABELS: Record<AlertType, string> = {
  maturity: "Maturity",
  liquidity: "Liquidity",
  concentration: "Concentration",
  settlement: "Settlement",
  data_quality: "Data Quality",
  approval: "Approval",
};

const STATUS_BADGE: Record<AlertStatus, { bg: string; text: string; label: string }> = {
  active: { bg: "#fee2e2", text: "#991b1b", label: "Active" },
  acknowledged: { bg: "#fef3c7", text: "#92400e", label: "Acknowledged" },
  resolved: { bg: "#d1fae5", text: "#065f46", label: "Resolved" },
};

// ---------------------------------------------------------------------------
// Configure Thresholds Modal
// ---------------------------------------------------------------------------
function ConfigModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [maturityEnabled, setMaturityEnabled] = useState(true);
  const [maturityDays, setMaturityDays] = useState<number[]>([30, 14, 7, 3, 1]);
  const [liquidityMin, setLiquidityMin] = useState("2,000,000,000");
  const [concentrationLimit, setConcentrationLimit] = useState("25");
  const [perEntity, setPerEntity] = useState(true);
  const [settlementTime, setSettlementTime] = useState("15:00");
  const [inApp, setInApp] = useState(true);
  const [email, setEmail] = useState(true);
  const [recipients, setRecipients] = useState("pm@fund.ng, risk@fund.ng");

  function toggleDay(d: number) {
    setMaturityDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  function handleSave() {
    toast({ title: "Thresholds saved", description: "Alert configuration updated successfully." });
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 20,
          width: 560,
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        }}
      >
        {/* Modal header */}
        <div
          className="h-[3px]"
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", borderRadius: "20px 20px 0 0" }}
        />
        <div style={{ padding: "20px 24px 0" }} className="flex items-center justify-between">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--pg-text-1)" }}>
              Configure Alert Thresholds
            </div>
            <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 2 }}>
              Set the parameters that trigger portfolio alerts
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--pg-muted-bg)",
              border: "none",
              borderRadius: 10,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--pg-text-2)",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 1. Maturity Alerts */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--pg-text-1)" }}>
                Maturity Alerts
              </div>
              <button
                onClick={() => setMaturityEnabled((p) => !p)}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  border: "none",
                  background: maturityEnabled ? "#FF6600" : "var(--pg-muted-bg)",
                  position: "relative",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: maturityEnabled ? 20 : 2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </button>
            </div>
            <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginBottom: 10 }}>
              Alert days before maturity:
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {[30, 14, 7, 3, 1].map((d) => (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  disabled={!maturityEnabled}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 8,
                    border: maturityDays.includes(d)
                      ? "1.5px solid #FF6600"
                      : "1px solid var(--pg-card-border)",
                    background: maturityDays.includes(d) ? "#fff7ed" : "var(--pg-muted-bg)",
                    color: maturityDays.includes(d) ? "#FF6600" : "var(--pg-text-2)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: maturityEnabled ? "pointer" : "not-allowed",
                    opacity: maturityEnabled ? 1 : 0.5,
                  }}
                >
                  {d}d
                </button>
              ))}
            </div>
          </section>

          <div style={{ height: 1, background: "var(--pg-card-border)" }} />

          {/* 2. Liquidity */}
          <section>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--pg-text-1)", marginBottom: 8 }}>
              Liquidity Threshold
            </div>
            <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginBottom: 8 }}>
              Minimum investable liquidity
            </div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 13, color: "var(--pg-text-2)", fontWeight: 600 }}>₦</span>
              <input
                value={liquidityMin}
                onChange={(e) => setLiquidityMin(e.target.value)}
                style={{
                  height: 36,
                  padding: "0 12px",
                  borderRadius: 10,
                  fontSize: 13,
                  outline: "none",
                  background: "var(--pg-muted-bg)",
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-1)",
                  width: 200,
                }}
              />
            </div>
          </section>

          <div style={{ height: 1, background: "var(--pg-card-border)" }} />

          {/* 3. Concentration */}
          <section>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--pg-text-1)", marginBottom: 8 }}>
              Concentration Limit
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  value={concentrationLimit}
                  onChange={(e) => setConcentrationLimit(e.target.value)}
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    outline: "none",
                    background: "var(--pg-muted-bg)",
                    border: "1px solid var(--pg-card-border)",
                    color: "var(--pg-text-1)",
                    width: 80,
                  }}
                />
                <span style={{ fontSize: 13, color: "var(--pg-text-2)", fontWeight: 600 }}>%</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPerEntity((p) => !p)}
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    border: "none",
                    background: perEntity ? "#FF6600" : "var(--pg-muted-bg)",
                    position: "relative",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: perEntity ? 20 : 2,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "white",
                      transition: "left 0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </button>
                <span style={{ fontSize: 12, color: "var(--pg-text-3)" }}>Per-entity limit</span>
              </div>
            </div>
          </section>

          <div style={{ height: 1, background: "var(--pg-card-border)" }} />

          {/* 4. Settlement cut-off */}
          <section>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--pg-text-1)", marginBottom: 8 }}>
              Settlement Cut-off Time
            </div>
            <input
              type="time"
              value={settlementTime}
              onChange={(e) => setSettlementTime(e.target.value)}
              style={{
                height: 36,
                padding: "0 12px",
                borderRadius: 10,
                fontSize: 13,
                outline: "none",
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-card-border)",
                color: "var(--pg-text-1)",
              }}
            />
          </section>

          <div style={{ height: 1, background: "var(--pg-card-border)" }} />

          {/* 5. Notifications */}
          <section>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--pg-text-1)", marginBottom: 12 }}>
              Notifications
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 13, color: "var(--pg-text-2)" }}>In-app notifications</span>
                <button
                  onClick={() => setInApp((p) => !p)}
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    border: "none",
                    background: inApp ? "#FF6600" : "var(--pg-muted-bg)",
                    position: "relative",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: inApp ? 20 : 2,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "white",
                      transition: "left 0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 13, color: "var(--pg-text-2)" }}>Email notifications</span>
                <button
                  onClick={() => setEmail((p) => !p)}
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    border: "none",
                    background: email ? "#FF6600" : "var(--pg-muted-bg)",
                    position: "relative",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: email ? 20 : 2,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "white",
                      transition: "left 0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </button>
              </div>
              {email && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pg-text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                    Recipients
                  </div>
                  <textarea
                    value={recipients}
                    onChange={(e) => setRecipients(e.target.value)}
                    rows={2}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 10,
                      fontSize: 12,
                      outline: "none",
                      background: "var(--pg-muted-bg)",
                      border: "1px solid var(--pg-card-border)",
                      color: "var(--pg-text-1)",
                      resize: "none",
                      fontFamily: "inherit",
                    }}
                    placeholder="email1@fund.ng, email2@fund.ng"
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--pg-card-border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            onClick={onClose}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              background: "linear-gradient(135deg,#FF6600,#E05500)",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            Save Thresholds
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------
function DetailPanel({
  alert,
  onClose,
  onUpdateStatus,
}: {
  alert: PMAlert;
  onClose: () => void;
  onUpdateStatus: (id: string, status: AlertStatus) => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [auditLog] = useState([
    { time: alert.created_at, action: "Alert created", actor: "System" },
  ]);

  const sev = SEV[alert.severity];
  const SevIcon = sev.icon;

  function submitNote() {
    if (!note.trim()) return;
    toast({ title: "Note added", description: "Resolution note saved." });
    setNote("");
  }

  function handleEscalate() {
    toast({ title: "Alert escalated", description: `${alert.title} escalated to Head of Investment.` });
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 380,
        height: "100vh",
        background: "var(--pg-card)",
        borderLeft: "1px solid var(--pg-card-border)",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.10)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      {/* Accent */}
      <div className="h-[3px]" style={{ background: sev.color, flexShrink: 0 }} />

      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--pg-card-border)", flexShrink: 0 }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                background: sev.bg,
                color: sev.color,
              }}
            >
              <SevIcon size={11} />
              {sev.label}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--pg-muted-bg)",
              border: "none",
              borderRadius: 8,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--pg-text-3)",
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pg-text-1)", marginTop: 10, lineHeight: 1.3 }}>
          {alert.title}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Description */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)", marginBottom: 6 }}>
            Description
          </div>
          <div style={{ fontSize: 13, color: "var(--pg-text-2)", lineHeight: 1.6 }}>{alert.description}</div>
        </div>

        {/* Meta */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alert.affected_record && alert.affected_link && (
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)" }}>
                Affected Record
              </span>
              <Link
                href={alert.affected_link}
                style={{ fontSize: 12, color: "#FF6600", fontWeight: 600, textDecoration: "none" }}
              >
                {alert.affected_record} →
              </Link>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)" }}>
              Owner
            </span>
            <span style={{ fontSize: 12, color: "var(--pg-text-2)" }}>{alert.owner}</span>
          </div>
          {alert.due_date && (
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)" }}>
                Due Date
              </span>
              <span style={{ fontSize: 12, color: "var(--pg-text-2)" }}>{fmtDate(alert.due_date)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)" }}>
              Created
            </span>
            <span style={{ fontSize: 12, color: "var(--pg-text-3)" }}>{fmtDate(alert.created_at)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)" }}>
              Status
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                background: STATUS_BADGE[alert.status].bg,
                color: STATUS_BADGE[alert.status].text,
              }}
            >
              {STATUS_BADGE[alert.status].label}
            </span>
          </div>
        </div>

        <div style={{ height: 1, background: "var(--pg-card-border)" }} />

        {/* Resolution note */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)", marginBottom: 8 }}>
            Add Resolution Note
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add note..."
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 10,
              fontSize: 12,
              outline: "none",
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-1)",
              resize: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={submitNote}
            disabled={!note.trim()}
            style={{
              marginTop: 8,
              height: 32,
              padding: "0 14px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              background: note.trim() ? "linear-gradient(135deg,#FF6600,#E05500)" : "var(--pg-muted-bg)",
              color: note.trim() ? "white" : "var(--pg-text-3)",
              border: "none",
              cursor: note.trim() ? "pointer" : "not-allowed",
            }}
          >
            Submit Note
          </button>
        </div>

        <div style={{ height: 1, background: "var(--pg-card-border)" }} />

        {/* Audit trail */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)", marginBottom: 10 }}>
            Audit Trail
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {auditLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-2">
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#FF6600",
                    marginTop: 4,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: 12, color: "var(--pg-text-2)", fontWeight: 600 }}>{entry.action}</div>
                  <div style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
                    {entry.actor} · {fmtDate(entry.time)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Escalate */}
        <button
          onClick={handleEscalate}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            height: 36,
            borderRadius: 10,
            border: "1px solid #dc2626",
            background: "#fee2e2",
            color: "#dc2626",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            marginTop: "auto",
          }}
        >
          <Zap size={14} />
          Escalate Alert
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert Card
// ---------------------------------------------------------------------------
function AlertCard({
  alert,
  onAcknowledge,
  onResolve,
  onSelect,
  isSelected,
}: {
  alert: PMAlert;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  onSelect: (alert: PMAlert) => void;
  isSelected: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const sev = SEV[alert.severity];
  const SevIcon = sev.icon;
  const TypeIcon = TYPE_ICONS[alert.alert_type];

  return (
    <div
      onClick={() => onSelect(alert)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        gap: 0,
        background: isSelected
          ? "var(--pg-muted-bg)"
          : hovered
          ? "var(--pg-row-hover, rgba(0,0,0,0.02))"
          : "var(--pg-card)",
        border: isSelected ? `1px solid ${sev.color}40` : "1px solid var(--pg-card-border)",
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        boxShadow: isSelected ? `0 0 0 2px ${sev.color}20` : "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      {/* Severity bar */}
      <div style={{ width: 4, background: sev.color, flexShrink: 0 }} />

      {/* Content */}
      <div style={{ flex: 1, padding: "14px 16px" }}>
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Severity badge */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "2px 7px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 700,
                background: sev.bg,
                color: sev.color,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              <SevIcon size={10} />
              {sev.label}
            </span>
            {/* Type badge */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "2px 7px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 600,
                background: "var(--pg-muted-bg)",
                color: "var(--pg-text-3)",
              }}
            >
              <TypeIcon size={10} />
              {TYPE_LABELS[alert.alert_type]}
            </span>
          </div>
          {/* Status badge */}
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 5,
              fontSize: 10,
              fontWeight: 700,
              background: STATUS_BADGE[alert.status].bg,
              color: STATUS_BADGE[alert.status].text,
              flexShrink: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {STATUS_BADGE[alert.status].label}
          </span>
        </div>

        {/* Title */}
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--pg-text-1)", marginTop: 8, lineHeight: 1.3 }}>
          {alert.title}
        </div>

        {/* Description */}
        <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 4, lineHeight: 1.5 }}>
          {alert.description}
        </div>

        {/* Meta row */}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1" style={{ marginTop: 10 }}>
          {alert.affected_record && alert.affected_link && (
            <Link
              href={alert.affected_link}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 11, color: "#FF6600", fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 2 }}
            >
              <ChevronRight size={10} />
              {alert.affected_record}
            </Link>
          )}
          {alert.due_date && (
            <span style={{ fontSize: 11, color: "var(--pg-text-3)", display: "flex", alignItems: "center", gap: 2 }}>
              <Calendar size={10} />
              Due {fmtDate(alert.due_date)}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--pg-text-3)", display: "flex", alignItems: "center", gap: 2 }}>
            <User size={10} />
            {alert.owner}
          </span>
          <span style={{ fontSize: 11, color: "var(--pg-text-4, #9ca3af)", display: "flex", alignItems: "center", gap: 2 }}>
            <Clock size={10} />
            {relTime(alert.created_at)}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2" style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
          {alert.status === "active" && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                background: "var(--pg-muted-bg)",
                color: "var(--pg-text-2)",
                border: "1px solid var(--pg-card-border)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <CheckSquare size={11} />
              Acknowledge
            </button>
          )}
          {(alert.status === "active" || alert.status === "acknowledged") && (
            <button
              onClick={() => onResolve(alert.id)}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                background: "#d1fae5",
                color: "#065f46",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <CheckCircle2 size={11} />
              Resolve
            </button>
          )}
          {alert.affected_link && (
            <Link
              href={alert.affected_link}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                background: "var(--pg-muted-bg)",
                color: "#FF6600",
                border: "1px solid #FF660030",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                textDecoration: "none",
              }}
            >
              <ChevronRight size={11} />
              View Record
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function AlertsPage() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<PMAlert[]>(DEMO_ALERTS);
  const [filterType, setFilterType] = useState<"all" | AlertType>("all");
  const [filterSeverity, setFilterSeverity] = useState<"all" | AlertSeverity>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | AlertStatus>("all");
  const [searchQ, setSearchQ] = useState("");
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<PMAlert | null>(null);

  // Counts
  const criticalCount = alerts.filter((a) => a.severity === "critical" && a.status !== "resolved").length;
  const highCount = alerts.filter((a) => a.severity === "high" && a.status !== "resolved").length;
  const warningCount = alerts.filter((a) => a.severity === "warning" && a.status !== "resolved").length;
  const resolvedToday = alerts.filter((a) => a.status === "resolved").length;

  // Filtered
  const filtered = alerts.filter((a) => {
    if (filterType !== "all" && a.alert_type !== filterType) return false;
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function handleAcknowledge(id: string) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "acknowledged" as AlertStatus } : a))
    );
    if (selectedAlert?.id === id) setSelectedAlert((p) => p ? { ...p, status: "acknowledged" } : p);
    toast({ title: "Alert acknowledged", description: "Alert has been marked as acknowledged." });
  }

  function handleResolve(id: string) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "resolved" as AlertStatus } : a))
    );
    if (selectedAlert?.id === id) setSelectedAlert((p) => p ? { ...p, status: "resolved" } : p);
    toast({ title: "Alert resolved", description: "Alert has been marked as resolved." });
  }

  function handleMarkAllRead() {
    setAlerts((prev) =>
      prev.map((a) => (a.status === "active" ? { ...a, status: "acknowledged" as AlertStatus } : a))
    );
    toast({ title: "All alerts acknowledged", description: "All active alerts marked as acknowledged." });
  }

  // Summary cards data
  const summaryCards = [
    { label: "Critical", value: criticalCount, color: "#dc2626", bg: "#fee2e2", icon: AlertCircle },
    { label: "High", value: highCount, color: "#ea580c", bg: "#ffedd5", icon: AlertTriangle },
    { label: "Warning", value: warningCount, color: "#d97706", bg: "#fef3c7", icon: AlertTriangle },
    { label: "Resolved Today", value: resolvedToday, color: "#059669", bg: "#d1fae5", icon: CheckCircle2 },
  ];

  const typeFilters: Array<{ key: "all" | AlertType; label: string }> = [
    { key: "all", label: "All" },
    { key: "maturity", label: "Maturity" },
    { key: "liquidity", label: "Liquidity" },
    { key: "concentration", label: "Concentration" },
    { key: "settlement", label: "Settlement" },
    { key: "data_quality", label: "Data Quality" },
    { key: "approval", label: "Approval" },
  ];

  const severityFilters: Array<{ key: "all" | AlertSeverity; label: string }> = [
    { key: "all", label: "All" },
    { key: "critical", label: "Critical" },
    { key: "high", label: "High" },
    { key: "warning", label: "Warning" },
    { key: "info", label: "Info" },
  ];

  const statusFilters: Array<{ key: "all" | AlertStatus; label: string }> = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "acknowledged", label: "Acknowledged" },
    { key: "resolved", label: "Resolved" },
  ];

  function FilterPill<T extends string>({
    options,
    value,
    onChange,
  }: {
    options: Array<{ key: T; label: string }>;
    value: T;
    onChange: (v: T) => void;
  }) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              border: value === opt.key ? "none" : "1px solid var(--pg-card-border)",
              background:
                value === opt.key
                  ? "linear-gradient(135deg,#FF6600,#E05500)"
                  : "var(--pg-muted-bg)",
              color: value === opt.key ? "white" : "var(--pg-text-2)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4" style={{ marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--pg-text-1)", display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={20} color="#FF6600" />
            Alerts & Tasks
          </div>
          <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 3 }}>
            Portfolio monitoring and exception management
          </div>
          {/* Inline summary badges */}
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 8 }}>
            {criticalCount > 0 && (
              <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: "#fee2e2", color: "#dc2626" }}>
                {criticalCount} Critical
              </span>
            )}
            {highCount > 0 && (
              <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: "#ffedd5", color: "#ea580c" }}>
                {highCount} High
              </span>
            )}
            {warningCount > 0 && (
              <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: "#fef3c7", color: "#92400e" }}>
                {warningCount} Warning
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleMarkAllRead}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 10,
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
            <CheckSquare size={14} />
            Mark All Read
          </button>
          <button
            onClick={() => setShowConfigModal(true)}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 10,
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
            <Settings size={14} />
            Configure Thresholds
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {summaryCards.map((card) => {
          const CardIcon = card.icon;
          return (
            <div
              key={card.label}
              style={{
                background: "var(--pg-card)",
                border: "1px solid var(--pg-card-border)",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}
            >
              <div className="h-[3px]" style={{ background: card.color }} />
              <div style={{ padding: "14px 16px" }}>
                <div className="flex items-center justify-between">
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: card.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CardIcon size={16} color={card.color} />
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "var(--pg-text-1)" }}>
                    {card.value}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--pg-text-3)",
                    marginTop: 10,
                  }}
                >
                  {card.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Demo banner */}
      <div
        style={{
          background: "#fef3c7",
          border: "1px solid #fde68a",
          borderRadius: 10,
          padding: "10px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <AlertTriangle size={14} color="#d97706" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "#92400e", fontWeight: 500 }}>
          Sample alerts shown below for demonstration. Connect your portfolio data to see live alerts and notifications.
        </span>
      </div>

      {/* Filter bar */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 14,
          padding: "14px 16px",
          marginBottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={13} color="var(--pg-text-3)" />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)" }}>
              Type
            </span>
          </div>
          <FilterPill options={typeFilters} value={filterType} onChange={setFilterType} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div style={{ minWidth: 64 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)" }}>
              Severity
            </span>
          </div>
          <FilterPill options={severityFilters} value={filterSeverity} onChange={setFilterSeverity} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div style={{ minWidth: 64 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)" }}>
              Status
            </span>
          </div>
          <FilterPill options={statusFilters} value={filterStatus} onChange={setFilterStatus} />
        </div>
        <div>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search alerts..."
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: 10,
              fontSize: 13,
              outline: "none",
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-1)",
              width: 280,
            }}
          />
        </div>
      </div>

      {/* Alert feed + optional detail panel */}
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        {/* Feed */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Bell size={36} color="var(--pg-text-4, #d1d5db)" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--pg-text-2)" }}>No alerts match your filters</div>
              <div style={{ fontSize: 13, color: "var(--pg-text-3)", marginTop: 4 }}>
                Try adjusting the type, severity, or status filters.
              </div>
            </div>
          ) : (
            filtered.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
                onSelect={setSelectedAlert}
                isSelected={selectedAlert?.id === alert.id}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedAlert && (
        <DetailPanel
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onUpdateStatus={(id, status) => {
            setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
          }}
        />
      )}

      {/* Config Modal */}
      {showConfigModal && <ConfigModal onClose={() => setShowConfigModal(false)} />}
    </div>
  );
}
