"use client";

import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  TrendingDown,
  CalendarDays,
  Filter,
  Plus,
  Download,
  X,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  RefreshCw,
  FileText,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Liability = {
  id: string;
  ref: string;
  product: string;
  client: string;
  currency: string;
  principal: number;
  outstanding: number;
  rate: number;
  accrued: number;
  start_date: string;
  maturity_date: string;
  original_tenor: number;
  remaining_tenor: number;
  maturity_bucket: string;
  payment_account: string;
  rollover_status: string;
  settlement_status: string;
  status: "active" | "due_soon" | "overdue" | "matured" | "rolled_over";
};

const BUCKETS = [
  "Overnight",
  "1-7 days",
  "8-30 days",
  "31-90 days",
  "91-180 days",
  "181-365 days",
  "1yr+",
];

const BUCKET_COLORS: Record<string, string> = {
  Overnight: "#dc2626",
  "1-7 days": "#dc2626",
  "8-30 days": "#d97706",
  "31-90 days": "#d97706",
  "91-180 days": "#1d4ed8",
  "181-365 days": "#1d4ed8",
  "1yr+": "#7c3aed",
};

const PRODUCTS = [
  "Fixed Deposit",
  "REPO",
  "Commercial Paper",
  "Call Deposit",
  "Client Funding",
  "Other",
];

function fmtCompact(n: number, cur: string = "NGN") {
  const sym = cur === "USD" ? "$" : "₦";
  if (n >= 1e9) return sym + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sym + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return sym + (n / 1e3).toFixed(1) + "K";
  return sym + n.toLocaleString("en-NG");
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / 86400000);
}

function statusBadge(status: Liability["status"]) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    active: { bg: "#d1fae5", color: "#065f46", label: "Active" },
    due_soon: { bg: "#fee2e2", color: "#991b1b", label: "Due Soon" },
    overdue: { bg: "#fee2e2", color: "#991b1b", label: "Overdue" },
    matured: { bg: "#f3f4f6", color: "#6b7280", label: "Matured" },
    rolled_over: { bg: "#dbeafe", color: "#1d4ed8", label: "Rolled Over" },
  };
  const s = styles[status] ?? styles.active;
  return (
    <span
      style={{ background: s.bg, color: s.color }}
      className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
    >
      {s.label}
    </span>
  );
}

type FormData = {
  ref: string;
  product: string;
  client: string;
  principal: string;
  outstanding: string;
  currency: string;
  rate: string;
  accrued: string;
  start_date: string;
  maturity_date: string;
  payment_account: string;
  maturity_instruction: string;
  rollover_status: string;
  status: string;
};

const DEFAULT_FORM: FormData = {
  ref: "",
  product: "Fixed Deposit",
  client: "",
  principal: "",
  outstanding: "",
  currency: "NGN",
  rate: "",
  accrued: "",
  start_date: "",
  maturity_date: "",
  payment_account: "",
  maturity_instruction: "Rollover",
  rollover_status: "",
  status: "active",
};

