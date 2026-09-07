"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  FileBarChart,
  CalendarDays,
  Download,
  Send,
  Clock,
  Play,
  Pause,
  Settings,
  X,
  Filter,
  ChevronRight,
  Eye,
  FileText,
  BarChart2,
  Wallet,
  CreditCard,
  Activity,
  AlertTriangle,
  Search,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Plus,
  TrendingUp,
} from "lucide-react";

const BASE = "http://localhost:8081";

function fmtCompact(n: number, cur: string) {
  const sym = cur === "USD" ? "$" : "₦";
  if (n >= 1e9) return sym + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sym + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return sym + (n / 1e3).toFixed(1) + "K";
  return sym + n.toLocaleString("en-NG");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type ReportDef = {
  id: string;
  name: string;
  desc: string;
  category: string;
  icon: React.ElementType;
  color: string;
  freq: string;
};

const REPORTS: ReportDef[] = [
  {
    id: "liquidity_daily",
    name: "Daily Liquidity Report",
    desc: "Consolidated bank account balances, available cash, restricted cash and investable balance.",
    category: "daily",
    icon: Wallet,
    color: "#059669",
    freq: "Daily",
  },
  {
    id: "liability_daily",
    name: "Daily Liability Report",
    desc: "Full liability schedule with outstanding amounts, rates, tenors and maturity buckets.",
    category: "daily",
    icon: CreditCard,
    color: "#d97706",
    freq: "Daily",
  },
  {
    id: "asset_schedule",
    name: "Consolidated Asset Schedule",
    desc: "All investments across asset classes with current values, yields and status.",
    category: "asset",
    icon: BarChart2,
    color: "#1d4ed8",
    freq: "On Demand",
  },
  {
    id: "asset_maturity",
    name: "Asset Maturity Report",
    desc: "Upcoming asset maturities by date, with amount and rollover instructions.",
    category: "asset",
    icon: CalendarDays,
    color: "#FF6600",
    freq: "On Demand",
  },
  {
    id: "liability_maturity",
    name: "Liability Maturity Report",
    desc: "Upcoming liability maturities and funding obligations by date.",
    category: "liability",
    icon: CalendarDays,
    color: "#d97706",
    freq: "On Demand",
  },
  {
    id: "asset_allocation",
    name: "Asset Allocation & Exposure",
    desc: "Portfolio allocation by asset class, issuer, currency and concentration analysis.",
    category: "asset",
    icon: FileBarChart,
    color: "#7c3aed",
    freq: "On Demand",
  },
  {
    id: "alm_report",
    name: "ALM Report",
    desc: "Maturity gap, liquidity gap, coverage ratios and weighted-average analysis.",
    category: "alm",
    icon: Activity,
    color: "#0891b2",
    freq: "On Demand",
  },
  {
    id: "income_yield",
    name: "Income, Yield & Performance",
    desc: "Accrued income, realized income, portfolio yield and performance vs benchmark.",
    category: "alm",
    icon: TrendingUp,
    color: "#059669",
    freq: "Monthly",
  },
  {
    id: "exception_report",
    name: "Exception & Limit Breach",
    desc: "All current breaches, approaching limits and data quality exceptions.",
    category: "audit",
    icon: AlertTriangle,
    color: "#dc2626",
    freq: "Daily",
  },
  {
    id: "audit_trail",
    name: "Transaction & Audit Trail",
    desc: "Complete log of all transactions, amendments, approvals and data changes.",
    category: "audit",
    icon: Search,
    color: "#475569",
    freq: "On Demand",
  },
];

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "daily", label: "Daily" },
  { key: "asset", label: "Asset" },
  { key: "liability", label: "Liability" },
  { key: "alm", label: "ALM" },
  { key: "audit", label: "Audit" },
];

type ScheduledReport = {
  id: string;
  reportId: string;
  reportName: string;
  frequency: string;
  time: string;
  recipients: string[];
  format: string;
  active: boolean;
};

