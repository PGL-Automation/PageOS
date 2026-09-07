"use client";

import { useState } from "react";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  BarChart2,
  PieChart,
  Globe,
  Building2,
  AlertTriangle,
  RefreshCw,
  Download,
  Filter,
  Info,
  Loader2,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

const BASE = "http://localhost:8081";

const BUCKETS = [
  { key: "overnight", label: "Overnight", days: 1 },
  { key: "1_7d", label: "1-7 Days", days: 7 },
  { key: "8_30d", label: "8-30 Days", days: 30 },
  { key: "31_90d", label: "31-90 Days", days: 90 },
  { key: "91_180d", label: "91-180 Days", days: 180 },
  { key: "181_365d", label: "181-365 Days", days: 365 },
  { key: "1yr_plus", label: "Over 1 Year", days: 999 },
];

type TabId =
  | "maturity_gap"
  | "liquidity_gap"
  | "coverage"
  | "wa_analysis"
  | "currency"
  | "concentration";

const TABS: { id: TabId; label: string }[] = [
  { id: "maturity_gap", label: "Maturity Gap" },
  { id: "liquidity_gap", label: "Liquidity Gap" },
  { id: "coverage", label: "Coverage" },
  { id: "wa_analysis", label: "WA Analysis" },
  { id: "currency", label: "Currency" },
  { id: "concentration", label: "Concentration" },
];

function fmtCompact(n: number, cur: string = "NGN") {
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

const today = fmtDate(new Date().toISOString());

export default function ALMPage() {
  const [activeTab, setActiveTab] = useState<TabId>("maturity_gap");
  const [concentrationFilter, setConcentrationFilter] = useState<
    "Asset Class" | "Issuer" | "Counterparty" | "Sector"
  >("Asset Class");
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }

  return (
    <div
      style={{ background: "var(--pg-bg)", minHeight: "100vh" }}
      className="p-6 space-y-5"
    >
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div
            className="font-bold leading-tight"
            style={{ fontSize: 22, color: "var(--pg-text-1)" }}
          >
            Asset &amp; Liability Management
          </div>
          <div
            className="mt-1"
            style={{ fontSize: 12, color: "var(--pg-text-3)" }}
          >
            Maturity gap, liquidity gap, coverage and concentration analysis
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 12, color: "var(--pg-text-3)" }}>
            As of {today}
          </span>
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
            Export Report
          </button>
          <button
            onClick={handleRefresh}
            style={{
              height: 36,
              width: 36,
              borderRadius: 12,
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
              border: "1px solid var(--pg-card-border)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      {/* INFO BANNER */}
      <div
        style={{
          background: "#fef3c7",
          border: "1px solid #fde68a",
          borderRadius: 12,
          padding: "10px 16px",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <AlertTriangle size={16} style={{ color: "#92400e", marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 13, color: "#92400e", lineHeight: 1.5 }}>
          ALM calculations require connected asset and liability data. The
          structure below shows what will be available once data feeds are
          configured. Sample values are illustrative.
        </p>
      </div>

      {/* TAB NAVIGATION */}
      <div
        style={{
          display: "flex",
          gap: 4,
          background: "var(--pg-muted-bg)",
          borderRadius: 14,
          padding: 4,
          flexWrap: "wrap",
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                height: 34,
                padding: "0 16px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                transition: "all 0.15s",
                background: isActive
                  ? "linear-gradient(135deg,#FF6600,#E05500)"
                  : "transparent",
                color: isActive ? "#fff" : "var(--pg-text-2)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      {activeTab === "maturity_gap" && <MaturityGapTab />}
      {activeTab === "liquidity_gap" && <LiquidityGapTab />}
      {activeTab === "coverage" && <CoverageTab />}
      {activeTab === "wa_analysis" && <WAAnalysisTab />}
      {activeTab === "currency" && <CurrencyTab />}
      {activeTab === "concentration" && (
        <ConcentrationTab
          filter={concentrationFilter}
          setFilter={setConcentrationFilter}
        />
      )}
    </div>
  );
}

/* ========== MATURITY GAP TAB ========== */
function MaturityGapTab() {
  return (
    <div className="space-y-5">
      <Card accentColor="#1d4ed8">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} style={{ color: "#1d4ed8" }} />
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--pg-text-1)",
              }}
            >
              Maturity Gap Analysis
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--pg-card-border)",
                  }}
                >
                  {[
                    "Time Bucket",
                    "Total Assets",
                    "Total Liabilities",
                    "Maturity Gap",
                    "Cumulative Gap",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        textAlign: h === "Time Bucket" ? "left" : "right",
                        fontSize: 10,
                        fontWeight: 700,
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
                {BUCKETS.map((bucket, i) => (
                  <MaturityRow key={bucket.key} bucket={bucket} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* BAR VISUALIZATION */}
      <Card accentColor="#1d4ed8">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--pg-text-1)",
              }}
            >
              Asset vs. Liability Distribution
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: "#1d4ed8",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
                  Assets
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: "#dc2626",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
                  Liabilities
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {BUCKETS.map((bucket) => (
              <div key={bucket.key}>
                <div
                  className="flex items-center gap-2 mb-1"
                >
                  <span
                    style={{
                      width: 90,
                      fontSize: 11,
                      color: "var(--pg-text-3)",
                      flexShrink: 0,
                    }}
                  >
                    {bucket.label}
                  </span>
                  <div className="flex-1 space-y-1">
                    <div
                      style={{
                        height: 8,
                        background: "var(--pg-muted-bg)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: "0%",
                          background: "#1d4ed8",
                          borderRadius: 4,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        height: 8,
                        background: "var(--pg-muted-bg)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: "0%",
                          background: "#dc2626",
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      width: 32,
                      fontSize: 11,
                      color: "var(--pg-text-4)",
                      textAlign: "right",
                    }}
                  >
                    0%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--pg-text-3)",
              marginTop: 16,
              textAlign: "center",
            }}
          >
            Connect asset register and liability data to populate this analysis
          </p>
        </div>
      </Card>
    </div>
  );
}