export default function LiabilitiesPage() {
  const { toast } = useToast();

  const [liabilities] = useState<Liability[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filterProduct, setFilterProduct] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterBucket, setFilterBucket] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [waOpen, setWaOpen] = useState(false);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [rowHover, setRowHover] = useState<string | null>(null);

  // Computed fields for modal
  const originalTenor = useMemo(() => {
    if (!form.start_date || !form.maturity_date) return "";
    const d = daysBetween(form.start_date, form.maturity_date);
    return d > 0 ? String(d) : "";
  }, [form.start_date, form.maturity_date]);

  const remainingTenor = useMemo(() => {
    if (!form.maturity_date) return "";
    const today = new Date().toISOString().split("T")[0];
    const d = daysBetween(today, form.maturity_date);
    return String(d);
  }, [form.maturity_date]);

  // Filtered liabilities
  const filtered = useMemo(() => {
    return liabilities.filter((l) => {
      if (filterProduct && l.product !== filterProduct) return false;
      if (filterCurrency && l.currency !== filterCurrency) return false;
      if (filterStatus && l.status !== filterStatus) return false;
      if (filterBucket && l.maturity_bucket !== filterBucket) return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        if (
          !l.ref.toLowerCase().includes(q) &&
          !l.client.toLowerCase().includes(q) &&
          !l.product.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [liabilities, filterProduct, filterCurrency, filterStatus, filterBucket, searchQ]);

  // Summary metrics
  const totalOutstanding = filtered.reduce((s, l) => s + l.outstanding, 0);
  const waRate =
    totalOutstanding > 0
      ? filtered.reduce((s, l) => s + l.outstanding * l.rate, 0) / totalOutstanding
      : 0;
  const waTenor =
    totalOutstanding > 0
      ? filtered.reduce((s, l) => s + l.outstanding * l.remaining_tenor, 0) / totalOutstanding
      : 0;

  const today = new Date();
  const in7 = filtered.filter((l) => l.remaining_tenor >= 0 && l.remaining_tenor <= 7);
  const in30 = filtered.filter((l) => l.remaining_tenor >= 0 && l.remaining_tenor <= 30);
  const overdue = filtered.filter((l) => l.status === "overdue");

  // Bucket grouping
  const bucketMap = useMemo(() => {
    const map: Record<string, { count: number; amount: number }> = {};
    BUCKETS.forEach((b) => (map[b] = { count: 0, amount: 0 }));
    filtered.forEach((l) => {
      if (map[l.maturity_bucket]) {
        map[l.maturity_bucket].count++;
        map[l.maturity_bucket].amount += l.outstanding;
      }
    });
    return map;
  }, [filtered]);

  function clearFilters() {
    setFilterProduct("");
    setFilterCurrency("");
    setFilterStatus("");
    setFilterBucket("");
    setSearchQ("");
  }

  function handleFormChange(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    toast({
      title: "Liability recorded",
      description: `${form.ref || "New liability"} has been added to the schedule.`,
    });
    setShowModal(false);
    setForm(DEFAULT_FORM);
  }

  const inputStyle: React.CSSProperties = {
    height: "36px",
    padding: "0 12px",
    borderRadius: "12px",
    fontSize: "13px",
    outline: "none",
    background: "var(--pg-muted-bg)",
    border: "1px solid var(--pg-card-border)",
    color: "var(--pg-text-1)",
    width: "100%",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: "pointer",
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--pg-card)",
    border: "1px solid var(--pg-card-border)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    borderRadius: "16px",
    overflow: "hidden",
  };

  const todayStr = today.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div style={{ background: "var(--pg-bg)", minHeight: "100vh", padding: "24px" }}>
      {/* HEADER */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "bold", color: "var(--pg-text-1)", lineHeight: 1.2 }}>
            Liability Schedule
          </h1>
          <p style={{ fontSize: "12px", color: "var(--pg-text-3)", marginTop: "4px" }}>
            Daily funding obligations and weighted-average analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            style={{
              height: "36px",
              padding: "0 16px",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#fff",
              background: "linear-gradient(135deg,#FF6600,#E05500)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Plus size={14} />
            Add Liability
          </button>
          <button
            style={{
              height: "36px",
              padding: "0 16px",
              borderRadius: "12px",
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
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Row 1 */}
        {/* Total Outstanding */}
        <div style={cardStyle}>
          <div className="h-[3px]" style={{ background: "#d97706" }} />
          <div className="p-4">
            <p style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)" }}>
              Total Outstanding
            </p>
            <p style={{ fontSize: "22px", fontWeight: "bold", lineHeight: 1, color: "var(--pg-text-1)", marginTop: "8px" }}>
              {fmtCompact(totalOutstanding)}
            </p>
            <p style={{ fontSize: "12px", color: "var(--pg-text-3)", marginTop: "4px" }}>
              {filtered.length} liabilities
            </p>
          </div>
        </div>

        {/* WA Rate */}
        <div style={cardStyle}>
          <div className="h-[3px]" style={{ background: "#7c3aed" }} />
          <div className="p-4">
            <p style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)" }}>
              WA Rate
            </p>
            <p style={{ fontSize: "22px", fontWeight: "bold", lineHeight: 1, color: "var(--pg-text-1)", marginTop: "8px" }}>
              {waRate.toFixed(2)}%
            </p>
            <p style={{ fontSize: "12px", color: "var(--pg-text-3)", marginTop: "4px" }}>
              Weighted average interest rate
            </p>
          </div>
        </div>

        {/* WA Tenor */}
        <div style={cardStyle}>
          <div className="h-[3px]" style={{ background: "#1d4ed8" }} />
          <div className="p-4">
            <p style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)" }}>
              WA Tenor
            </p>
            <p style={{ fontSize: "22px", fontWeight: "bold", lineHeight: 1, color: "var(--pg-text-1)", marginTop: "8px" }}>
              {waTenor.toFixed(0)} days
            </p>
            <p style={{ fontSize: "12px", color: "var(--pg-text-3)", marginTop: "4px" }}>
              Weighted average remaining tenor
            </p>
          </div>
        </div>

        {/* Row 2 */}
        {/* Due in 7 Days */}
        <div style={cardStyle}>
          <div className="h-[3px]" style={{ background: "#dc2626" }} />
          <div className="p-4">
            <p style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)" }}>
              Due in 7 Days
            </p>
            <p style={{ fontSize: "22px", fontWeight: "bold", lineHeight: 1, color: "var(--pg-text-1)", marginTop: "8px" }}>
              {in7.length}
            </p>
            <p style={{ fontSize: "12px", color: "var(--pg-text-3)", marginTop: "4px" }}>
              {fmtCompact(in7.reduce((s, l) => s + l.outstanding, 0))} outstanding
            </p>
          </div>
        </div>

        {/* Due in 30 Days */}
        <div style={cardStyle}>
          <div className="h-[3px]" style={{ background: "#d97706" }} />
          <div className="p-4">
            <p style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)" }}>
              Due in 30 Days
            </p>
            <p style={{ fontSize: "22px", fontWeight: "bold", lineHeight: 1, color: "var(--pg-text-1)", marginTop: "8px" }}>
              {in30.length}
            </p>
            <p style={{ fontSize: "12px", color: "var(--pg-text-3)", marginTop: "4px" }}>
              {fmtCompact(in30.reduce((s, l) => s + l.outstanding, 0))} outstanding
            </p>
          </div>
        </div>

        {/* Overdue */}
        <div style={cardStyle}>
          <div className="h-[3px]" style={{ background: "#dc2626" }} />
          <div className="p-4">
            <div className="flex items-center gap-2">
              <p style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)" }}>
                Overdue
              </p>
              {overdue.length > 0 && <AlertTriangle size={12} color="#dc2626" />}
            </div>
            <p style={{ fontSize: "22px", fontWeight: "bold", lineHeight: 1, color: overdue.length > 0 ? "#dc2626" : "var(--pg-text-1)", marginTop: "8px" }}>
              {overdue.length}
            </p>
            <p style={{ fontSize: "12px", color: "var(--pg-text-3)", marginTop: "4px" }}>
              {fmtCompact(overdue.reduce((s, l) => s + l.outstanding, 0))} past due
            </p>
          </div>
        </div>
      </div>

      {/* MATURITY BUCKETS ROW */}
      <div style={cardStyle} className="mb-4">
        <div className="p-4">
          <p style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)", marginBottom: "12px" }}>
            Maturity Buckets
          </p>
          <div className="flex flex-wrap gap-2">
            {BUCKETS.map((bucket) => {
              const data = bucketMap[bucket] ?? { count: 0, amount: 0 };
              const color = BUCKET_COLORS[bucket] ?? "#6b7280";
              const isActive = filterBucket === bucket;
              return (
                <button
                  key={bucket}
                  onClick={() => setFilterBucket(isActive ? "" : bucket)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "9999px",
                    border: isActive ? `2px solid ${color}` : "1px solid var(--pg-card-border)",
                    background: isActive ? `${color}18` : "var(--pg-muted-bg)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: 600, color }}>
                    {bucket}
                  </span>
                  <span
                    style={{
                      background: color,
                      color: "#fff",
                      borderRadius: "9999px",
                      padding: "1px 7px",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    {data.count}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>
                    {data.amount > 0 ? fmtCompact(data.amount) : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={cardStyle} className="mb-4">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2" style={{ color: "var(--pg-text-3)" }}>
              <Filter size={14} />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--pg-text-3)" }}>Filters</span>
            </div>

            <select
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
              style={{ ...selectStyle, width: "160px" }}
            >
              <option value="">All Products</option>
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              style={{ ...selectStyle, width: "120px" }}
            >
              <option value="">All Currencies</option>
              <option value="NGN">NGN</option>
              <option value="USD">USD</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ ...selectStyle, width: "140px" }}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="due_soon">Due Soon</option>
              <option value="overdue">Overdue</option>
              <option value="matured">Matured</option>
              <option value="rolled_over">Rolled Over</option>
            </select>

            <select
              value={filterBucket}
              onChange={(e) => setFilterBucket(e.target.value)}
              style={{ ...selectStyle, width: "150px" }}
            >
              <option value="">All Buckets</option>
              {BUCKETS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            <div style={{ position: "relative", flex: 1, minWidth: "180px" }}>
              <Search
                size={14}
                style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--pg-text-3)" }}
              />
              <input
                type="text"
                placeholder="Search ref, client, product..."
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                style={{ ...inputStyle, paddingLeft: "32px" }}
              />
            </div>

            {(filterProduct || filterCurrency || filterStatus || filterBucket || searchQ) && (
              <button
                onClick={clearFilters}
                style={{ fontSize: "13px", color: "#FF6600", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "0 4px" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LIABILITY TABLE */}
      <div style={cardStyle} className="mb-4">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--pg-card-border)" }}>
                {[
                  "Ref",
                  "Product",
                  "Client",
                  "Currency",
                  "Outstanding",
                  "Rate %",
                  "Start",
                  "Maturity",
                  "Tenor",
                  "Remaining",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "10px",
                      fontWeight: "bold",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12}>
                    <div
                      className="flex flex-col items-center justify-center py-20 text-center"
                      style={{ color: "var(--pg-text-3)" }}
                    >
                      <CreditCard size={40} strokeWidth={1.2} style={{ marginBottom: "16px", color: "var(--pg-text-4)" }} />
                      <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--pg-text-2)", marginBottom: "6px" }}>
                        No liabilities recorded
                      </p>
                      <p style={{ fontSize: "12px", color: "var(--pg-text-3)", maxWidth: "320px", marginBottom: "20px" }}>
                        Add your first liability record to begin tracking funding obligations.
                      </p>
                      <button
                        onClick={() => setShowModal(true)}
                        style={{
                          height: "36px",
                          padding: "0 16px",
                          borderRadius: "12px",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#fff",
                          background: "linear-gradient(135deg,#FF6600,#E05500)",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Plus size={14} />
                        Add Liability
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr
                    key={l.id}
                    onMouseEnter={() => setRowHover(l.id)}
                    onMouseLeave={() => setRowHover(null)}
                    style={{
                      borderBottom: "1px solid var(--pg-card-border)",
                      background: rowHover === l.id ? "var(--pg-row-hover)" : "transparent",
                      transition: "background 0.1s",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--pg-text-1)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {l.ref}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--pg-text-2)", whiteSpace: "nowrap" }}>
                      {l.product}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--pg-text-2)", whiteSpace: "nowrap" }}>
                      {l.client}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--pg-text-2)" }}>
                      {l.currency}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--pg-text-1)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {fmtCompact(l.outstanding, l.currency)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--pg-text-2)" }}>
                      {l.rate.toFixed(2)}%
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--pg-text-2)", whiteSpace: "nowrap" }}>
                      {fmtDate(l.start_date)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--pg-text-2)", whiteSpace: "nowrap" }}>
                      {fmtDate(l.maturity_date)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--pg-text-2)" }}>
                      {l.original_tenor}d
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", fontWeight: l.remaining_tenor < 7 ? 700 : 400, color: l.remaining_tenor < 7 ? "#dc2626" : "var(--pg-text-2)", whiteSpace: "nowrap" }}>
                      {l.remaining_tenor}d
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {statusBadge(l.status)}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pg-text-3)", display: "flex", alignItems: "center" }}
                      >
                        <FileText size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* WA ANALYSIS BOX */}
      <div style={cardStyle} className="mb-6">
        <button
          onClick={() => setWaOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "14px 16px",
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {waOpen ? <ChevronDown size={16} color="var(--pg-text-3)" /> : <ChevronRight size={16} color="var(--pg-text-3)" />}
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--pg-text-2)" }}>
            Weighted Average Analysis
          </span>
          <Info size={13} color="var(--pg-text-3)" style={{ marginLeft: "4px" }} />
        </button>

        {waOpen && (
          <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--pg-card-border)" }}>
            <div className="grid grid-cols-2 gap-6 pt-4">
              <div>
                <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)", marginBottom: "6px" }}>
                  WA Rate Formula
                </p>
                <div
                  style={{
                    background: "var(--pg-muted-bg)",
                    borderRadius: "10px",
                    padding: "12px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: "var(--pg-text-2)",
                    lineHeight: 1.6,
                  }}
                >
                  WA Rate = Σ(outstanding_i × rate_i) / Σ(outstanding_i)
                </div>
                <p style={{ marginTop: "8px", fontSize: "22px", fontWeight: "bold", color: "#7c3aed" }}>
                  {waRate.toFixed(3)}%
                </p>
              </div>
              <div>
                <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pg-text-3)", marginBottom: "6px" }}>
                  WA Tenor Formula
                </p>
                <div
                  style={{
                    background: "var(--pg-muted-bg)",
                    borderRadius: "10px",
                    padding: "12px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: "var(--pg-text-2)",
                    lineHeight: 1.6,
                  }}
                >
                  WA Tenor = Σ(outstanding_i × remaining_i) / Σ(outstanding_i)
                </div>
                <p style={{ marginTop: "8px", fontSize: "22px", fontWeight: "bold", color: "#1d4ed8" }}>
                  {waTenor.toFixed(1)} days
                </p>
              </div>
            </div>
            <p style={{ marginTop: "12px", fontSize: "11px", color: "var(--pg-text-4)" }}>
              Based on records as of {todayStr}. Calculations exclude matured and rolled-over instruments.
            </p>
          </div>
        )}
      </div>

      {/* ADD LIABILITY MODAL */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); setForm(DEFAULT_FORM); } }}
        >
          <div
            style={{
              background: "var(--pg-card)",
              borderRadius: "20px",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
              width: "100%",
              maxWidth: "680px",
              maxHeight: "90vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--pg-card-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: "bold", color: "var(--pg-text-1)" }}>Add Liability</h2>
                <p style={{ fontSize: "12px", color: "var(--pg-text-3)", marginTop: "2px" }}>Record a new funding obligation</p>
              </div>
              <button
                onClick={() => { setShowModal(false); setForm(DEFAULT_FORM); }}
                style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", borderRadius: "10px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--pg-text-2)" }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} style={{ overflowY: "auto", flex: 1, padding: "24px" }}>
              {/* Section 1: Identification */}
              <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#FF6600", marginBottom: "12px" }}>
                1. Identification
              </p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Ref / Source Booking
                  </label>
                  <input
                    type="text"
                    value={form.ref}
                    onChange={(e) => handleFormChange("ref", e.target.value)}
                    placeholder="e.g. FD-2026-001"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Product Type
                  </label>
                  <select
                    value={form.product}
                    onChange={(e) => handleFormChange("product", e.target.value)}
                    style={selectStyle}
                  >
                    {PRODUCTS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Client / Category
                  </label>
                  <input
                    type="text"
                    value={form.client}
                    onChange={(e) => handleFormChange("client", e.target.value)}
                    placeholder="Client name or funding category"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Section 2: Economics */}
              <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#FF6600", marginBottom: "12px" }}>
                2. Economics
              </p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Original Principal
                  </label>
                  <input
                    type="number"
                    value={form.principal}
                    onChange={(e) => handleFormChange("principal", e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Outstanding Principal
                  </label>
                  <input
                    type="number"
                    value={form.outstanding}
                    onChange={(e) => handleFormChange("outstanding", e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Currency
                  </label>
                  <select
                    value={form.currency}
                    onChange={(e) => handleFormChange("currency", e.target.value)}
                    style={selectStyle}
                  >
                    <option value="NGN">NGN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Rate %
                  </label>
                  <input
                    type="number"
                    value={form.rate}
                    onChange={(e) => handleFormChange("rate", e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    style={inputStyle}
                  />
                </div>
                <div className="col-span-2">
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Accrued Amount
                  </label>
                  <input
                    type="number"
                    value={form.accrued}
                    onChange={(e) => handleFormChange("accrued", e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Section 3: Dates */}
              <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#FF6600", marginBottom: "12px" }}>
                3. Dates
              </p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => handleFormChange("start_date", e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Maturity Date
                  </label>
                  <input
                    type="date"
                    value={form.maturity_date}
                    onChange={(e) => handleFormChange("maturity_date", e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Original Tenor (auto-calculated)
                  </label>
                  <input
                    type="text"
                    value={originalTenor ? `${originalTenor} days` : ""}
                    readOnly
                    placeholder="Set start & maturity dates"
                    style={{ ...inputStyle, opacity: 0.7, cursor: "not-allowed" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Remaining Tenor (auto-calculated)
                  </label>
                  <input
                    type="text"
                    value={remainingTenor ? `${remainingTenor} days` : ""}
                    readOnly
                    placeholder="Set maturity date"
                    style={{ ...inputStyle, opacity: 0.7, cursor: "not-allowed" }}
                  />
                </div>
              </div>

              {/* Section 4: Settlement */}
              <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#FF6600", marginBottom: "12px" }}>
                4. Settlement
              </p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Payment Account
                  </label>
                  <input
                    type="text"
                    value={form.payment_account}
                    onChange={(e) => handleFormChange("payment_account", e.target.value)}
                    placeholder="Account number or name"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Maturity Instruction
                  </label>
                  <select
                    value={form.maturity_instruction}
                    onChange={(e) => handleFormChange("maturity_instruction", e.target.value)}
                    style={selectStyle}
                  >
                    <option value="Rollover">Rollover</option>
                    <option value="Redeem">Redeem</option>
                    <option value="Partial">Partial</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                    Rollover Status
                  </label>
                  <input
                    type="text"
                    value={form.rollover_status}
                    onChange={(e) => handleFormChange("rollover_status", e.target.value)}
                    placeholder="e.g. Pending, Confirmed, N/A"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Section 5: Status */}
              <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#FF6600", marginBottom: "12px" }}>
                5. Status
              </p>
              <div className="mb-8">
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--pg-text-3)", display: "block", marginBottom: "5px" }}>
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => handleFormChange("status", e.target.value)}
                  style={{ ...selectStyle, maxWidth: "260px" }}
                >
                  <option value="active">Active</option>
                  <option value="due_soon">Due Soon</option>
                  <option value="overdue">Overdue</option>
                  <option value="matured">Matured</option>
                  <option value="rolled_over">Rolled Over</option>
                </select>
              </div>

              {/* Modal Footer */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "16px", borderTop: "1px solid var(--pg-card-border)" }}>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(DEFAULT_FORM); }}
                  style={{
                    height: "36px",
                    padding: "0 16px",
                    borderRadius: "12px",
                    fontSize: "13px",
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
                  type="submit"
                  style={{
                    height: "36px",
                    padding: "0 20px",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#fff",
                    background: "linear-gradient(135deg,#FF6600,#E05500)",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Plus size={14} />
                  Record Liability
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
