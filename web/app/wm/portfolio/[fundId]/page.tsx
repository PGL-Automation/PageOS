"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Loader2, AlertCircle, TrendingUp, TrendingDown,
  RefreshCw, Plus, Search, DollarSign, BarChart3, Activity,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type Fund = {
  id: string;
  code: string;
  name: string;
  fund_type: string;
  benchmark: string;
  currency: string;
  inception_date: string;
  target_return?: number;
  status: string;
  aum: number;
  created_by_name: string;
};

type Holding = {
  id: string;
  fund_id: string;
  instrument_id: string;
  ticker: string;
  instrument_name: string;
  asset_class: string;
  quantity: number;
  avg_cost: number;
  book_value: number;
  market_price?: number;
  market_value?: number;
  unrealized_pnl?: number;
  last_priced_at?: string;
};

type Transaction = {
  id: string;
  fund_id: string;
  instrument_id?: string;
  ticker?: string;
  instrument_name?: string;
  txn_type: string;
  trade_date: string;
  quantity?: number;
  price?: number;
  gross_amount: number;
  fees: number;
  net_amount: number;
  realized_pnl: number;
  reference: string;
  narration: string;
  status: string;
  created_by_name: string;
  created_at: string;
};

type Instrument = {
  id: string;
  ticker: string;
  name: string;
  asset_class: string;
  exchange: string;
  gl_account_code: string;
};

type AllocationRow = {
  asset_class: string;
  book_value: number;
  market_value: number;
  pct: number;
};

