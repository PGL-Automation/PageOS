"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet,
  Upload,
  Download,
  Plus,
  RefreshCw,
  Building2,
  DollarSign,
  AlertCircle,
  Info,
  Loader2,
  X,
  TrendingUp,
  TrendingDown,
  Filter,
  Calendar,
} from "lucide-react";

const BASE = "http://localhost:8081";

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountBalance = {
  id: string;
  bank: string;
  account: string;
  currency: string;
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
  available: number;
  restricted: number;
  date: string;
  status: "confirmed" | "pending" | "estimated";
};

type UploadForm = {
  bank: string;
  account: string;
  currency: string;
  date: string;
  opening: string;
  inflows: string;
  outflows: string;
  closing: string;
  notes: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCompact(n: number, cur: string = "NGN"): string {
  const sym = cur === "USD" ? "$" : "₦";
  if (n >= 1e9) return sym + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sym + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return sym + (n / 1e3).toFixed(1) + "K";
  return sym + n.toLocaleString("en-NG");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_BADGE: Record<
  AccountBalance["status"],
  { bg: string; color: string; label: string }
> = {
  confirmed: { bg: "#d1fae5", color: "#065f46", label: "Confirmed" },
  pending: { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  estimated: { bg: "#dbeafe", color: "#1d4ed8", label: "Estimated" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LiquidityPage() {
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState("All");
  const [selectedDate, setSelectedDate] = useState(todayIso());

  const [form, setForm] = useState<UploadForm>({
    bank: "",
    account: "",
    currency: "NGN",
    date: todayIso(),
    opening: "",
    inflows: "",
    outflows: "",
    closing: "",
    notes: "",
  });

  // ── Derived totals ──────────────────────────────────────────────────────────

  const filtered =
    selectedCurrency === "All"
      ? accounts
      : accounts.filter((a) => a.currency === selectedCurrency);

  const totalAvailable = filtered.reduce((s, a) => s + a.available, 0);
  const totalRestricted = filtered.reduce((s, a) => s + a.restricted, 0);
  const totalPending = filtered
    .filter((a) => a.status === "pending")
    .reduce((s, a) => s + a.closing, 0);
  const investable = totalAvailable - totalRestricted;

  // ── Upload form helpers ─────────────────────────────────────────────────────

  function handleFormChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      // Auto-calculate closing = opening + inflows - outflows
      if (
        name === "opening" ||
        name === "inflows" ||
        name === "outflows"
      ) {
        const o = parseFloat(next.opening) || 0;
        const i = parseFloat(next.inflows) || 0;
        const ot = parseFloat(next.outflows) || 0;
        next.closing = String(o + i - ot);
      }
      return next;
    });
  }

  function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    const o = parseFloat(form.opening) || 0;
    const i = parseFloat(form.inflows) || 0;
    const ot = parseFloat(form.outflows) || 0;
    const cl = parseFloat(form.closing) || o + i - ot;

    const newEntry: AccountBalance = {
      id: crypto.randomUUID(),
      bank: form.bank,
      account: form.account,
      currency: form.currency,
      date: form.date,
      opening: o,
      inflows: i,
      outflows: ot,
      closing: cl,
      available: cl,
      restricted: 0,
      status: "confirmed",
    };

    setAccounts((prev) => [newEntry, ...prev]);
    setShowUploadModal(false);
    setForm({
      bank: "",
      account: "",
      currency: "NGN",
      date: todayIso(),
      opening: "",
      inflows: "",
      outflows: "",
      closing: "",
      notes: "",
    });

    toast({
      title: "Balance recorded",
      description: "Account balance has been saved.",
    });
  }

  // ── By-bank / by-currency aggregation ──────────────────────────────────────

  const byBank = Object.values(
    filtered.reduce<
      Record<string, { bank: string; closing: number; count: number }>
    >((acc, a) => {
      if (!acc[a.bank])
        acc[a.bank] = { bank: a.bank, closing: 0, count: 0 };
      acc[a.bank].closing += a.closing;
      acc[a.bank].count += 1;
      return acc;
    }, {})
  );

  const byCurrency = Object.values(
    accounts.reduce<
      Record<
        string,
        { currency: string; available: number; restricted: number }
      >
    >((acc, a) => {
      if (!acc[a.currency])
        acc[a.currency] = { currency: a.currency, available: 0, restricted: 0 };
      acc[a.currency].available += a.available;
      acc[a.currency].restricted += a.restricted;
      return acc;
    }, {})
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--pg-bg)",
        padding: "32px 28px",
      }}
    >
      {/* ── HEADER ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 28,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--pg-text-1)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Liquidity Position
          </h1>
          <p
            style={{
              fontSize: 12,
              color: "var(--pg-text-3)",
              marginTop: 4,
            }}
          >
            Daily consolidated cash and account balances
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Date selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Calendar
              style={{ width: 14, height: 14, color: "var(--pg-text-3)" }}
            />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                height: 36,
                padding: "0 10px",
                borderRadius: 10,
                fontSize: 13,
                outline: "none",
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-card-border)",
                color: "var(--pg-text-1)",
              }}
            />
          </div>

          {/* Upload Balances */}
          <button
            onClick={() => setShowUploadModal(true)}
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
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Upload style={{ width: 14, height: 14 }} />
            Upload Balances
          </button>

          {/* Export */}
          <button
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
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Download style={{ width: 14, height: 14 }} />
            Export
          </button>
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {/* Total Available */}
        <SummaryCard
          color="#059669"
          label="Total Available"
          value={fmtCompact(totalAvailable)}
          icon={<Wallet style={{ width: 16, height: 16, color: "#059669" }} />}
        />

        {/* Restricted */}
        <SummaryCard
          color="#d97706"
          label="Restricted / Committed"
          value={fmtCompact(totalRestricted)}
          icon={
            <AlertCircle
              style={{ width: 16, height: 16, color: "#d97706" }}
            />
          }
        />

        {/* Pending Settlement */}
        <SummaryCard
          color="#1d4ed8"
          label="Pending Settlement"
          value={fmtCompact(totalPending)}
          icon={
            <RefreshCw style={{ width: 16, height: 16, color: "#1d4ed8" }} />
          }
        />

        {/* Investable — more prominent */}
        <SummaryCard
          color="#FF6600"
          label="Investable Balance"
          value={fmtCompact(Math.max(0, investable))}
          icon={
            <TrendingUp style={{ width: 16, height: 16, color: "#FF6600" }} />
          }
          prominent
        />
      </div>

      {/* ── LIQUIDITY COVERAGE ── */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 16,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          padding: "20px 24px",
          marginBottom: 20,
        }}
      >
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--pg-text-1)",
            margin: "0 0 4px 0",
          }}
        >
          Coverage Ratios
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--pg-text-3)",
            margin: "0 0 18px 0",
          }}
        >
          Coverage = Liquid Assets / Obligations Due Within Period
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <CoverageBar label="7-Day Coverage" pct={0} color="#059669" />
          <CoverageBar label="30-Day Coverage" pct={0} color="#1d4ed8" />
          <CoverageBar label="90-Day Coverage" pct={0} color="#7c3aed" />
        </div>
      </div>

      {/* ── INFO BANNER ── */}
      <div
        style={{
          background: "#fef3c7",
          border: "1px solid #d97706",
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Info style={{ width: 16, height: 16, color: "#d97706", flexShrink: 0 }} />
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#92400e",
              margin: 0,
            }}
          >
            Bank account balances are not yet connected
          </p>
        </div>
        <p
          style={{
            fontSize: 12,
            color: "#92400e",
            margin: "6px 0 0 24px",
          }}
        >
          Upload daily balance files manually or contact Operations to set up
          automated feeds from your banking systems.
        </p>
      </div>

      {/* ── CURRENCY FILTER ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Filter
          style={{ width: 13, height: 13, color: "var(--pg-text-3)" }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--pg-text-3)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
          }}
        >
          Currency
        </span>
        {["All", "NGN", "USD", "GBP", "EUR"].map((c) => (
          <button
            key={c}
            onClick={() => setSelectedCurrency(c)}
            style={{
              height: 28,
              padding: "0 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border:
                selectedCurrency === c
                  ? "1px solid #FF6600"
                  : "1px solid var(--pg-card-border)",
              background:
                selectedCurrency === c ? "#fff4ee" : "var(--pg-muted-bg)",
              color: selectedCurrency === c ? "#FF6600" : "var(--pg-text-2)",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* ── ACCOUNT BALANCES TABLE ── */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 16,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--pg-card-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--pg-text-1)",
              margin: 0,
            }}
          >
            Account Balances
          </p>
          <span
            style={{
              fontSize: 11,
              color: "var(--pg-text-3)",
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              borderRadius: 6,
              padding: "2px 8px",
            }}
          >
            {filtered.length} account{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--pg-muted-bg)" }}>
                {[
                  "Bank / Institution",
                  "Account",
                  "Currency",
                  "Opening Balance",
                  "Inflows",
                  "Outflows",
                  "Closing Balance",
                  "Available",
                  "Restricted",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px",
                      textAlign: "left",
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
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
                  <td colSpan={10}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "60px 20px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 12,
                          background: "var(--pg-muted-bg)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 14,
                        }}
                      >
                        <Wallet
                          style={{
                            width: 22,
                            height: 22,
                            color: "var(--pg-text-3)",
                          }}
                        />
                      </div>
                      <p
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--pg-text-2)",
                          margin: "0 0 6px 0",
                        }}
                      >
                        No account balances recorded
                      </p>
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--pg-text-3)",
                          marginBottom: 18,
                        }}
                      >
                        Upload a daily balance file to get started.
                      </p>
                      <button
                        onClick={() => setShowUploadModal(true)}
                        style={{
                          height: 36,
                          padding: "0 16px",
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#fff",
                          background:
                            "linear-gradient(135deg,#FF6600,#E05500)",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Upload style={{ width: 14, height: 14 }} />
                        Upload Balances
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((a) => {
                  const badge = STATUS_BADGE[a.status];
                  return (
                    <AccountRow key={a.id} account={a} badge={badge} />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── AGGREGATION SECTION ── */}
      {filtered.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* By Bank */}
          <div
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              borderRadius: 16,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid var(--pg-card-border)",
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--pg-text-1)",
                  margin: 0,
                }}
              >
                By Bank
              </p>
            </div>
            <div style={{ padding: "4px 0" }}>
              {byBank.map((b) => (
                <div
                  key={b.bank}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 18px",
                    borderBottom: "1px solid var(--pg-card-border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Building2
                      style={{
                        width: 14,
                        height: 14,
                        color: "var(--pg-text-3)",
                      }}
                    />
                    <span
                      style={{ fontSize: 13, color: "var(--pg-text-1)" }}
                    >
                      {b.bank}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--pg-text-3)",
                        background: "var(--pg-muted-bg)",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      {b.count} acct{b.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--pg-text-1)",
                    }}
                  >
                    {fmtCompact(b.closing)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* By Currency */}
          <div
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              borderRadius: 16,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid var(--pg-card-border)",
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--pg-text-1)",
                  margin: 0,
                }}
              >
                By Currency
              </p>
            </div>
            <div style={{ padding: "4px 0" }}>
              {byCurrency.map((c) => (
                <div
                  key={c.currency}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 18px",
                    borderBottom: "1px solid var(--pg-card-border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <DollarSign
                      style={{
                        width: 14,
                        height: 14,
                        color: "var(--pg-text-3)",
                      }}
                    />
                    <span
                      style={{ fontSize: 13, color: "var(--pg-text-1)" }}
                    >
                      {c.currency}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#059669",
                      }}
                    >
                      {fmtCompact(c.available, c.currency)} available
                    </div>
                    {c.restricted > 0 && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#d97706",
                          marginTop: 2,
                        }}
                      >
                        {fmtCompact(c.restricted, c.currency)} restricted
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── UPLOAD MODAL ── */}
      {showUploadModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowUploadModal(false);
          }}
        >
          <div
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              borderRadius: 20,
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                padding: "20px 24px 16px",
                borderBottom: "1px solid var(--pg-card-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--pg-text-1)",
                    margin: 0,
                  }}
                >
                  Upload Account Balance
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--pg-text-3)",
                    marginTop: 3,
                  }}
                >
                  Record a daily balance for a bank account
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: "var(--pg-muted-bg)",
                  border: "1px solid var(--pg-card-border)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--pg-text-2)",
                }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleUploadSubmit} style={{ padding: "20px 24px" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {/* Bank */}
                <div>
                  <label style={labelStyle}>Bank / Institution *</label>
                  <input
                    name="bank"
                    value={form.bank}
                    onChange={handleFormChange}
                    required
                    placeholder="e.g. Zenith Bank"
                    style={inputStyle}
                  />
                </div>

                {/* Account Number */}
                <div>
                  <label style={labelStyle}>Account Number</label>
                  <input
                    name="account"
                    value={form.account}
                    onChange={handleFormChange}
                    placeholder="e.g. 1234567890"
                    style={inputStyle}
                  />
                </div>

                {/* Currency + Date row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Currency *</label>
                    <select
                      name="currency"
                      value={form.currency}
                      onChange={handleFormChange}
                      required
                      style={inputStyle}
                    >
                      <option value="NGN">NGN</option>
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Date *</label>
                    <input
                      type="date"
                      name="date"
                      value={form.date}
                      onChange={handleFormChange}
                      required
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Opening Balance */}
                <div>
                  <label style={labelStyle}>Opening Balance *</label>
                  <input
                    type="number"
                    name="opening"
                    value={form.opening}
                    onChange={handleFormChange}
                    required
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    style={inputStyle}
                  />
                </div>

                {/* Inflows + Outflows */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Total Inflows</label>
                    <input
                      type="number"
                      name="inflows"
                      value={form.inflows}
                      onChange={handleFormChange}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Total Outflows</label>
                    <input
                      type="number"
                      name="outflows"
                      value={form.outflows}
                      onChange={handleFormChange}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Closing Balance */}
                <div>
                  <label style={labelStyle}>Closing Balance (auto-calculated)</label>
                  <input
                    type="number"
                    name="closing"
                    value={form.closing}
                    onChange={handleFormChange}
                    placeholder="0.00"
                    step="0.01"
                    style={{
                      ...inputStyle,
                      background: "var(--pg-muted-bg)",
                      opacity: 0.8,
                    }}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleFormChange}
                    placeholder="Optional notes..."
                    rows={3}
                    style={{
                      ...inputStyle,
                      height: "auto",
                      resize: "vertical",
                      paddingTop: 8,
                      paddingBottom: 8,
                    }}
                  />
                </div>

                {/* Actions */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "flex-end",
                    paddingTop: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
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
                    type="submit"
                    style={{
                      height: 36,
                      padding: "0 20px",
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      background: "linear-gradient(135deg,#FF6600,#E05500)",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Upload style={{ width: 14, height: 14 }} />
                    Save Balance
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  color,
  label,
  value,
  icon,
  prominent,
}: {
  color: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  prominent?: boolean;
}) {
  return (
    <div
      style={{
        background: prominent ? `${color}08` : "var(--pg-card)",
        border: prominent ? `1.5px solid ${color}40` : "1px solid var(--pg-card-border)",
        borderRadius: 16,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        overflow: "hidden",
      }}
    >
      <div style={{ height: 3, background: color }} />
      <div style={{ padding: "16px 18px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "var(--pg-text-3)",
            }}
          >
            {label}
          </span>
          {icon}
        </div>
        <p
          style={{
            fontSize: prominent ? 26 : 22,
            fontWeight: 700,
            lineHeight: 1,
            color: prominent ? color : "var(--pg-text-1)",
            margin: 0,
          }}
        >
          {value}
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--pg-text-4)",
            marginTop: 6,
          }}
        >
          {prominent ? "Net deployable cash" : "As of today"}
        </p>
      </div>
    </div>
  );
}

function CoverageBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--pg-text-2)",
          width: 120,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 8,
          background: "var(--pg-muted-bg)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, pct)}%`,
            background: color,
            borderRadius: 99,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: pct === 0 ? "var(--pg-text-3)" : color,
          width: 40,
          textAlign: "right",
        }}
      >
        {pct === 0 ? "—" : `${pct.toFixed(0)}%`}
      </span>
    </div>
  );
}

function AccountRow({
  account,
  badge,
}: {
  account: AccountBalance;
  badge: { bg: string; color: string; label: string };
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--pg-row-hover)" : "transparent",
        borderBottom: "1px solid var(--pg-card-border)",
        transition: "background 0.15s",
      }}
    >
      <td style={cellStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Building2
            style={{ width: 13, height: 13, color: "var(--pg-text-3)" }}
          />
          <span style={{ fontWeight: 600 }}>{account.bank}</span>
        </div>
      </td>
      <td style={{ ...cellStyle, color: "var(--pg-text-2)" }}>
        {account.account || "—"}
      </td>
      <td style={cellStyle}>
        <span
          style={{
            background: "#dbeafe",
            color: "#1d4ed8",
            borderRadius: 6,
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {account.currency}
        </span>
      </td>
      <td style={{ ...cellStyle, textAlign: "right" }}>
        {fmtCompact(account.opening, account.currency)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right", color: "#059669" }}>
        +{fmtCompact(account.inflows, account.currency)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right", color: "#dc2626" }}>
        -{fmtCompact(account.outflows, account.currency)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>
        {fmtCompact(account.closing, account.currency)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right", color: "#059669", fontWeight: 600 }}>
        {fmtCompact(account.available, account.currency)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right", color: "#d97706" }}>
        {fmtCompact(account.restricted, account.currency)}
      </td>
      <td style={cellStyle}>
        <span
          style={{
            background: badge.bg,
            color: badge.color,
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {badge.label}
        </span>
      </td>
    </tr>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const cellStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  color: "var(--pg-text-1)",
  whiteSpace: "nowrap",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--pg-text-3)",
  marginBottom: 5,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
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
};
