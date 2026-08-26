"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Loader2, TrendingUp, Briefcase, BarChart3,
  X, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type FundType = "pooled" | "segregated" | "proprietary";
type FundStatus = "active" | "closed" | "suspended";

type Fund = {
  id: string;
  code: string;
  name: string;
  fund_type: FundType;
  benchmark: string;
  currency: string;
  inception_date: string;
  target_return?: number;
  status: FundStatus;
  client_id?: string;
  subsidiary_id?: string;
  aum: number;
  created_by_name: string;
  created_at: string;
};

type Subsidiary = { id: string; name: string };

type CreateFundBody = {
  code: string;
  name: string;
  fund_type: FundType;
  benchmark: string;
  currency: string;
  inception_date: string;
  target_return?: number;
  subsidiary_id?: string;  // optional — omit when empty to avoid UUID parse error in Go
};

type FilterTab = "all" | "active" | "closed";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

const FUND_TYPE_LABEL: Record<FundType, string> = {
  pooled:       "Pooled",
  segregated:   "Segregated",
  proprietary:  "Proprietary",
};

const FUND_TYPE_COLOR: Record<FundType, { bg: string; color: string }> = {
  pooled:      { bg: "#dbeafe", color: "#1d4ed8" },
  segregated:  { bg: "#ede9fe", color: "#6d28d9" },
  proprietary: { bg: "#d1fae5", color: "#065f46" },
};

