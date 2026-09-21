"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, AlertCircle, Loader2, Download, ArrowUpDown,
  RefreshCw, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type FxRate = {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  date: string;
  source: string;
  created_by_name?: string;
  created_at: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const COMMON_CURRENCIES = [
  "NGN", "USD", "GBP", "EUR", "ZAR", "GHS", "KES", "JPY",
  "CAD", "AUD", "CHF", "CNY", "AED", "SGD",
];

const SOURCES = ["CBN", "Bloomberg", "Reuters", "Manual", "FMDQ", "Internal"];

// ── Helpers ────────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(e.error?.message ?? "Request failed");
  }
  return res.json();
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtRate(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(n);
}

function CurrencyBadge({ code, size = "sm" }: { code: string; size?: "sm" | "md" }) {
  const COLORS: Record<string, { bg: string; color: string }> = {
    NGN: { bg: "#fffbeb", color: "#d97706" },
    USD: { bg: "#eff6ff", color: "#1d4ed8" },
    GBP: { bg: "#f5f3ff", color: "#7c3aed" },
    EUR: { bg: "#ecfdf5", color: "#059669" },
    ZAR: { bg: "#fef2f2", color: "#dc2626" },
    GHS: { bg: "#fff7ed", color: "#c2410c" },
    KES: { bg: "#f0fdf4", color: "#15803d" },
    JPY: { bg: "#fef2f2", color: "#be123c" },
  };
  const cfg = COLORS[code] ?? { bg: "#f1f5f9", color: "#475569" };
  return (
    <span
      className={cn("font-bold rounded-md font-mono", size === "md" ? "text-[13px] px-2 py-1" : "text-[11px] px-1.5 py-0.5")}
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {code}
    </span>
  );
}

// ── Add Rate Modal ─────────────────────────────────────────────────────────────

function AddRateModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [from, setFrom]     = useState("USD");
  const [to, setTo]         = useState("NGN");
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [rate, setRate]     = useState("");
  const [source, setSource] = useState("CBN");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rate || isNaN(parseFloat(rate)) || parseFloat(rate) <= 0) {
      setError("Rate must be a positive number.");
      return;
    }
    if (from === to) {
      setError("From and To currencies cannot be the same.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/fx-rates", {
        method: "POST",
        body: JSON.stringify({
          from_currency: from,
          to_currency: to,
          date,
          rate: parseFloat(rate),
          source,
        }),
      });
      toast({ title: "FX Rate added", description: `${from} → ${to} @ ${fmtRate(parseFloat(rate))}` });
      queryClient.invalidateQueries({ queryKey: ["fx-rates"] });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--pg-row-border)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,102,0,0.12)" }}>
              <RefreshCw className="w-3.5 h-3.5" style={{ color: "#FF6600" }} />
            </div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Add FX Rate</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--pg-text-3)" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Currency pair */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
                From Currency *
              </label>
              <select
                value={from}
                onChange={e => setFrom(e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none appearance-none"
                style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
              >
                {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
                To Currency *
              </label>
              <select
                value={to}
                onChange={e => setTo(e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none appearance-none"
                style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
              >
                {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Preview pair */}
          {from && to && from !== to && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--pg-muted-bg)" }}>
              <CurrencyBadge code={from} />
              <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>→</span>
              <CurrencyBadge code={to} />
              <span className="text-[11px] ml-1" style={{ color: "var(--pg-text-3)" }}>
                1 {from} = {rate ? fmtRate(parseFloat(rate) || 0) : "?"} {to}
              </span>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
              Date *
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
              style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
            />
          </div>

          {/* Rate */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
              Rate * <span style={{ color: "var(--pg-text-4)", textTransform: "none", letterSpacing: 0 }}>
                (1 {from} = ? {to})
              </span>
            </label>
            <input
              type="number"
              step="0.000001"
              min="0.000001"
              value={rate}
              onChange={e => setRate(e.target.value)}
              required
              placeholder="e.g. 1580.0000"
              className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none"
              style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
            />
          </div>

          {/* Source */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
              Source *
            </label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              required
              className="w-full h-9 px-3 rounded-lg text-[13px] outline-none appearance-none"
              style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
            >
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl text-[13px] font-medium transition-colors"
              style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Rate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type SortField = keyof Pick<FxRate, "date" | "from_currency" | "to_currency" | "rate" | "source">;

export default function FxRatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo]     = useState("");
  const [sortField, setSortField]   = useState<SortField>("date");
  const [sortAsc, setSortAsc]       = useState(false);

  // Build query params
  const params = new URLSearchParams();
  if (filterFrom) params.set("from_currency", filterFrom);
  if (filterTo)   params.set("to_currency", filterTo);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data: rates = [], isLoading } = useQuery<FxRate[]>({
    queryKey: ["fx-rates", filterFrom, filterTo],
    queryFn: async () => {
      const raw = await apiFetch(`/fx-rates${qs}`);
      return Array.isArray(raw) ? (raw as FxRate[]) : [];
    },
    refetchInterval: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/fx-rates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fx-rates"] });
      toast({ title: "Rate deleted" });
    },
    onError: (err) => toast({ title: "Delete Failed", description: (err as Error).message, variant: "destructive" }),
  });

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc(v => !v);
    else { setSortField(field); setSortAsc(false); }
  }

  const sorted = [...rates].sort((a, b) => {
    const av = a[sortField] as string | number;
    const bv = b[sortField] as string | number;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  function SortHeader({ field, label, align }: { field: SortField; label: string; align?: "right" }) {
    const active = sortField === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        className={cn("flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider", align === "right" && "ml-auto")}
        style={{ color: active ? "var(--pg-text-1)" : "var(--pg-text-3)" }}
      >
        {label}
        <ArrowUpDown className={cn("w-3 h-3 transition-opacity", active ? "opacity-100" : "opacity-40")} />
      </button>
    );
  }

  // Export CSV
  function exportCsv() {
    const rows = [
      ["From", "To", "Date", "Rate", "Source", "Added By"],
      ...sorted.map(r => [r.from_currency, r.to_currency, r.date, r.rate, r.source, r.created_by_name ?? ""]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `fx-rates-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // Summary stats
  const uniquePairs = new Set(rates.map(r => `${r.from_currency}/${r.to_currency}`)).size;
  const latestDate  = rates.length ? rates.reduce((a, b) => a.date > b.date ? a : b).date : null;

  const sourceCounts: Record<string, number> = {};
  for (const r of rates) sourceCounts[r.source] = (sourceCounts[r.source] ?? 0) + 1;
  const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>FX Rates</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {rates.length} rate{rates.length !== 1 ? "s" : ""} · {uniquePairs} currency pair{uniquePairs !== 1 ? "s" : ""}
            {latestDate && ` · Latest: ${fmtDate(latestDate)}`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}
        >
          <Plus className="w-3.5 h-3.5" /> Add Rate
        </button>
      </div>

      {/* Summary cards */}
      {rates.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Rates",     value: String(rates.length),      color: "#FF6600", bg: "#fff7f0", icon: RefreshCw },
            { label: "Currency Pairs",  value: String(uniquePairs),       color: "#0891b2", bg: "#ecfeff", icon: TrendingUp },
            { label: "Primary Source",  value: topSource ?? "—",          color: "#059669", bg: "#ecfdf5", icon: RefreshCw },
          ].map(s => (
            <div key={s.label} className="rounded-xl px-5 py-4 flex items-center gap-4"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.bg }}>
                <s.icon style={{ color: s.color, width: 16, height: 16 }} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>{s.label}</p>
                <p className="text-[20px] font-bold leading-none mt-0.5" style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* From currency */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>
            From
          </label>
          <select
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="h-9 px-3 rounded-xl text-[12px] outline-none appearance-none font-mono min-w-[90px]"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
          >
            <option value="">All</option>
            {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* To currency */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>
            To
          </label>
          <select
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="h-9 px-3 rounded-xl text-[12px] outline-none appearance-none font-mono min-w-[90px]"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
          >
            <option value="">All</option>
            {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Clear filters */}
        {(filterFrom || filterTo) && (
          <div className="mt-4">
            <button
              onClick={() => { setFilterFrom(""); setFilterTo(""); }}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors"
              style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
            >
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
        )}

        {/* Export */}
        <div className={cn("ml-auto", !filterFrom && !filterTo ? "mt-4" : "mt-4")}>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors"
            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        {/* Column headers */}
        <div
          className="grid items-center gap-4 px-5 py-3"
          style={{
            gridTemplateColumns: "90px 90px 120px 160px 1fr 100px",
            borderBottom: "1px solid var(--pg-row-border)",
            background: "var(--pg-muted-bg)",
          }}
        >
          <SortHeader field="from_currency" label="From" />
          <SortHeader field="to_currency"   label="To" />
          <SortHeader field="date"          label="Date" />
          <SortHeader field="rate"          label="Rate" align="right" />
          <SortHeader field="source"        label="Source" />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Actions</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--pg-text-4)" }} />
            <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-2)" }}>
              {filterFrom || filterTo ? "No rates match your filters." : "No FX rates yet — add one to get started."}
            </p>
            {!filterFrom && !filterTo && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white mx-auto"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
              >
                <Plus className="w-3 h-3" /> Add First Rate
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {sorted.map(rate => (
              <div
                key={rate.id}
                className="grid items-center gap-4 px-5 py-3 transition-colors"
                style={{ gridTemplateColumns: "90px 90px 120px 160px 1fr 100px" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
              >
                {/* From */}
                <div>
                  <CurrencyBadge code={rate.from_currency} />
                </div>

                {/* To */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>→</span>
                  <CurrencyBadge code={rate.to_currency} />
                </div>

                {/* Date */}
                <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                  {fmtDate(rate.date)}
                </p>

                {/* Rate */}
                <div className="text-right">
                  <p className="text-[13px] font-bold font-mono tabular-nums" style={{ color: "var(--pg-text-1)" }}>
                    {fmtRate(rate.rate)}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--pg-text-4)" }}>
                    1 {rate.from_currency} = {fmtRate(rate.rate)} {rate.to_currency}
                  </p>
                </div>

                {/* Source */}
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                    style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
                  >
                    {rate.source}
                  </span>
                  {rate.created_by_name && (
                    <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                      by {rate.created_by_name}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${rate.from_currency}/${rate.to_currency} rate for ${fmtDate(rate.date)}?`)) {
                        deleteMutation.mutate(rate.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    title="Delete rate"
                    className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-3)" }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = "#fef2f2";
                      (e.currentTarget as HTMLElement).style.color = "#dc2626";
                      (e.currentTarget as HTMLElement).style.borderColor = "#fca5a5";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = "";
                      (e.currentTarget as HTMLElement).style.color = "var(--pg-text-3)";
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)";
                    }}
                  >
                    <X className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer: row count */}
        {sorted.length > 0 && (
          <div
            className="flex items-center justify-between px-5 py-2.5"
            style={{ borderTop: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}
          >
            <p className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>
              {sorted.length} rate{sorted.length !== 1 ? "s" : ""}
              {(filterFrom || filterTo) && " (filtered)"}
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors"
              style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-card)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
            >
              <Plus className="w-3 h-3" /> Add Rate
            </button>
          </div>
        )}
      </div>

      {showCreate && <AddRateModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
