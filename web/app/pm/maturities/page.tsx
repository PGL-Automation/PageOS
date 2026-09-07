"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  CalendarDays, Clock, AlertTriangle, ChevronLeft, ChevronRight,
  Bell, Settings, Download, Filter, CheckCircle2, X, Loader2,
  Calendar, List, BarChart2, TrendingUp, TrendingDown,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const BASE = "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type MaturityItem = {
  id: string;
  name: string;
  item_type: "asset" | "liability";
  instrument_type: string;
  currency: string;
  amount: number;
  maturity_date: string;
  days_remaining: number;
  status: string;
  ref?: string;
};

type ViewMode = "timeline" | "list" | "calendar";
type FilterType = "both" | "assets" | "liabilities";
type FilterUrgency = "all" | "7" | "30" | "90";
type FilterCurrency = "all" | "NGN" | "USD";
type DateRange = "today" | "week" | "month" | "90days" | "custom";
type SortKey = "maturity_date" | "name" | "amount" | "days_remaining" | "item_type";
type SortDir = "asc" | "desc";

// ── Helpers ────────────────────────────────────────────────────────────────────

function dateInDays(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().split("T")[0];
}

function fmtCompact(n: number, cur: string): string {
  const sym = cur === "USD" ? "$" : "₦";
  if (n >= 1e9) return sym + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sym + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return sym + (n / 1e3).toFixed(1) + "K";
  return sym + n.toLocaleString("en-NG");
}

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function urgencyBadge(days: number) {
  if (days < 0)  return { label: "Overdue",      bg: "#fee2e2", color: "#991b1b" };
  if (days < 7)  return { label: `In ${days}d`,   bg: "#fee2e2", color: "#991b1b" };
  if (days < 30) return { label: `In ${days}d`,   bg: "#fef3c7", color: "#92400e" };
  return             { label: `In ${days}d`,   bg: "#d1fae5", color: "#065f46" };
}

function typeBadge(type: "asset" | "liability") {
  if (type === "asset")
    return { label: "ASSET",     bg: "#fff7ed", color: "#FF6600" };
  return   { label: "LIABILITY", bg: "#dbeafe", color: "#1d4ed8" };
}

function leftBorderColor(type: "asset" | "liability") {
  return type === "asset" ? "#FF6600" : "#1d4ed8";
}

// ── Demo Data ──────────────────────────────────────────────────────────────────

const DEMO_MATURITIES: MaturityItem[] = [
  {
    id: "1",
    name: "NGT 364-Day T-Bill",
    item_type: "asset",
    instrument_type: "Treasury Bill",
    currency: "NGN",
    amount: 500000000,
    maturity_date: dateInDays(1),
    days_remaining: 1,
    status: "active",
  },
  {
    id: "2",
    name: "Zenith Bank Fixed Deposit",
    item_type: "asset",
    instrument_type: "Fixed Deposit",
    currency: "NGN",
    amount: 1200000000,
    maturity_date: dateInDays(7),
    days_remaining: 7,
    status: "active",
  },
  {
    id: "3",
    name: "Client Funding Obligation",
    item_type: "liability",
    instrument_type: "Client Deposit",
    currency: "NGN",
    amount: 800000000,
    maturity_date: dateInDays(14),
    days_remaining: 14,
    status: "active",
  },
  {
    id: "4",
    name: "Access Bank FD",
    item_type: "asset",
    instrument_type: "Fixed Deposit",
    currency: "NGN",
    amount: 750000000,
    maturity_date: dateInDays(30),
    days_remaining: 30,
    status: "active",
  },
  {
    id: "5",
    name: "REPO Agreement",
    item_type: "asset",
    instrument_type: "REPO",
    currency: "NGN",
    amount: 2000000000,
    maturity_date: dateInDays(45),
    days_remaining: 45,
    status: "active",
  },
  {
    id: "6",
    name: "Call Deposit Obligation",
    item_type: "liability",
    instrument_type: "Call Deposit",
    currency: "NGN",
    amount: 500000000,
    maturity_date: dateInDays(90),
    days_remaining: 90,
    status: "active",
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SummaryCard({
  title, count, amount, color,
}: {
  title: string;
  count: number;
  amount: number;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        borderRadius: "16px",
        overflow: "hidden",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div className="h-[3px]" style={{ background: color }} />
      <div style={{ padding: "16px" }}>
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--pg-text-3)",
            marginBottom: "8px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: "22px",
            fontWeight: 700,
            lineHeight: 1,
            color: "var(--pg-text-1)",
            marginBottom: "4px",
          }}
        >
          {count} items
        </div>
        <div style={{ fontSize: "12px", color: "var(--pg-text-3)" }}>
          {fmtCompact(amount, "NGN")}
        </div>
      </div>
    </div>
  );
}

