"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Layers,
  Plus,
  Upload,
  Download,
  Filter,
  X,
  TrendingUp,
  Calendar,
  Building2,
  Search,
  FileText,
  Eye,
  Edit2,
  Loader2,
  ChevronDown,
  BarChart2,
  RefreshCw,
  Clock,
} from "lucide-react";

const BASE = "http://localhost:8081";

// ─── Types ───────────────────────────────────────────────────────────────────

type AssetClass =
  | "fixed_income"
  | "money_market"
  | "equity"
  | "alternatives"
  | "derivatives"
  | "pmmf";

type AssetStatus =
  | "active"
  | "maturing_soon"
  | "matured"
  | "redeemed"
  | "pending"
  | "under_review";

type Asset = {
  id: string;
  name: string;
  instrument_type: string;
  asset_class: AssetClass;
  issuer: string;
  currency: string;
  principal: number;
  cost: number;
  current_value: number;
  rate: number;
  start_date: string;
  maturity_date: string;
  days_to_maturity: number;
  status: AssetStatus;
  fund_id: string;
  fund_name: string;
};

type Fund = {
  id: string;
  name: string;
  code: string;
  fund_type: string;
  aum: number;
  currency: string;
  status: string;
  inception_date?: string;
  benchmark?: string;
};

type Holding = {
  id: string;
  instrument_id: string;
  quantity: number;
  avg_cost: number;
  book_value: number;
  market_value: number;
  unrealized_pnl: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSET_CLASSES = [
  { key: "all", label: "All Assets", color: "#475569" },
  { key: "fixed_income", label: "Fixed Income", color: "#1d4ed8" },
  { key: "money_market", label: "Money Market", color: "#059669" },
  { key: "equity", label: "Equity", color: "#FF6600" },
  { key: "alternatives", label: "Alternatives", color: "#7c3aed" },
  { key: "derivatives", label: "Derivatives", color: "#d97706" },
  { key: "pmmf", label: "PMMF", color: "#0891b2" },
];

const INSTRUMENT_TYPES_BY_CLASS: Record<string, string[]> = {
  fixed_income: ["Bond", "Treasury Bill", "Commercial Paper", "FGN Bond", "Eurobond"],
  money_market: ["Call Deposit", "Fixed Deposit", "Treasury Bill", "Repo"],
  equity: ["Listed Equity", "Unlisted Equity", "ETF"],
  alternatives: ["Real Estate", "Private Equity", "Infrastructure", "Hedge Fund"],
  derivatives: ["Option", "Future", "Forward", "Swap"],
  pmmf: ["PMMF Unit", "Money Market Fund"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCompact(n: number, cur?: string): string {
  const sym = cur === "USD" ? "$" : "₦";
  if (n >= 1e9) return sym + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sym + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return sym + (n / 1e3).toFixed(1) + "K";
  return sym + n.toLocaleString("en-NG");
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fundTypeToAssetClass(fundType: string): AssetClass {
  if (fundType === "pooled") return "pmmf";
  if (fundType === "proprietary") return "money_market";
  if (fundType === "segregated") return "equity";
  return "alternatives";
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const normalized = status?.toLowerCase();
  let bg = "#d1fae5";
  let color = "#065f46";
  let label = capitalize(status);

  if (normalized === "active") {
    bg = "#d1fae5"; color = "#065f46"; label = "Active";
  } else if (normalized === "maturing_soon") {
    bg = "#fef3c7"; color = "#92400e"; label = "Maturing Soon";
  } else if (normalized === "matured") {
    bg = "#fee2e2"; color = "#991b1b"; label = "Matured";
  } else if (normalized === "redeemed") {
    bg = "#dbeafe"; color = "#1d4ed8"; label = "Redeemed";
  } else if (normalized === "pending") {
    bg = "#fef3c7"; color = "#92400e"; label = "Pending";
  } else if (normalized === "under_review") {
    bg = "#fef3c7"; color = "#92400e"; label = "Under Review";
  } else if (normalized === "inactive") {
    bg = "#fee2e2"; color = "#991b1b"; label = "Inactive";
  }

  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 6,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function DaysToMatCell({ days }: { days: number | null }) {
  if (days === null || days === undefined) return <span style={{ color: "var(--pg-text-3)" }}>—</span>;
  if (days < 7) return <span style={{ color: "#dc2626", fontWeight: 700, fontSize: 13 }}>{days}d</span>;
  if (days <= 30) return <span style={{ color: "#d97706", fontWeight: 600, fontSize: 13 }}>{days}d</span>;
  return <span style={{ color: "var(--pg-text-1)", fontSize: 13 }}>{days}d</span>;
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ fund, onClose }: { fund: Fund; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 400,
        height: "100vh",
        background: "var(--pg-card)",
        borderLeft: "1px solid var(--pg-card-border)",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.10)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      {/* Accent bar */}
      <div className="h-[3px]" style={{ background: "#FF6600", flexShrink: 0 }} />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "20px 24px 16px",
          borderBottom: "1px solid var(--pg-card-border)",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--pg-text-1)", lineHeight: 1.3 }}>
            {fund.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 4 }}>
            {fund.code}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "var(--pg-muted-bg)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 8,
            padding: "6px 8px",
            cursor: "pointer",
            color: "var(--pg-text-2)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 24px", flex: 1 }}>
        {/* AUM card */}
        <div
          style={{
            background: "var(--pg-muted-bg)",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)" }}>
            Total AUM
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--pg-text-1)", marginTop: 4, lineHeight: 1 }}>
            {fmtCompact(fund.aum ?? 0, fund.currency)}
          </div>
          <div style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 6 }}>
            {fund.currency}
          </div>
        </div>

        {/* Details grid */}
        {[
          { label: "Fund Type", value: capitalize(fund.fund_type) },
          { label: "Asset Class", value: capitalize(fundTypeToAssetClass(fund.fund_type)) },
          { label: "Currency", value: fund.currency },
          { label: "Status", value: <StatusBadge status={fund.status} /> },
          { label: "Inception Date", value: fmtDate(fund.inception_date) },
          { label: "Benchmark", value: fund.benchmark ?? "—" },
          { label: "Issuer / Manager", value: "Page Asset Mgmt" },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 12,
              paddingBottom: 12,
              borderBottom: "1px solid var(--pg-card-border)",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--pg-text-3)" }}>{label}</span>
            <span style={{ fontSize: 13, color: "var(--pg-text-1)", fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "16px 24px", borderTop: "1px solid var(--pg-card-border)" }}>
        <a
          href={`/wm/portfolio/${fund.id}`}
          style={{
            display: "block",
            textAlign: "center",
            height: 36,
            lineHeight: "36px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            color: "white",
            background: "linear-gradient(135deg,#FF6600,#E05500)",
            textDecoration: "none",
          }}
        >
          View Full Fund
        </a>
      </div>
    </div>
  );
}

