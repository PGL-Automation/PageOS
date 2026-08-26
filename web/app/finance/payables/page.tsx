"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, CheckCircle2, CreditCard, Clock, AlertTriangle,
  X, AlertCircle, Loader2, ChevronDown, Building2, Trash2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Vendor  = { id: string; code: string; name: string; payment_terms_days: number; wht_applicable: boolean; wht_rate: number; default_expense_code: string };
type Account = { code: string; name: string; account_type: string };
type Payable = {
  id: string; reference: string; vendor_id: string; vendor_name: string;
  vendor_invoice_no: string; invoice_date: string; due_date: string;
  description: string; status: string;
  gross_amount: number; wht_amount: number; net_payable: number;
  amount_paid: number; outstanding: number; days_overdue: number;
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
  pending:  { label: "Pending",  bg: "#fef3c7", color: "#92400e" },
  approved: { label: "Approved", bg: "#dbeafe", color: "#1e40af" },
  paid:     { label: "Paid",     bg: "#d1fae5", color: "#065f46" },
  overdue:  { label: "Overdue",  bg: "#fee2e2", color: "#991b1b" },
  cancelled:{ label: "Cancelled",bg: "#f1f5f9", color: "#475569" },
};

// ── Create Invoice Modal ───────────────────────────────────────────────────────

type LineRow = { key: string; description: string; accountCode: string; accountName: string; quantity: string; unitPrice: string };
function emptyLine(): LineRow {
  return { key: crypto.randomUUID(), description: "", accountCode: "", accountName: "", quantity: "1", unitPrice: "" };
}

