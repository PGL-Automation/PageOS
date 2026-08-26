"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Loader2, AlertCircle, TrendingUp, TrendingDown,
  ArrowDownLeft, ArrowUpRight, X, Activity,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

const BANK_ACCOUNTS = [
  { code: "1110", label: "1110 — Zenith Bank" },
  { code: "1111", label: "1111 — GTBank" },
  { code: "1112", label: "1112 — Access Bank" },
  { code: "1113", label: "1113 — First Bank" },
  { code: "1114", label: "1114 — UBA" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientAccount = {
  id: string;
  account_number: string;
  client_id: string;
  client_name: string;
  fund_id: string;
  fund_name: string;
  fund_type: string;
  currency: string;
  units_held: number;
  invested_amount: number;
  current_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  rm_name: string;
  status: string;
  opened_date: string;
  closed_date?: string;
  created_by_name: string;
};

type ClientTransaction = {
  id: string;
  account_id: string;
  account_number: string;
  client_name: string;
  txn_type: "subscription" | "redemption" | "dividend_distribution" | "fee_charge" | "revaluation";
  txn_date: string;
  amount: number;
  units: number;
  nav_per_unit: number;
  fees: number;
  net_amount: number;
  running_balance: number;
  reference: string;
  narration: string;
  status: string;
  journal_id?: string;
  created_by_name: string;
  created_at: string;
};

type SubscribeBody = {
  amount: number;
  fees?: number;
  txn_date: string;
  nav_per_unit?: number;
  bank_account_code?: string;
  narration?: string;
};

type RedeemBody = {
  amount?: number;
  units?: number;
  fees?: number;
  txn_date: string;
  nav_per_unit?: number;
  bank_account_code?: string;
  narration?: string;
};

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtNaira(n: number): string {
  return "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUnits(n: number): string {
  return n.toLocaleString("en-NG", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function pctReturn(invested: number, current: number): string {
  if (invested === 0) return "0.00%";
  const pct = ((current - invested) / Math.abs(invested)) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } })) as {
      error?: { message?: string };
    };
    throw new Error(err?.error?.message ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── TXN type badge config ─────────────────────────────────────────────────────

const TXN_CFG: Record<ClientTransaction["txn_type"], { label: string; color: string; bg: string }> = {
  subscription:          { label: "Subscription",    color: "#065f46", bg: "#d1fae5" },
  redemption:            { label: "Redemption",      color: "#991b1b", bg: "#fee2e2" },
  dividend_distribution: { label: "Dividend",        color: "#1e40af", bg: "#dbeafe" },
  fee_charge:            { label: "Fee",             color: "#92400e", bg: "#fef3c7" },
  revaluation:           { label: "Revaluation",     color: "#4c1d95", bg: "#ede9fe" },
};

function TxnBadge({ type }: { type: ClientTransaction["txn_type"] }) {
  const cfg = TXN_CFG[type] ?? { label: type, color: "#475569", bg: "#f1f5f9" };
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  active:   { label: "Active",   color: "#065f46", bg: "#d1fae5" },
  closed:   { label: "Closed",   color: "#475569", bg: "#f1f5f9" },
  suspended:{ label: "Suspended",color: "#92400e", bg: "#fef3c7" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: "#475569", bg: "#f1f5f9" };
  return (
    <span
      className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ── Shared modal wrapper ──────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--pg-card-border)" }}
        >
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>{title}</h2>
            {subtitle && (
              <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: "var(--pg-muted-bg)" }}
          >
            <X className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Subscription Modal ────────────────────────────────────────────────────────

function SubscriptionModal({
  accountId,
  accountNumber,
  onClose,
}: {
  accountId: string;
  accountNumber: string;
  onClose: () => void;
}) {
  const { toast }   = useToast();
  const queryClient = useQueryClient();

  const [amount, setAmount]           = useState("");
  const [fees, setFees]               = useState("");
  const [nav, setNav]                 = useState("1.0");
  const [txnDate, setTxnDate]         = useState(new Date().toISOString().slice(0, 10));
  const [bankCode, setBankCode]       = useState("1110");
  const [narration, setNarration]     = useState("");

  const mutation = useMutation({
    mutationFn: (body: SubscribeBody) =>
      apiFetch<ClientTransaction>(`/api/v1/portfolio/accounts/${accountId}/subscribe`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-statement", accountId] });
      queryClient.invalidateQueries({ queryKey: ["client-accounts"] });
      toast({ title: "Subscription recorded", description: `${fmtNaira(parseFloat(amount))} subscribed to ${accountNumber}` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Subscription failed", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: SubscribeBody = {
      amount: parseFloat(amount),
      txn_date: txnDate,
      ...(fees ? { fees: parseFloat(fees) } : {}),
      ...(nav ? { nav_per_unit: parseFloat(nav) } : {}),
      bank_account_code: bankCode,
      ...(narration.trim() ? { narration: narration.trim() } : {}),
    };
    mutation.mutate(body);
  }

  const inputCls  = "w-full h-9 px-3 rounded-xl text-[13px] outline-none";
  const inputSty  = { background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" };
  const labelSty  = { color: "var(--pg-text-3)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" };

  return (
    <Modal title="New Subscription" subtitle={accountNumber} onClose={onClose}>
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

        {/* Amount */}
        <div className="space-y-1.5">
          <label style={labelSty}>Amount (₦) *</label>
          <input
            type="number" min="0.01" step="0.01" required
            value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" className={inputCls} style={inputSty}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Fees */}
          <div className="space-y-1.5">
            <label style={labelSty}>Fees (₦)</label>
            <input
              type="number" min="0" step="0.01"
              value={fees} onChange={e => setFees(e.target.value)}
              placeholder="0.00" className={inputCls} style={inputSty}
            />
          </div>
          {/* NAV per unit */}
          <div className="space-y-1.5">
            <label style={labelSty}>NAV per Unit</label>
            <input
              type="number" min="0.0001" step="0.0001"
              value={nav} onChange={e => setNav(e.target.value)}
              placeholder="1.0000" className={inputCls} style={inputSty}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Trade date */}
          <div className="space-y-1.5">
            <label style={labelSty}>Trade Date *</label>
            <input
              type="date" required
              value={txnDate} onChange={e => setTxnDate(e.target.value)}
              className={inputCls} style={inputSty}
            />
          </div>
          {/* Bank account */}
          <div className="space-y-1.5">
            <label style={labelSty}>Bank Account</label>
            <select
              value={bankCode} onChange={e => setBankCode(e.target.value)}
              className={inputCls + " appearance-none"} style={inputSty}
            >
              {BANK_ACCOUNTS.map(b => (
                <option key={b.code} value={b.code}>{b.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Units preview */}
        {amount && nav && (
          <div
            className="px-3 py-2 rounded-xl text-[12px] font-mono"
            style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af" }}
          >
            ≈ {fmtUnits(parseFloat(amount) / parseFloat(nav))} units @ NAV {fmtNaira(parseFloat(nav))}
          </div>
        )}

        {/* Narration */}
        <div className="space-y-1.5">
          <label style={labelSty}>Narration</label>
          <input
            type="text"
            value={narration} onChange={e => setNarration(e.target.value)}
            placeholder="Optional note…" className={inputCls} style={inputSty}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button" onClick={onClose}
            className="h-9 px-5 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
          >
            Cancel
          </button>
          <button
            type="submit" disabled={mutation.isPending}
            className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#059669,#047857)", boxShadow: "0 1px 8px rgba(5,150,105,0.35)" }}
          >
            {mutation.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</>
              : <><ArrowDownLeft className="w-3.5 h-3.5" /> Subscribe</>
            }
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Redemption Modal ──────────────────────────────────────────────────────────

// ── Redemption Preview types ──────────────────────────────────────────────────

type RedemptionPreview = {
  account_id: string; account_number: string; client_name: string; fund_name: string;
  investment_date: string; maturity_date?: string;
  days_held: number; days_to_maturity: number;
  is_early_redemption: boolean;
  lock_up_violation: boolean; lock_up_ends_on?: string;
  notice_required: boolean; notice_ends_on?: string;
  requested_amount: number; principal_amount: number;
  full_accrued_interest: number; actual_accrued_interest: number;
  penalty_type: string; penalty_amount: number; penalty_description: string;
  wht_rate: number; wht_amount: number;
  gross_proceeds: number; net_proceeds: number;
  nav_per_unit: number; units_to_redeem: number;
  warnings: string[];
};

// ── RedemptionModal — two-step: preview → confirm ─────────────────────────────

function RedemptionModal({
  accountId, accountNumber, unitsHeld, onClose,
}: {
  accountId: string; accountNumber: string; unitsHeld: number; onClose: () => void;
}) {
  const { toast }   = useToast();
  const qc          = useQueryClient();
  const inputSty    = { background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" };
  const labelSty    = { color: "var(--pg-text-3)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" };
  const inputCls    = "w-full h-9 px-3 rounded-xl text-[13px] outline-none";

  // Step 1 state
  const [amount, setAmount]       = useState("");
  const [nav, setNav]             = useState("1.0");
  const [txnDate, setTxnDate]     = useState(new Date().toISOString().slice(0, 10));
  const [bankCode, setBankCode]   = useState("1110");
  const [destBank, setDestBank]   = useState("");
  const [destAcc, setDestAcc]     = useState("");
  const [narration, setNarration] = useState("");

  // Step 2 — preview
  const [preview, setPreview]         = useState<RedemptionPreview | null>(null);
  const [previewing, setPreviewing]   = useState(false);
  const [confirming, setConfirming]   = useState(false);
  const [previewError, setPreviewError] = useState("");

  async function fetchPreview(e: React.FormEvent) {
    e.preventDefault();
    setPreviewing(true); setPreviewError(""); setPreview(null);
    try {
      const amt = parseFloat(amount) || 0;
      const navVal = parseFloat(nav) || 1;
      const params = new URLSearchParams({ amount: String(amt), nav_per_unit: String(navVal), date: txnDate });
      const res = await fetch(
        `${BASE}/api/v1/portfolio/accounts/${accountId}/redemption-preview?${params}`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? `Error ${res.status}`);
      setPreview(data as RedemptionPreview);
    } catch (err) { setPreviewError((err as Error).message); }
    finally { setPreviewing(false); }
  }

  async function confirmRedemption() {
    if (!preview) return;
    setConfirming(true);
    try {
      await fetch(`${BASE}/api/v1/portfolio/accounts/${accountId}/redeem-confirmed`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_amount: preview.requested_amount,
          nav_per_unit: preview.nav_per_unit,
          request_date: txnDate,
          bank_account_code: bankCode,
          destination_bank_name: destBank,
          destination_account_no: destAcc,
          narration,
        }),
      });
      qc.invalidateQueries({ queryKey: ["client-account-statement", accountId] });
      qc.invalidateQueries({ queryKey: ["client-accounts", accountId] });
      qc.refetchQueries({ queryKey: ["client-account-statement", accountId] });
      toast({ title: "Redemption confirmed", description: `${accountNumber} — ₦${preview.net_proceeds.toLocaleString()} net proceeds` });
      onClose();
    } catch (err) {
      toast({ title: "Redemption failed", description: (err as Error).message, variant: "destructive" });
    } finally { setConfirming(false); }
  }

  const fmtNGN = (n: number) => `₦${Math.abs(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Modal title={preview ? "Redemption Breakdown" : "Initiate Redemption"} subtitle={accountNumber} onClose={onClose}>

      {/* ── STEP 1: Request form ───────────────────────────────────────── */}
      {!preview && (
        <form onSubmit={fetchPreview} className="px-6 py-5 space-y-4">
          {previewError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px]"
                 style={{ background: "#fef2f2", color: "#dc2626" }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {previewError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label style={labelSty}>Redemption Amount (₦) *</label>
              <input type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)}
                     placeholder="0.00 (0 = full)" className={inputCls} style={inputSty} />
            </div>
            <div className="space-y-1.5">
              <label style={labelSty}>NAV per Unit</label>
              <input type="number" min="0.0001" step="0.0001" value={nav} onChange={e => setNav(e.target.value)}
                     placeholder="1.0000" className={inputCls} style={inputSty} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label style={labelSty}>Redemption Date *</label>
            <input type="date" required value={txnDate} onChange={e => setTxnDate(e.target.value)}
                   className={inputCls} style={inputSty} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label style={labelSty}>Pay From (Fund Bank)</label>
              <select value={bankCode} onChange={e => setBankCode(e.target.value)}
                      className={inputCls + " appearance-none"} style={inputSty}>
                {BANK_ACCOUNTS.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label style={labelSty}>Destination Bank</label>
              <input value={destBank} onChange={e => setDestBank(e.target.value)} placeholder="Client's bank name"
                     className={inputCls} style={inputSty} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label style={labelSty}>Destination Account No.</label>
            <input value={destAcc} onChange={e => setDestAcc(e.target.value)} placeholder="Client's bank account number"
                   className={inputCls + " font-mono"} style={inputSty} />
          </div>
          <div className="space-y-1.5">
            <label style={labelSty}>Narration</label>
            <input value={narration} onChange={e => setNarration(e.target.value)} placeholder="Optional"
                   className={inputCls} style={inputSty} />
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="h-9 px-5 rounded-xl text-[13px] font-semibold"
                    style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={previewing}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {previewing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating…</> : "Preview Breakdown →"}
            </button>
          </div>
        </form>
      )}

      {/* ── STEP 2: Penalty breakdown + confirm ───────────────────────── */}
      {preview && (
        <div className="px-6 py-5 space-y-4">

          {/* Lock-up violation — hard block */}
          {preview.lock_up_violation && (
            <div className="rounded-xl p-4" style={{ background: "#fef2f2", border: "2px solid #fca5a5" }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-[13px] font-bold text-red-700">Redemption Blocked — Lock-up Period Active</p>
              </div>
              <p className="text-[12px] text-red-600">
                {preview.lock_up_ends_on
                  ? `This investment cannot be redeemed until ${preview.lock_up_ends_on}. Early redemption is not permitted.`
                  : "Early redemption is not permitted for this fund."}
              </p>
            </div>
          )}

          {/* Early redemption warning */}
          {preview.is_early_redemption && !preview.lock_up_violation && (
            <div className="rounded-xl p-4" style={{ background: "#fffbeb", border: "2px solid #fde68a" }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[13px] font-bold text-amber-800">Early Redemption — Penalty Applies</p>
              </div>
              <p className="text-[12px] text-amber-700">
                {preview.days_held} days held of {preview.days_held + preview.days_to_maturity} day tenor.
                Maturity date: {preview.maturity_date}.
              </p>
              {preview.penalty_description && (
                <p className="text-[12px] text-amber-700 mt-1 font-medium">{preview.penalty_description}</p>
              )}
            </div>
          )}

          {/* Other warnings */}
          {(preview.warnings ?? []).filter(w => !w.includes("Penalty") && !w.includes("lock-up")).map((w, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12px]"
                 style={{ background: "#eff6ff", color: "#1d4ed8" }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
            </div>
          ))}

          {/* Proceeds breakdown table */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pg-card-border)" }}>
            {[
              { label: "Requested Amount",         value: fmtNGN(preview.requested_amount),         dim: false },
              { label: "Principal (Cost Basis)",    value: fmtNGN(preview.principal_amount),          dim: false },
              { label: "Full Accrued Interest",     value: fmtNGN(preview.full_accrued_interest),     dim: !preview.is_early_redemption },
              { label: "Actual Accrued Interest",   value: fmtNGN(preview.actual_accrued_interest),   dim: false },
              { label: `Early Redemption Penalty (${preview.penalty_type.replace("_"," ")})`,
                                                    value: preview.penalty_amount > 0 ? `−${fmtNGN(preview.penalty_amount)}` : "—",
                                                    red: preview.penalty_amount > 0, dim: false },
              { label: "Gross Proceeds",            value: fmtNGN(preview.gross_proceeds),            bold: true },
              { label: `WHT (${preview.wht_rate}% on interest)`,
                                                    value: preview.wht_amount > 0 ? `−${fmtNGN(preview.wht_amount)}` : "—",
                                                    red: preview.wht_amount > 0, dim: false },
              { label: "NET PROCEEDS TO CLIENT",    value: fmtNGN(preview.net_proceeds),              bold: true, highlight: true },
            ].map(({ label, value, dim, red, bold, highlight }) => (
              <div key={label}
                   className="flex items-center justify-between px-4 py-2.5"
                   style={{
                     borderBottom: "1px solid var(--pg-row-border)",
                     background: highlight ? "#ecfdf5" : "var(--pg-card)",
                   }}>
                <span className="text-[12px]"
                      style={{ color: highlight ? "#065f46" : dim ? "var(--pg-text-4)" : "var(--pg-text-2)",
                               fontWeight: bold ? 700 : 400 }}>
                  {label}
                </span>
                <span className="text-[12px] font-mono"
                      style={{ color: highlight ? "#059669" : red ? "#dc2626" : bold ? "var(--pg-text-1)" : "var(--pg-text-2)",
                               fontWeight: bold ? 700 : 400 }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div className="text-[10px] px-1" style={{ color: "var(--pg-text-4)" }}>
            Units to redeem: {preview.units_to_redeem.toFixed(6)} @ NAV ₦{preview.nav_per_unit.toFixed(4)}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => setPreview(null)} className="flex-1 h-9 rounded-xl text-[13px] font-semibold"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              ← Back
            </button>
            {!preview.lock_up_violation && (
              <button onClick={confirmRedemption} disabled={confirming}
                      className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ background: preview.is_early_redemption
                        ? "linear-gradient(135deg,#d97706,#b45309)"
                        : "linear-gradient(135deg,#dc2626,#b91c1c)" }}>
                {confirming ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</> :
                  preview.is_early_redemption
                    ? "Confirm Early Redemption"
                    : "Confirm Redemption"}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Statement Table ───────────────────────────────────────────────────────────

function StatementTable({
  accountId,
  dateFrom,
  dateTo,
}: {
  accountId: string;
  dateFrom: string;
  dateTo: string;
}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("from", dateFrom);
  if (dateTo)   params.set("to", dateTo);

  const { data: txns = [], isLoading, error } = useQuery<ClientTransaction[]>({
    queryKey: ["client-account-statement", accountId, dateFrom, dateTo],
    queryFn: () =>
      apiFetch<ClientTransaction[]>(
        `/api/v1/portfolio/accounts/${accountId}/statement${params.size ? "?" + params.toString() : ""}`,
      ),
    enabled: Boolean(accountId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-2">
        <AlertCircle className="w-6 h-6" style={{ color: "#dc2626" }} />
        <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
          Failed to load statement.
        </p>
      </div>
    );
  }

  if (txns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--pg-muted-bg)" }}
        >
          <Activity className="w-6 h-6" style={{ color: "var(--pg-text-3)" }} />
        </div>
        <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
          No transactions
        </p>
        <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
          {dateFrom || dateTo
            ? "No transactions in the selected date range."
            : "No transactions have been recorded for this account yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Header */}
      <div
        className="grid items-center gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider min-w-[960px]"
        style={{
          gridTemplateColumns: "90px 150px 90px 80px 120px 90px 120px 140px 130px",
          background: "var(--pg-muted-bg)",
          color: "var(--pg-text-3)",
          borderBottom: "1px solid var(--pg-card-border)",
        }}
      >
        <span>Date</span>
        <span>Type</span>
        <span className="text-right">Units</span>
        <span className="text-right">NAV</span>
        <span className="text-right">Gross Amount</span>
        <span className="text-right">Fees</span>
        <span className="text-right">Net Amount</span>
        <span className="text-right">Running Balance</span>
        <span>Reference</span>
      </div>

      <div className="divide-y min-w-[960px]" style={{ borderColor: "var(--pg-card-border)" }}>
        {txns.map(t => {
          const isCredit = t.txn_type === "subscription" || t.txn_type === "dividend_distribution";
          return (
            <div
              key={t.id}
              className="grid items-center gap-3 px-5 py-3.5 transition-colors"
              style={{ gridTemplateColumns: "90px 150px 90px 80px 120px 90px 120px 140px 130px" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
            >
              {/* Date */}
              <p className="text-[11px]" style={{ color: "var(--pg-text-2)" }}>
                {fmtDate(t.txn_date)}
              </p>

              {/* Type badge */}
              <div>
                <TxnBadge type={t.txn_type} />
              </div>

              {/* Units */}
              <p className="text-[11px] font-mono text-right" style={{ color: "var(--pg-text-2)" }}>
                {t.units !== 0 ? fmtUnits(t.units) : "—"}
              </p>

              {/* NAV */}
              <p className="text-[11px] font-mono text-right" style={{ color: "var(--pg-text-3)" }}>
                {t.nav_per_unit > 0 ? fmtNaira(t.nav_per_unit) : "—"}
              </p>

              {/* Gross amount */}
              <p
                className="text-[12px] font-mono font-semibold text-right"
                style={{ color: isCredit ? "#059669" : "#dc2626" }}
              >
                {isCredit ? "+" : "-"}{fmtNaira(Math.abs(t.amount))}
              </p>

              {/* Fees */}
              <p className="text-[11px] font-mono text-right" style={{ color: "var(--pg-text-3)" }}>
                {t.fees > 0 ? fmtNaira(t.fees) : "—"}
              </p>

              {/* Net amount */}
              <p
                className="text-[12px] font-mono font-semibold text-right"
                style={{ color: isCredit ? "#059669" : "#dc2626" }}
              >
                {isCredit ? "+" : "-"}{fmtNaira(Math.abs(t.net_amount))}
              </p>

              {/* Running balance */}
              <p className="text-[12px] font-mono font-bold text-right" style={{ color: "var(--pg-text-1)" }}>
                {fmtNaira(t.running_balance)}
              </p>

              {/* Reference */}
              <p className="text-[11px] truncate font-mono" style={{ color: "var(--pg-text-3)" }}>
                {t.reference || "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  color,
  accentBar,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  accentBar: string;
  icon: React.ElementType;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
    >
      <div className="h-[3px]" style={{ background: accentBar }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
            {label}
          </p>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: color + "18" }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        </div>
        <p className="text-[22px] font-bold tabular-nums leading-tight" style={{ color: "var(--pg-text-1)" }}>
          {value}
        </p>
        {sub && (
          <p className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>{sub}</p>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ClientAccountStatementPage() {
  const { accountId } = useParams<{ accountId: string }>();

  const [showSubscribe, setShowSubscribe] = useState(false);
  const [showRedeem, setShowRedeem]       = useState(false);
  const [dateFrom, setDateFrom]           = useState("");
  const [dateTo, setDateTo]               = useState("");

  // Fetch all accounts, find matching one client-side
  const { data: account, isLoading, error } = useQuery<ClientAccount | undefined>({
    queryKey: ["client-accounts", accountId],
    queryFn: async () => {
      const list = await apiFetch<ClientAccount[]>("/api/v1/portfolio/accounts");
      return list.find(a => a.id === accountId);
    },
    enabled: Boolean(accountId),
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <AlertCircle className="w-8 h-8" style={{ color: "#dc2626" }} />
        <p className="text-[14px] font-medium" style={{ color: "var(--pg-text-2)" }}>
          Account not found or could not be loaded.
        </p>
        <Link
          href="/wm/portfolio/accounts"
          className="text-[13px] font-semibold"
          style={{ color: "#2563eb" }}
        >
          Back to Accounts
        </Link>
      </div>
    );
  }

  const unrealizedPos   = account.unrealized_pnl >= 0;
  const unrealizedColor = unrealizedPos ? "#059669" : "#dc2626";
  const returnPct       = pctReturn(account.invested_amount, account.current_value);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {/* Back link */}
          <Link
            href="/wm/portfolio/accounts"
            className="flex items-center gap-1.5 text-[12px] mb-2 transition-colors"
            style={{ color: "var(--pg-text-3)" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#2563eb"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--pg-text-3)"}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Funds &amp; Mandates
          </Link>

          {/* Title row */}
          <div className="flex items-center gap-3 flex-wrap">
            <code
              className="text-[12px] font-bold font-mono px-2.5 py-1 rounded-lg"
              style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
            >
              {account.account_number}
            </code>
            <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
              {account.client_name}
            </h1>
            <StatusBadge status={account.status} />
          </div>

          {/* Sub-line */}
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              Fund: <strong style={{ color: "var(--pg-text-2)" }}>{account.fund_name}</strong>
            </span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              Type: <strong style={{ color: "var(--pg-text-2)" }}>{account.fund_type}</strong>
            </span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              Currency: <strong style={{ color: "var(--pg-text-2)" }}>{account.currency}</strong>
            </span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              RM: <strong style={{ color: "var(--pg-text-2)" }}>{account.rm_name || "—"}</strong>
            </span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              Opened: <strong style={{ color: "var(--pg-text-2)" }}>{fmtDate(account.opened_date)}</strong>
            </span>
            {account.closed_date && (
              <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                Closed: <strong style={{ color: "#dc2626" }}>{fmtDate(account.closed_date)}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowSubscribe(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#059669,#047857)", boxShadow: "0 1px 8px rgba(5,150,105,0.30)" }}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" /> Subscription +
          </button>
          <button
            onClick={() => setShowRedeem(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", boxShadow: "0 1px 8px rgba(220,38,38,0.30)" }}
          >
            <ArrowUpRight className="w-3.5 h-3.5" /> Redemption −
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          label="Invested Amount"
          value={fmtNaira(account.invested_amount)}
          sub="Cost basis"
          color="#7c3aed"
          accentBar="#7c3aed"
          icon={TrendingUp}
        />
        <SummaryCard
          label="Current Value"
          value={fmtNaira(account.current_value)}
          sub={`${fmtUnits(account.units_held)} units held`}
          color="#2563eb"
          accentBar="#2563eb"
          icon={TrendingUp}
        />

        {/* Unrealized P&L — dynamic color */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
        >
          <div className="h-[3px]" style={{ background: unrealizedColor }} />
          <div className="p-5">
            <div className="flex items-start justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: unrealizedColor }}>
                Unrealized P&amp;L
              </p>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: unrealizedColor + "18" }}>
                {unrealizedPos
                  ? <TrendingUp className="w-4 h-4" style={{ color: unrealizedColor }} />
                  : <TrendingDown className="w-4 h-4" style={{ color: unrealizedColor }} />}
              </div>
            </div>
            <p className="text-[22px] font-bold tabular-nums leading-tight" style={{ color: "var(--pg-text-1)" }}>
              {unrealizedPos ? "+" : ""}{fmtNaira(account.unrealized_pnl)}
            </p>
            <p className="text-[11px] mt-1.5 font-semibold" style={{ color: unrealizedColor }}>
              {returnPct} return
            </p>
          </div>
        </div>

        <SummaryCard
          label="Realized P&L"
          value={(account.realized_pnl >= 0 ? "+" : "") + fmtNaira(account.realized_pnl)}
          sub="Crystallised gains / losses"
          color="#d97706"
          accentBar="#d97706"
          icon={TrendingUp}
        />
      </div>

      {/* ── Account Statement ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
      >
        {/* Section header + date filters */}
        <div
          className="flex items-center justify-between gap-4 px-5 py-4 flex-wrap"
          style={{ borderBottom: "1px solid var(--pg-card-border)" }}
        >
          <div>
            <h2 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              Account Statement
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              All transactions, running balance
            </p>
          </div>

          {/* Date range filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold" style={{ color: "var(--pg-text-3)" }}>From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 px-3 rounded-xl text-[12px] outline-none"
                style={{
                  background: "var(--pg-muted-bg)",
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-1)",
                }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold" style={{ color: "var(--pg-text-3)" }}>To</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 px-3 rounded-xl text-[12px] outline-none"
                style={{
                  background: "var(--pg-muted-bg)",
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-1)",
                }}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="h-8 px-3 rounded-xl text-[12px] font-semibold transition-colors"
                style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <StatementTable
          accountId={accountId}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      </div>

      {/* ── Modals ── */}
      {showSubscribe && (
        <SubscriptionModal
          accountId={accountId}
          accountNumber={account.account_number}
          onClose={() => setShowSubscribe(false)}
        />
      )}
      {showRedeem && (
        <RedemptionModal
          accountId={accountId}
          accountNumber={account.account_number}
          unitsHeld={account.units_held}
          onClose={() => setShowRedeem(false)}
        />
      )}
    </div>
  );
}
