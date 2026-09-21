"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  Plus,
  Loader2,
  Trash2,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronDown,
  Zap,
  BarChart3,
  Play,
  AlertCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Fund = {
  id: string;
  code: string;
  name: string;
  currency: string;
  aum: number;
  status: string;
};

type AllocationType = "asset_class" | "instrument" | "sector" | "issuer";

type TargetAllocation = {
  id: string;
  fund_id: string;
  allocation_type: AllocationType;
  label: string;
  instrument_id?: string;
  target_pct: number;
  min_pct: number;
  max_pct: number;
};

type CreateTargetBody = {
  allocation_type: AllocationType;
  label: string;
  instrument_id?: string;
  target_pct: number;
  min_pct: number;
  max_pct: number;
};

type DriftRow = {
  label: string;
  allocation_type: AllocationType;
  current_pct: number;
  target_pct: number;
  drift_pct: number;
  current_value: number;
  in_band: boolean;
};

type Suggestion = {
  instrument: string;
  instrument_id: string;
  action: "BUY" | "SELL";
  quantity: number;
  estimated_value: number;
  current_price: number;
  rationale: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

const ALLOCATION_TYPE_LABELS: Record<AllocationType, string> = {
  asset_class: "Asset Class",
  instrument:  "Instrument",
  sector:      "Sector",
  issuer:      "Issuer",
};

const ALLOCATION_TYPE_COLORS: Record<AllocationType, { bg: string; color: string }> = {
  asset_class: { bg: "#dbeafe", color: "#1d4ed8" },
  instrument:  { bg: "#d1fae5", color: "#065f46" },
  sector:      { bg: "#ede9fe", color: "#6d28d9" },
  issuer:      { bg: "#fff0e0", color: "#E05500" },
};

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtPct(n: number): string {
  return n.toFixed(2) + "%";
}

function fmtValue(n: number, currency: string): string {
  const sym = currency === "USD" ? "$" : "₦";
  if (n >= 1_000_000_000) return `${sym}${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${sym}${(n / 1_000).toFixed(1)}K`;
  return `${sym}${n.toLocaleString("en-NG")}`;
}

function fmtDrift(drift: number): string {
  const abs = Math.abs(drift).toFixed(2);
  return drift >= 0 ? `+${abs}%` : `-${abs}%`;
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function fetchFunds(subsidiaryId: string): Promise<Fund[]> {
  const url = `${BASE}/api/v1/portfolio/funds${subsidiaryId ? `?subsidiary_id=${subsidiaryId}` : ""}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? json : [];
}

async function fetchTargets(fundId: string): Promise<TargetAllocation[]> {
  const res = await fetch(`${BASE}/api/v1/portfolio/rebalancing/targets?fund_id=${fundId}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? json : [];
}

async function createTarget(fundId: string, body: CreateTargetBody): Promise<TargetAllocation> {
  const res = await fetch(`${BASE}/api/v1/portfolio/rebalancing/targets?fund_id=${fundId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to create target");
  }
  return res.json();
}

async function deleteTarget(targetId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/portfolio/rebalancing/targets/${targetId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete target");
}

async function fetchDrift(fundId: string): Promise<DriftRow[]> {
  const res = await fetch(`${BASE}/api/v1/portfolio/rebalancing/drift?fund_id=${fundId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch drift analysis");
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? json : [];
}

async function fetchSuggestions(fundId: string): Promise<Suggestion[]> {
  const res = await fetch(`${BASE}/api/v1/portfolio/rebalancing/suggestions?fund_id=${fundId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch suggestions");
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? json : [];
}

async function executeRebalancing(fundId: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/api/v1/portfolio/rebalancing/execute?fund_id=${fundId}`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to execute rebalancing");
  }
  return res.json();
}

// ── Modal wrapper ──────────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-auto shadow-2xl"
        style={{
          background:  "var(--pg-card)",
          border:      "1px solid var(--pg-card-border)",
          maxHeight:   "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ── Add Target Dialog ──────────────────────────────────────────────────────────

interface AddTargetDialogProps {
  fundId: string;
  onClose: () => void;
  onCreated: () => void;
}

function AddTargetDialog({ fundId, onClose, onCreated }: AddTargetDialogProps) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState<{
    allocation_type: AllocationType;
    label: string;
    target_pct: string;
    min_pct: string;
    max_pct: string;
  }>({
    allocation_type: "asset_class",
    label: "",
    target_pct: "",
    min_pct: "",
    max_pct: "",
  });

  const mutation = useMutation({
    mutationFn: (body: CreateTargetBody) => createTarget(fundId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebalancing-targets", fundId] });
      onCreated();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label || !form.target_pct) return;
    mutation.mutate({
      allocation_type: form.allocation_type,
      label:           form.label.trim(),
      target_pct:      parseFloat(form.target_pct),
      min_pct:         parseFloat(form.min_pct || "0"),
      max_pct:         parseFloat(form.max_pct || "100"),
    });
  }

  const inputCls = "w-full h-9 px-3 rounded-xl text-[13px] outline-none";
  const inputStyle: React.CSSProperties = {
    background: "var(--pg-muted-bg)",
    border:     "1px solid var(--pg-card-border)",
    color:      "var(--pg-text-1)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize:      11,
    fontWeight:    700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color:         "var(--pg-text-3)",
    display:       "block",
    marginBottom:  6,
  };

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--pg-card-border)" }}
      >
        <div>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Add Target Allocation
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Define a new allocation target for this fund
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "var(--pg-muted-bg)" }}
        >
          <X className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        {/* Allocation type */}
        <div>
          <label style={labelStyle}>Allocation Type</label>
          <select
            value={form.allocation_type}
            onChange={(e) => setForm((f) => ({ ...f, allocation_type: e.target.value as AllocationType }))}
            className={inputCls}
            style={inputStyle}
          >
            {(Object.entries(ALLOCATION_TYPE_LABELS) as [AllocationType, string][]).map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>
        </div>

        {/* Label / instrument */}
        <div>
          <label style={labelStyle}>
            {form.allocation_type === "instrument" ? "Instrument Name" : "Label"}
          </label>
          <input
            type="text"
            required
            placeholder={
              form.allocation_type === "asset_class" ? "e.g. Equities" :
              form.allocation_type === "instrument"  ? "e.g. Dangote Cement Plc" :
              form.allocation_type === "sector"      ? "e.g. Financials" :
              "e.g. FGN / CBN"
            }
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            className={inputCls}
            style={inputStyle}
          />
        </div>

        {/* Percentage fields */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label style={labelStyle}>Target %</label>
            <input
              type="number"
              required
              step="0.01"
              min="0"
              max="100"
              placeholder="40.00"
              value={form.target_pct}
              onChange={(e) => setForm((f) => ({ ...f, target_pct: e.target.value }))}
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Min %</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="30.00"
              value={form.min_pct}
              onChange={(e) => setForm((f) => ({ ...f, min_pct: e.target.value }))}
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Max %</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="50.00"
              value={form.max_pct}
              onChange={(e) => setForm((f) => ({ ...f, max_pct: e.target.value }))}
              className={inputCls}
              style={inputStyle}
            />
          </div>
        </div>

        {mutation.isError && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px]"
            style={{ background: "#fee2e2", color: "#dc2626" }}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {(mutation.error as Error).message}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 rounded-xl text-[13px] font-semibold"
            style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding…</>
            ) : (
              <><Plus className="w-3.5 h-3.5" /> Add Target</>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Execute Confirmation Dialog ────────────────────────────────────────────────

interface ExecuteDialogProps {
  fund: Fund;
  suggestions: Suggestion[];
  onClose: () => void;
  onExecuted: () => void;
}

function ExecuteDialog({ fund, suggestions, onClose, onExecuted }: ExecuteDialogProps) {
  const mutation = useMutation({
    mutationFn: () => executeRebalancing(fund.id),
    onSuccess: () => { onExecuted(); },
  });

  const totalBuys  = suggestions.filter((s) => s.action === "BUY").reduce((a, s) => a + s.estimated_value, 0);
  const totalSells = suggestions.filter((s) => s.action === "SELL").reduce((a, s) => a + s.estimated_value, 0);

  return (
    <Modal onClose={onClose}>
      <div className="px-6 py-5">
        {/* Header */}
        <div
          className="flex items-center justify-between mb-5"
          style={{ paddingBottom: 16, borderBottom: "1px solid var(--pg-card-border)" }}
        >
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              Execute Rebalancing
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              {fund.name} · {suggestions.length} order{suggestions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "var(--pg-muted-bg)" }}
          >
            <X className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          </button>
        </div>

        {/* Warning banner */}
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl mb-5"
          style={{ background: "#fef3c7", border: "1px solid #f59e0b" }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#92400e" }} />
          <p className="text-[12px] leading-relaxed" style={{ color: "#92400e" }}>
            This will submit market orders for all suggested trades. Orders cannot be cancelled once submitted.
            Please review the summary below carefully before proceeding.
          </p>
        </div>

        {/* Summary grid */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Total Orders", value: suggestions.length.toString(), color: "#FF6600" },
            { label: "Buy Value",    value: fmtValue(totalBuys, fund.currency),  color: "#059669" },
            { label: "Sell Value",   value: fmtValue(totalSells, fund.currency), color: "#dc2626" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl p-3 text-center"
              style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>
                {item.label}
              </p>
              <p className="text-[16px] font-bold" style={{ color: item.color }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {mutation.isError && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] mb-4"
            style={{ background: "#fee2e2", color: "#dc2626" }}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {(mutation.error as Error).message}
          </div>
        )}

        {mutation.isSuccess && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] mb-4"
            style={{ background: "#d1fae5", color: "#065f46" }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Rebalancing orders submitted successfully.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="h-9 px-5 rounded-xl text-[13px] font-semibold"
            style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || mutation.isSuccess}
            className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Executing…</>
            ) : (
              <><Play className="w-3.5 h-3.5" /> Confirm &amp; Execute</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Section card wrapper ───────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  accentColor,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  accentColor: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background:  "var(--pg-card)",
        border:      "1px solid var(--pg-card-border)",
        boxShadow:   "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div className="h-[3px]" style={{ background: accentColor }} />
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--pg-card-border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: accentColor + "15" }}
          >
            <Icon className="w-4 h-4" style={{ color: accentColor }} />
          </div>
          <div>
            <h2 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>{title}</h2>
            {subtitle && (
              <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{subtitle}</p>
            )}
          </div>
        </div>
        {action && <div>{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Table helpers ──────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding:        "10px 16px",
  textAlign:      "left",
  fontSize:       10,
  fontWeight:     700,
  textTransform:  "uppercase",
  letterSpacing:  "0.08em",
  color:          "var(--pg-text-3)",
  whiteSpace:     "nowrap",
  borderBottom:   "1px solid var(--pg-row-border)",
};

const tdStyle: React.CSSProperties = {
  padding:      "11px 16px",
  fontSize:     13,
  color:        "var(--pg-text-1)",
  borderBottom: "1px solid var(--pg-row-border)",
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RebalancingPage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";
  const queryClient = useQueryClient();

  // ── State
  const [selectedFundId, setSelectedFundId] = useState<string>("");
  const [showAddTarget, setShowAddTarget]   = useState(false);
  const [showExecute, setShowExecute]       = useState(false);

  // Drift & suggestions are triggered manually
  const [driftEnabled, setDriftEnabled]           = useState(false);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(false);

  // ── Queries
  const { data: funds = [], isLoading: fundsLoading } = useQuery<Fund[]>({
    queryKey: ["portfolio-funds", subsidId],
    queryFn:  () => fetchFunds(subsidId),
  });

  const selectedFund = funds.find((f) => f.id === selectedFundId) ?? null;

  const { data: targets = [], isLoading: targetsLoading } = useQuery<TargetAllocation[]>({
    queryKey: ["rebalancing-targets", selectedFundId],
    queryFn:  () => fetchTargets(selectedFundId),
    enabled:  !!selectedFundId,
  });

  const {
    data:      driftRows = [],
    isLoading: driftLoading,
    isError:   driftError,
    refetch:   refetchDrift,
  } = useQuery<DriftRow[]>({
    queryKey: ["rebalancing-drift", selectedFundId],
    queryFn:  () => fetchDrift(selectedFundId),
    enabled:  !!selectedFundId && driftEnabled,
  });

  const {
    data:      suggestions = [],
    isLoading: suggestionsLoading,
    isError:   suggestionsError,
    refetch:   refetchSuggestions,
  } = useQuery<Suggestion[]>({
    queryKey: ["rebalancing-suggestions", selectedFundId],
    queryFn:  () => fetchSuggestions(selectedFundId),
    enabled:  !!selectedFundId && suggestionsEnabled,
  });

  // ── Delete target mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTarget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebalancing-targets", selectedFundId] });
    },
  });

  function handleAnalyseDrift() {
    if (!driftEnabled) {
      setDriftEnabled(true);
    } else {
      refetchDrift();
    }
  }

  function handleGenerateSuggestions() {
    if (!suggestionsEnabled) {
      setSuggestionsEnabled(true);
    } else {
      refetchSuggestions();
    }
  }

  // Reset drift/suggestions when fund changes
  function handleFundChange(id: string) {
    setSelectedFundId(id);
    setDriftEnabled(false);
    setSuggestionsEnabled(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
            Portfolio Rebalancing
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {subsidiary?.Name ?? "Page Asset Management"} · Target allocations, drift analysis &amp; rebalancing
          </p>
        </div>
      </div>

      {/* ── Fund Selector ── */}
      <div
        className="rounded-2xl px-5 py-4 flex items-center gap-4"
        style={{
          background: "var(--pg-card)",
          border:     "1px solid var(--pg-card-border)",
          boxShadow:  "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "#FF660015" }}
        >
          <BarChart3 className="w-4 h-4" style={{ color: "#FF6600" }} />
        </div>
        <div className="flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>
            Selected Fund
          </p>
          {fundsLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
              <span className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>Loading funds…</span>
            </div>
          ) : (
            <div className="relative inline-block">
              <select
                value={selectedFundId}
                onChange={(e) => handleFundChange(e.target.value)}
                className="h-9 pl-3 pr-8 rounded-xl text-[13px] font-semibold outline-none appearance-none min-w-[280px]"
                style={{
                  background: "var(--pg-muted-bg)",
                  border:     "1px solid var(--pg-card-border)",
                  color:      selectedFundId ? "var(--pg-text-1)" : "var(--pg-text-3)",
                }}
              >
                <option value="">Select a fund to begin…</option>
                {funds.filter((f) => f.status === "active").map((f) => (
                  <option key={f.id} value={f.id}>{f.code} — {f.name}</option>
                ))}
              </select>
              <ChevronDown
                className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--pg-text-3)" }}
              />
            </div>
          )}
        </div>
        {selectedFund && (
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>
                Currency
              </p>
              <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                {selectedFund.currency}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>
                AUM
              </p>
              <p className="text-[13px] font-semibold" style={{ color: "#059669" }}>
                {fmtValue(selectedFund.aum, selectedFund.currency)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 1: Target Allocation ── */}
      <SectionCard
        title="Target Allocation"
        subtitle={selectedFundId ? `${targets.length} allocation${targets.length !== 1 ? "s" : ""} defined` : "Select a fund to manage allocations"}
        accentColor="#7c3aed"
        icon={TrendingUp}
        action={
          selectedFundId ? (
            <button
              onClick={() => setShowAddTarget(true)}
              className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#7c3aed,#5b21b6)" }}
            >
              <Plus className="w-3.5 h-3.5" /> Add Target
            </button>
          ) : undefined
        }
      >
        {!selectedFundId ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "var(--pg-muted-bg)" }}
            >
              <TrendingUp className="w-6 h-6" style={{ color: "var(--pg-text-3)" }} />
            </div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
              No fund selected
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
              Select a fund above to view and manage target allocations
            </p>
          </div>
        ) : targetsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
          </div>
        ) : targets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "#ede9fe" }}
            >
              <TrendingUp className="w-6 h-6" style={{ color: "#7c3aed" }} />
            </div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
              No target allocations yet
            </p>
            <p className="text-[12px] mt-1 mb-4" style={{ color: "var(--pg-text-3)" }}>
              Define target allocations to start tracking drift
            </p>
            <button
              onClick={() => setShowAddTarget(true)}
              className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#7c3aed,#5b21b6)" }}
            >
              <Plus className="w-3.5 h-3.5" /> Add First Target
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Type", "Label / Instrument", "Target %", "Min %", "Max %", ""].map((col) => (
                    <th key={col} style={thStyle}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {targets.map((t, i) => {
                  const typeMeta = ALLOCATION_TYPE_COLORS[t.allocation_type];
                  const isLast   = i === targets.length - 1;
                  return (
                    <tr
                      key={t.id}
                      style={{ borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}
                    >
                      <td style={{ ...tdStyle, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ background: typeMeta.bg, color: typeMeta.color }}
                        >
                          {ALLOCATION_TYPE_LABELS[t.allocation_type]}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                        {t.label}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#7c3aed", borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                        {fmtPct(t.target_pct)}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--pg-text-2)", borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                        {fmtPct(t.min_pct)}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--pg-text-2)", borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                        {fmtPct(t.max_pct)}
                      </td>
                      <td style={{ ...tdStyle, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                        <button
                          onClick={() => deleteMutation.mutate(t.id)}
                          disabled={deleteMutation.isPending}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
                          style={{ background: "var(--pg-muted-bg)", color: "#dc2626" }}
                          title="Delete target"
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Allocation sum indicator */}
            {targets.length > 0 && (() => {
              const sum = targets.reduce((a, t) => a + t.target_pct, 0);
              const isOver  = sum > 100;
              const isExact = Math.abs(sum - 100) < 0.01;
              return (
                <div
                  className="flex items-center justify-end gap-2 px-5 py-2.5 text-[12px] font-semibold"
                  style={{
                    borderTop:  "1px solid var(--pg-row-border)",
                    color:      isOver ? "#dc2626" : isExact ? "#059669" : "var(--pg-text-2)",
                  }}
                >
                  {isOver && <AlertCircle className="w-3.5 h-3.5" />}
                  {isExact && <CheckCircle2 className="w-3.5 h-3.5" />}
                  Total target: {fmtPct(sum)}
                  {isOver  && " — exceeds 100%"}
                  {isExact && " — fully allocated"}
                </div>
              );
            })()}
          </div>
        )}
      </SectionCard>

      {/* ── Section 2: Drift Analysis ── */}
      {selectedFundId && (
        <SectionCard
          title="Drift Analysis"
          subtitle="Compare current allocation against targets"
          accentColor="#d97706"
          icon={BarChart3}
          action={
            <button
              onClick={handleAnalyseDrift}
              disabled={driftLoading}
              className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#d97706,#b45309)" }}
            >
              {driftLoading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analysing…</>
              ) : (
                <><BarChart3 className="w-3.5 h-3.5" /> Analyse Drift</>
              )}
            </button>
          }
        >
          {driftError && (
            <div
              className="flex items-center gap-2 mx-5 my-4 px-3 py-2.5 rounded-xl text-[12px]"
              style={{ background: "#fee2e2", color: "#dc2626" }}
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Failed to load drift analysis. Please try again.
            </div>
          )}

          {!driftEnabled && !driftError ? (
            <div className="flex flex-col items-center justify-center py-14">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: "#fef3c7" }}
              >
                <BarChart3 className="w-6 h-6" style={{ color: "#d97706" }} />
              </div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
                Drift analysis not loaded
              </p>
              <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                Click &ldquo;Analyse Drift&rdquo; to compare current vs target allocations
              </p>
            </div>
          ) : driftLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
            </div>
          ) : driftEnabled && driftRows.length === 0 && !driftError ? (
            <div className="flex flex-col items-center justify-center py-14">
              <CheckCircle2 className="w-10 h-10 mb-2" style={{ color: "#059669" }} />
              <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
                No drift data returned
              </p>
              <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                Ensure target allocations are defined and the fund has holdings
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Label", "Type", "Current %", "Target %", "Drift %", "Current Value", "In Band"].map((col) => (
                      <th key={col} style={thStyle}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driftRows.map((row, i) => {
                    const isLast    = i === driftRows.length - 1;
                    const typeMeta  = ALLOCATION_TYPE_COLORS[row.allocation_type];
                    const driftPos  = row.drift_pct >= 0;
                    const driftAbs  = Math.abs(row.drift_pct);

                    return (
                      <tr
                        key={row.label + i}
                        style={{
                          borderBottom:    isLast ? "none" : "1px solid var(--pg-row-border)",
                          borderLeft:      `3px solid ${row.in_band ? "#059669" : "#dc2626"}`,
                          background:      row.in_band ? "transparent" : "rgba(220,38,38,0.03)",
                        }}
                      >
                        <td style={{ ...tdStyle, fontWeight: 600, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          {row.label}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          <span
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ background: typeMeta.bg, color: typeMeta.color }}
                          >
                            {ALLOCATION_TYPE_LABELS[row.allocation_type]}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          {fmtPct(row.current_pct)}
                        </td>
                        <td style={{ ...tdStyle, color: "#7c3aed", fontWeight: 600, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          {fmtPct(row.target_pct)}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          <span
                            className="text-[12px] font-bold tabular-nums"
                            style={{ color: driftPos ? "#dc2626" : "#059669" }}
                          >
                            {fmtDrift(row.drift_pct)}
                          </span>
                          {/* Drift bar */}
                          <div
                            className="mt-1 h-1 rounded-full overflow-hidden"
                            style={{ width: 64, background: "var(--pg-muted-bg)" }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width:      `${Math.min((driftAbs / 10) * 100, 100)}%`,
                                background: row.in_band ? "#059669" : "#dc2626",
                              }}
                            />
                          </div>
                        </td>
                        <td style={{ ...tdStyle, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          {fmtValue(row.current_value, selectedFund?.currency ?? "NGN")}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          {row.in_band ? (
                            <span
                              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                              style={{ background: "#d1fae5", color: "#065f46" }}
                            >
                              <CheckCircle2 className="w-3 h-3" /> In Band
                            </span>
                          ) : (
                            <span
                              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                              style={{ background: "#fee2e2", color: "#991b1b" }}
                            >
                              <AlertTriangle className="w-3 h-3" /> Out of Band
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Drift summary strip */}
              {driftRows.length > 0 && (() => {
                const outOfBand = driftRows.filter((r) => !r.in_band).length;
                return (
                  <div
                    className="flex items-center gap-3 px-5 py-2.5"
                    style={{ borderTop: "1px solid var(--pg-row-border)" }}
                  >
                    <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                      {driftRows.length} allocation{driftRows.length !== 1 ? "s" : ""} analysed
                    </span>
                    <span className="text-[12px] font-semibold" style={{ color: outOfBand > 0 ? "#dc2626" : "#059669" }}>
                      · {outOfBand} out of band
                    </span>
                    <span className="text-[12px] font-semibold" style={{ color: "#059669" }}>
                      · {driftRows.length - outOfBand} in band
                    </span>
                  </div>
                );
              })()}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Section 3: Rebalancing Suggestions ── */}
      {selectedFundId && (
        <SectionCard
          title="Rebalancing Suggestions"
          subtitle="AI-generated trade orders to restore target allocation"
          accentColor="#059669"
          icon={Zap}
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateSuggestions}
                disabled={suggestionsLoading}
                className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
              >
                {suggestionsLoading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                ) : (
                  <><Zap className="w-3.5 h-3.5" /> Generate Suggestions</>
                )}
              </button>
              {suggestions.length > 0 && (
                <button
                  onClick={() => setShowExecute(true)}
                  className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}
                >
                  <Play className="w-3.5 h-3.5" /> Execute Rebalancing
                </button>
              )}
            </div>
          }
        >
          {suggestionsError && (
            <div
              className="flex items-center gap-2 mx-5 my-4 px-3 py-2.5 rounded-xl text-[12px]"
              style={{ background: "#fee2e2", color: "#dc2626" }}
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Failed to generate suggestions. Please try again.
            </div>
          )}

          {!suggestionsEnabled && !suggestionsError ? (
            <div className="flex flex-col items-center justify-center py-14">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: "#d1fae5" }}
              >
                <Zap className="w-6 h-6" style={{ color: "#059669" }} />
              </div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
                No suggestions generated
              </p>
              <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                Click &ldquo;Generate Suggestions&rdquo; to produce trade orders that restore target allocation
              </p>
            </div>
          ) : suggestionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
            </div>
          ) : suggestionsEnabled && suggestions.length === 0 && !suggestionsError ? (
            <div className="flex flex-col items-center justify-center py-14">
              <CheckCircle2 className="w-10 h-10 mb-2" style={{ color: "#059669" }} />
              <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
                No trades required
              </p>
              <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                The portfolio is within target bands — no rebalancing needed
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Instrument", "Action", "Quantity", "Estimated Value", "Current Price", "Rationale"].map((col) => (
                      <th key={col} style={thStyle}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s, i) => {
                    const isLast = i === suggestions.length - 1;
                    const isBuy  = s.action === "BUY";
                    return (
                      <tr
                        key={s.instrument_id + i}
                        style={{
                          borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)",
                          borderLeft:   `3px solid ${isBuy ? "#059669" : "#dc2626"}`,
                        }}
                      >
                        <td style={{ ...tdStyle, fontWeight: 600, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          {s.instrument}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          <span
                            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                            style={{
                              background: isBuy ? "#d1fae5" : "#fee2e2",
                              color:      isBuy ? "#065f46" : "#991b1b",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {s.action}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 600, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          {s.quantity.toLocaleString("en-NG")}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          <span style={{ color: isBuy ? "#059669" : "#dc2626", fontWeight: 600 }}>
                            {fmtValue(s.estimated_value, selectedFund?.currency ?? "NGN")}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)" }}>
                          {fmtValue(s.current_price, selectedFund?.currency ?? "NGN")}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            color:        "var(--pg-text-2)",
                            fontSize:     12,
                            maxWidth:     280,
                            borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)",
                          }}
                        >
                          <span title={s.rationale} className="block truncate" style={{ maxWidth: 260 }}>
                            {s.rationale}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Suggestions summary strip */}
              {suggestions.length > 0 && (() => {
                const buys  = suggestions.filter((s) => s.action === "BUY");
                const sells = suggestions.filter((s) => s.action === "SELL");
                const buyVal  = buys.reduce((a, s) => a + s.estimated_value, 0);
                const sellVal = sells.reduce((a, s) => a + s.estimated_value, 0);
                const currency = selectedFund?.currency ?? "NGN";
                return (
                  <div
                    className="flex items-center gap-4 px-5 py-2.5 flex-wrap"
                    style={{ borderTop: "1px solid var(--pg-row-border)" }}
                  >
                    <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                      {suggestions.length} order{suggestions.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-[12px] font-semibold" style={{ color: "#059669" }}>
                      · {buys.length} buy{buys.length !== 1 ? "s" : ""} ({fmtValue(buyVal, currency)})
                    </span>
                    <span className="text-[12px] font-semibold" style={{ color: "#dc2626" }}>
                      · {sells.length} sell{sells.length !== 1 ? "s" : ""} ({fmtValue(sellVal, currency)})
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={() => setShowExecute(true)}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold text-white"
                      style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}
                    >
                      <Play className="w-3 h-3" /> Execute Rebalancing
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Dialogs ── */}
      {showAddTarget && selectedFundId && (
        <AddTargetDialog
          fundId={selectedFundId}
          onClose={() => setShowAddTarget(false)}
          onCreated={() => setShowAddTarget(false)}
        />
      )}

      {showExecute && selectedFund && (
        <ExecuteDialog
          fund={selectedFund}
          suggestions={suggestions}
          onClose={() => setShowExecute(false)}
          onExecuted={() => {
            setShowExecute(false);
            setSuggestionsEnabled(false);
            setDriftEnabled(false);
          }}
        />
      )}
    </div>
  );
}
