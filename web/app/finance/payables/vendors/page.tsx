"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X, AlertCircle, Loader2, Edit2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Vendor = {
  id: string; code: string; name: string; short_name: string; tax_id: string;
  address: string; contact_name: string; contact_email: string; contact_phone: string;
  bank_name: string; bank_account_name: string; bank_account_no: string;
  payment_terms_days: number; default_expense_code: string;
  wht_applicable: boolean; wht_rate: number; is_active: boolean;
};

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

function VendorModal({ editing, onClose }: { editing?: Vendor; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: editing?.name ?? "", short_name: editing?.short_name ?? "",
    tax_id: editing?.tax_id ?? "", address: editing?.address ?? "",
    contact_name: editing?.contact_name ?? "", contact_email: editing?.contact_email ?? "",
    contact_phone: editing?.contact_phone ?? "",
    bank_name: editing?.bank_name ?? "", bank_account_name: editing?.bank_account_name ?? "",
    bank_account_no: editing?.bank_account_no ?? "",
    payment_terms_days: String(editing?.payment_terms_days ?? 30),
    default_expense_code: editing?.default_expense_code ?? "",
    wht_applicable: editing?.wht_applicable ?? false,
    wht_rate: String(editing?.wht_rate ?? 5),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const body = { ...form, payment_terms_days: parseInt(form.payment_terms_days) || 30, wht_rate: parseFloat(form.wht_rate) || 5 };
      if (editing) {
        await apiFetch(`/vendors/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "Vendor updated" });
      } else {
        await apiFetch("/vendors", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Vendor created" });
      }
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  const F = ({ label, field, type = "text", placeholder = "" }: { label: string; field: string; type?: string; placeholder?: string }) => (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>{label}</label>
      <input type={type} value={String((form as unknown as Record<string, unknown>)[field] ?? "")} onChange={e => set(field, e.target.value)} placeholder={placeholder}
             className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
             style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
         style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden my-4"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 32px 80px rgba(0,0,0,0.4)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>{editing ? "Edit Vendor" : "New Vendor"}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5 overflow-y-auto" style={{ maxHeight: "75vh" }}>
          {/* Basic info */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Basic Information</p>
            <div className="grid grid-cols-2 gap-4">
              <F label="Vendor Name *" field="name" placeholder="e.g. TechSoft Ltd" />
              <F label="Short Name" field="short_name" placeholder="Abbreviation" />
              <F label="Tax ID (TIN)" field="tax_id" placeholder="FIRS TIN number" />
              <F label="Address" field="address" placeholder="Registered address" />
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Contact</p>
            <div className="grid grid-cols-3 gap-4">
              <F label="Contact Person" field="contact_name" />
              <F label="Email" field="contact_email" type="email" />
              <F label="Phone" field="contact_phone" />
            </div>
          </div>

          {/* Banking */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Bank Details</p>
            <div className="grid grid-cols-3 gap-4">
              <F label="Bank Name" field="bank_name" placeholder="e.g. GTBank" />
              <F label="Account Name" field="bank_account_name" />
              <F label="Account Number" field="bank_account_no" />
            </div>
          </div>

          {/* Payment terms + WHT */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Payment Settings</p>
            <div className="grid grid-cols-3 gap-4">
              <F label="Payment Terms (days)" field="payment_terms_days" type="number" placeholder="30" />
              <F label="Default Expense Account" field="default_expense_code" placeholder="e.g. 5200" />
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>WHT Rate (%)</label>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={form.wht_applicable} onChange={e => set("wht_applicable", e.target.checked)} />
                  <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>WHT applies</span>
                  {form.wht_applicable && (
                    <input type="number" value={form.wht_rate} onChange={e => set("wht_rate", e.target.value)}
                           min="0" max="100" step="0.5" className="w-16 h-8 px-2 rounded-lg text-[12px] outline-none ml-2"
                           style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                  )}
                </div>
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
                    style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing ? "Save Changes" : "Create Vendor")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Vendor | undefined>();
  const [showCreate, setShowCreate] = useState(false);

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: async () => {
      const raw = await apiFetch("/vendors");
      return Array.isArray(raw) ? (raw as Vendor[]) : [];
    },
  });

  const filtered = vendors.filter(v =>
    !search || v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/finance/payables" className="flex items-center gap-1 text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              <ArrowLeft className="w-3 h-3" /> Payables
            </Link>
            <span style={{ color: "var(--pg-text-4)" }}>›</span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>Vendors</span>
          </div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Vendor Master</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{vendors.length} vendors registered</p>
        </div>
        <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
          <Plus className="w-3.5 h-3.5" /> New Vendor
        </button>
      </div>

      <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl max-w-xs"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…"
               className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
             style={{ gridTemplateColumns: "80px 2fr 1fr 1fr 100px 80px 60px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
          <span>Code</span><span>Name</span><span>Contact</span><span>Bank Account</span>
          <span>Terms</span><span>WHT</span><span />
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No vendors yet. Add one to start recording invoices.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {filtered.map(v => (
              <div key={v.id} className="grid items-center gap-3 px-5 py-3.5 transition-colors"
                   style={{ gridTemplateColumns: "80px 2fr 1fr 1fr 100px 80px 60px" }}
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <code className="text-[11px] font-mono" style={{ color: "var(--pg-text-3)" }}>{v.code}</code>
                <div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{v.name}</p>
                  {v.tax_id && <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>TIN: {v.tax_id}</p>}
                </div>
                <div>
                  {v.contact_name && <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{v.contact_name}</p>}
                  {v.contact_email && <p className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>{v.contact_email}</p>}
                </div>
                <div>
                  {v.bank_name && <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{v.bank_name}</p>}
                  {v.bank_account_no && <p className="text-[11px] font-mono" style={{ color: "var(--pg-text-4)" }}>{v.bank_account_no}</p>}
                </div>
                <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{v.payment_terms_days} days</p>
                <p className="text-[12px]" style={{ color: v.wht_applicable ? "#d97706" : "var(--pg-text-4)" }}>
                  {v.wht_applicable ? `${v.wht_rate}%` : "—"}
                </p>
                <button onClick={() => setEditing(v)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg"
                        style={{ color: "var(--pg-text-3)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {(showCreate || editing) && (
        <VendorModal editing={editing} onClose={() => { setEditing(undefined); setShowCreate(false); }} />
      )}
    </div>
  );
}
