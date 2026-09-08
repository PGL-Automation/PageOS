"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  Clock,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Bell,
  CheckCircle2,
  X,
  Loader2,
  Plus,
  Download,
  Filter,
  AlertCircle,
  User,
  DollarSign,
  MessageSquare,
  ArrowRight,
  Settings,
  Eye,
} from "lucide-react";

const BASE = "http://localhost:8081";

/* ─── Types ─────────────────────────────────────────────────────────── */
type MaturityItem = {
  id: string;
  client_name: string;
  product: string;
  product_type: string;
  currency: string;
  principal: number;
  maturity_value: number;
  maturity_date: string;
  days_remaining: number;
  has_instruction: boolean;
  instruction?: string;
  wm_name: string;
  account_id?: string;
};

/* ─── Formatters ─────────────────────────────────────────────────────── */
function fmtCompact(n: number, cur: string) {
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
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/* ─── Demo Data ──────────────────────────────────────────────────────── */
const DEMO_MATURITIES: MaturityItem[] = [
  {
    id: "m1",
    client_name: "Adaeze Okonkwo",
    product: "Zenith Bank Fixed Deposit",
    product_type: "Fixed Deposit",
    currency: "NGN",
    principal: 500000000,
    maturity_value: 533500000,
    maturity_date: "2026-09-14",
    days_remaining: 6,
    has_instruction: false,
    wm_name: "Me",
  },
  {
    id: "m2",
    client_name: "Emeka Nwosu",
    product: "NGT 364-Day T-Bill",
    product_type: "Treasury Bill",
    currency: "NGN",
    principal: 250000000,
    maturity_value: 268750000,
    maturity_date: "2026-09-10",
    days_remaining: 2,
    has_instruction: true,
    instruction: "Redeem and credit client account",
    wm_name: "Me",
  },
  {
    id: "m3",
    client_name: "Chukwudi Obi",
    product: "Access Bank Call Deposit",
    product_type: "Call Deposit",
    currency: "NGN",
    principal: 150000000,
    maturity_value: 157500000,
    maturity_date: "2026-09-22",
    days_remaining: 14,
    has_instruction: false,
    wm_name: "Me",
  },
  {
    id: "m4",
    client_name: "Fatima Al-Hassan",
    product: "FSDH FD 180-Day",
    product_type: "Fixed Deposit",
    currency: "NGN",
    principal: 800000000,
    maturity_value: 868000000,
    maturity_date: "2026-09-30",
    days_remaining: 22,
    has_instruction: true,
    instruction: "Rollover for another 180 days at best available rate",
    wm_name: "Me",
  },
  {
    id: "m5",
    client_name: "Ngozi Adeyemi",
    product: "FGN T-Bill 91-Day",
    product_type: "Treasury Bill",
    currency: "NGN",
    principal: 100000000,
    maturity_value: 104500000,
    maturity_date: "2026-10-15",
    days_remaining: 37,
    has_instruction: false,
    wm_name: "Me",
  },
];

/* ─── Sub-components ─────────────────────────────────────────────────── */

type ToastMsg = { id: number; text: string };

function Toast({ toasts, remove }: { toasts: ToastMsg[]; remove: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: "#1e293b",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 12,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            minWidth: 240,
          }}
        >
          <CheckCircle2 size={15} color="#34d399" />
          <span style={{ flex: 1 }}>{t.text}</span>
          <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, lineHeight: 1 }}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function WMMaturitiesPage() {
  const { user, subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";
  const subsidName = subsidiary?.Name ?? "WM";

  /* ── Remote data (unused in demo but fetched for future wiring) ── */
  useQuery({
    queryKey: ["wm-accounts"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/portfolio/accounts`, { credentials: "include" });
      if (!r.ok) throw new Error("accounts");
      return r.json();
    },
    enabled: !!subsidId,
    retry: false,
  });

  useQuery({
    queryKey: ["wm-funds", subsidId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/portfolio/funds?subsidiary_id=${subsidId}`, { credentials: "include" });
      if (!r.ok) throw new Error("funds");
      return r.json();
    },
    enabled: !!subsidId,
    retry: false,
  });

  /* ── Local state ── */
  const [maturities, setMaturities] = useState<MaturityItem[]>(DEMO_MATURITIES);
  const [period, setPeriod] = useState<"week" | "month" | "3m" | "all">("all");
  const [productFilter, setProductFilter] = useState<string>("All");
  const [noInstOnly, setNoInstOnly] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [toastId, setToastId] = useState(0);

  /* ── Modals ── */
  const [recordTarget, setRecordTarget] = useState<MaturityItem | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);

  /* ── Record instruction form state ── */
  const [instType, setInstType] = useState("Rollover");
  const [instTenor, setInstTenor] = useState("90");
  const [instBank, setInstBank] = useState("");
  const [instNotes, setInstNotes] = useState("");
  const [instDate, setInstDate] = useState(new Date().toISOString().slice(0, 10));

  /* ── Alert prefs ── */
  const [alert7, setAlert7] = useState(true);
  const [alert3, setAlert3] = useState(true);
  const [alert1, setAlert1] = useState(false);
  const [escalate, setEscalate] = useState("3d");
  const [notifInApp, setNotifInApp] = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);

  function toast(msg: string) {
    const id = toastId + 1;
    setToastId(id);
    setToasts((prev) => [...prev, { id, text: msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }
  function removeToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  /* ── Filtering ── */
  const filtered = maturities.filter((m) => {
    if (period === "week" && m.days_remaining > 7) return false;
    if (period === "month" && m.days_remaining > 30) return false;
    if (period === "3m" && m.days_remaining > 90) return false;
    if (productFilter !== "All" && m.product_type !== productFilter) return false;
    if (noInstOnly && m.has_instruction) return false;
    return true;
  });

  /* ── Summary stats ── */
  const thisWeek = maturities.filter((m) => m.days_remaining <= 7);
  const thisMonth = maturities.filter((m) => m.days_remaining <= 30);
  const noInst = maturities.filter((m) => !m.has_instruction);
  const sumWeek = thisWeek.reduce((a, m) => a + m.maturity_value, 0);
  const sumMonth = thisMonth.reduce((a, m) => a + m.maturity_value, 0);
  const sumNoInst = noInst.reduce((a, m) => a + m.maturity_value, 0);
  const sumTotal = maturities.reduce((a, m) => a + m.maturity_value, 0);

  /* ── Day color ── */
  function daysColor(d: number) {
    if (d <= 3) return "#dc2626";
    if (d <= 7) return "#dc2626";
    if (d <= 14) return "#d97706";
    return "#059669";
  }
  function daysBold(d: number) {
    return d <= 3 ? "800" : "600";
  }
  function rowBorderColor(d: number) {
    if (d <= 3) return "#dc2626";
    if (d <= 7) return "#d97706";
    return "transparent";
  }
  function rowBg(d: number, hasInst: boolean) {
    if (!hasInst && d <= 7) return "rgba(220,38,38,0.04)";
    return "transparent";
  }

  /* ── Record instruction submit ── */
  function submitInstruction() {
    if (!recordTarget) return;
    setMaturities((prev) =>
      prev.map((m) =>
        m.id === recordTarget.id
          ? { ...m, has_instruction: true, instruction: `${instType}${instNotes ? ": " + instNotes : ""}` }
          : m
      )
    );
    toast(`Instruction recorded for ${recordTarget.client_name}`);
    setRecordTarget(null);
    setInstType("Rollover");
    setInstTenor("90");
    setInstBank("");
    setInstNotes("");
    setInstDate(new Date().toISOString().slice(0, 10));
  }

  const PRODUCT_TYPES = ["All", "Fixed Deposit", "Treasury Bill", "Call Deposit", "Other"];
  const PERIOD_TABS: { key: "week" | "month" | "3m" | "all"; label: string }[] = [
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "3m", label: "Next 3 Months" },
    { key: "all", label: "All" },
  ];

  return (
    <div style={{ padding: "28px 32px", minHeight: "100vh", background: "var(--pg-bg)" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Clock size={20} color="#FF6600" />
            <span style={{ fontSize: 20, fontWeight: 700, color: "var(--pg-text-1)" }}>Client Maturities</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 4 }}>
            {subsidName} · Your client book
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowAlerts(true)}
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
            <Bell size={14} />
            Configure Alerts
          </button>
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
        </div>
      </div>

      {/* ── Demo Banner ── */}
      <div
        style={{
          background: "#fef3c7",
          border: "1px solid #f59e0b",
          borderRadius: 12,
          padding: "10px 16px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <AlertTriangle size={15} color="#92400e" />
        <span style={{ fontSize: 13, color: "#92400e" }}>
          Sample maturity data shown. Connect portfolio and client data to see live maturities.
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

      {/* ── Summary Strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {/* This Week */}
        <div
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 16,
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
            overflow: "hidden",
          }}
        >
          <div className="h-[3px]" style={{ background: "#d97706" }} />
          <div style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)", marginBottom: 6 }}>
              This Week
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "var(--pg-text-1)", marginBottom: 4 }}>
              {thisWeek.length}
            </div>
            <div style={{ fontSize: 12, color: "var(--pg-text-3)" }}>{fmtCompact(sumWeek, "NGN")}</div>
          </div>
        </div>

        {/* This Month */}
        <div
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 16,
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
            overflow: "hidden",
          }}
        >
          <div className="h-[3px]" style={{ background: "#1d4ed8" }} />
          <div style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)", marginBottom: 6 }}>
              This Month
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "var(--pg-text-1)", marginBottom: 4 }}>
              {thisMonth.length}
            </div>
            <div style={{ fontSize: 12, color: "var(--pg-text-3)" }}>{fmtCompact(sumMonth, "NGN")}</div>
          </div>
        </div>

        {/* No Instruction */}
        <div
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 16,
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
            overflow: "hidden",
          }}
        >
          <div className="h-[3px]" style={{ background: "#dc2626" }} />
          <div style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#dc2626", marginBottom: 6 }}>
              No Instruction
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "#dc2626", marginBottom: 4 }}>
              {noInst.length}
            </div>
            <div style={{ fontSize: 12, color: "var(--pg-text-3)" }}>{fmtCompact(sumNoInst, "NGN")}</div>
          </div>
        </div>

        {/* Total Outstanding */}
        <div
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 16,
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
            overflow: "hidden",
          }}
        >
          <div className="h-[3px]" style={{ background: "#FF6600" }} />
          <div style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)", marginBottom: 6 }}>
              Total Outstanding
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "var(--pg-text-1)", marginBottom: 4 }}>
              {maturities.length}
            </div>
            <div style={{ fontSize: 12, color: "var(--pg-text-3)" }}>{fmtCompact(sumTotal, "NGN")}</div>
          </div>
        </div>
      </div>

      {/* ── Filter Controls ── */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 16,
          boxShadow: "0 1px 4px var(--pg-card-shadow)",
          padding: "14px 20px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {/* Period tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPeriod(tab.key)}
              style={{
                height: 32,
                padding: "0 14px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: period === tab.key ? "linear-gradient(135deg,#FF6600,#E05500)" : "var(--pg-muted-bg)",
                color: period === tab.key ? "#fff" : "var(--pg-text-2)",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: "var(--pg-card-border)" }} />

        {/* Product type */}
        <div style={{ display: "flex", gap: 4 }}>
          {PRODUCT_TYPES.map((pt) => (
            <button
              key={pt}
              onClick={() => setProductFilter(pt)}
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: productFilter === pt ? "1px solid #FF6600" : "1px solid var(--pg-card-border)",
                cursor: "pointer",
                background: productFilter === pt ? "#fff0e0" : "var(--pg-muted-bg)",
                color: productFilter === pt ? "#E05500" : "var(--pg-text-2)",
                transition: "all 0.15s",
              }}
            >
              {pt}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: "var(--pg-card-border)" }} />

        {/* No instruction toggle */}
        <button
          onClick={() => setNoInstOnly(!noInstOnly)}
          style={{
            height: 32,
            padding: "0 14px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            border: noInstOnly ? "1px solid #dc2626" : "1px solid var(--pg-card-border)",
            cursor: "pointer",
            background: noInstOnly ? "#fee2e2" : "var(--pg-muted-bg)",
            color: noInstOnly ? "#991b1b" : "var(--pg-text-2)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.15s",
          }}
        >
          <AlertCircle size={12} />
          No Instruction Only
        </button>
      </div>

      {/* ── Table ── */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 16,
          boxShadow: "0 1px 4px var(--pg-card-shadow)",
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              {["Client", "Product", "Type", "Principal", "Maturity Value", "Maturity Date", "Days", "Instruction", "Actions"].map(
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: "40px 16px", textAlign: "center", color: "var(--pg-text-3)", fontSize: 13 }}>
                  No maturities match the current filters.
                </td>
              </tr>
            )}
            {filtered.map((m, i) => (
              <MaturityRow
                key={m.id}
                item={m}
                rowBg={rowBg(m.days_remaining, m.has_instruction)}
                borderColor={rowBorderColor(m.days_remaining)}
                daysColor={daysColor(m.days_remaining)}
                daysBold={daysBold(m.days_remaining)}
                isLast={i === filtered.length - 1}
                onRecord={() => {
                  setRecordTarget(m);
                  setInstType("Rollover");
                  setInstNotes("");
                  setInstBank("");
                  setInstDate(new Date().toISOString().slice(0, 10));
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Escalation Info ── */}
      <div
        style={{
          background: "#dbeafe",
          border: "1px solid #93c5fd",
          borderRadius: 12,
          padding: "12px 18px",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <AlertCircle size={15} color="#1d4ed8" style={{ marginTop: 1, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "#1d4ed8", lineHeight: 1.5 }}>
          Maturities without recorded instructions <strong>3 days before due date</strong> will be automatically escalated to the Group Head.
        </span>
      </div>

      {/* ── Record Instruction Modal ── */}
      {recordTarget && (
        <Modal onClose={() => setRecordTarget(null)}>
          <div style={{ padding: "24px 28px", minWidth: 480, maxWidth: 560 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pg-text-1)" }}>
                  Record Maturity Instruction
                </div>
                <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 2 }}>{recordTarget.client_name}</div>
              </div>
              <button onClick={() => setRecordTarget(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pg-text-3)" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Instruction type */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: 6 }}>
                  INSTRUCTION TYPE
                </label>
                <select
                  value={instType}
                  onChange={(e) => setInstType(e.target.value)}
                  style={{
                    width: "100%",
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    outline: "none",
                    background: "var(--pg-muted-bg)",
                    border: "1px solid var(--pg-card-border)",
                    color: "var(--pg-text-1)",
                  }}
                >
                  <option>Rollover</option>
                  <option>Redeem</option>
                  <option>Partial Redemption</option>
                  <option>Reinvest</option>
                  <option>Other</option>
                </select>
              </div>

              {/* Rollover details */}
              {instType === "Rollover" && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: 6 }}>
                    ROLLOVER TENOR (DAYS)
                  </label>
                  <select
                    value={instTenor}
                    onChange={(e) => setInstTenor(e.target.value)}
                    style={{
                      width: "100%",
                      height: 36,
                      padding: "0 12px",
                      borderRadius: 10,
                      fontSize: 13,
                      outline: "none",
                      background: "var(--pg-muted-bg)",
                      border: "1px solid var(--pg-card-border)",
                      color: "var(--pg-text-1)",
                    }}
                  >
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="90">90 days</option>
                    <option value="180">180 days</option>
                    <option value="364">364 days</option>
                  </select>
                  <div style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 5 }}>
                    Rate note: Best available rate at time of rollover.
                  </div>
                </div>
              )}

              {/* Redeem details */}
              {(instType === "Redeem" || instType === "Partial Redemption") && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: 6 }}>
                    DESTINATION BANK ACCOUNT
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Zenith Bank — 2012345678"
                    value={instBank}
                    onChange={(e) => setInstBank(e.target.value)}
                    style={{
                      width: "100%",
                      height: 36,
                      padding: "0 12px",
                      borderRadius: 10,
                      fontSize: 13,
                      outline: "none",
                      background: "var(--pg-muted-bg)",
                      border: "1px solid var(--pg-card-border)",
                      color: "var(--pg-text-1)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: 6 }}>
                  NOTES / INSTRUCTIONS
                </label>
                <textarea
                  rows={3}
                  placeholder="Additional instructions or notes..."
                  value={instNotes}
                  onChange={(e) => setInstNotes(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    outline: "none",
                    background: "var(--pg-muted-bg)",
                    border: "1px solid var(--pg-card-border)",
                    color: "var(--pg-text-1)",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Confirmation date */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: 6 }}>
                  CONFIRMATION DATE
                </label>
                <input
                  type="date"
                  value={instDate}
                  onChange={(e) => setInstDate(e.target.value)}
                  style={{
                    width: "100%",
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    outline: "none",
                    background: "var(--pg-muted-bg)",
                    border: "1px solid var(--pg-card-border)",
                    color: "var(--pg-text-1)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button
                onClick={() => setRecordTarget(null)}
                style={{
                  height: 36,
                  padding: "0 16px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  background: "var(--pg-muted-bg)",
                  color: "var(--pg-text-2)",
                  border: "1px solid var(--pg-card-border)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitInstruction}
                style={{
                  height: 36,
                  padding: "0 20px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  background: "linear-gradient(135deg,#FF6600,#E05500)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Record Instruction
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Configure Alerts Modal ── */}
      {showAlerts && (
        <Modal onClose={() => setShowAlerts(false)}>
          <div style={{ padding: "24px 28px", minWidth: 440, maxWidth: 520 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pg-text-1)" }}>Configure Maturity Alerts</div>
              <button onClick={() => setShowAlerts(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pg-text-3)" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Alert before maturity */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pg-text-2)", marginBottom: 10 }}>
                  Alert me before maturity
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "7 days before", val: alert7, set: setAlert7 },
                    { label: "3 days before", val: alert3, set: setAlert3 },
                    { label: "1 day before", val: alert1, set: setAlert1 },
                  ].map(({ label, val, set }) => (
                    <label key={label} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "var(--pg-text-1)" }}>
                      <input
                        type="checkbox"
                        checked={val}
                        onChange={(e) => set(e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: "#FF6600" }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Escalation */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: 8 }}>
                  ESCALATE TO GROUP HEAD IF NO INSTRUCTION BY
                </label>
                <select
                  value={escalate}
                  onChange={(e) => setEscalate(e.target.value)}
                  style={{
                    width: "100%",
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    outline: "none",
                    background: "var(--pg-muted-bg)",
                    border: "1px solid var(--pg-card-border)",
                    color: "var(--pg-text-1)",
                  }}
                >
                  <option value="3d">3 days before maturity</option>
                  <option value="1d">1 day before maturity</option>
                  <option value="0d">On maturity date</option>
                </select>
              </div>

              {/* Notification channels */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pg-text-2)", marginBottom: 10 }}>
                  Notification channels
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "In-app notifications", val: notifInApp, set: setNotifInApp },
                    { label: "Email", val: notifEmail, set: setNotifEmail },
                  ].map(({ label, val, set }) => (
                    <label key={label} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "var(--pg-text-1)" }}>
                      <input
                        type="checkbox"
                        checked={val}
                        onChange={(e) => set(e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: "#FF6600" }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowAlerts(false)}
                style={{
                  height: 36,
                  padding: "0 16px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  background: "var(--pg-muted-bg)",
                  color: "var(--pg-text-2)",
                  border: "1px solid var(--pg-card-border)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowAlerts(false);
                  toast("Alert preferences saved");
                }}
                style={{
                  height: 36,
                  padding: "0 20px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  background: "linear-gradient(135deg,#FF6600,#E05500)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Save Preferences
              </button>
            </div>
          </div>
        </Modal>
      )}

      <Toast toasts={toasts} remove={removeToast} />
    </div>
  );
}

/* ─── MaturityRow Component ─────────────────────────────────────────── */
function MaturityRow({
  item,
  rowBg,
  borderColor,
  daysColor,
  daysBold,
  isLast,
  onRecord,
}: {
  item: MaturityItem;
  rowBg: string;
  borderColor: string;
  daysColor: string;
  daysBold: string;
  isLast: boolean;
  onRecord: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const bg = hovered ? "var(--pg-row-hover)" : rowBg;

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: bg,
        borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)",
        borderLeft: borderColor !== "transparent" ? `3px solid ${borderColor}` : "3px solid transparent",
        transition: "background 0.12s",
      }}
    >
      {/* Client */}
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#FF6600,#E05500)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {initials(item.client_name)}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pg-text-1)" }}>{item.client_name}</span>
        </div>
      </td>

      {/* Product */}
      <td style={{ padding: "12px 16px" }}>
        <span style={{ fontSize: 13, color: "var(--pg-text-1)", maxWidth: 180, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.product}
        </span>
      </td>

      {/* Type */}
      <td style={{ padding: "12px 16px" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 9px",
            borderRadius: 20,
            background: typeColors(item.product_type).bg,
            color: typeColors(item.product_type).color,
            whiteSpace: "nowrap",
          }}
        >
          {item.product_type}
        </span>
      </td>

      {/* Principal */}
      <td style={{ padding: "12px 16px" }}>
        <span style={{ fontSize: 13, color: "var(--pg-text-1)" }}>
          {fmtCompact(item.principal, item.currency)}
        </span>
      </td>

      {/* Maturity Value */}
      <td style={{ padding: "12px 16px" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>
          {fmtCompact(item.maturity_value, item.currency)}
        </span>
      </td>

      {/* Maturity Date */}
      <td style={{ padding: "12px 16px" }}>
        <span style={{ fontSize: 13, color: "var(--pg-text-1)" }}>{fmtDate(item.maturity_date)}</span>
      </td>

      {/* Days */}
      <td style={{ padding: "12px 16px" }}>
        <span style={{ fontSize: 13, fontWeight: daysBold, color: daysColor }}>
          {item.days_remaining}d
        </span>
      </td>

      {/* Instruction */}
      <td style={{ padding: "12px 16px", maxWidth: 200 }}>
        {item.has_instruction ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <CheckCircle2 size={14} color="#059669" style={{ marginTop: 1, flexShrink: 0 }} />
            <span
              style={{
                fontSize: 12,
                color: "var(--pg-text-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 160,
                display: "block",
              }}
              title={item.instruction}
            >
              {item.instruction}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 9px",
                borderRadius: 20,
                background: "#fee2e2",
                color: "#991b1b",
                whiteSpace: "nowrap",
              }}
            >
              No instruction
            </span>
            <button
              onClick={onRecord}
              style={{
                height: 26,
                padding: "0 10px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                background: "linear-gradient(135deg,#FF6600,#E05500)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Record
            </button>
          </div>
        )}
      </td>

      {/* Actions */}
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
              border: "1px solid var(--pg-card-border)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Eye size={12} />
            View
          </button>
          {!item.has_instruction && (
            <button
              onClick={onRecord}
              style={{
                height: 28,
                padding: "0 10px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                background: "linear-gradient(135deg,#FF6600,#E05500)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                whiteSpace: "nowrap",
              }}
            >
              <Plus size={11} />
              Record
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ─── Modal Wrapper ──────────────────────────────────────────────────── */
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--pg-card)",
          borderRadius: 20,
          boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
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

/* ─── Type badge colors ──────────────────────────────────────────────── */
function typeColors(pt: string): { bg: string; color: string } {
  switch (pt) {
    case "Fixed Deposit": return { bg: "#dbeafe", color: "#1d4ed8" };
    case "Treasury Bill": return { bg: "#d1fae5", color: "#065f46" };
    case "Call Deposit":  return { bg: "#ede9fe", color: "#6d28d9" };
    default:              return { bg: "#f1f5f9", color: "#475569" };
  }
}

