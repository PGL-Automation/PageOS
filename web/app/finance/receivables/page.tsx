"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, TrendingUp, Clock, AlertTriangle, CheckCircle2,
  X, AlertCircle, Loader2, ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Receivable = {
  id: string; reference: string; client_name: string; client_email: string;
  invoice_date: string; due_date: string; fee_type: string; description: string;
  status: string; gross_amount: number; wht_deducted: number;
  amount_received: number; outstanding: number; days_overdue: number;
};
type AgingBucket = { label: string; count: number; amount: number };

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, {
    credentials: "include", headers: { "Content-Type": "application/json" }, ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(e.error?.message ?? "Request failed");
  }
  return res.json();
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  outstanding: { label: "Outstanding", bg: "#fef3c7", color: "#92400e" },
  partial:     { label: "Partial",     bg: "#dbeafe", color: "#1e40af" },
  paid:        { label: "Paid",        bg: "#d1fae5", color: "#065f46" },
  overdue:     { label: "Overdue",     bg: "#fee2e2", color: "#991b1b" },
  cancelled:   { label: "Cancelled",   bg: "#f1f5f9", color: "#475569" },
  draft:       { label: "Draft",       bg: "#f1f5f9", color: "#475569" },
};

const FEE_TYPES = [
  { value: "management_fee",  label: "Management Fee",   accounts: ["1130", "4001"] },
  { value: "performance_fee", label: "Performance Fee",  accounts: ["1131", "4002"] },
  { value: "advisory_fee",    label: "Advisory Fee",     accounts: ["1133", "4003"] },
  { value: "brokerage",       label: "Brokerage Commission", accounts: ["1132", "4004"] },
  { value: "custody_fee",     label: "Custody Fee",      accounts: ["1134", "4007"] },
];

// ── Create Invoice Modal ───────────────────────────────────────────────────────

function CreateReceivableModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [clientName, setClientName]   = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [feeType, setFeeType]         = useState("management_fee");
  const [description, setDescription] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate]         = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10);
  });
  const [grossAmount, setGrossAmount] = useState("");
  const [whtDeducted, setWhtDeducted] = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  const selectedFee = FEE_TYPES.find(f => f.value === feeType);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName || !grossAmount) { setError("Client name and amount are required."); return; }
    setSaving(true); setError("");
    try {
      await apiFetch("/receivables", {
        method: "POST",
        body: JSON.stringify({
          client_name: clientName, client_email: clientEmail,
          fee_type: feeType, description,
          invoice_date: invoiceDate, due_date: dueDate,
          gross_amount: parseFloat(grossAmount),
          wht_deducted: parseFloat(whtDeducted) || 0,
          receivable_account_code: selectedFee?.accounts[0] ?? "1130",
          revenue_account_code:    selectedFee?.accounts[1] ?? "4001",
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
      queryClient.invalidateQueries({ queryKey: ["ar-aging"] });
      toast({ title: "Invoice Raised", description: "GL journal posted automatically." });
      onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 32px 80px rgba(0,0,0,0.4)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Raise Client Invoice</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Client Name *</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} required placeholder="e.g. NSIA Insurance Ltd"
                     className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Client Email</label>
              <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@example.com"
                     className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Fee Type *</label>
            <div className="relative">
              <select value={feeType} onChange={e => setFeeType(e.target.value)}
                      className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                      style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                {FEE_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-4)" }} />
            </div>
            {selectedFee && (
              <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-4)" }}>
                Dr {selectedFee.accounts[0]} (Receivable) / Cr {selectedFee.accounts[1]} (Revenue)
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Q3 2026 Management Fee"
                   className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                   style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Invoice Date *</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required
                     className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                     className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Invoice Amount (₦) *</label>
              <input type="number" value={grossAmount} onChange={e => setGrossAmount(e.target.value)} required min="0" step="0.01"
                     placeholder="0.00"
                     className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>WHT Deducted (₦)</label>
              <input type="number" value={whtDeducted} onChange={e => setWhtDeducted(e.target.value)} min="0" step="0.01"
                     placeholder="0.00"
                     className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          </div>

          <div className="px-4 py-3 rounded-xl text-[12px]" style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
            A GL journal will be posted automatically on save: Dr Receivable / Cr Revenue.
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Raise Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Record Receipt Modal ───────────────────────────────────────────────────────

function ReceiptModal({ receivable, onClose }: { receivable: Receivable; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount]         = useState(String(receivable.outstanding));
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankCode, setBankCode]     = useState("1110");
  const [reference, setReference]   = useState("");
  const [saving, setSaving]         = useState(false);

  const BANKS = [
    { code: "1110", name: "GTBank" }, { code: "1111", name: "Zenith Bank" },
    { code: "1112", name: "Stanbic IBTC" }, { code: "1113", name: "UBA" }, { code: "1114", name: "Access Bank" },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const bank = BANKS.find(b => b.code === bankCode);
      await apiFetch(`/receivables/${receivable.id}/receive`, {
        method: "POST",
        body: JSON.stringify({
          receipt_date: receiptDate, amount: parseFloat(amount),
          bank_account_code: bankCode, bank_account_name: bank?.name ?? "Cash at Bank",
          reference,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
      queryClient.invalidateQueries({ queryKey: ["ar-aging"] });
      toast({ title: "Receipt Recorded", description: "GL journal Dr Bank / Cr Receivable posted." });
      onClose();
    } catch (err) { toast({ title: "Failed", description: (err as Error).message, variant: "destructive" }); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Record Receipt</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="px-4 py-3 rounded-xl" style={{ background: "var(--pg-muted-bg)" }}>
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{receivable.client_name}</p>
            <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{receivable.reference} · Outstanding: {fmt(receivable.outstanding)}</p>
          </div>
          {[
            { label: "Receipt Date", el: <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} className="w-full h-9 px-3 rounded-lg text-[13px] outline-none" style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} /> },
            { label: "Amount Received (₦)", el: <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="0.01" required className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none" style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} /> },
            { label: "Received Into", el: (
              <select value={bankCode} onChange={e => setBankCode(e.target.value)} className="w-full h-9 px-3 rounded-lg text-[13px] outline-none appearance-none" style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                {BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            )},
            { label: "Bank Reference / Narration", el: <input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. Transfer ref, cheque no." className="w-full h-9 px-3 rounded-lg text-[13px] outline-none" style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} /> },
          ].map(({ label, el }) => (
            <div key={label}>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>{label}</label>
              {el}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record Receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const STATUS_TABS = ["all", "outstanding", "partial", "paid", "overdue"] as const;

export default function ReceivablesPage() {
  const [tab, setTab] = useState<typeof STATUS_TABS[number]>("all");
  const [search, setSearch]           = useState("");
  const [showCreate, setShowCreate]   = useState(false);
  const [receiving, setReceiving]     = useState<Receivable | null>(null);

  const { data: receivables = [], isLoading } = useQuery<Receivable[]>({
    queryKey: ["receivables", tab],
    queryFn: async () => {
      const raw = await apiFetch(`/receivables${tab !== "all" ? `?status=${tab}` : ""}`);
      return Array.isArray(raw) ? (raw as Receivable[]) : [];
    },
    refetchInterval: 30000,
  });

  const { data: aging = [] } = useQuery<AgingBucket[]>({
    queryKey: ["ar-aging"],
    queryFn: async () => {
      const raw = await apiFetch("/receivables/aging");
      return Array.isArray(raw) ? (raw as AgingBucket[]) : [];
    },
  });

  const filtered = receivables.filter(r =>
    !search || r.client_name.toLowerCase().includes(search.toLowerCase()) ||
    r.reference.toLowerCase().includes(search.toLowerCase()) ||
    r.fee_type.toLowerCase().includes(search.toLowerCase())
  );

  const totalReceivable = receivables.filter(r => r.status !== "paid" && r.status !== "cancelled").reduce((s, r) => s + r.outstanding, 0);
  const overdue = receivables.filter(r => r.days_overdue > 0 && r.status !== "paid").length;

  return (
    <div className="max-w-[1300px] mx-auto space-y-5">

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>Finance › Receivables</span>
          </div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Accounts Receivable</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{receivables.length} invoices · {fmt(totalReceivable)} outstanding</p>
        </div>
        <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
          <Plus className="w-3.5 h-3.5" /> Raise Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Receivable", value: fmt(totalReceivable), color: "#059669", bg: "#d1fae5", icon: TrendingUp },
          { label: "Overdue",          value: overdue + " invoices", color: "#dc2626", bg: "#fee2e2", icon: AlertTriangle },
          { label: "Outstanding",      value: receivables.filter(r => r.status === "outstanding").length + " invoices", color: "#d97706", bg: "#fffbeb", icon: Clock },
          { label: "Received",         value: receivables.filter(r => r.status === "paid").length + " invoices",  color: "#2563eb", bg: "#eff6ff", icon: CheckCircle2 },
        ].map(s => (
          <div key={s.label} className="rounded-xl px-4 py-4 flex items-center gap-3"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.bg }}>
              <s.icon style={{ color: s.color, width: 16, height: 16 }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
              <p className="text-[14px] font-bold leading-tight mt-0.5" style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Aging */}
      {aging.length > 0 && (
        <div className="grid grid-cols-5 gap-3">
          {aging.map(b => (
            <div key={b.label} className="rounded-xl p-3 text-center"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>{b.label}</p>
              <p className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>{fmt(b.amount)}</p>
              <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>{b.count} invoice{b.count !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl flex-1 max-w-xs"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client, reference…"
                 className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {STATUS_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
                    className="h-7 px-3 rounded-lg text-[11px] font-medium capitalize transition-all"
                    style={tab === t ? { background: "linear-gradient(135deg,#059669,#047857)", color: "white" } : { color: "var(--pg-text-2)" }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
             style={{ gridTemplateColumns: "110px 1.5fr 130px 110px 110px 110px 110px 120px 120px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
          <span>Reference</span><span>Client</span><span>Fee Type</span>
          <span>Invoice Date</span><span>Due Date</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Outstanding</span>
          <span>Status</span><span>Actions</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No receivables. Raise an invoice to get started.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {filtered.map(r => {
              const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.outstanding;
              return (
                <div key={r.id} className="grid items-center gap-3 px-5 py-3.5 transition-colors"
                     style={{ gridTemplateColumns: "110px 1.5fr 130px 110px 110px 110px 110px 120px 120px" }}
                     onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                     onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <code className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>{r.reference}</code>
                  <div>
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{r.client_name}</p>
                    {r.description && <p className="text-[10px] truncate" style={{ color: "var(--pg-text-4)" }}>{r.description}</p>}
                  </div>
                  <p className="text-[12px] capitalize" style={{ color: "var(--pg-text-2)" }}>
                    {FEE_TYPES.find(f => f.value === r.fee_type)?.label ?? r.fee_type}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{fmtDate(r.invoice_date)}</p>
                  <p className="text-[12px]" style={{ color: r.days_overdue > 0 && r.status !== "paid" ? "#dc2626" : "var(--pg-text-2)" }}>
                    {fmtDate(r.due_date)}
                    {r.days_overdue > 0 && r.status !== "paid" && <span className="block text-[10px]">{r.days_overdue}d overdue</span>}
                  </p>
                  <p className="text-[12px] font-semibold tabular text-right font-mono" style={{ color: "var(--pg-text-1)" }}>{fmt(r.gross_amount)}</p>
                  <p className="text-[12px] font-bold tabular text-right font-mono" style={{ color: r.outstanding > 0 ? "#dc2626" : "#059669" }}>
                    {r.outstanding > 0 ? fmt(r.outstanding) : "—"}
                  </p>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                        style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  <div className="flex items-center gap-1.5">
                    {r.status !== "paid" && r.status !== "cancelled" && r.outstanding > 0 && (
                      <button onClick={() => setReceiving(r)}
                              className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold text-white"
                              style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
                        <CheckCircle2 className="w-3 h-3" /> Receive
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && <CreateReceivableModal onClose={() => setShowCreate(false)} />}
      {receiving && <ReceiptModal receivable={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}