function MaturityRow({
  bucket,
  index,
}: {
  bucket: (typeof BUCKETS)[0];
  index: number;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid var(--pg-card-border)",
        background: hovered ? "var(--pg-row-hover)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--pg-text-1)" }}>
        {bucket.label}
      </td>
      <td
        style={{
          padding: "10px 12px",
          fontSize: 13,
          color: "var(--pg-text-3)",
          textAlign: "right",
        }}
      >
        ₦—
      </td>
      <td
        style={{
          padding: "10px 12px",
          fontSize: 13,
          color: "var(--pg-text-3)",
          textAlign: "right",
        }}
      >
        ₦—
      </td>
      <td
        style={{
          padding: "10px 12px",
          fontSize: 13,
          color: "var(--pg-text-3)",
          textAlign: "right",
        }}
      >
        ₦0
      </td>
      <td
        style={{
          padding: "10px 12px",
          fontSize: 13,
          color: "var(--pg-text-3)",
          textAlign: "right",
        }}
      >
        ₦0
      </td>
    </tr>
  );
}

/* ========== LIQUIDITY GAP TAB ========== */
function LiquidityGapTab() {
  return (
    <div className="space-y-5">
      <Card accentColor="#0891b2">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} style={{ color: "#0891b2" }} />
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--pg-text-1)",
              }}
            >
              Liquidity Gap Analysis
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--pg-card-border)",
                  }}
                >
                  {[
                    "Time Bucket",
                    "Available Cash",
                    "Expected Asset Inflows",
                    "Expected Liability Outflows",
                    "Liquidity Gap",
                    "Cumulative Gap",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        textAlign: h === "Time Bucket" ? "left" : "right",
                        fontSize: 10,
                        fontWeight: 700,
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
                {BUCKETS.map((bucket) => (
                  <LiquidityRow key={bucket.key} bucket={bucket} />
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: 20,
              padding: "12px 16px",
              background: "#e0f2fe",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Info size={14} style={{ color: "#0891b2", flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: "#0369a1" }}>
              Liquidity gap = Available Cash + Expected Asset Inflows -
              Expected Liability Outflows for each time bucket.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LiquidityRow({ bucket }: { bucket: (typeof BUCKETS)[0] }) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid var(--pg-card-border)",
        background: hovered ? "var(--pg-row-hover)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--pg-text-1)" }}>
        {bucket.label}
      </td>
      {["₦—", "₦—", "₦—", "₦0", "₦0"].map((val, i) => (
        <td
          key={i}
          style={{
            padding: "10px 12px",
            fontSize: 13,
            color: "var(--pg-text-3)",
            textAlign: "right",
          }}
        >
          {val}
        </td>
      ))}
    </tr>
  );
}

/* ========== COVERAGE TAB ========== */
function CoverageTab() {
  const ratios = [
    { label: "7-Day Coverage Ratio", period: "7 days" },
    { label: "30-Day Coverage Ratio", period: "30 days" },
    { label: "90-Day Coverage Ratio", period: "90 days" },
  ];

  return (
    <div className="space-y-5">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {ratios.map((ratio) => (
          <Card key={ratio.label} accentColor="#7c3aed">
            <div className="p-5 space-y-4">
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--pg-text-3)",
                    marginBottom: 8,
                  }}
                >
                  {ratio.label}
                </div>
                <div
                  style={{
                    fontSize: 40,
                    fontWeight: 700,
                    color: "var(--pg-text-4)",
                    lineHeight: 1,
                  }}
                >
                  —×
                </div>
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: "var(--pg-text-3)",
                  background: "var(--pg-muted-bg)",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                Liquid Assets ÷ Obligations Due Within {ratio.period}
              </div>

              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--pg-text-3)",
                    marginBottom: 6,
                  }}
                >
                  Status:{" "}
                  <span style={{ color: "var(--pg-text-4)" }}>
                    Data required
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "var(--pg-muted-bg)",
                    borderRadius: 3,
                    overflow: "hidden",
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: "0%",
                      background: "#7c3aed",
                      borderRadius: 3,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "var(--pg-text-4)" }}>
                  Minimum: 1.0×
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card accentColor="#7c3aed">
        <div className="p-5">
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--pg-text-1)",
              marginBottom: 12,
            }}
          >
            Coverage Ratio Thresholds
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {[
              { label: "Critical", range: "< 0.8×", color: "#dc2626", bg: "#fee2e2" },
              { label: "Warning", range: "0.8× – 1.0×", color: "#92400e", bg: "#fef3c7" },
              { label: "Adequate", range: "1.0× – 1.5×", color: "#065f46", bg: "#d1fae5" },
              { label: "Strong", range: "> 1.5×", color: "#1d4ed8", bg: "#dbeafe" },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: t.bg,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: t.color }}>
                  {t.label}
                </span>
                <span style={{ fontSize: 12, color: t.color }}>{t.range}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ========== WA ANALYSIS TAB ========== */