type PortfolioSummary = {
  fund_id: string;
  fund_name: string;
  total_book_value: number;
  total_market_value: number;
  total_unrealized_pnl: number;
  asset_allocation: AllocationRow[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `${sign}₦${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${sign}₦${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₦${abs.toFixed(2)}`;
}

function fmtFull(n: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtNum(n: number, dp = 2): string {
  return n.toLocaleString("en-NG", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

const ALLOCATION_COLORS: Record<string, string> = {
  "Equities":         "#FF6600",
  "Fixed Income":     "#059669",
  "Money Market":     "#d97706",
  "Real Estate":      "#7c3aed",
  "Alternatives":     "#0891b2",
  "Cash":             "#94a3b8",
};

function allocationColor(cls: string): string {
  return ALLOCATION_COLORS[cls] ?? "#64748b";
}

const TXN_TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  buy:       { label: "Buy",      color: "#E05500", bg: "#fff0e0" },
  sell:      { label: "Sell",     color: "#b45309", bg: "#fef3c7" },
  dividend:  { label: "Dividend", color: "#059669", bg: "#d1fae5" },
  coupon:    { label: "Coupon",   color: "#047857", bg: "#d1fae5" },
  interest:  { label: "Interest", color: "#0369a1", bg: "#e0f2fe" },
};

const TXN_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Pending",   color: "#d97706", bg: "#fef3c7" },
  settled:   { label: "Settled",   color: "#059669", bg: "#d1fae5" },
  cancelled: { label: "Cancelled", color: "#dc2626", bg: "#fee2e2" },
};

const BANK_ACCOUNTS = [
  { code: "1110", label: "1110 — Zenith Bank" },
  { code: "1111", label: "1111 — GTBank" },
  { code: "1112", label: "1112 — Access Bank" },
  { code: "1113", label: "1113 — First Bank" },
  { code: "1114", label: "1114 — UBA" },
];

// ── API fetch ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── Badge components ──────────────────────────────────────────────────────────

function TxnTypeBadge({ type }: { type: string }) {
  const cfg = TXN_TYPE_CFG[type] ?? { label: type, color: "#64748b", bg: "#f1f5f9" };
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function TxnStatusBadge({ status }: { status: string }) {
  const cfg = TXN_STATUS_CFG[status] ?? { label: status, color: "#64748b", bg: "#f1f5f9" };
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({
  summary,
  holdings,
  totalMV,
}: {
  summary: PortfolioSummary | undefined;
  holdings: Holding[];
  totalMV: number;
}) {
  const allocation = summary?.asset_allocation ?? [];

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "Total Market Value",
            value: summary ? fmtCompact(summary.total_market_value) : "—",
            sub: summary ? fmtFull(summary.total_market_value) : "",
            icon: DollarSign,
            color: "#FF6600",
            bg: "#fff0e0",
          },
          {
            label: "Unrealised P&L",
            value: summary ? fmtCompact(summary.total_unrealized_pnl) : "—",
            sub: summary ? fmtFull(summary.total_unrealized_pnl) : "",
            icon: summary && summary.total_unrealized_pnl >= 0 ? TrendingUp : TrendingDown,
            color: summary && summary.total_unrealized_pnl >= 0 ? "#059669" : "#dc2626",
            bg: summary && summary.total_unrealized_pnl >= 0 ? "#d1fae5" : "#fee2e2",
          },
          {
            label: "Book Value",
            value: summary ? fmtCompact(summary.total_book_value) : "—",
            sub: summary ? fmtFull(summary.total_book_value) : "",
            icon: BarChart3,
            color: "#7c3aed",
            bg: "#ede9fe",
          },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-5 flex items-start gap-4"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                 style={{ background: s.bg }}>
              <s.icon className="w-5 h-5" style={{ color: s.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>{s.label}</p>
              <p className="text-[22px] font-bold leading-tight mt-0.5 tabular-nums" style={{ color: s.color }}>{s.value}</p>
              {s.sub && <p className="text-[10px] mt-0.5 font-mono truncate" style={{ color: "var(--pg-text-4)" }}>{s.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Asset allocation */}
      {allocation.length > 0 && (
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Asset Allocation</h2>
          </div>
          <div className="p-5 space-y-3.5">
            {allocation.map(row => (
              <div key={row.asset_class}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium" style={{ color: "var(--pg-text-1)" }}>{row.asset_class}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono" style={{ color: "var(--pg-text-3)" }}>
                      {fmtCompact(row.market_value)}
                    </span>
                    <span className="text-[12px] font-bold tabular-nums w-12 text-right"
                          style={{ color: allocationColor(row.asset_class) }}>
                      {row.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--pg-muted-bg)" }}>
                  <div className="h-2 rounded-full transition-all duration-500"
                       style={{ width: `${Math.min(row.pct, 100)}%`, background: allocationColor(row.asset_class) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holdings table */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Holdings <span className="font-normal text-[12px]" style={{ color: "var(--pg-text-3)" }}>({holdings.length})</span>
          </h2>
        </div>

        {holdings.length === 0 ? (
          <div className="py-12 text-center">
            <Activity className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--pg-text-4)" }} />
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No holdings in this fund yet.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="grid items-center gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                 style={{
                   gridTemplateColumns: "1fr 100px 110px 110px 120px 110px 90px",
                   background: "var(--pg-muted-bg)",
                   color: "var(--pg-text-3)",
                   borderBottom: "1px solid var(--pg-row-border)",
                 }}>
              <span>Instrument</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Avg Cost</span>
              <span className="text-right">Book Value</span>
              <span className="text-right">Market Value</span>
              <span className="text-right">Unrealised P&L</span>
              <span className="text-right">% Portfolio</span>
            </div>

            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {holdings.map(h => {
                const pnl   = h.unrealized_pnl ?? 0;
                const pnlPos = pnl >= 0;
                const mv    = h.market_value ?? h.book_value;
                const pct   = totalMV > 0 ? (mv / totalMV) * 100 : 0;

                return (
                  <div key={h.id}
                       className="grid items-center gap-3 px-5 py-3.5 transition-colors"
                       style={{ gridTemplateColumns: "1fr 100px 110px 110px 120px 110px 90px" }}
                       onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                       onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] font-bold font-mono"
                              style={{ color: "var(--pg-text-1)" }}>{h.ticker}</code>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
                          {h.asset_class}
                        </span>
                      </div>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                        {h.instrument_name}
                      </p>
                    </div>
                    <p className="text-[12px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                      {fmtNum(h.quantity, 0)}
                    </p>
                    <p className="text-[12px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                      {fmtFull(h.avg_cost)}
                    </p>
                    <p className="text-[12px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                      {fmtCompact(h.book_value)}
                    </p>
                    <p className="text-[12px] font-mono font-semibold text-right" style={{ color: "var(--pg-text-1)" }}>
                      {h.market_value != null ? fmtCompact(h.market_value) : "—"}
                    </p>
                    <div className="text-right">
                      {h.unrealized_pnl != null ? (
                        <div className="flex items-center justify-end gap-1">
                          {pnlPos
                            ? <TrendingUp className="w-3 h-3" style={{ color: "#059669" }} />
                            : <TrendingDown className="w-3 h-3" style={{ color: "#dc2626" }} />
                          }
                          <p className="text-[12px] font-mono font-semibold"
                             style={{ color: pnlPos ? "#059669" : "#dc2626" }}>
                            {pnlPos ? "+" : ""}{fmtCompact(pnl)}
                          </p>
                        </div>
                      ) : <p className="text-[12px]" style={{ color: "var(--pg-text-4)" }}>—</p>}
                    </div>
                    <p className="text-[12px] font-mono font-semibold text-right" style={{ color: "var(--pg-text-3)" }}>
                      {pct.toFixed(1)}%
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab: Transactions ─────────────────────────────────────────────────────────

function TransactionsTab({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
          Trade Blotter <span className="font-normal text-[12px]" style={{ color: "var(--pg-text-3)" }}>({transactions.length})</span>
        </h2>
      </div>

      {transactions.length === 0 ? (
        <div className="py-12 text-center">
          <Activity className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No transactions yet.</p>
        </div>
      ) : (
        <>
          <div className="grid items-center gap-2 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
               style={{
                 gridTemplateColumns: "90px 1fr 70px 80px 90px 100px 80px 100px 90px 80px",
                 background: "var(--pg-muted-bg)",
                 color: "var(--pg-text-3)",
                 borderBottom: "1px solid var(--pg-row-border)",
               }}>
            <span>Date</span>
            <span>Instrument</span>
            <span>Type</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Gross</span>
            <span className="text-right">Fees</span>
            <span className="text-right">Net</span>
            <span className="text-right">P&L</span>
            <span>Status</span>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {transactions.map(t => (
              <div key={t.id}
                   className="grid items-center gap-2 px-5 py-3 transition-colors"
                   style={{ gridTemplateColumns: "90px 1fr 70px 80px 90px 100px 80px 100px 90px 80px" }}
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <p className="text-[11px]" style={{ color: "var(--pg-text-2)" }}>{fmtDate(t.trade_date)}</p>
                <div className="min-w-0">
                  {t.ticker
                    ? <code className="text-[11px] font-bold font-mono" style={{ color: "var(--pg-text-1)" }}>{t.ticker}</code>
                    : <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{t.instrument_name ?? "—"}</span>}
                </div>
                <TxnTypeBadge type={t.txn_type} />
                <p className="text-[12px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                  {t.quantity != null ? fmtNum(t.quantity, 0) : "—"}
                </p>
                <p className="text-[12px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                  {t.price != null ? fmtFull(t.price) : "—"}
                </p>
                <p className="text-[12px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                  {fmtCompact(t.gross_amount)}
                </p>
                <p className="text-[12px] font-mono text-right" style={{ color: "var(--pg-text-3)" }}>
                  {t.fees > 0 ? fmtCompact(t.fees) : "—"}
                </p>
                <p className="text-[12px] font-mono font-semibold text-right" style={{ color: "var(--pg-text-1)" }}>
                  {fmtCompact(t.net_amount)}
                </p>
                <p className="text-[12px] font-mono text-right"
                   style={{ color: t.realized_pnl > 0 ? "#059669" : t.realized_pnl < 0 ? "#dc2626" : "var(--pg-text-4)" }}>
                  {t.realized_pnl !== 0
                    ? `${t.realized_pnl > 0 ? "+" : ""}${fmtCompact(t.realized_pnl)}`
                    : "—"}
                </p>
                <TxnStatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Trade Booking ────────────────────────────────────────────────────────

function TradeTab({
  fundId,
  instruments,
}: {
  fundId: string;
  instruments: Instrument[];
}) {
  const { toast }      = useToast();
  const queryClient    = useQueryClient();

  // Trade form state
  const [tradeInstrumentId, setTradeInstrumentId] = useState("");
  const [tradeSide, setTradeSide]                 = useState<"buy" | "sell">("buy");
  const [tradeDate, setTradeDate]                 = useState(new Date().toISOString().slice(0, 10));
  const [settlementDate, setSettlementDate]       = useState("");
  const [quantity, setQuantity]                   = useState("");
  const [price, setPrice]                         = useState("");
  const [fees, setFees]                           = useState("");
  const [bankAccount, setBankAccount]             = useState("1110");
  const [narration, setNarration]                 = useState("");
  const [instrSearch, setInstrSearch]             = useState("");

  // Income form state
  const [incomeInstrumentId, setIncomeInstrumentId] = useState("");
  const [incomeType, setIncomeType]                 = useState<"dividend" | "coupon" | "interest">("dividend");
  const [incomeDate, setIncomeDate]                 = useState(new Date().toISOString().slice(0, 10));
  const [incomeAmount, setIncomeAmount]             = useState("");
  const [incomeBankAccount, setIncomeBankAccount]   = useState("1110");
  const [incomeNarration, setIncomeNarration]       = useState("");
  const [incomeInstrSearch, setIncomeInstrSearch]   = useState("");

  const filteredInstrs = instruments.filter(i =>
    instrSearch === "" ||
    i.ticker.toLowerCase().includes(instrSearch.toLowerCase()) ||
    i.name.toLowerCase().includes(instrSearch.toLowerCase())
  );

  const filteredIncomeInstrs = instruments.filter(i =>
    incomeInstrSearch === "" ||
    i.ticker.toLowerCase().includes(incomeInstrSearch.toLowerCase()) ||
    i.name.toLowerCase().includes(incomeInstrSearch.toLowerCase())
  );

  const tradeMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<Transaction>("/api/v1/portfolio/trades", {
        method: "POST", body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund-transactions", fundId] });
      queryClient.invalidateQueries({ queryKey: ["fund-holdings", fundId] });
      queryClient.invalidateQueries({ queryKey: ["fund-summary", fundId] });
      toast({ title: "Trade booked successfully" });
      setTradeInstrumentId(""); setQuantity(""); setPrice(""); setFees(""); setNarration(""); setInstrSearch("");
    },
    onError: (err) => toast({ title: "Trade failed", description: (err as Error).message, variant: "destructive" }),
  });

  const incomeMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<Transaction>("/api/v1/portfolio/income", {
        method: "POST", body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund-transactions", fundId] });
      toast({ title: "Income recorded successfully" });
      setIncomeInstrumentId(""); setIncomeAmount(""); setIncomeNarration(""); setIncomeInstrSearch("");
    },
    onError: (err) => toast({ title: "Income recording failed", description: (err as Error).message, variant: "destructive" }),
  });

  function submitTrade(e: React.FormEvent) {
    e.preventDefault();
    if (!tradeInstrumentId) { toast({ title: "Select an instrument", variant: "destructive" }); return; }
    tradeMutation.mutate({
      fund_id: fundId,
      instrument_id: tradeInstrumentId,
      txn_type: tradeSide,
      trade_date: tradeDate,
      ...(settlementDate ? { settlement_date: settlementDate } : {}),
      quantity: parseFloat(quantity),
      price: parseFloat(price),
      ...(fees ? { fees: parseFloat(fees) } : {}),
      bank_account_code: bankAccount,
      ...(narration ? { narration } : {}),
    });
  }

  function submitIncome(e: React.FormEvent) {
    e.preventDefault();
    incomeMutation.mutate({
      fund_id: fundId,
      ...(incomeInstrumentId ? { instrument_id: incomeInstrumentId } : {}),
      income_type: incomeType,
      date: incomeDate,
      amount: parseFloat(incomeAmount),
      ...(incomeBankAccount ? { bank_account_code: incomeBankAccount } : {}),
      ...(incomeNarration ? { narration: incomeNarration } : {}),
    });
  }

  const selectedInstr = instruments.find(i => i.id === tradeInstrumentId);
  const selectedIncomeInstr = instruments.find(i => i.id === incomeInstrumentId);

  const inputCls = "w-full h-9 px-3 rounded-xl text-[13px] outline-none";
  const inputStyle = { background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" };
  const labelCls = "block text-[11px] font-bold uppercase tracking-wider mb-1.5";

  return (
    <div className="grid xl:grid-cols-2 gap-5">

      {/* Trade form */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <Plus className="w-4 h-4" style={{ color: "#FF6600" }} />
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Book Trade</h2>
        </div>

        <form onSubmit={submitTrade} className="p-5 space-y-4">
          {/* Instrument search */}
          <div>
            <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Instrument *</label>
            <div className="relative mb-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />
              <input
                value={instrSearch}
                onChange={e => { setInstrSearch(e.target.value); setTradeInstrumentId(""); }}
                placeholder="Search by ticker or name…"
                className="w-full h-9 pl-8 pr-3 rounded-xl text-[13px] outline-none"
                style={inputStyle}
              />
            </div>
            {instrSearch && !selectedInstr && filteredInstrs.length > 0 && (
              <div className="rounded-xl overflow-hidden mt-1"
                   style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
                {filteredInstrs.slice(0, 6).map(i => (
                  <button key={i.id} type="button"
                          onClick={() => { setTradeInstrumentId(i.id); setInstrSearch(`${i.ticker} — ${i.name}`); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                    <code className="text-[11px] font-bold font-mono w-16 shrink-0" style={{ color: "var(--pg-text-2)" }}>{i.ticker}</code>
                    <span className="text-[12px] flex-1 truncate" style={{ color: "var(--pg-text-1)" }}>{i.name}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>{i.asset_class}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedInstr && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                   style={{ background: "#fff7f0", border: "1px solid #fed7aa" }}>
                <code className="text-[11px] font-bold text-orange-700">{selectedInstr.ticker}</code>
                <span className="text-[12px] text-blue-800 flex-1">{selectedInstr.name}</span>
                <span className="text-[9px] font-bold text-orange-600">{selectedInstr.exchange}</span>
              </div>
            )}
          </div>

          {/* Side */}
          <div>
            <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Side *</label>
            <div className="flex gap-2">
              {(["buy", "sell"] as const).map(side => (
                <button key={side} type="button" onClick={() => setTradeSide(side)}
                        className="flex-1 h-9 rounded-xl text-[13px] font-semibold capitalize transition-all"
                        style={tradeSide === side
                          ? side === "buy"
                            ? { background: "#fff0e0", color: "#E05500", border: "2px solid #ffb380" }
                            : { background: "#fef3c7", color: "#b45309", border: "2px solid #fcd34d" }
                          : { border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                  {side}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Trade Date *</label>
              <input type="date" value={tradeDate} onChange={e => setTradeDate(e.target.value)}
                     required className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Settlement Date</label>
              <input type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)}
                     className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Qty + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Quantity *</label>
              <input type="number" min="0" step="1" value={quantity}
                     onChange={e => setQuantity(e.target.value)} required
                     placeholder="0" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Price (₦) *</label>
              <input type="number" min="0" step="0.01" value={price}
                     onChange={e => setPrice(e.target.value)} required
                     placeholder="0.00" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Fees + Bank */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Fees (₦)</label>
              <input type="number" min="0" step="0.01" value={fees}
                     onChange={e => setFees(e.target.value)}
                     placeholder="0.00" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Bank Account</label>
              <select value={bankAccount} onChange={e => setBankAccount(e.target.value)}
                      className={inputCls + " appearance-none"} style={inputStyle}>
                {BANK_ACCOUNTS.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
              </select>
            </div>
          </div>

          {/* Gross preview */}
          {quantity && price && (
            <div className="px-3 py-2 rounded-xl text-[12px] font-mono"
                 style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
              Gross: {fmtFull(parseFloat(quantity) * parseFloat(price))}
              {fees && ` — Fees: ${fmtFull(parseFloat(fees))} = Net: ${fmtFull(parseFloat(quantity) * parseFloat(price) - parseFloat(fees || "0"))}`}
            </div>
          )}

          {/* Narration */}
          <div>
            <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Narration</label>
            <input type="text" value={narration} onChange={e => setNarration(e.target.value)}
                   placeholder="Optional note…" className={inputCls} style={inputStyle} />
          </div>

          <button type="submit"
                  disabled={tradeMutation.isPending || !tradeInstrumentId}
                  className="w-full h-10 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: tradeSide === "buy"
                    ? "linear-gradient(135deg,#FF6600,#E05500)"
                    : "linear-gradient(135deg,#d97706,#b45309)" }}>
            {tradeMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</>
              : <><Plus className="w-4 h-4" /> Book {tradeSide === "buy" ? "Buy" : "Sell"}</>
            }
          </button>
        </form>
      </div>

      {/* Income form */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <DollarSign className="w-4 h-4" style={{ color: "#059669" }} />
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Record Income</h2>
        </div>

        <form onSubmit={submitIncome} className="p-5 space-y-4">
          {/* Income type */}
          <div>
            <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Income Type *</label>
            <div className="flex gap-2">
              {(["dividend", "coupon", "interest"] as const).map(t => (
                <button key={t} type="button" onClick={() => setIncomeType(t)}
                        className="flex-1 h-9 rounded-xl text-[12px] font-semibold capitalize transition-all"
                        style={incomeType === t
                          ? { background: "#d1fae5", color: "#059669", border: "2px solid #6ee7b7" }
                          : { border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Instrument (optional) */}
          <div>
            <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Instrument (optional)</label>
            <div className="relative mb-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />
              <input
                value={incomeInstrSearch}
                onChange={e => { setIncomeInstrSearch(e.target.value); setIncomeInstrumentId(""); }}
                placeholder="Search by ticker or name…"
                className="w-full h-9 pl-8 pr-3 rounded-xl text-[13px] outline-none"
                style={inputStyle}
              />
            </div>
            {incomeInstrSearch && !selectedIncomeInstr && filteredIncomeInstrs.length > 0 && (
              <div className="rounded-xl overflow-hidden mt-1"
                   style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
                {filteredIncomeInstrs.slice(0, 6).map(i => (
                  <button key={i.id} type="button"
                          onClick={() => { setIncomeInstrumentId(i.id); setIncomeInstrSearch(`${i.ticker} — ${i.name}`); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                    <code className="text-[11px] font-bold font-mono w-16 shrink-0" style={{ color: "var(--pg-text-2)" }}>{i.ticker}</code>
                    <span className="text-[12px] flex-1 truncate" style={{ color: "var(--pg-text-1)" }}>{i.name}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedIncomeInstr && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                   style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                <code className="text-[11px] font-bold text-emerald-700">{selectedIncomeInstr.ticker}</code>
                <span className="text-[12px] text-emerald-800 flex-1">{selectedIncomeInstr.name}</span>
              </div>
            )}
          </div>

          {/* Date + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Date *</label>
              <input type="date" value={incomeDate} onChange={e => setIncomeDate(e.target.value)}
                     required className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Amount (₦) *</label>
              <input type="number" min="0" step="0.01" value={incomeAmount}
                     onChange={e => setIncomeAmount(e.target.value)} required
                     placeholder="0.00" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Bank account */}
          <div>
            <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Bank Account</label>
            <select value={incomeBankAccount} onChange={e => setIncomeBankAccount(e.target.value)}
                    className={inputCls + " appearance-none"} style={inputStyle}>
              {BANK_ACCOUNTS.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
            </select>
          </div>

          {/* Narration */}
          <div>
            <label className={labelCls} style={{ color: "var(--pg-text-3)" }}>Narration</label>
            <input type="text" value={incomeNarration} onChange={e => setIncomeNarration(e.target.value)}
                   placeholder="Optional note…" className={inputCls} style={inputStyle} />
          </div>

          <button type="submit"
                  disabled={incomeMutation.isPending}
                  className="w-full h-10 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
            {incomeMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Recording…</>
              : <><Plus className="w-4 h-4" /> Record Income</>
            }
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Tab: Update Prices ────────────────────────────────────────────────────────

function UpdatePricesTab({
  holdings,
  fundId,
}: {
  holdings: Holding[];
  fundId: string;
}) {
  const { toast }   = useToast();
  const queryClient = useQueryClient();

  const [prices, setPrices] = useState<Record<string, string>>({});

  const updateMutation = useMutation({
    mutationFn: (payload: { instrument_id: string; price: number; price_date?: string }[]) =>
      apiFetch<unknown>("/api/v1/portfolio/prices", {
        method: "POST", body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund-holdings", fundId] });
      queryClient.invalidateQueries({ queryKey: ["fund-summary", fundId] });
      toast({ title: "Prices updated successfully" });
      setPrices({});
    },
    onError: (err) => toast({ title: "Price update failed", description: (err as Error).message, variant: "destructive" }),
  });

  function submitPrices(e: React.FormEvent) {
    e.preventDefault();
    const payload = Object.entries(prices)
      .filter(([, v]) => v !== "" && !isNaN(parseFloat(v)))
      .map(([instrument_id, p]) => ({ instrument_id, price: parseFloat(p) }));
    if (payload.length === 0) {
      toast({ title: "No prices entered", variant: "destructive" });
      return;
    }
    updateMutation.mutate(payload);
  }

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" style={{ color: "#7c3aed" }} />
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Update Market Prices</h2>
        </div>
        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
          {Object.values(prices).filter(v => v !== "").length} prices entered
        </p>
      </div>

      {holdings.length === 0 ? (
        <div className="py-12 text-center">
          <RefreshCw className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No holdings to price.</p>
        </div>
      ) : (
        <form onSubmit={submitPrices}>
          {/* Header */}
          <div className="grid items-center gap-4 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
               style={{
                 gridTemplateColumns: "1fr 80px 120px 130px 140px",
                 background: "var(--pg-muted-bg)",
                 color: "var(--pg-text-3)",
                 borderBottom: "1px solid var(--pg-row-border)",
               }}>
            <span>Instrument</span>
            <span>Class</span>
            <span className="text-right">Current Price</span>
            <span className="text-right">Last Updated</span>
            <span className="text-right">New Price (₦)</span>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {holdings.map(h => (
              <div key={h.id}
                   className="grid items-center gap-4 px-5 py-3.5"
                   style={{ gridTemplateColumns: "1fr 80px 120px 130px 140px" }}>
                <div className="min-w-0">
                  <code className="text-[12px] font-bold font-mono" style={{ color: "var(--pg-text-1)" }}>{h.ticker}</code>
                  <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-3)" }}>{h.instrument_name}</p>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full self-start mt-0.5"
                      style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
                  {h.asset_class}
                </span>
                <p className="text-[12px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                  {h.market_price != null ? fmtFull(h.market_price) : "—"}
                </p>
                <p className="text-[11px] text-right" style={{ color: "var(--pg-text-4)" }}>
                  {h.last_priced_at ? fmtDate(h.last_priced_at) : "Never"}
                </p>
                <input
                  type="number" min="0" step="0.01"
                  value={prices[h.instrument_id] ?? ""}
                  onChange={e => setPrices(prev => ({ ...prev, [h.instrument_id]: e.target.value }))}
                  placeholder={h.market_price != null ? fmtNum(h.market_price) : "0.00"}
                  className="w-full h-8 px-2.5 rounded-lg text-[12px] font-mono text-right outline-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                />
              </div>
            ))}
          </div>

          <div className="px-5 py-4" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="submit"
                    disabled={updateMutation.isPending}
                    className="flex items-center gap-2 h-10 px-6 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
              {updateMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                : <><RefreshCw className="w-4 h-4" /> Update All Prices</>
              }
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type TabId = "overview" | "transactions" | "trade" | "prices";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview",      label: "Overview"        },
  { id: "transactions",  label: "Transactions"    },
  { id: "trade",         label: "Trade"           },
  { id: "prices",        label: "Update Prices"   },
];

const FUND_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: "Active",    color: "#059669", bg: "#d1fae5" },
  inactive:  { label: "Inactive",  color: "#94a3b8", bg: "#f1f5f9" },
  closed:    { label: "Closed",    color: "#dc2626", bg: "#fee2e2" },
  winding_up:{ label: "Winding Up",color: "#d97706", bg: "#fef3c7" },
};

export default function FundDetailPage() {
  const { fundId } = useParams<{ fundId: string }>();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: fund, isLoading: fundLoading, error: fundError } = useQuery<Fund>({
    queryKey: ["fund", fundId],
    queryFn: () => apiFetch<Fund>(`/api/v1/portfolio/funds/${fundId}`),
    enabled: !!fundId,
  });

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["fund-holdings", fundId],
    queryFn: () => apiFetch<Holding[]>(`/api/v1/portfolio/funds/${fundId}/holdings`),
    enabled: !!fundId,
  });

  const { data: summary } = useQuery<PortfolioSummary>({
    queryKey: ["fund-summary", fundId],
    queryFn: () => apiFetch<PortfolioSummary>(`/api/v1/portfolio/funds/${fundId}/summary`),
    enabled: !!fundId,
  });

  const { data: transactions = [], isLoading: txnsLoading } = useQuery<Transaction[]>({
    queryKey: ["fund-transactions", fundId],
    queryFn: () => apiFetch<Transaction[]>(`/api/v1/portfolio/transactions?fund_id=${fundId}&limit=50`),
    enabled: !!fundId,
  });

  const { data: instruments = [] } = useQuery<Instrument[]>({
    queryKey: ["instruments"],
    queryFn: () => apiFetch<Instrument[]>("/api/v1/portfolio/instruments"),
  });

  const totalMV = summary?.total_market_value
    ?? holdings.reduce((s, h) => s + (h.market_value ?? h.book_value), 0);

  if (fundLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  if (fundError || !fund) {
    return (
      <div className="flex h-[60vh] items-center justify-center flex-col gap-3">
        <AlertCircle className="w-8 h-8" style={{ color: "#dc2626" }} />
        <p className="text-[14px] font-medium" style={{ color: "var(--pg-text-2)" }}>
          Fund not found or could not be loaded.
        </p>
        <Link href="/wm/portfolio"
              className="text-[13px] font-semibold"
              style={{ color: "#FF6600" }}>
          Back to Portfolios
        </Link>
      </div>
    );
  }

  const statusCfg = FUND_STATUS_CFG[fund.status] ?? { label: fund.status, color: "#475569", bg: "#f1f5f9" };

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/wm/portfolio"
                className="flex items-center gap-1.5 text-[12px] mb-2 transition-colors"
                style={{ color: "var(--pg-text-3)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#FF6600"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--pg-text-3)"}>
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to Portfolios
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              {fund.name}
            </h1>
            <code className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-lg"
                  style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
              {fund.code}
            </code>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: statusCfg.bg, color: statusCfg.color }}>
              {statusCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              {fund.fund_type}
            </span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              Benchmark: <strong style={{ color: "var(--pg-text-2)" }}>{fund.benchmark || "—"}</strong>
            </span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              Currency: <strong style={{ color: "var(--pg-text-2)" }}>{fund.currency}</strong>
            </span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              Inception: <strong style={{ color: "var(--pg-text-2)" }}>{fmtDate(fund.inception_date)}</strong>
            </span>
            {fund.target_return != null && (
              <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                Target Return: <strong style={{ color: "#059669" }}>{fund.target_return.toFixed(1)}%</strong>
              </span>
            )}
          </div>
        </div>

        {/* AUM badge */}
        <div className="rounded-2xl px-5 py-3 text-right shrink-0"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>AUM</p>
          <p className="text-[22px] font-bold tabular-nums" style={{ color: "var(--pg-text-1)" }}>
            {fmtCompact(fund.aum)}
          </p>
          <p className="text-[10px] font-mono" style={{ color: "var(--pg-text-4)" }}>
            {fmtFull(fund.aum)}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        {TABS.map(tab => (
          <button key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="h-8 px-4 rounded-lg text-[12px] font-medium transition-all"
                  style={activeTab === tab.id
                    ? { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "white" }
                    : { color: "var(--pg-text-2)" }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading state for tab content */}
      {(holdingsLoading || txnsLoading) && activeTab !== "trade" && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
        </div>
      )}

      {/* Tab content */}
      {!holdingsLoading && !txnsLoading && (
        <>
          {activeTab === "overview" && (
            <OverviewTab summary={summary} holdings={holdings} totalMV={totalMV} />
          )}
          {activeTab === "transactions" && (
            <TransactionsTab transactions={transactions} />
          )}
          {activeTab === "trade" && (
            <TradeTab fundId={fundId} instruments={instruments} />
          )}
          {activeTab === "prices" && (
            <UpdatePricesTab holdings={holdings} fundId={fundId} />
          )}
        </>
      )}
    </div>
  );
}