function CreatePayableModal({ vendors, accounts, onClose }: { vendors: Vendor[]; accounts: Account[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [vendorId, setVendorId] = useState("");
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedVendor = vendors.find(v => v.id === vendorId);
  const grossAmount = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
  const whtAmount   = selectedVendor?.wht_applicable ? grossAmount * (selectedVendor.wht_rate / 100) : 0;
  const netPayable  = grossAmount - whtAmount;

  function onVendorChange(id: string) {
    setVendorId(id);
    const v = vendors.find(x => x.id === id);
    if (v) {
      const due = new Date();
      due.setDate(due.getDate() + v.payment_terms_days);
      setDueDate(due.toISOString().slice(0, 10));
      if (v.default_expense_code) {
        setLines(ls => ls.map((l, i) => i === 0 ? { ...l, accountCode: v.default_expense_code, accountName: "" } : l));
      }
    }
  }

  function updateLine(key: string, field: keyof LineRow, value: string) {
    setLines(ls => ls.map(l => l.key === key ? { ...l, [field]: value } : l));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId) { setError("Please select a vendor."); return; }
    setSaving(true); setError("");
    try {
      await apiFetch("/payables", {
        method: "POST",
        body: JSON.stringify({
          vendor_id: vendorId,
          vendor_invoice_no: vendorInvoiceNo,
          invoice_date: invoiceDate,
          due_date: dueDate,
          description,
          lines: lines.filter(l => l.description && l.unitPrice).map(l => ({
            description: l.description,
            account_code: l.accountCode,
            account_name: l.accountName,
            quantity: parseFloat(l.quantity) || 1,
            unit_price: parseFloat(l.unitPrice) || 0,
          })),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["payables"] });
      queryClient.invalidateQueries({ queryKey: ["ap-aging"] });
      toast({ title: "Invoice Recorded" });
      onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  const expenseAccounts = accounts.filter(a => a.account_type === "EXPENSE");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
         style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden my-4"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 32px 80px rgba(0,0,0,0.4)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Record Vendor Invoice</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5 overflow-y-auto" style={{ maxHeight: "75vh" }}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Vendor *</label>
              <div className="relative">
                <select value={vendorId} onChange={e => onVendorChange(e.target.value)} required
                        className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                        style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                  <option value="">Select vendor…</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-4)" }} />
              </div>
              {selectedVendor?.wht_applicable && (
                <p className="text-[11px] mt-1" style={{ color: "#d97706" }}>
                  WHT applies at {selectedVendor.wht_rate}%
                </p>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Vendor Invoice No.</label>
              <input value={vendorInvoiceNo} onChange={e => setVendorInvoiceNo(e.target.value)} placeholder="Vendor's reference"
                     className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
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
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this invoice for?"
                     className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Invoice Lines</p>
              <button type="button" onClick={() => setLines(ls => [...ls, emptyLine()])}
                      className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold"
                      style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                <Plus className="w-3 h-3" /> Add Line
              </button>
            </div>
            <div className="grid text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-t-lg"
                 style={{ gridTemplateColumns: "1fr 130px 80px 100px 32px", background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
              <span>Description</span><span>Account (Expense)</span><span>Qty</span><span className="text-right">Unit Price</span><span />
            </div>
            <div className="divide-y rounded-b-lg overflow-hidden"
                 style={{ border: "1px solid var(--pg-card-border)", borderTop: "none", borderColor: "var(--pg-row-border)" }}>
              {lines.map(l => (
                <div key={l.key} className="grid items-center gap-2 px-3 py-2"
                     style={{ gridTemplateColumns: "1fr 130px 80px 100px 32px" }}>
                  <input value={l.description} onChange={e => updateLine(l.key, "description", e.target.value)}
                         placeholder="Item description" className="h-8 px-2 rounded-md text-[12px] outline-none"
                         style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                  <select value={l.accountCode} onChange={e => {
                    const acc = expenseAccounts.find(a => a.code === e.target.value);
                    updateLine(l.key, "accountCode", e.target.value);
                    if (acc) updateLine(l.key, "accountName", acc.name);
                  }}
                          className="h-8 px-2 rounded-md text-[12px] outline-none appearance-none"
                          style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                    <option value="">Account…</option>
                    {expenseAccounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                  </select>
                  <input type="number" value={l.quantity} onChange={e => updateLine(l.key, "quantity", e.target.value)}
                         min="0" step="0.01" className="h-8 px-2 rounded-md text-[12px] text-right outline-none"
                         style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                  <input type="number" value={l.unitPrice} onChange={e => updateLine(l.key, "unitPrice", e.target.value)}
                         min="0" step="0.01" placeholder="0.00" className="h-8 px-2 rounded-md text-[12px] text-right font-mono outline-none"
                         style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                  <button type="button" onClick={() => lines.length > 1 && setLines(ls => ls.filter(x => x.key !== l.key))}
                          className="w-7 h-7 flex items-center justify-center rounded-md" style={{ color: "var(--pg-text-4)" }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {/* Totals */}
            <div className="mt-3 flex items-center justify-end gap-6">
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Gross Amount</p>
                <p className="text-[14px] font-bold tabular font-mono" style={{ color: "var(--pg-text-1)" }}>{fmt(grossAmount)}</p>
              </div>
              {whtAmount > 0 && (
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#d97706" }}>WHT ({selectedVendor?.wht_rate}%)</p>
                  <p className="text-[14px] font-bold tabular font-mono" style={{ color: "#d97706" }}>({fmt(whtAmount)})</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#2563eb" }}>Net Payable</p>
                <p className="text-[16px] font-bold tabular font-mono" style={{ color: "#2563eb" }}>{fmt(netPayable)}</p>
              </div>
            </div>
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
                    style={{ background: "linear-gradient(135deg,#d97706,#b45309)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Pay Modal ─────────────────────────────────────────────────────────────────

function PayModal({ payable, onClose }: { payable: Payable; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankCode, setBankCode] = useState("1110");
  const [saving, setSaving] = useState(false);

  const BANKS = [
    { code: "1110", name: "GTBank" }, { code: "1111", name: "Zenith Bank" },
    { code: "1112", name: "Stanbic IBTC" }, { code: "1113", name: "UBA" },
    { code: "1114", name: "Access Bank" },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/payables/${payable.id}/pay`, {
        method: "POST", body: JSON.stringify({ payment_date: paymentDate, bank_account_code: bankCode }),
      });
      queryClient.invalidateQueries({ queryKey: ["payables"] });
      queryClient.invalidateQueries({ queryKey: ["ap-aging"] });
      toast({ title: "Payment Recorded", description: `${payable.reference} marked as paid` });
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
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Record Payment</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="px-4 py-3 rounded-xl" style={{ background: "var(--pg-muted-bg)" }}>
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{payable.vendor_name}</p>
            <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{payable.reference} · Outstanding: {fmt(payable.outstanding)}</p>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Payment Date</label>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                   className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                   style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Pay From</label>
            <select value={bankCode} onChange={e => setBankCode(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg text-[13px] outline-none appearance-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
              {BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ${fmt(payable.outstanding)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const STATUS_TABS = ["all", "pending", "approved", "paid", "overdue"] as const;

export default function PayablesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<typeof STATUS_TABS[number]>("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [paying, setPaying] = useState<Payable | null>(null);

  const { data: payables = [], isLoading } = useQuery<Payable[]>({
    queryKey: ["payables", tab],
    queryFn: async () => {
      const raw = await apiFetch(`/payables${tab !== "all" ? `?status=${tab}` : ""}`);
      return Array.isArray(raw) ? (raw as Payable[]) : [];
    },
    refetchInterval: 30000,
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: async () => {
      const raw = await apiFetch("/vendors");
      return Array.isArray(raw) ? (raw as Vendor[]) : [];
    },
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const raw = await apiFetch("/accounts?active=true");
      return Array.isArray(raw) ? (raw as Account[]) : [];
    },
  });

  const { data: aging = [] } = useQuery<AgingBucket[]>({
    queryKey: ["ap-aging"],
    queryFn: async () => {
      const raw = await apiFetch("/payables/aging");
      return Array.isArray(raw) ? (raw as AgingBucket[]) : [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/payables/${id}/approve`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payables"] }); toast({ title: "Invoice Approved & Journal Posted" }); },
    onError: (err) => toast({ title: "Failed", description: (err as Error).message, variant: "destructive" }),
  });

  const filtered = payables.filter(p =>
    !search || p.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
    p.reference.toLowerCase().includes(search.toLowerCase()) ||
    p.vendor_invoice_no.toLowerCase().includes(search.toLowerCase())
  );

  const totalOutstanding = payables.filter(p => p.status !== "paid" && p.status !== "cancelled").reduce((s, p) => s + p.outstanding, 0);
  const overdue = payables.filter(p => p.days_overdue > 0 && p.status !== "paid").length;

  return (
    <div className="max-w-[1300px] mx-auto space-y-5">

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>Finance</span>
            <span style={{ color: "var(--pg-text-4)" }}>›</span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>Payables</span>
          </div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Accounts Payable</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{payables.length} invoices · {fmt(totalOutstanding)} outstanding</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/finance/payables/vendors"
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
                style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
            <Building2 className="w-3.5 h-3.5" /> Vendors
          </Link>
          <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#d97706,#b45309)" }}>
            <Plus className="w-3.5 h-3.5" /> Record Invoice
          </button>
        </div>
      </div>

      {/* Stats + Aging */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Outstanding", value: fmt(totalOutstanding), color: "#d97706", bg: "#fffbeb", icon: CreditCard },
          { label: "Overdue Invoices",  value: overdue + " invoices", color: "#dc2626", bg: "#fee2e2", icon: AlertTriangle },
          { label: "Pending Approval",  value: payables.filter(p => p.status === "pending").length + " invoices", color: "#2563eb", bg: "#eff6ff", icon: Clock },
          { label: "Paid This Month",   value: payables.filter(p => p.status === "paid").length + " invoices", color: "#059669", bg: "#d1fae5", icon: CheckCircle2 },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor, reference…"
                 className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {STATUS_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
                    className="h-7 px-3 rounded-lg text-[11px] font-medium capitalize transition-all"
                    style={tab === t ? { background: "linear-gradient(135deg,#d97706,#b45309)", color: "white" } : { color: "var(--pg-text-2)" }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
             style={{ gridTemplateColumns: "110px 1fr 110px 110px 100px 120px 100px 160px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
          <span>Reference</span><span>Vendor</span><span>Invoice Date</span><span>Due Date</span>
          <span className="text-right">Net Payable</span><span className="text-right">Outstanding</span>
          <span>Status</span><span>Actions</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No invoices found. Record one to get started.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {filtered.map(p => {
              const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.pending;
              return (
                <div key={p.id} className="grid items-center gap-3 px-5 py-3.5 transition-colors"
                     style={{ gridTemplateColumns: "110px 1fr 110px 110px 100px 120px 100px 160px" }}
                     onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                     onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <code className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>{p.reference}</code>
                  <div>
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{p.vendor_name}</p>
                    {p.vendor_invoice_no && <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>{p.vendor_invoice_no}</p>}
                  </div>
                  <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{fmtDate(p.invoice_date)}</p>
                  <p className="text-[12px]" style={{ color: p.days_overdue > 0 && p.status !== "paid" ? "#dc2626" : "var(--pg-text-2)" }}>
                    {fmtDate(p.due_date)}
                    {p.days_overdue > 0 && p.status !== "paid" && <span className="block text-[10px]">{p.days_overdue}d overdue</span>}
                  </p>
                  <p className="text-[12px] font-semibold tabular text-right font-mono" style={{ color: "var(--pg-text-1)" }}>{fmt(p.net_payable)}</p>
                  <p className="text-[12px] font-bold tabular text-right font-mono" style={{ color: p.outstanding > 0 ? "#dc2626" : "#059669" }}>
                    {p.outstanding > 0 ? fmt(p.outstanding) : "—"}
                  </p>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                        style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  <div className="flex items-center gap-1.5">
                    {p.status === "pending" && (
                      <button onClick={() => approveMutation.mutate(p.id)}
                              disabled={approveMutation.isPending}
                              className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold text-white"
                              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                    )}
                    {p.status === "approved" && (
                      <button onClick={() => setPaying(p)}
                              className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold text-white"
                              style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
                        <CreditCard className="w-3 h-3" /> Pay
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && <CreatePayableModal vendors={vendors} accounts={accounts} onClose={() => setShowCreate(false)} />}
      {paying && <PayModal payable={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