function TimelineItemCard({
  item, onAction,
}: {
  item: MaturityItem;
  onAction: (id: string, action: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const days = getDaysUntil(item.maturity_date);
  const ub = urgencyBadge(days);
  const tb = typeBadge(item.item_type);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--pg-row-hover)" : "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        borderRadius: "16px",
        overflow: "hidden",
        display: "flex",
        transition: "background 0.15s",
      }}
    >
      {/* Left color bar */}
      <div
        style={{
          width: "3px",
          background: leftBorderColor(item.item_type),
          flexShrink: 0,
        }}
      />
      <div
        style={{
          padding: "14px 16px",
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        {/* Type badge */}
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "2px 7px",
            borderRadius: "6px",
            background: tb.bg,
            color: tb.color,
            flexShrink: 0,
          }}
        >
          {tb.label}
        </span>

        {/* Name + instrument */}
        <div style={{ flex: 1, minWidth: "160px" }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--pg-text-1)",
              marginBottom: "2px",
            }}
          >
            {item.name}
          </div>
          <div style={{ fontSize: "12px", color: "var(--pg-text-3)" }}>
            {item.instrument_type}
          </div>
        </div>

        {/* Amount */}
        <div style={{ textAlign: "right", minWidth: "100px" }}>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--pg-text-1)",
            }}
          >
            {fmtCompact(item.amount, item.currency)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>
            {item.currency}
          </div>
        </div>

        {/* Urgency badge */}
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            padding: "3px 10px",
            borderRadius: "20px",
            background: ub.bg,
            color: ub.color,
            flexShrink: 0,
          }}
        >
          {ub.label}
        </span>

        {/* Status */}
        <span
          style={{
            fontSize: "11px",
            color: "var(--pg-text-3)",
            textTransform: "capitalize",
            flexShrink: 0,
          }}
        >
          {item.status}
        </span>

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={() => onAction(item.id, "view")}
            style={{
              height: "32px",
              padding: "0 12px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 600,
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
              border: "none",
              cursor: "pointer",
            }}
          >
            View
          </button>
          <button
            onClick={() =>
              onAction(item.id, item.item_type === "asset" ? "rollover" : "instructed")
            }
            style={{
              height: "32px",
              padding: "0 12px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 600,
              background: "linear-gradient(135deg, #FF6600, #E05500)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            {item.item_type === "asset" ? "Book Rollover" : "Mark Instructed"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarView({
  items, selectedMonth, onPrev, onNext,
}: {
  items: MaturityItem[];
  selectedMonth: Date;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [popupDay, setPopupDay] = useState<string | null>(null);

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Monday-based week start
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
  const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;

  const cells: (number | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDow + 1;
    cells.push(dayNum >= 1 && dayNum <= lastDay.getDate() ? dayNum : null);
  }

  const itemsByDay = useMemo(() => {
    const map: Record<string, MaturityItem[]> = {};
    items.forEach((it) => {
      const d = new Date(it.maturity_date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const key = String(d.getDate());
        if (!map[key]) map[key] = [];
        map[key].push(it);
      }
    });
    return map;
  }, [items, year, month]);

  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  const monthLabel = selectedMonth.toLocaleDateString("en-GB", {
    month: "long", year: "numeric",
  });

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      {/* Month nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <button
          onClick={onPrev}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            border: "1px solid var(--pg-card-border)",
            background: "var(--pg-muted-bg)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft size={16} color="var(--pg-text-2)" />
        </button>
        <span
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "var(--pg-text-1)",
          }}
        >
          {monthLabel}
        </span>
        <button
          onClick={onNext}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            border: "1px solid var(--pg-card-border)",
            background: "var(--pg-muted-bg)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronRight size={16} color="var(--pg-text-2)" />
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "2px" }}>
        {dayNames.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--pg-text-3)",
              padding: "6px 0",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
        {cells.map((dayNum, i) => {
          const key = dayNum ? String(dayNum) : `empty-${i}`;
          const dayItems = dayNum ? (itemsByDay[String(dayNum)] ?? []) : [];
          const assets = dayItems.filter((x) => x.item_type === "asset");
          const liabilities = dayItems.filter((x) => x.item_type === "liability");
          const isActive = dayNum && isToday(dayNum);
          const popKey = dayNum ? `${year}-${month}-${dayNum}` : null;

          return (
            <div
              key={key}
              onClick={() => {
                if (!dayNum) return;
                const pk = `${year}-${month}-${dayNum}`;
                setPopupDay(popupDay === pk ? null : pk);
              }}
              style={{
                minHeight: "80px",
                borderRadius: "10px",
                border: "1px solid var(--pg-card-border)",
                background: isActive
                  ? "rgba(255,102,0,0.06)"
                  : dayNum
                  ? "var(--pg-card)"
                  : "transparent",
                padding: "6px 8px",
                cursor: dayNum ? "pointer" : "default",
                position: "relative",
              }}
            >
              {dayNum && (
                <>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: isActive ? 700 : 400,
                      color: isActive ? "#FF6600" : "var(--pg-text-2)",
                      marginBottom: "6px",
                    }}
                  >
                    {dayNum}
                  </div>
                  <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                    {assets.map((_, ai) => (
                      <div
                        key={`a${ai}`}
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "#FF6600",
                        }}
                      />
                    ))}
                    {liabilities.map((_, li) => (
                      <div
                        key={`l${li}`}
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "#1d4ed8",
                        }}
                      />
                    ))}
                  </div>

                  {/* Popup */}
                  {popupDay === popKey && dayItems.length > 0 && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: "0",
                        zIndex: 50,
                        background: "var(--pg-card)",
                        border: "1px solid var(--pg-card-border)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        borderRadius: "12px",
                        padding: "12px",
                        minWidth: "220px",
                        width: "max-content",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--pg-text-3)",
                          marginBottom: "8px",
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                        }}
                      >
                        {fmtDate(`${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`)}
                      </div>
                      {dayItems.map((it) => (
                        <div
                          key={it.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            padding: "6px 0",
                            borderBottom: "1px solid var(--pg-card-border)",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--pg-text-1)" }}>
                              {it.name}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>
                              {it.instrument_type}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              color: it.item_type === "asset" ? "#FF6600" : "#1d4ed8",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {fmtCompact(it.amount, it.currency)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "16px", marginTop: "12px", justifyContent: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#FF6600" }} />
          <span style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>Asset</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#1d4ed8" }} />
          <span style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>Liability</span>
        </div>
      </div>
    </div>
  );
}

function AlertConfigModal({ onClose }: { onClose: () => void }) {
  const [thresholds, setThresholds] = useState({
    d30: true, d14: true, d7: true, d3: true, d1: true,
  });
  const [assetAlerts, setAssetAlerts] = useState(true);
  const [liabilityAlerts, setLiabilityAlerts] = useState(true);
  const [notifMethod, setNotifMethod] = useState<"inapp" | "email">("inapp");
  const [saved, setSaved] = useState(false);

  const toggle = (key: keyof typeof thresholds) =>
    setThresholds((prev) => ({ ...prev, [key]: !prev[key] }));

  function handleSave() {
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: "20px",
          padding: "28px",
          width: "100%",
          maxWidth: "440px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Bell size={18} color="#FF6600" />
            <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--pg-text-1)" }}>
              Configure Alerts
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              border: "none",
              background: "var(--pg-muted-bg)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={14} color="var(--pg-text-3)" />
          </button>
        </div>

        {/* Thresholds */}
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--pg-text-3)",
              marginBottom: "10px",
            }}
          >
            Alert Thresholds
          </div>
          {[
            { key: "d30" as const, label: "30 days before maturity" },
            { key: "d14" as const, label: "14 days before maturity" },
            { key: "d7" as const, label: "7 days before maturity" },
            { key: "d3" as const, label: "3 days before maturity" },
            { key: "d1" as const, label: "1 day before maturity" },
          ].map(({ key, label }) => (
            <label
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 0",
                cursor: "pointer",
                fontSize: "13px",
                color: "var(--pg-text-1)",
              }}
            >
              <input
                type="checkbox"
                checked={thresholds[key]}
                onChange={() => toggle(key)}
                style={{ width: "16px", height: "16px", accentColor: "#FF6600", cursor: "pointer" }}
              />
              {label}
            </label>
          ))}
        </div>

        {/* Asset / Liability toggles */}
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--pg-text-3)",
              marginBottom: "10px",
            }}
          >
            Alert For
          </div>
          {[
            { label: "Asset maturities", checked: assetAlerts, set: setAssetAlerts },
            { label: "Liability maturities", checked: liabilityAlerts, set: setLiabilityAlerts },
          ].map(({ label, checked, set }) => (
            <label
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 0",
                cursor: "pointer",
                fontSize: "13px",
                color: "var(--pg-text-1)",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => set(!checked)}
                style={{ width: "16px", height: "16px", accentColor: "#FF6600", cursor: "pointer" }}
              />
              {label}
            </label>
          ))}
        </div>

        {/* Notification method */}
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--pg-text-3)",
              marginBottom: "10px",
            }}
          >
            Notification Method
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["inapp", "email"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setNotifMethod(m)}
                style={{
                  height: "36px",
                  padding: "0 16px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: 600,
                  border: "1px solid var(--pg-card-border)",
                  cursor: "pointer",
                  background: notifMethod === m
                    ? "linear-gradient(135deg, #FF6600, #E05500)"
                    : "var(--pg-muted-bg)",
                  color: notifMethod === m ? "#fff" : "var(--pg-text-2)",
                  transition: "all 0.15s",
                }}
              >
                {m === "inapp" ? "In-app" : "Email"}
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          style={{
            width: "100%",
            height: "40px",
            borderRadius: "12px",
            fontSize: "13px",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            background: saved
              ? "linear-gradient(135deg, #059669, #047857)"
              : "linear-gradient(135deg, #FF6600, #E05500)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "background 0.2s",
          }}
        >
          {saved ? (
            <>
              <CheckCircle2 size={16} />
              Alert preferences saved
            </>
          ) : (
            "Save Preferences"
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function MaturitiesPage() {
  const { user } = useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [filterType, setFilterType] = useState<FilterType>("both");
  const [filterUrgency, setFilterUrgency] = useState<FilterUrgency>("all");
  const [filterCurrency, setFilterCurrency] = useState<FilterCurrency>("all");
  const [dateRange, setDateRange] = useState<DateRange>("90days");
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("maturity_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [rowHover, setRowHover] = useState<string | null>(null);

  // Recalculate days_remaining from today (demo data has static days_remaining)
  const items: MaturityItem[] = DEMO_MATURITIES.map((it) => ({
    ...it,
    days_remaining: getDaysUntil(it.maturity_date),
  }));

  // ── Summary strip calculations ────────────────────────────────────────────

  const todayItems = items.filter((it) => it.days_remaining === 0);
  const weekItems  = items.filter((it) => it.days_remaining >= 0 && it.days_remaining <= 7);
  const monthItems = items.filter((it) => it.days_remaining >= 0 && it.days_remaining <= 30);
  const q90Items   = items.filter((it) => it.days_remaining >= 0 && it.days_remaining <= 90);

  const sumAmount = (list: MaturityItem[]) => list.reduce((s, it) => s + it.amount, 0);

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...items];

    // type filter
    if (filterType === "assets")      list = list.filter((x) => x.item_type === "asset");
    if (filterType === "liabilities") list = list.filter((x) => x.item_type === "liability");

    // urgency
    if (filterUrgency !== "all") {
      const maxD = parseInt(filterUrgency, 10);
      list = list.filter((x) => x.days_remaining >= 0 && x.days_remaining <= maxD);
    }

    // currency
    if (filterCurrency !== "all") {
      list = list.filter((x) => x.currency === filterCurrency);
    }

    // date range
    if (dateRange === "today")   list = list.filter((x) => x.days_remaining === 0);
    if (dateRange === "week")    list = list.filter((x) => x.days_remaining >= 0 && x.days_remaining <= 7);
    if (dateRange === "month")   list = list.filter((x) => x.days_remaining >= 0 && x.days_remaining <= 30);
    if (dateRange === "90days")  list = list.filter((x) => x.days_remaining >= 0 && x.days_remaining <= 90);

    // sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "maturity_date")  cmp = a.maturity_date.localeCompare(b.maturity_date);
      if (sortKey === "name")            cmp = a.name.localeCompare(b.name);
      if (sortKey === "amount")          cmp = a.amount - b.amount;
      if (sortKey === "days_remaining")  cmp = a.days_remaining - b.days_remaining;
      if (sortKey === "item_type")       cmp = a.item_type.localeCompare(b.item_type);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [items, filterType, filterUrgency, filterCurrency, dateRange, sortKey, sortDir]);

  // ── Group for timeline ────────────────────────────────────────────────────

  const timelineGroups = useMemo(() => {
    const groups: Record<string, MaturityItem[]> = {};
    filtered.forEach((it) => {
      if (!groups[it.maturity_date]) groups[it.maturity_date] = [];
      groups[it.maturity_date].push(it);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function getGroupLabel(dateStr: string): string {
    const days = getDaysUntil(dateStr);
    const dateLabel = fmtDate(dateStr);
    if (days === 0) return `Today — ${dateLabel}`;
    if (days === 1) return `Tomorrow — ${dateLabel}`;
    if (days === -1) return `Yesterday — ${dateLabel}`;
    if (days < 0) return `${Math.abs(days)} days overdue — ${dateLabel}`;
    return `In ${days} days — ${dateLabel}`;
  }

  // ── Sort toggle ───────────────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ opacity: 0.3, fontSize: "10px" }}>↕</span>;
    return <span style={{ fontSize: "10px", color: "#FF6600" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // ── Action handler ────────────────────────────────────────────────────────

  function handleAction(id: string, action: string) {
    console.log("Action", action, "on item", id);
  }

  // ── Month nav ─────────────────────────────────────────────────────────────

  function prevMonth() {
    setSelectedMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function nextMonth() {
    setSelectedMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }

  // ── Pill button helpers ───────────────────────────────────────────────────

  const pillBase: React.CSSProperties = {
    height: "36px",
    padding: "0 14px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: 600,
    border: "1px solid var(--pg-card-border)",
    cursor: "pointer",
    transition: "all 0.15s",
  };
  const pillActive: React.CSSProperties = {
    ...pillBase,
    background: "linear-gradient(135deg, #FF6600, #E05500)",
    color: "#fff",
    border: "1px solid transparent",
  };
  const pillInactive: React.CSSProperties = {
    ...pillBase,
    background: "var(--pg-muted-bg)",
    color: "var(--pg-text-2)",
  };

  const iconPillBase: React.CSSProperties = {
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    border: "1px solid var(--pg-card-border)",
    cursor: "pointer",
    transition: "all 0.15s",
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--pg-text-3)",
    borderBottom: "1px solid var(--pg-card-border)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1280px", margin: "0 auto" }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        {/* Left: title + date range */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <CalendarDays size={22} color="#FF6600" />
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--pg-text-1)", margin: 0 }}>
              Maturity Calendar
            </h1>
          </div>
          {/* Date range buttons */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {(
              [
                { key: "today",   label: "Today" },
                { key: "week",    label: "This Week" },
                { key: "month",   label: "This Month" },
                { key: "90days",  label: "Next 90 Days" },
                { key: "custom",  label: "Custom" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateRange(key)}
                style={dateRange === key ? pillActive : pillInactive}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: view toggle + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* View mode toggle */}
          <div
            style={{
              display: "flex",
              gap: "2px",
              background: "var(--pg-muted-bg)",
              borderRadius: "12px",
              padding: "3px",
              border: "1px solid var(--pg-card-border)",
            }}
          >
            {(
              [
                { mode: "timeline" as ViewMode, Icon: BarChart2, label: "Timeline" },
                { mode: "calendar" as ViewMode, Icon: Calendar,  label: "Calendar" },
                { mode: "list"     as ViewMode, Icon: List,       label: "List" },
              ]
            ).map(({ mode, Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                style={{
                  width: "34px",
                  height: "30px",
                  borderRadius: "9px",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: viewMode === mode
                    ? "linear-gradient(135deg, #FF6600, #E05500)"
                    : "transparent",
                  transition: "all 0.15s",
                }}
              >
                <Icon size={15} color={viewMode === mode ? "#fff" : "var(--pg-text-3)"} />
              </button>
            ))}
          </div>

          {/* Configure Alerts */}
          <button
            onClick={() => setShowAlertModal(true)}
            style={{
              height: "36px",
              padding: "0 14px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 600,
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
              border: "1px solid var(--pg-card-border)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Bell size={14} />
            Configure Alerts
          </button>

          {/* Export */}
          <button
            style={{
              height: "36px",
              padding: "0 14px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 600,
              background: "linear-gradient(135deg, #FF6600, #E05500)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      {/* ── SUMMARY STRIP ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <SummaryCard
          title="Today"
          count={todayItems.length}
          amount={sumAmount(todayItems)}
          color="#dc2626"
        />
        <SummaryCard
          title="This Week (7d)"
          count={weekItems.length}
          amount={sumAmount(weekItems)}
          color="#d97706"
        />
        <SummaryCard
          title="This Month (30d)"
          count={monthItems.length}
          amount={sumAmount(monthItems)}
          color="#FF6600"
        />
        <SummaryCard
          title="Next 90 Days"
          count={q90Items.length}
          amount={sumAmount(q90Items)}
          color="#059669"
        />
      </div>

      {/* ── DEMO BANNER ────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "#fef3c7",
          border: "1px solid #fde68a",
          borderRadius: "12px",
          padding: "10px 16px",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <AlertTriangle size={15} color="#d97706" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: "12px", color: "#92400e", fontWeight: 500 }}>
          Sample maturity data shown for demonstration. Connect your asset register and liability
          records to see live data.
        </span>
      </div>

      {/* ── FILTER BAR ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Type */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--pg-text-3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Type
          </span>
          {(
            [
              { key: "both" as FilterType, label: "All" },
              { key: "assets" as FilterType, label: "Assets Only" },
              { key: "liabilities" as FilterType, label: "Liabilities Only" },
            ]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              style={filterType === key ? { ...pillActive, height: "30px", padding: "0 10px", fontSize: "12px" } : { ...pillInactive, height: "30px", padding: "0 10px", fontSize: "12px" }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ width: "1px", height: "24px", background: "var(--pg-card-border)" }} />

        {/* Urgency */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--pg-text-3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Urgency
          </span>
          {(
            [
              { key: "all" as FilterUrgency, label: "All" },
              { key: "7"   as FilterUrgency, label: "<7 days" },
              { key: "30"  as FilterUrgency, label: "<30 days" },
              { key: "90"  as FilterUrgency, label: "<90 days" },
            ]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterUrgency(key)}
              style={filterUrgency === key ? { ...pillActive, height: "30px", padding: "0 10px", fontSize: "12px" } : { ...pillInactive, height: "30px", padding: "0 10px", fontSize: "12px" }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ width: "1px", height: "24px", background: "var(--pg-card-border)" }} />

        {/* Currency */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--pg-text-3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Currency
          </span>
          {(
            [
              { key: "all" as FilterCurrency, label: "All" },
              { key: "NGN" as FilterCurrency, label: "NGN" },
              { key: "USD" as FilterCurrency, label: "USD" },
            ]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterCurrency(key)}
              style={filterCurrency === key ? { ...pillActive, height: "30px", padding: "0 10px", fontSize: "12px" } : { ...pillInactive, height: "30px", padding: "0 10px", fontSize: "12px" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── VIEWS ──────────────────────────────────────────────────────────── */}

      {/* TIMELINE VIEW */}
      {viewMode === "timeline" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {timelineGroups.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "80px 0",
                textAlign: "center",
              }}
            >
              <CalendarDays size={40} color="var(--pg-text-4)" style={{ marginBottom: "12px" }} />
              <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--pg-text-3)" }}>
                No maturities in this range
              </div>
              <div style={{ fontSize: "12px", color: "var(--pg-text-4)", marginTop: "6px" }}>
                Try changing the date range or filters
              </div>
            </div>
          )}
          {timelineGroups.map(([dateStr, groupItems]) => (
            <div key={dateStr}>
              {/* Group header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "10px",
                }}
              >
                <Clock size={14} color="var(--pg-text-3)" />
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "var(--pg-text-2)",
                  }}
                >
                  {getGroupLabel(dateStr)}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "20px",
                    background: "var(--pg-muted-bg)",
                    color: "var(--pg-text-3)",
                  }}
                >
                  {groupItems.length} item{groupItems.length !== 1 ? "s" : ""} &nbsp;&middot;&nbsp; {fmtCompact(sumAmount(groupItems), "NGN")}
                </span>
                <div style={{ flex: 1, height: "1px", background: "var(--pg-card-border)" }} />
              </div>
              {/* Items */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {groupItems.map((it) => (
                  <TimelineItemCard key={it.id} item={it} onAction={handleAction} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === "calendar" && (
        <div
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            borderRadius: "16px",
            padding: "20px",
          }}
        >
          <CalendarView
            items={items}
            selectedMonth={selectedMonth}
            onPrev={prevMonth}
            onNext={nextMonth}
          />
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <div
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            borderRadius: "16px",
            overflow: "hidden",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "80px 0",
                textAlign: "center",
              }}
            >
              <List size={40} color="var(--pg-text-4)" style={{ marginBottom: "12px" }} />
              <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--pg-text-3)" }}>
                No maturities found
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--pg-muted-bg)" }}>
                    {[
                      { key: "maturity_date" as SortKey, label: "Date" },
                      { key: "name" as SortKey,          label: "Name" },
                      { key: "item_type" as SortKey,     label: "Type" },
                      { key: "name" as SortKey,          label: "Instrument" },
                      { key: "name" as SortKey,          label: "Currency" },
                      { key: "amount" as SortKey,        label: "Amount" },
                      { key: "days_remaining" as SortKey, label: "Days" },
                      { key: "name" as SortKey,          label: "Status" },
                    ].map(({ key, label }) => (
                      <th
                        key={label}
                        style={thStyle}
                        onClick={() => handleSort(key)}
                      >
                        {label} {key !== "name" || label === "Name" ? <SortIcon col={key} /> : null}
                      </th>
                    ))}
                    <th style={{ ...thStyle, cursor: "default" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const days = getDaysUntil(it.maturity_date);
                    const ub = urgencyBadge(days);
                    const tb = typeBadge(it.item_type);
                    const isHov = rowHover === it.id;
                    return (
                      <tr
                        key={it.id}
                        onMouseEnter={() => setRowHover(it.id)}
                        onMouseLeave={() => setRowHover(null)}
                        style={{
                          background: isHov ? "var(--pg-row-hover)" : undefined,
                          borderBottom: "1px solid var(--pg-card-border)",
                          transition: "background 0.1s",
                        }}
                      >
                        <td style={{ padding: "12px", fontSize: "13px", color: "var(--pg-text-1)", whiteSpace: "nowrap" }}>
                          {fmtDate(it.maturity_date)}
                        </td>
                        <td style={{ padding: "12px", fontSize: "13px", fontWeight: 600, color: "var(--pg-text-1)", maxWidth: "180px" }}>
                          {it.name}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              padding: "2px 7px",
                              borderRadius: "6px",
                              background: tb.bg,
                              color: tb.color,
                              letterSpacing: "0.05em",
                            }}
                          >
                            {tb.label}
                          </span>
                        </td>
                        <td style={{ padding: "12px", fontSize: "13px", color: "var(--pg-text-2)" }}>
                          {it.instrument_type}
                        </td>
                        <td style={{ padding: "12px", fontSize: "13px", color: "var(--pg-text-2)" }}>
                          {it.currency}
                        </td>
                        <td style={{ padding: "12px", fontSize: "13px", fontWeight: 700, color: "var(--pg-text-1)", whiteSpace: "nowrap" }}>
                          {fmtCompact(it.amount, it.currency)}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "3px 9px",
                              borderRadius: "20px",
                              background: ub.bg,
                              color: ub.color,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ub.label}
                          </span>
                        </td>
                        <td style={{ padding: "12px", fontSize: "13px", color: "var(--pg-text-2)", textTransform: "capitalize" }}>
                          {it.status}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              onClick={() => handleAction(it.id, "view")}
                              style={{
                                height: "28px",
                                padding: "0 10px",
                                borderRadius: "8px",
                                fontSize: "11px",
                                fontWeight: 600,
                                background: "var(--pg-muted-bg)",
                                color: "var(--pg-text-2)",
                                border: "none",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleAction(it.id, it.item_type === "asset" ? "rollover" : "instructed")}
                              style={{
                                height: "28px",
                                padding: "0 10px",
                                borderRadius: "8px",
                                fontSize: "11px",
                                fontWeight: 600,
                                background: "linear-gradient(135deg, #FF6600, #E05500)",
                                color: "#fff",
                                border: "none",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {it.item_type === "asset" ? "Book Rollover" : "Mark Instructed"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ALERT MODAL ────────────────────────────────────────────────────── */}
      {showAlertModal && <AlertConfigModal onClose={() => setShowAlertModal(false)} />}
    </div>
  );
}