// ─── Add Asset Modal ──────────────────────────────────────────────────────────

function AddAssetModal({ onClose, funds }: { onClose: () => void; funds: Fund[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    asset_class: "fixed_income",
    instrument_type: "",
    name: "",
    issuer: "",
    currency: "NGN",
    principal: "",
    cost: "",
    rate: "",
    trade_date: "",
    maturity_date: "",
    fund_id: "",
  });

  const instrumentOptions =
    INSTRUMENT_TYPES_BY_CLASS[form.asset_class] ?? [];

  function handleChange(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    toast({ title: "Asset recorded", description: `${form.name || "Asset"} added to register.` });
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    height: 36,
    padding: "0 12px",
    borderRadius: 12,
    fontSize: 13,
    outline: "none",
    background: "var(--pg-muted-bg)",
    border: "1px solid var(--pg-card-border)",
    color: "var(--pg-text-1)",
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--pg-text-3)",
    marginBottom: 4,
    display: "block",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

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
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--pg-card)",
          borderRadius: 20,
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          width: "100%",
          maxWidth: 580,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Accent */}
        <div className="h-[3px]" style={{ background: "#FF6600", flexShrink: 0 }} />

        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--pg-card-border)",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--pg-text-1)" }}>Add Asset</div>
            <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 2 }}>
              Register a new investment in the asset register
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              borderRadius: 8,
              padding: "6px 8px",
              cursor: "pointer",
              color: "var(--pg-text-2)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Asset Class */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Asset Class</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ASSET_CLASSES.filter((c) => c.key !== "all").map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => handleChange("asset_class", c.key)}
                    style={{
                      height: 32,
                      padding: "0 14px",
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: form.asset_class === c.key ? `2px solid ${c.color}` : "1px solid var(--pg-card-border)",
                      background: form.asset_class === c.key ? c.color + "18" : "var(--pg-muted-bg)",
                      color: form.asset_class === c.key ? c.color : "var(--pg-text-2)",
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Instrument Type */}
            <div>
              <label style={labelStyle}>Instrument Type</label>
              <select
                style={inputStyle}
                value={form.instrument_type}
                onChange={(e) => handleChange("instrument_type", e.target.value)}
                required
              >
                <option value="">Select type</option>
                {instrumentOptions.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {/* Currency */}
            <div>
              <label style={labelStyle}>Currency</label>
              <select
                style={inputStyle}
                value={form.currency}
                onChange={(e) => handleChange("currency", e.target.value)}
              >
                <option value="NGN">NGN</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            {/* Name */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Name / Description</label>
              <input
                style={inputStyle}
                placeholder="e.g. FGN Bond 2027"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                required
              />
            </div>

            {/* Issuer */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Issuer / Counterparty</label>
              <input
                style={inputStyle}
                placeholder="e.g. Federal Government of Nigeria"
                value={form.issuer}
                onChange={(e) => handleChange("issuer", e.target.value)}
              />
            </div>

            {/* Principal */}
            <div>
              <label style={labelStyle}>Principal / Face Value</label>
              <input
                style={inputStyle}
                type="number"
                placeholder="0.00"
                value={form.principal}
                onChange={(e) => handleChange("principal", e.target.value)}
                required
              />
            </div>

            {/* Cost */}
            <div>
              <label style={labelStyle}>Cost</label>
              <input
                style={inputStyle}
                type="number"
                placeholder="0.00"
                value={form.cost}
                onChange={(e) => handleChange("cost", e.target.value)}
              />
            </div>

            {/* Rate */}
            <div>
              <label style={labelStyle}>Rate / Yield %</label>
              <input
                style={inputStyle}
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.rate}
                onChange={(e) => handleChange("rate", e.target.value)}
              />
            </div>

            {/* Fund */}
            <div>
              <label style={labelStyle}>Fund / Mandate</label>
              <select
                style={inputStyle}
                value={form.fund_id}
                onChange={(e) => handleChange("fund_id", e.target.value)}
              >
                <option value="">Select fund</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            {/* Trade Date */}
            <div>
              <label style={labelStyle}>Trade Date</label>
              <input
                style={inputStyle}
                type="date"
                value={form.trade_date}
                onChange={(e) => handleChange("trade_date", e.target.value)}
              />
            </div>

            {/* Maturity Date */}
            <div>
              <label style={labelStyle}>Maturity Date</label>
              <input
                style={inputStyle}
                type="date"
                value={form.maturity_date}
                onChange={(e) => handleChange("maturity_date", e.target.value)}
              />
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 24,
              paddingTop: 16,
              borderTop: "1px solid var(--pg-card-border)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-card-border)",
                color: "var(--pg-text-2)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                flex: 2,
                height: 36,
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                color: "white",
                background: "linear-gradient(135deg,#FF6600,#E05500)",
              }}
            >
              Record Asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const { subsidiary } = useAuth();
  const { toast } = useToast();

  const [activeClass, setActiveClass] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [showDetailId, setShowDetailId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subsidId = (subsidiary as any)?.id ?? (subsidiary as any)?.ID ?? "";
  const subsidName = (subsidiary as any)?.name ?? (subsidiary as any)?.Name ?? "Portfolio";

  const {
    data: fundsRaw,
    isLoading,
    isError,
    refetch,
  } = useQuery<Fund[]>({
    queryKey: ["pm-assets-funds", subsidId],
    queryFn: async () => {
      if (!subsidId) return [];
      const res = await fetch(
        `${BASE}/api/v1/portfolio/funds?subsidiary_id=${subsidId}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch funds");
      const json = await res.json();
      // Handle wrapped response
      if (Array.isArray(json)) return json;
      if (json?.funds) return json.funds;
      if (json?.data) return json.data;
      return [];
    },
    enabled: !!subsidId,
  });

  const funds: Fund[] = fundsRaw ?? [];

  // ── Derive metrics ──────────────────────────────────────────────────────────

  const totalValue = funds.reduce((s, f) => s + (f.aum ?? 0), 0);

  const maturingSoonCount = funds.filter((f) => {
    // funds don't have maturity — count those with status maturing_soon
    return f.status === "maturing_soon";
  }).length;

  // ── Map funds → asset rows ──────────────────────────────────────────────────

  function fundToAssetClass(fund: Fund): AssetClass {
    return fundTypeToAssetClass(fund.fund_type);
  }

  const filteredFunds = funds.filter((f) => {
    const ac = fundToAssetClass(f);
    if (activeClass !== "all" && ac !== activeClass) return false;
    if (filterCurrency && f.currency !== filterCurrency) return false;
    if (filterStatus && f.status !== filterStatus) return false;
    const q = searchQ.toLowerCase();
    if (q && !f.name.toLowerCase().includes(q) && !f.code?.toLowerCase().includes(q)) return false;
    return true;
  });

  // Count per class for tab badges
  const classCounts: Record<string, number> = { all: funds.length };
  for (const c of ASSET_CLASSES.filter((c) => c.key !== "all")) {
    classCounts[c.key] = funds.filter((f) => fundToAssetClass(f) === c.key).length;
  }

  const detailFund = showDetailId ? funds.find((f) => f.id === showDetailId) ?? null : null;

  // ── Unique currencies in dataset ────────────────────────────────────────────
  const currencies = Array.from(new Set(funds.map((f) => f.currency).filter(Boolean)));

  // ── Row hover state ─────────────────────────────────────────────────────────
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // ── Summary card ────────────────────────────────────────────────────────────
  function SummaryCard({
    title,
    value,
    color,
    icon: Icon,
  }: {
    title: string;
    value: string;
    color: string;
    icon: React.ElementType;
  }) {
    return (
      <div
        style={{
          background: "var(--pg-card)",
          borderRadius: 16,
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}
      >
        <div className="h-[3px]" style={{ background: color }} />
        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--pg-text-3)",
                  marginBottom: 8,
                }}
              >
                {title}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: "var(--pg-text-1)",
                }}
              >
                {value}
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: color + "18",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={16} style={{ color }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--pg-bg)",
        padding: "28px 32px",
        paddingRight: detailFund ? 440 : 32,
        transition: "padding-right 0.25s ease",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--pg-text-1)", lineHeight: 1 }}>
            Asset Register
          </div>
          <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 6 }}>
            {subsidName} &middot; Investment Portfolio
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => refetch()}
            style={{
              height: 36,
              width: 36,
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-2)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Upload size={13} />
            Import
          </button>
          <button
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-2)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Download size={13} />
            Export
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              color: "white",
              background: "linear-gradient(135deg,#FF6600,#E05500)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Plus size={13} />
            Add Asset
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <SummaryCard
          title="Total Portfolio Value"
          value={isLoading ? "..." : fmtCompact(totalValue, "NGN")}
          color="#1d4ed8"
          icon={BarChart2}
        />
        <SummaryCard
          title="Accrued Income"
          value="—"
          color="#059669"
          icon={TrendingUp}
        />
        <SummaryCard
          title="Maturing in 30 Days"
          value={isLoading ? "..." : String(maturingSoonCount)}
          color="#d97706"
          icon={Clock}
        />
        <SummaryCard
          title="Average Yield"
          value="—%"
          color="#7c3aed"
          icon={TrendingUp}
        />
      </div>

      {/* ── Asset Class Tabs ── */}
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          marginBottom: 20,
          paddingBottom: 2,
        }}
      >
        {ASSET_CLASSES.map((cls) => {
          const active = activeClass === cls.key;
          const count = classCounts[cls.key] ?? 0;
          return (
            <button
              key={cls.key}
              onClick={() => setActiveClass(cls.key)}
              style={{
                height: 34,
                padding: "0 14px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                border: active ? `1.5px solid ${cls.color}` : "1px solid var(--pg-card-border)",
                background: active ? cls.color : "var(--pg-card)",
                color: active ? "white" : "var(--pg-text-2)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              {cls.label}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 6,
                  padding: "1px 6px",
                  background: active ? "rgba(255,255,255,0.25)" : "var(--pg-muted-bg)",
                  color: active ? "white" : "var(--pg-text-3)",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Filter Row ── */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 20,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Currency filter */}
        <select
          value={filterCurrency}
          onChange={(e) => setFilterCurrency(e.target.value)}
          style={{
            height: 36,
            padding: "0 12px",
            borderRadius: 12,
            fontSize: 13,
            outline: "none",
            background: "var(--pg-muted-bg)",
            border: "1px solid var(--pg-card-border)",
            color: filterCurrency ? "var(--pg-text-1)" : "var(--pg-text-3)",
            cursor: "pointer",
          }}
        >
          <option value="">All Currencies</option>
          {currencies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            height: 36,
            padding: "0 12px",
            borderRadius: 12,
            fontSize: 13,
            outline: "none",
            background: "var(--pg-muted-bg)",
            border: "1px solid var(--pg-card-border)",
            color: filterStatus ? "var(--pg-text-1)" : "var(--pg-text-3)",
            cursor: "pointer",
          }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="maturing_soon">Maturing Soon</option>
          <option value="matured">Matured</option>
          <option value="redeemed">Redeemed</option>
          <option value="pending">Pending</option>
          <option value="under_review">Under Review</option>
          <option value="inactive">Inactive</option>
        </select>

        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--pg-text-3)",
            }}
          />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search instrument, issuer..."
            style={{
              height: 36,
              padding: "0 12px 0 34px",
              borderRadius: 12,
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

        {/* Clear filters */}
        {(filterCurrency || filterStatus || searchQ) && (
          <button
            onClick={() => { setFilterCurrency(""); setFilterStatus(""); setSearchQ(""); }}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-2)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <X size={13} />
            Clear
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div
        style={{
          background: "var(--pg-card)",
          borderRadius: 16,
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}
      >
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 10 }}>
            <Loader2 size={20} style={{ color: "#FF6600", animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 13, color: "var(--pg-text-3)" }}>Loading assets...</span>
          </div>
        ) : isError ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 10 }}>
            <span style={{ fontSize: 13, color: "#dc2626" }}>Failed to load asset data.</span>
            <button
              onClick={() => refetch()}
              style={{
                height: 32,
                padding: "0 16px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-card-border)",
                color: "var(--pg-text-2)",
              }}
            >
              Retry
            </button>
          </div>
        ) : filteredFunds.length === 0 ? (
          /* Empty state */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "80px 0",
              textAlign: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "var(--pg-muted-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Layers size={22} style={{ color: "var(--pg-text-3)" }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pg-text-1)", marginBottom: 4 }}>
                No assets in register
              </div>
              <div style={{ fontSize: 12, color: "var(--pg-text-3)" }}>
                {funds.length === 0
                  ? "Add your first investment to get started"
                  : "No assets match the current filters"}
              </div>
            </div>
            {funds.length === 0 && (
              <button
                onClick={() => setShowModal(true)}
                style={{
                  height: 36,
                  padding: "0 20px",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  color: "white",
                  background: "linear-gradient(135deg,#FF6600,#E05500)",
                  marginTop: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={13} />
                Add Asset
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pg-card-border)" }}>
                  {[
                    "Asset ID",
                    "Instrument",
                    "Type",
                    "Issuer / Counterparty",
                    "Currency",
                    "Principal",
                    "Rate / Yield",
                    "Start",
                    "Maturity",
                    "Days to Mat",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "11px 16px",
                        textAlign: "left",
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--pg-text-3)",
                        whiteSpace: "nowrap",
                        background: "var(--pg-muted-bg)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredFunds.map((fund) => (
                  <tr
                    key={fund.id}
                    onMouseEnter={() => setHoveredRow(fund.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      borderBottom: "1px solid var(--pg-card-border)",
                      background: hoveredRow === fund.id ? "var(--pg-row-hover, var(--pg-muted-bg))" : "transparent",
                      transition: "background 0.1s ease",
                    }}
                  >
                    {/* Asset ID */}
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: "#FF6600",
                          background: "#FF660010",
                          borderRadius: 6,
                          padding: "2px 7px",
                        }}
                      >
                        {fund.code ?? "—"}
                      </span>
                    </td>

                    {/* Instrument */}
                    <td style={{ padding: "12px 16px", maxWidth: 220 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pg-text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {fund.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 2 }}>
                        {capitalize(fundToAssetClass(fund))}
                      </div>
                    </td>

                    {/* Type */}
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--pg-text-2)", whiteSpace: "nowrap" }}>
                      {capitalize(fund.fund_type)}
                    </td>

                    {/* Issuer */}
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--pg-text-2)", whiteSpace: "nowrap" }}>
                      Page Asset Mgmt
                    </td>

                    {/* Currency */}
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          background: "var(--pg-muted-bg)",
                          border: "1px solid var(--pg-card-border)",
                          borderRadius: 6,
                          padding: "2px 8px",
                          color: "var(--pg-text-2)",
                        }}
                      >
                        {fund.currency}
                      </span>
                    </td>

                    {/* Principal */}
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--pg-text-1)", whiteSpace: "nowrap" }}>
                      {fmtCompact(fund.aum ?? 0, fund.currency)}
                    </td>

                    {/* Rate */}
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--pg-text-3)", whiteSpace: "nowrap" }}>
                      —
                    </td>

                    {/* Start */}
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--pg-text-2)", whiteSpace: "nowrap" }}>
                      {fmtDate(fund.inception_date)}
                    </td>

                    {/* Maturity */}
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--pg-text-3)", whiteSpace: "nowrap" }}>
                      —
                    </td>

                    {/* Days to Mat */}
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <DaysToMatCell days={null} />
                    </td>

                    {/* Status */}
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <StatusBadge status={fund.status} />
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          onClick={() => setShowDetailId(fund.id === showDetailId ? null : fund.id)}
                          title="View details"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            border: "1px solid var(--pg-card-border)",
                            background: showDetailId === fund.id ? "#FF660018" : "var(--pg-muted-bg)",
                            color: showDetailId === fund.id ? "#FF6600" : "var(--pg-text-3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          title="Edit"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            border: "1px solid var(--pg-card-border)",
                            background: "var(--pg-muted-bg)",
                            color: "var(--pg-text-3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table footer */}
        {!isLoading && !isError && filteredFunds.length > 0 && (
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--pg-card-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--pg-text-3)" }}>
              {filteredFunds.length} asset{filteredFunds.length !== 1 ? "s" : ""} shown
              {funds.length !== filteredFunds.length ? ` of ${funds.length} total` : ""}
            </span>
            <span style={{ fontSize: 12, color: "var(--pg-text-3)" }}>
              Total AUM: <strong style={{ color: "var(--pg-text-1)" }}>{fmtCompact(filteredFunds.reduce((s, f) => s + (f.aum ?? 0), 0), "NGN")}</strong>
            </span>
          </div>
        )}
      </div>

      {/* ── Detail Panel ── */}
      {detailFund && (
        <DetailPanel
          fund={detailFund}
          onClose={() => setShowDetailId(null)}
        />
      )}

      {/* ── Add Asset Modal ── */}
      {showModal && (
        <AddAssetModal onClose={() => setShowModal(false)} funds={funds} />
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