function WAAnalysisTab() {
  const metrics = [
    {
      label: "WA Asset Yield",
      value: "—",
      unit: "%",
      color: "#059669",
      icon: TrendingUp,
      desc: "Weighted average yield across all assets",
    },
    {
      label: "WA Liability Cost",
      value: "—",
      unit: "%",
      color: "#d97706",
      icon: TrendingDown,
      desc: "Weighted average cost of liabilities",
    },
    {
      label: "Net Yield Spread",
      value: "—",
      unit: "%",
      color: "#1d4ed8",
      icon: Activity,
      desc: "Asset yield minus liability cost",
    },
    {
      label: "Tenor Gap",
      value: "—",
      unit: "days",
      color: "#7c3aed",
      icon: BarChart2,
      desc: "WA asset tenor minus WA liability tenor",
    },
  ];

  const assetClasses = [
    "Fixed Income",
    "Money Market",
    "Equity",
    "Alternatives",
    "Derivatives",
    "PMMF",
  ];

  return (
    <div className="space-y-5">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
        }}
      >
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label} accentColor={m.color}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--pg-text-3)",
                    }}
                  >
                    {m.label}
                  </div>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: m.color + "18",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={14} style={{ color: m.color }} />
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "var(--pg-text-4)",
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {m.value}
                  {m.value !== "—" && (
                    <span style={{ fontSize: 14, marginLeft: 2 }}>{m.unit}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
                  {m.desc}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card accentColor="#059669">
        <div className="p-5">
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--pg-text-1)",
              marginBottom: 16,
            }}
          >
            Asset Class Breakdown
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pg-card-border)" }}>
                  {[
                    "Asset Class",
                    "Value",
                    "WA Yield",
                    "WA Tenor",
                    "% of Portfolio",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        textAlign: h === "Asset Class" ? "left" : "right",
                        fontSize: 10,
                        fontWeight: 700,
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
                {assetClasses.map((cls) => (
                  <AssetClassRow key={cls} name={cls} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AssetClassRow({ name }: { name: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid var(--pg-card-border)",
        background: hovered ? "var(--pg-row-hover)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--pg-text-1)" }}>
        {name}
      </td>
      {["—", "—", "—", "—"].map((v, i) => (
        <td
          key={i}
          style={{
            padding: "10px 12px",
            fontSize: 13,
            color: "var(--pg-text-3)",
            textAlign: "right",
          }}
        >
          {v}
        </td>
      ))}
    </tr>
  );
}

/* ========== CURRENCY TAB ========== */
function CurrencyTab() {
  const currencies = [
    { code: "NGN", name: "Nigerian Naira", flag: "🇳🇬" },
    { code: "USD", name: "US Dollar", flag: "🇺🇸" },
    { code: "GBP", name: "British Pound", flag: "🇬🇧" },
    { code: "EUR", name: "Euro", flag: "🇪🇺" },
  ];

  return (
    <div className="space-y-5">
      <Card accentColor="#0891b2">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={16} style={{ color: "#0891b2" }} />
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--pg-text-1)",
              }}
            >
              Currency Exposure
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pg-card-border)" }}>
                  {[
                    "Currency",
                    "Assets",
                    "Liabilities",
                    "Net Position",
                    "% of Portfolio",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        textAlign: h === "Currency" ? "left" : "right",
                        fontSize: 10,
                        fontWeight: 700,
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
                {currencies.map((cur) => (
                  <CurrencyRow key={cur.code} currency={cur} />
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: 20,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
            }}
          >
            {[
              { label: "Long", desc: "Assets > Liabilities", color: "#059669", bg: "#d1fae5" },
              { label: "Short", desc: "Liabilities > Assets", color: "#991b1b", bg: "#fee2e2" },
              {
                label: "Balanced",
                desc: "Assets ≈ Liabilities",
                color: "#1d4ed8",
                bg: "#dbeafe",
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: s.bg,
                }}
              >
                <div
                  style={{ fontSize: 12, fontWeight: 700, color: s.color }}
                >
                  {s.label}
                </div>
                <div style={{ fontSize: 11, color: s.color, opacity: 0.8 }}>
                  {s.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function CurrencyRow({
  currency,
}: {
  currency: { code: string; name: string; flag: string };
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid var(--pg-card-border)",
        background: hovered ? "var(--pg-row-hover)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <td style={{ padding: "10px 12px" }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 16 }}>{currency.flag}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pg-text-1)" }}>
              {currency.code}
            </div>
            <div style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
              {currency.name}
            </div>
          </div>
        </div>
      </td>
      <td
        style={{
          padding: "10px 12px",
          fontSize: 13,
          color: "var(--pg-text-3)",
          textAlign: "right",
        }}
      >
        ₦0
      </td>
      <td
        style={{
          padding: "10px 12px",
          fontSize: 13,
          color: "var(--pg-text-3)",
          textAlign: "right",
        }}
      >
        ₦0
      </td>
      <td
        style={{
          padding: "10px 12px",
          fontSize: 13,
          color: "var(--pg-text-3)",
          textAlign: "right",
        }}
      >
        ₦0
      </td>
      <td
        style={{
          padding: "10px 12px",
          fontSize: 13,
          color: "var(--pg-text-3)",
          textAlign: "right",
        }}
      >
        —
      </td>
      <td style={{ padding: "10px 12px", textAlign: "right" }}>
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            background: "#dbeafe",
            color: "#1d4ed8",
          }}
        >
          Balanced
        </span>
      </td>
    </tr>
  );
}

/* ========== CONCENTRATION TAB ========== */
type ConcentrationFilter = "Asset Class" | "Issuer" | "Counterparty" | "Sector";

function ConcentrationTab({
  filter,
  setFilter,
}: {
  filter: ConcentrationFilter;
  setFilter: (f: ConcentrationFilter) => void;
}) {
  const filters: ConcentrationFilter[] = [
    "Asset Class",
    "Issuer",
    "Counterparty",
    "Sector",
  ];

  const placeholderBars = [
    { label: "Entity A", pct: 0 },
    { label: "Entity B", pct: 0 },
    { label: "Entity C", pct: 0 },
    { label: "Entity D", pct: 0 },
    { label: "Entity E", pct: 0 },
  ];

  return (
    <div className="space-y-5">
      <Card accentColor="#FF6600">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <PieChart size={16} style={{ color: "#FF6600" }} />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--pg-text-1)",
                }}
              >
                Concentration Analysis
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 4,
                background: "var(--pg-muted-bg)",
                borderRadius: 10,
                padding: 3,
              }}
            >
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    height: 28,
                    padding: "0 12px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "none",
                    background:
                      filter === f
                        ? "linear-gradient(135deg,#FF6600,#E05500)"
                        : "transparent",
                    color: filter === f ? "#fff" : "var(--pg-text-2)",
                    transition: "all 0.15s",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              background: "#fef3c7",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
            }}
          >
            <AlertTriangle
              size={14}
              style={{ color: "#92400e", flexShrink: 0 }}
            />
            <p style={{ fontSize: 12, color: "#92400e" }}>
              Max concentration limit: 25% per entity
            </p>
          </div>

          <div className="space-y-3">
            {placeholderBars.map((bar, i) => (
              <div key={i}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--pg-text-2)" }}>
                    {bar.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--pg-text-3)" }}>
                    {bar.pct}%
                  </span>
                </div>
                <div
                  style={{
                    height: 10,
                    background: "var(--pg-muted-bg)",
                    borderRadius: 5,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${bar.pct}%`,
                      background: "linear-gradient(135deg,#FF6600,#E05500)",
                      borderRadius: 5,
                    }}
                  />
                  {/* 25% limit line */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "25%",
                      width: 1,
                      height: "100%",
                      background: "#dc2626",
                      opacity: 0.5,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 32,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 24,
              paddingBottom: 24,
              borderTop: "1px dashed var(--pg-card-border)",
              textAlign: "center",
              gap: 8,
            }}
          >
            <Building2
              size={32}
              style={{ color: "var(--pg-text-4)", marginBottom: 4 }}
            />
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--pg-text-3)",
              }}
            >
              Connect asset register to see concentration analysis
            </p>
            <p style={{ fontSize: 12, color: "var(--pg-text-4)" }}>
              Real-time concentration data will appear here once data feeds are
              configured
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ========== SHARED CARD COMPONENT ========== */
function Card({
  children,
  accentColor,
}: {
  children: React.ReactNode;
  accentColor: string;
}) {
  return (
    <div
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        borderRadius: 16,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        overflow: "hidden",
      }}
    >
      <div className="h-[3px]" style={{ background: accentColor }} />
      {children}
    </div>
  );
}