export default function PMReportsPage() {
  const { toast } = useToast();

  const [activeCategory, setActiveCategory] = useState("all");
  const [showGenModal, setShowGenModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showScheduleList, setShowScheduleList] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportDef | null>(null);
  const [genFormat, setGenFormat] = useState<"pdf" | "excel" | "screen">("pdf");
  const [generating, setGenerating] = useState(false);

  // Generate modal state
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [entityFund, setEntityFund] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [assetClass, setAssetClass] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Schedule modal state
  const [schedFreq, setSchedFreq] = useState<"daily" | "weekly" | "monthly">("daily");
  const [schedTime, setSchedTime] = useState("08:00");
  const [schedRecipients, setSchedRecipients] = useState("");
  const [schedFormat, setSchedFormat] = useState<"pdf" | "excel">("pdf");
  const [schedActive, setSchedActive] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);

  const filteredReports =
    activeCategory === "all"
      ? REPORTS
      : REPORTS.filter((r) => r.category === activeCategory);

  function openGenModal(report: ReportDef) {
    setSelectedReport(report);
    setGenFormat("pdf");
    setAsOfDate(new Date().toISOString().split("T")[0]);
    setDateFrom("");
    setDateTo("");
    setEntityFund("");
    setCurrency("NGN");
    setAssetClass("all");
    setStatusFilter("all");
    setShowGenModal(true);
  }

  function openScheduleModal(report: ReportDef) {
    setSelectedReport(report);
    setSchedFreq("daily");
    setSchedTime("08:00");
    setSchedRecipients("");
    setSchedFormat("pdf");
    setSchedActive(true);
    setShowScheduleModal(true);
  }

  async function handleGenerate() {
    if (!selectedReport) return;
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 1400));
    setGenerating(false);
    setShowGenModal(false);
    toast({
      title: "Report generated",
      description: "Download starting...",
    });
  }

  async function handleSaveSchedule() {
    if (!selectedReport) return;
    setSavingSchedule(true);
    await new Promise((r) => setTimeout(r, 900));
    const newSched: ScheduledReport = {
      id: Math.random().toString(36).slice(2),
      reportId: selectedReport.id,
      reportName: selectedReport.name,
      frequency: schedFreq,
      time: schedTime,
      recipients: schedRecipients.split("\n").map((e) => e.trim()).filter(Boolean),
      format: schedFormat,
      active: schedActive,
    };
    setScheduledReports((prev) => [...prev, newSched]);
    setSavingSchedule(false);
    setShowScheduleModal(false);
    toast({ title: "Schedule saved", description: `${selectedReport.name} scheduled successfully.` });
  }

  function deleteSchedule(id: string) {
    setScheduledReports((prev) => prev.filter((s) => s.id !== id));
    toast({ title: "Schedule deleted" });
  }

  function toggleScheduleActive(id: string) {
    setScheduledReports((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    );
  }

  const freqBadgeColor: Record<string, { bg: string; color: string }> = {
    Daily: { bg: "#d1fae5", color: "#065f46" },
    Monthly: { bg: "#dbeafe", color: "#1d4ed8" },
    "On Demand": { bg: "#f3f4f6", color: "#374151" },
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--pg-bg)",
        padding: "32px 32px 64px",
        fontFamily: "inherit",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--pg-text-1)",
              lineHeight: 1.2,
            }}
          >
            Reports
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--pg-text-3)",
              marginTop: 4,
            }}
          >
            Generate, export and schedule management reports
          </div>
        </div>
        <button
          onClick={() => setShowScheduleList(true)}
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
          <Clock size={14} />
          Scheduled Reports
          {scheduledReports.length > 0 && (
            <span
              style={{
                background: "#FF6600",
                color: "#fff",
                borderRadius: 10,
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 6px",
                marginLeft: 2,
              }}
            >
              {scheduledReports.length}
            </span>
          )}
        </button>
      </div>

      {/* CATEGORY TABS */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          background: "var(--pg-muted-bg)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 12,
          padding: 4,
          width: "fit-content",
        }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            style={{
              height: 32,
              padding: "0 16px",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: activeCategory === cat.key ? 600 : 500,
              border: "none",
              cursor: "pointer",
              background:
                activeCategory === cat.key
                  ? "#fff"
                  : "transparent",
              color:
                activeCategory === cat.key
                  ? "#FF6600"
                  : "var(--pg-text-2)",
              boxShadow:
                activeCategory === cat.key
                  ? "0 1px 4px rgba(0,0,0,0.08)"
                  : "none",
              transition: "all 0.15s",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* REPORT CARDS GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 16,
        }}
      >
        {filteredReports.map((report) => {
          const Icon = report.icon;
          const badge = freqBadgeColor[report.freq] ?? { bg: "#f3f4f6", color: "#374151" };
          return (
            <div
              key={report.id}
              style={{
                background: "var(--pg-card)",
                border: "1px solid var(--pg-card-border)",
                borderRadius: 16,
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Accent bar */}
              <div className="h-[3px]" style={{ background: report.color }} />

              <div style={{ padding: "16px 18px 18px" }}>
                {/* Card header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: report.color + "18",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={18} style={{ color: report.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--pg-text-1)",
                        lineHeight: 1.3,
                      }}
                    >
                      {report.name}
                    </div>
                  </div>
                  <span
                    style={{
                      background: badge.bg,
                      color: badge.color,
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {report.freq}
                  </span>
                </div>

                {/* Description */}
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--pg-text-3)",
                    lineHeight: 1.55,
                    marginBottom: 14,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {report.desc}
                </div>

                {/* Footer */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--pg-text-4)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Clock size={11} />
                    Last run: Never
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => openGenModal(report)}
                      style={{
                        height: 30,
                        padding: "0 12px",
                        borderRadius: 9,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                        background: "linear-gradient(135deg,#FF6600,#E05500)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Play size={11} />
                      Generate
                    </button>
                    <button
                      onClick={() => openGenModal(report)}
                      style={{
                        height: 30,
                        padding: "0 10px",
                        borderRadius: 9,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--pg-text-2)",
                        border: "1px solid var(--pg-card-border)",
                        cursor: "pointer",
                        background: "var(--pg-muted-bg)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Eye size={11} />
                      Preview
                    </button>
                    <button
                      onClick={() => openScheduleModal(report)}
                      style={{
                        height: 30,
                        padding: "0 10px",
                        borderRadius: 9,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--pg-text-2)",
                        border: "1px solid var(--pg-card-border)",
                        cursor: "pointer",
                        background: "var(--pg-muted-bg)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Clock size={11} />
                      Schedule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* GENERATE MODAL */}
      {showGenModal && selectedReport && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGenModal(false);
          }}
        >
          <div
            style={{
              background: "var(--pg-card)",
              borderRadius: 20,
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            {/* Modal accent bar */}
            <div style={{ height: 3, background: selectedReport.color, borderRadius: "20px 20px 0 0" }} />

            <div style={{ padding: "24px 24px 28px" }}>
              {/* Modal header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 22,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                      marginBottom: 4,
                    }}
                  >
                    Generate Report
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--pg-text-1)",
                    }}
                  >
                    {selectedReport.name}
                  </div>
                </div>
                <button
                  onClick={() => setShowGenModal(false)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid var(--pg-card-border)",
                    background: "var(--pg-muted-bg)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--pg-text-3)",
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Filter section */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--pg-text-3)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      As of Date
                    </label>
                    <input
                      type="date"
                      value={asOfDate}
                      onChange={(e) => setAsOfDate(e.target.value)}
                      style={{
                        height: 36,
                        padding: "0 12px",
                        borderRadius: 10,
                        fontSize: 13,
                        outline: "none",
                        background: "var(--pg-muted-bg)",
                        border: "1px solid var(--pg-card-border)",
                        color: "var(--pg-text-1)",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--pg-text-3)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      style={{
                        height: 36,
                        padding: "0 12px",
                        borderRadius: 10,
                        fontSize: 13,
                        outline: "none",
                        background: "var(--pg-muted-bg)",
                        border: "1px solid var(--pg-card-border)",
                        color: "var(--pg-text-1)",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="NGN">NGN</option>
                      <option value="USD">USD</option>
                      <option value="all">All</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Date Range
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      placeholder="From"
                      style={{
                        height: 36,
                        padding: "0 12px",
                        borderRadius: 10,
                        fontSize: 13,
                        outline: "none",
                        background: "var(--pg-muted-bg)",
                        border: "1px solid var(--pg-card-border)",
                        color: "var(--pg-text-1)",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      placeholder="To"
                      style={{
                        height: 36,
                        padding: "0 12px",
                        borderRadius: 10,
                        fontSize: 13,
                        outline: "none",
                        background: "var(--pg-muted-bg)",
                        border: "1px solid var(--pg-card-border)",
                        color: "var(--pg-text-1)",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Entity / Fund
                  </label>
                  <input
                    type="text"
                    value={entityFund}
                    onChange={(e) => setEntityFund(e.target.value)}
                    placeholder="All entities"
                    style={{
                      height: 36,
                      padding: "0 12px",
                      borderRadius: 10,
                      fontSize: 13,
                      outline: "none",
                      background: "var(--pg-muted-bg)",
                      border: "1px solid var(--pg-card-border)",
                      color: "var(--pg-text-1)",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--pg-text-3)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Asset Class
                    </label>
                    <select
                      value={assetClass}
                      onChange={(e) => setAssetClass(e.target.value)}
                      style={{
                        height: 36,
                        padding: "0 12px",
                        borderRadius: 10,
                        fontSize: 13,
                        outline: "none",
                        background: "var(--pg-muted-bg)",
                        border: "1px solid var(--pg-card-border)",
                        color: "var(--pg-text-1)",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="all">All Classes</option>
                      <option value="fixed_income">Fixed Income</option>
                      <option value="equity">Equity</option>
                      <option value="money_market">Money Market</option>
                      <option value="real_estate">Real Estate</option>
                      <option value="alternatives">Alternatives</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--pg-text-3)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      style={{
                        height: 36,
                        padding: "0 12px",
                        borderRadius: 10,
                        fontSize: 13,
                        outline: "none",
                        background: "var(--pg-muted-bg)",
                        border: "1px solid var(--pg-card-border)",
                        color: "var(--pg-text-1)",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="matured">Matured</option>
                      <option value="pending">Pending</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                {/* Format selector */}
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                      display: "block",
                      marginBottom: 8,
                    }}
                  >
                    Output Format
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["pdf", "excel", "screen"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setGenFormat(fmt)}
                        style={{
                          height: 34,
                          padding: "0 16px",
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 600,
                          border: genFormat === fmt ? "2px solid #FF6600" : "1px solid var(--pg-card-border)",
                          background: genFormat === fmt ? "#fff4ee" : "var(--pg-muted-bg)",
                          color: genFormat === fmt ? "#FF6600" : "var(--pg-text-2)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          transition: "all 0.15s",
                        }}
                      >
                        {fmt === "pdf" && <FileText size={13} />}
                        {fmt === "excel" && <BarChart2 size={13} />}
                        {fmt === "screen" && <Eye size={13} />}
                        {fmt === "pdf" ? "PDF" : fmt === "excel" ? "Excel" : "On-screen"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal actions */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 24,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setShowGenModal(false)}
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
                  onClick={handleGenerate}
                  disabled={generating}
                  style={{
                    height: 36,
                    padding: "0 20px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    border: "none",
                    cursor: generating ? "not-allowed" : "pointer",
                    background: "linear-gradient(135deg,#FF6600,#E05500)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: generating ? 0.8 : 1,
                  }}
                >
                  {generating ? (
                    <>
                      <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      Generate Report
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE MODAL */}
      {showScheduleModal && selectedReport && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowScheduleModal(false);
          }}
        >
          <div
            style={{
              background: "var(--pg-card)",
              borderRadius: 20,
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
              width: "100%",
              maxWidth: 460,
            }}
          >
            <div style={{ height: 3, background: selectedReport.color, borderRadius: "20px 20px 0 0" }} />
            <div style={{ padding: "24px 24px 28px" }}>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 22,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                      marginBottom: 4,
                    }}
                  >
                    Schedule Report
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--pg-text-1)",
                    }}
                  >
                    {selectedReport.name}
                  </div>
                </div>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid var(--pg-card-border)",
                    background: "var(--pg-muted-bg)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--pg-text-3)",
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Frequency */}
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                      display: "block",
                      marginBottom: 8,
                    }}
                  >
                    Frequency
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["daily", "weekly", "monthly"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setSchedFreq(f)}
                        style={{
                          height: 34,
                          padding: "0 16px",
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 600,
                          border: schedFreq === f ? "2px solid #FF6600" : "1px solid var(--pg-card-border)",
                          background: schedFreq === f ? "#fff4ee" : "var(--pg-muted-bg)",
                          color: schedFreq === f ? "#FF6600" : "var(--pg-text-2)",
                          cursor: "pointer",
                          textTransform: "capitalize",
                          transition: "all 0.15s",
                        }}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time */}
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Send Time
                  </label>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    style={{
                      height: 36,
                      padding: "0 12px",
                      borderRadius: 10,
                      fontSize: 13,
                      outline: "none",
                      background: "var(--pg-muted-bg)",
                      border: "1px solid var(--pg-card-border)",
                      color: "var(--pg-text-1)",
                      width: 160,
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Recipients */}
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Recipients
                  </label>
                  <textarea
                    value={schedRecipients}
                    onChange={(e) => setSchedRecipients(e.target.value)}
                    placeholder="one@example.com&#10;two@example.com"
                    rows={3}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      fontSize: 13,
                      outline: "none",
                      background: "var(--pg-muted-bg)",
                      border: "1px solid var(--pg-card-border)",
                      color: "var(--pg-text-1)",
                      width: "100%",
                      boxSizing: "border-box",
                      resize: "vertical",
                      fontFamily: "inherit",
                      lineHeight: 1.5,
                    }}
                  />
                  <div style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 4 }}>
                    One email address per line
                  </div>
                </div>

                {/* Format */}
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                      display: "block",
                      marginBottom: 8,
                    }}
                  >
                    Format
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["pdf", "excel"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setSchedFormat(fmt)}
                        style={{
                          height: 34,
                          padding: "0 16px",
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 600,
                          border: schedFormat === fmt ? "2px solid #FF6600" : "1px solid var(--pg-card-border)",
                          background: schedFormat === fmt ? "#fff4ee" : "var(--pg-muted-bg)",
                          color: schedFormat === fmt ? "#FF6600" : "var(--pg-text-2)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          transition: "all 0.15s",
                        }}
                      >
                        {fmt === "pdf" ? <FileText size={13} /> : <BarChart2 size={13} />}
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active toggle */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "var(--pg-muted-bg)",
                    border: "1px solid var(--pg-card-border)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pg-text-1)" }}>
                      Active Schedule
                    </div>
                    <div style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
                      Enable automatic delivery
                    </div>
                  </div>
                  <button
                    onClick={() => setSchedActive(!schedActive)}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: "none",
                      cursor: "pointer",
                      background: schedActive ? "#FF6600" : "#d1d5db",
                      position: "relative",
                      transition: "background 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "#fff",
                        position: "absolute",
                        top: 3,
                        left: schedActive ? 23 : 3,
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 24,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setShowScheduleModal(false)}
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
                  onClick={handleSaveSchedule}
                  disabled={savingSchedule}
                  style={{
                    height: 36,
                    padding: "0 20px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    border: "none",
                    cursor: savingSchedule ? "not-allowed" : "pointer",
                    background: "linear-gradient(135deg,#FF6600,#E05500)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: savingSchedule ? 0.8 : 1,
                  }}
                >
                  {savingSchedule ? (
                    <>
                      <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={13} />
                      Save Schedule
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULED REPORTS SIDE PANEL */}
      {showScheduleList && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.25)",
              zIndex: 40,
            }}
            onClick={() => setShowScheduleList(false)}
          />
          {/* Panel */}
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 420,
              background: "var(--pg-card)",
              borderLeft: "1px solid var(--pg-card-border)",
              boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
              zIndex: 45,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: "20px 20px 16px",
                borderBottom: "1px solid var(--pg-card-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--pg-text-1)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Clock size={16} style={{ color: "#FF6600" }} />
                  Scheduled Reports
                </div>
                <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 2 }}>
                  {scheduledReports.length} schedule{scheduledReports.length !== 1 ? "s" : ""} configured
                </div>
              </div>
              <button
                onClick={() => setShowScheduleList(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid var(--pg-card-border)",
                  background: "var(--pg-muted-bg)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--pg-text-3)",
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {scheduledReports.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingTop: 80,
                    paddingBottom: 80,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 16,
                      background: "var(--pg-muted-bg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 16,
                    }}
                  >
                    <Clock size={24} style={{ color: "var(--pg-text-3)" }} />
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--pg-text-2)",
                      marginBottom: 6,
                    }}
                  >
                    No scheduled reports configured
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--pg-text-3)",
                      marginBottom: 20,
                      maxWidth: 240,
                      lineHeight: 1.5,
                    }}
                  >
                    Automate your reporting by scheduling reports for regular delivery.
                  </div>
                  <button
                    onClick={() => {
                      setShowScheduleList(false);
                    }}
                    style={{
                      height: 36,
                      padding: "0 16px",
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      background: "linear-gradient(135deg,#FF6600,#E05500)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Plus size={13} />
                    Schedule your first report
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {scheduledReports.map((sched) => {
                    const rep = REPORTS.find((r) => r.id === sched.reportId);
                    const Icon = rep?.icon ?? Clock;
                    const color = rep?.color ?? "#FF6600";
                    return (
                      <div
                        key={sched.id}
                        style={{
                          background: "var(--pg-muted-bg)",
                          border: "1px solid var(--pg-card-border)",
                          borderRadius: 12,
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ height: 2, background: color }} />
                        <div style={{ padding: "14px 14px 12px" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: 8,
                              marginBottom: 10,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: 8,
                                  background: color + "18",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <Icon size={14} style={{ color }} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: "var(--pg-text-1)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {sched.reportName}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 1 }}>
                                  {sched.frequency.charAt(0).toUpperCase() + sched.frequency.slice(1)} at {sched.time} · {sched.format.toUpperCase()}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                              <button
                                onClick={() => toggleScheduleActive(sched.id)}
                                title={sched.active ? "Pause" : "Resume"}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 7,
                                  border: "1px solid var(--pg-card-border)",
                                  background: sched.active ? "#fff4ee" : "var(--pg-card)",
                                  color: sched.active ? "#FF6600" : "var(--pg-text-3)",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {sched.active ? <Pause size={12} /> : <Play size={12} />}
                              </button>
                              <button
                                onClick={() => deleteSchedule(sched.id)}
                                title="Delete schedule"
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 7,
                                  border: "1px solid var(--pg-card-border)",
                                  background: "var(--pg-card)",
                                  color: "#dc2626",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Status badge */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: 5,
                                background: sched.active ? "#d1fae5" : "#f3f4f6",
                                color: sched.active ? "#065f46" : "#6b7280",
                              }}
                            >
                              {sched.active ? "Active" : "Paused"}
                            </span>
                            {sched.recipients.length > 0 && (
                              <span style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
                                {sched.recipients.length} recipient{sched.recipients.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