const STATUS_PILL: Record<FundStatus, { bg: string; color: string; label: string }> = {
  active:    { bg: "#d1fae5", color: "#065f46", label: "Active" },
  closed:    { bg: "#f1f5f9", color: "#475569", label: "Closed" },
  suspended: { bg: "#fef3c7", color: "#92400e", label: "Suspended" },
};

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtAUM(amount: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : "₦";
  if (amount >= 1_000_000_000) return `${symbol}${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000)     return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000)         return `${symbol}${(amount / 1_000).toFixed(1)}K`;
  return `${symbol}${amount.toLocaleString("en-NG")}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── API fetchers ──────────────────────────────────────────────────────────────

async function fetchFunds(subsidiaryId: string): Promise<Fund[]> {
  const url = `${BASE}/api/v1/portfolio/funds${subsidiaryId ? `?subsidiary_id=${subsidiaryId}` : ""}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? json : [];
}

async function fetchSubsidiaries(): Promise<Subsidiary[]> {
  const res = await fetch(`${BASE}/api/v1/org/subsidiaries`, { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? json : [];
}

async function createFund(body: CreateFundBody): Promise<Fund> {
  const res = await fetch(`${BASE}/api/v1/portfolio/funds`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to create fund");
  }
  return res.json() as Promise<Fund>;
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filter, onNew }: { filter: FilterTab; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
           style={{ background: "var(--pg-muted-bg)" }}>
        <Briefcase className="w-7 h-7" style={{ color: "var(--pg-text-3)" }} />
      </div>
      <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
        {filter === "all" ? "No funds yet" : `No ${filter} funds`}
      </p>
      <p className="text-[12px] mt-1.5 max-w-xs" style={{ color: "var(--pg-text-3)" }}>
        {filter === "all"
          ? "Create your first fund or mandate to start managing portfolios."
          : `There are no ${filter} funds at the moment.`}
      </p>
      {filter === "all" && (
        <button
          onClick={onNew}
          className="mt-5 flex items-center gap-2 h-9 px-5 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
          <Plus className="w-3.5 h-3.5" /> New Fund
        </button>
      )}
    </div>
  );
}

// ── Fund card ─────────────────────────────────────────────────────────────────

function FundCard({ fund, onClick }: { fund: Fund; onClick: () => void }) {
  const typeMeta   = FUND_TYPE_COLOR[fund.fund_type]   ?? { bg: "#f1f5f9", color: "#475569" };
  const statusMeta = STATUS_PILL[fund.status]          ?? { bg: "#f1f5f9", color: "#475569", label: fund.status };
  const accentColor = fund.fund_type === "pooled" ? "#2563eb"
    : fund.fund_type === "segregated"              ? "#7c3aed"
    : "#059669";

  return (
    <button
      onClick={onClick}
      className="group text-left w-full rounded-2xl overflow-hidden transition-all duration-150"
      style={{
        background:  "var(--pg-card)",
        border:      "1px solid var(--pg-card-border)",
        boxShadow:   "0 1px 4px rgba(0,0,0,0.05)",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)";
        (e.currentTarget as HTMLElement).style.borderColor = accentColor + "55";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)";
      }}>
      {/* Top accent bar */}
      <div className="h-[3px]" style={{ background: accentColor }} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] font-bold tracking-widest uppercase"
                    style={{ color: accentColor }}>
                {fund.code}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: typeMeta.bg, color: typeMeta.color }}>
                {FUND_TYPE_LABEL[fund.fund_type]}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: statusMeta.bg, color: statusMeta.color }}>
                {statusMeta.label}
              </span>
            </div>
            <h3 className="text-[14px] font-bold leading-snug truncate"
                style={{ color: "var(--pg-text-1)" }}>
              {fund.name}
            </h3>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "var(--pg-text-3)" }} />
        </div>

        {/* AUM */}
        <div className="flex items-baseline gap-1.5 mb-3">
          <span className="text-[22px] font-bold tabular leading-none"
                style={{ color: "var(--pg-text-1)" }}>
            {fmtAUM(fund.aum, fund.currency)}
          </span>
          <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>AUM</span>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
               style={{ color: "var(--pg-text-3)" }}>Benchmark</p>
            <p className="text-[12px] font-medium truncate"
               style={{ color: "var(--pg-text-2)" }}>{fund.benchmark || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
               style={{ color: "var(--pg-text-3)" }}>Currency</p>
            <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
              {fund.currency}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
               style={{ color: "var(--pg-text-3)" }}>Inception</p>
            <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
              {fmtDate(fund.inception_date)}
            </p>
          </div>
          {fund.target_return != null && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
                 style={{ color: "var(--pg-text-3)" }}>Target Return</p>
              <p className="text-[12px] font-semibold" style={{ color: "#059669" }}>
                {fund.target_return.toFixed(1)}%
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-3.5 pt-3 flex items-center justify-between"
             style={{ borderTop: "1px solid var(--pg-card-border)" }}>
          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
            Created by {fund.created_by_name}
          </p>
          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
            {fmtDate(fund.created_at)}
          </p>
        </div>
      </div>
    </button>
  );
}

// ── New Fund Modal ─────────────────────────────────────────────────────────────

interface NewFundModalProps {
  subsidiaries: Subsidiary[];
  defaultSubsidiaryId: string;
  onClose: () => void;
  onCreated: () => void;
}

function NewFundModal({ subsidiaries, defaultSubsidiaryId, onClose, onCreated }: NewFundModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<{
    code: string;
    name: string;
    fund_type: FundType;
    benchmark: string;
    currency: string;
    inception_date: string;
    target_return: string;
    subsidiary_id: string;
  }>({
    code: "",
    name: "",
    fund_type: "pooled",
    benchmark: "",
    currency: "NGN",
    inception_date: "",
    target_return: "",
    subsidiary_id: defaultSubsidiaryId,
  });

  const mutation = useMutation({
    mutationFn: (body: CreateFundBody) => createFund(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-funds"] });
      toast({ title: "Fund created", description: `${form.name} has been created successfully.` });
      onCreated();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code || !form.name || !form.inception_date) return;
    const body: CreateFundBody = {
      code:           form.code.trim().toUpperCase(),
      name:           form.name.trim(),
      fund_type:      form.fund_type,
      benchmark:      form.benchmark.trim(),
      currency:       form.currency,
      inception_date: form.inception_date,
      subsidiary_id:  form.subsidiary_id || undefined,
      ...(form.target_return ? { target_return: parseFloat(form.target_return) } : {}),
    };
    mutation.mutate(body);
  }

  const inputClass = "w-full h-9 px-3 rounded-xl text-[13px] outline-none transition-colors";
  const inputStyle = {
    background:  "var(--pg-muted-bg)",
    border:      "1px solid var(--pg-card-border)",
    color:       "var(--pg-text-1)",
  };
  const labelStyle = { color: "var(--pg-text-3)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom: "1px solid var(--pg-card-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              New Fund / Mandate
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Page Asset Management
            </p>
          </div>
          <button onClick={onClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                  style={{ background: "var(--pg-muted-bg)" }}>
            <X className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          <div className="grid grid-cols-2 gap-4">
            {/* Code */}
            <div className="space-y-1.5">
              <label style={labelStyle}>Code</label>
              <input
                type="text"
                placeholder="PAGE-EQ-01"
                required
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            {/* Fund type */}
            <div className="space-y-1.5">
              <label style={labelStyle}>Type</label>
              <select
                value={form.fund_type}
                onChange={e => setForm(f => ({ ...f, fund_type: e.target.value as FundType }))}
                className={inputClass}
                style={inputStyle}>
                <option value="pooled">Pooled</option>
                <option value="segregated">Segregated</option>
                <option value="proprietary">Proprietary</option>
              </select>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label style={labelStyle}>Fund Name</label>
            <input
              type="text"
              placeholder="Page Equity Growth Fund"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Benchmark */}
          <div className="space-y-1.5">
            <label style={labelStyle}>Benchmark</label>
            <input
              type="text"
              placeholder="NSE All-Share Index"
              value={form.benchmark}
              onChange={e => setForm(f => ({ ...f, benchmark: e.target.value }))}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Currency */}
            <div className="space-y-1.5">
              <label style={labelStyle}>Currency</label>
              <select
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className={inputClass}
                style={inputStyle}>
                <option value="NGN">NGN — Nigerian Naira</option>
                <option value="USD">USD — US Dollar</option>
              </select>
            </div>
            {/* Inception date */}
            <div className="space-y-1.5">
              <label style={labelStyle}>Inception Date</label>
              <input
                type="date"
                required
                value={form.inception_date}
                onChange={e => setForm(f => ({ ...f, inception_date: e.target.value }))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Target return */}
            <div className="space-y-1.5">
              <label style={labelStyle}>Target Return (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="12.0"
                value={form.target_return}
                onChange={e => setForm(f => ({ ...f, target_return: e.target.value }))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            {/* Entity */}
            <div className="space-y-1.5">
              <label style={labelStyle}>Entity</label>
              <select
                value={form.subsidiary_id}
                onChange={e => setForm(f => ({ ...f, subsidiary_id: e.target.value }))}
                className={inputClass}
                style={inputStyle}>
                {(Array.isArray(subsidiaries) ? subsidiaries : []).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                {subsidiaries.length === 0 && (
                  <option value="">No entities available</option>
                )}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-5 rounded-xl text-[13px] font-semibold transition-colors"
              style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 transition-opacity disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 8px rgba(37,99,235,0.35)" }}>
              {mutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
              ) : (
                <><Plus className="w-3.5 h-3.5" /> Create Fund</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const router = useRouter();
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [showModal, setShowModal] = useState(false);

  const { data: funds = [], isLoading: fundsLoading } = useQuery<Fund[]>({
    queryKey: ["portfolio-funds", subsidId],
    queryFn: () => fetchFunds(subsidId),
    enabled: true,
  });

  const { data: subsidiaries = [] } = useQuery<Subsidiary[]>({
    queryKey: ["org-subsidiaries"],
    queryFn: fetchSubsidiaries,
  });

  // ── Derived stats ──────────────────────────────────────────────────────────

  const totalAUM    = funds.reduce((s, f) => s + f.aum, 0);
  const activeFunds = funds.filter(f => f.status === "active").length;

  const filtered = funds.filter(f => {
    if (activeTab === "all")    return true;
    if (activeTab === "active") return f.status === "active";
    if (activeTab === "closed") return f.status === "closed" || f.status === "suspended";
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
            Investment Portfolios
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {subsidiary?.Name ?? "Page Asset Management"} · Funds & Mandates
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
          style={{
            background:  "linear-gradient(135deg,#2563eb,#1d4ed8)",
            boxShadow:   "0 1px 8px rgba(37,99,235,0.35)",
          }}>
          <Plus className="w-3.5 h-3.5" /> New Fund
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: "Total Funds",
            value: funds.length.toString(),
            sub:   "All funds & mandates",
            color: "#2563eb",
            icon:  Briefcase,
          },
          {
            label: "Total AUM",
            value: fmtAUM(totalAUM, "NGN"),
            sub:   "Aggregate assets under management",
            color: "#059669",
            icon:  BarChart3,
          },
          {
            label: "Active Funds",
            value: activeFunds.toString(),
            sub:   `${funds.length - activeFunds} inactive`,
            color: "#7c3aed",
            icon:  TrendingUp,
          },
        ].map(card => (
          <div key={card.label} className="rounded-2xl overflow-hidden"
               style={{
                 background: "var(--pg-card)",
                 border:     "1px solid var(--pg-card-border)",
                 boxShadow:  "0 1px 4px rgba(0,0,0,0.05)",
               }}>
            <div className="h-[3px]" style={{ background: card.color }} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider"
                   style={{ color: card.color }}>
                  {card.label}
                </p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                     style={{ background: card.color + "15" }}>
                  <card.icon className="w-4 h-4" style={{ color: card.color }} />
                </div>
              </div>
              <p className="text-[22px] font-bold tabular leading-tight"
                 style={{ color: "var(--pg-text-1)" }}>
                {fundsLoading ? "—" : card.value}
              </p>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>
                {card.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit"
           style={{ background: "var(--pg-muted-bg)" }}>
        {(["all", "active", "closed"] as FilterTab[]).map(tab => {
          const count = tab === "all"    ? funds.length
                      : tab === "active" ? funds.filter(f => f.status === "active").length
                      : funds.filter(f => f.status === "closed" || f.status === "suspended").length;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold capitalize transition-all"
              style={{
                background: isActive ? "var(--pg-card)" : "transparent",
                color:      isActive ? "var(--pg-text-1)" : "var(--pg-text-3)",
                boxShadow:  isActive ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}>
              {tab}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isActive ? "#2563eb15" : "transparent",
                      color:      isActive ? "#2563eb"   : "var(--pg-text-3)",
                    }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Fund grid / loading / empty */}
      {fundsLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState filter={activeTab} onNew={() => setShowModal(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(fund => (
            <FundCard
              key={fund.id}
              fund={fund}
              onClick={() => router.push(`/wm/portfolio/${fund.id}`)}
            />
          ))}
        </div>
      )}

      {/* Legend / info strip */}
      {!fundsLoading && funds.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap pt-2">
          {(Object.entries(FUND_TYPE_LABEL) as [FundType, string][]).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: FUND_TYPE_COLOR[type].bg,
                      color:      FUND_TYPE_COLOR[type].color,
                    }}>
                {label}
              </span>
            </div>
          ))}
          <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
            · {funds.length} fund{funds.length !== 1 ? "s" : ""} · AUM {fmtAUM(totalAUM, "NGN")}
          </span>
        </div>
      )}

      {/* New Fund Modal */}
      {showModal && (
        <NewFundModal
          subsidiaries={subsidiaries}
          defaultSubsidiaryId={subsidId}
          onClose={() => setShowModal(false)}
          onCreated={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
