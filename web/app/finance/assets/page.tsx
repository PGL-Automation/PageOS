"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, AlertCircle, Loader2, ChevronDown,
  Package, TrendingDown, CheckCircle2, Trash2,
  ChevronRight, RotateCcw, Eye, Play,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ─────────────────────────────────────────────────────────────────────

type Asset = {
  id: string; reference: string; subsidiary_id?: string;
  name: string; description: string; category: string;
  asset_account_code: string; accum_dep_code: string; dep_expense_code: string;
  acquisition_date: string; acquisition_cost: number; salvage_value: number;
  useful_life_months: number; dep_method: "straight_line" | "reducing_balance";
  annual_dep_rate: number; status: "active" | "disposed" | "fully_depreciated";
  book_value: number; accum_depreciation: number; last_dep_period?: string;
  journal_id?: string; created_by_name: string; created_at: string;
};

type DepRun = {
  id: string; asset_id: string; period: string;
  dep_amount: number; book_value_after: number;
  journal_id?: string; created_at: string;
};

type AssetWithHistory = Asset & { dep_runs: DepRun[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Computer Equipment", "Furniture and Fittings",
  "Office Equipment", "Motor Vehicles", "Software Licences",
];

const STATUS_CFG = {
  active:             { label: "Active",           bg: "#d1fae5", color: "#065f46" },
  disposed:           { label: "Disposed",         bg: "#fee2e2", color: "#991b1b" },
  fully_depreciated:  { label: "Fully Depreciated", bg: "#f1f5f9", color: "#475569" },
};

const FILTER_TABS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "fully_depreciated", label: "Fully Dep." },
  { key: "disposed", label: "Disposed" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 2,
  }).format(n);
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

// ── Register Asset Modal ──────────────────────────────────────────────────────

function RegisterAssetModal({ subsidiaryId, onClose }: { subsidiaryId: string; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "", description: "", category: CATEGORIES[0],
    acquisition_date: new Date().toISOString().slice(0, 10),
    acquisition_cost: "", salvage_value: "0",
    useful_life_months: "", dep_method: "straight_line" as const,
    annual_dep_rate: "0",
    paid_from_account: "1110",
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/assets/fixed", {
        method: "POST",
        body: JSON.stringify({
          subsidiary_id: subsidiaryId || null,
          name: form.name,
          description: form.description,
          category: form.category,
          acquisition_date: form.acquisition_date,
          acquisition_cost: parseFloat(form.acquisition_cost),
          salvage_value: parseFloat(form.salvage_value) || 0,
          useful_life_months: parseInt(form.useful_life_months) || 0,
          dep_method: form.dep_method,
          annual_dep_rate: parseFloat(form.annual_dep_rate) || 0,
          paid_from_account: form.paid_from_account,
        }),
      });
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Asset registered", description: `${form.name} added to the fixed asset register.` });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 shrink-0"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Register Fixed Asset</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto">
          <div className="p-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-[12px]"
                   style={{ background: "#fef2f2", color: "#dc2626" }}>
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Asset Name *</label>
                <input value={form.name} onChange={e => set("name", e.target.value)} required
                       placeholder="e.g. MacBook Pro 14-inch"
                       className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                       style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
              </div>

              <div className="col-span-2">
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Description</label>
                <input value={form.description} onChange={e => set("description", e.target.value)}
                       placeholder="Optional details"
                       className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                       style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Category *</label>
                <div className="relative">
                  <select value={form.category} onChange={e => set("category", e.target.value)} required
                          className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                          style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Acquisition Date *</label>
                <input type="date" value={form.acquisition_date} onChange={e => set("acquisition_date", e.target.value)} required
                       className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                       style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Acquisition Cost (₦) *</label>
                <input type="number" min="0" step="0.01" value={form.acquisition_cost} onChange={e => set("acquisition_cost", e.target.value)} required
                       placeholder="0.00"
                       className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                       style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Salvage Value (₦)</label>
                <input type="number" min="0" step="0.01" value={form.salvage_value} onChange={e => set("salvage_value", e.target.value)}
                       className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                       style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Dep. Method</label>
                <div className="relative">
                  <select value={form.dep_method} onChange={e => set("dep_method", e.target.value)}
                          className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                          style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }}>
                    <option value="straight_line">Straight Line</option>
                    <option value="reducing_balance">Reducing Balance</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                  {form.dep_method === "straight_line" ? "Useful Life (months)" : "Annual Rate (%)"}
                </label>
                <input type="number" min="0" step={form.dep_method === "straight_line" ? "1" : "0.01"}
                       value={form.dep_method === "straight_line" ? form.useful_life_months : form.annual_dep_rate}
                       onChange={e => form.dep_method === "straight_line"
                         ? set("useful_life_months", e.target.value)
                         : set("annual_dep_rate", e.target.value)}
                       placeholder={form.dep_method === "straight_line" ? "36" : "20"}
                       className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                       style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Payment Account</label>
                <div className="relative">
                  <select value={form.paid_from_account} onChange={e => set("paid_from_account", e.target.value)}
                          className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                          style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }}>
                    <option value="1110">1110 – Cash at Bank (GTBank)</option>
                    <option value="1111">1111 – Cash at Bank (UBA)</option>
                    <option value="1112">1112 – Cash at Bank (Stanbic)</option>
                    <option value="2101">2101 – Accounts Payable (on credit)</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 shrink-0 flex gap-3">
            <button type="button" onClick={onClose}
                    className="flex-1 h-9 rounded-xl text-[13px] font-semibold"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
                    className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: saving ? "#94a3b8" : "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Register Asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Depreciate Modal ──────────────────────────────────────────────────────────

function DepreciateModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch(`/assets/fixed/${asset.id}/depreciate`, {
        method: "POST", body: JSON.stringify({ period }),
      });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["asset", asset.id] });
      toast({ title: "Depreciation recorded", description: `${asset.name} – ${period}` });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Run Depreciation</h2>
          <button onClick={onClose} style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
            Asset: <strong style={{ color: "var(--pg-text-1)" }}>{asset.name}</strong>
            <br />Book value: <strong style={{ color: "var(--pg-text-1)" }}>{fmt(asset.book_value)}</strong>
            {asset.last_dep_period && <> · Last dep: <strong>{asset.last_dep_period}</strong></>}
          </p>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px]"
                 style={{ background: "#fef2f2", color: "#dc2626" }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Period (YYYY-MM)</label>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} required
                   className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                   style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
                    className="flex-1 h-9 rounded-xl text-[13px] font-semibold"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
                    className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: saving ? "#94a3b8" : "#2563eb" }}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Run
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Dispose Modal ─────────────────────────────────────────────────────────────

function DisposeModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    disposal_date: new Date().toISOString().slice(0, 10),
    proceeds: "", notes: "", bank_account_code: "1110",
  });
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch(`/assets/fixed/${asset.id}/dispose`, {
        method: "POST",
        body: JSON.stringify({
          disposal_date: form.disposal_date,
          proceeds: parseFloat(form.proceeds) || 0,
          notes: form.notes,
          bank_account_code: form.bank_account_code,
        }),
      });
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Asset disposed", description: asset.name });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Dispose Asset</h2>
          <button onClick={onClose} style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
            Asset: <strong style={{ color: "var(--pg-text-1)" }}>{asset.name}</strong>
            <br />Book value: <strong style={{ color: "var(--pg-text-1)" }}>{fmt(asset.book_value)}</strong>
          </p>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px]"
                 style={{ background: "#fef2f2", color: "#dc2626" }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Disposal Date</label>
            <input type="date" value={form.disposal_date} onChange={e => set("disposal_date", e.target.value)} required
                   className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                   style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Disposal Proceeds (₦)</label>
            <input type="number" min="0" step="0.01" value={form.proceeds} onChange={e => set("proceeds", e.target.value)}
                   placeholder="0.00"
                   className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                   style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Proceeds Account</label>
            <div className="relative">
              <select value={form.bank_account_code} onChange={e => set("bank_account_code", e.target.value)}
                      className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                      style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }}>
                <option value="1110">1110 – Cash at Bank (GTBank)</option>
                <option value="1111">1111 – Cash at Bank (UBA)</option>
                <option value="1112">1112 – Cash at Bank (Stanbic)</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Notes</label>
            <input value={form.notes} onChange={e => set("notes", e.target.value)}
                   placeholder="Reason for disposal…"
                   className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                   style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
                    className="flex-1 h-9 rounded-xl text-[13px] font-semibold"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
                    className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: saving ? "#94a3b8" : "#dc2626" }}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Dispose
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Bulk Depreciation Modal ───────────────────────────────────────────────────

function BulkDepreciateModal({ subsidiaryId, onClose }: { subsidiaryId: string; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const result = await apiFetch("/assets/fixed/depreciate-all", {
        method: "POST",
        body: JSON.stringify({ subsidiary_id: subsidiaryId || null, period }),
      });
      qc.invalidateQueries({ queryKey: ["assets"] });
      const count = (result as { count?: number })?.count ?? 0;
      toast({ title: "Bulk depreciation complete", description: `${count} asset(s) depreciated for ${period}.` });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Run Monthly Depreciation</h2>
          <button onClick={onClose} style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
            Depreciation journals will be posted for all active assets. Already-depreciated assets for the selected period are skipped.
          </p>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px]"
                 style={{ background: "#fef2f2", color: "#dc2626" }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Period</label>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} required
                   className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                   style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
                    className="flex-1 h-9 rounded-xl text-[13px] font-semibold"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
                    className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: saving ? "#94a3b8" : "#059669" }}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Run Depreciation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Asset Detail Panel ────────────────────────────────────────────────────────

function AssetDetail({ assetId, onClose, onDepreciate, onDispose }: {
  assetId: string;
  onClose: () => void;
  onDepreciate: (a: Asset) => void;
  onDispose: (a: Asset) => void;
}) {
  const { data, isLoading } = useQuery<AssetWithHistory>({
    queryKey: ["asset", assetId],
    queryFn: () => apiFetch(`/assets/fixed/${assetId}`),
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end"
         style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
         onClick={onClose}>
      <div className="w-full max-w-md h-full overflow-y-auto"
           style={{ background: "var(--pg-card)", borderLeft: "1px solid var(--pg-card-border)", boxShadow: "-8px 0 32px rgba(0,0,0,0.15)" }}
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 sticky top-0"
             style={{ borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-card)" }}>
          <h2 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>Asset Detail</h2>
          <button onClick={onClose} style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : data ? (
          <div className="p-5 space-y-5">
            {/* Header */}
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-[11px] font-mono text-slate-400 mb-0.5">{data.reference}</p>
                  <h3 className="text-[16px] font-bold" style={{ color: "var(--pg-text-1)" }}>{data.name}</h3>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{data.category}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: STATUS_CFG[data.status].bg, color: STATUS_CFG[data.status].color }}>
                  {STATUS_CFG[data.status].label}
                </span>
              </div>
              {data.description && (
                <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>{data.description}</p>
              )}
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Acquisition Cost", value: fmt(data.acquisition_cost) },
                { label: "Book Value", value: fmt(data.book_value), highlight: true },
                { label: "Accum. Depreciation", value: fmt(data.accum_depreciation) },
                { label: "Salvage Value", value: fmt(data.salvage_value) },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="p-3 rounded-xl"
                     style={{ background: highlight ? "#eff6ff" : "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1"
                     style={{ color: highlight ? "#2563eb" : "var(--pg-text-3)" }}>{label}</p>
                  <p className="text-[14px] font-bold"
                     style={{ color: highlight ? "#1d4ed8" : "var(--pg-text-1)" }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Dep details */}
            <div className="rounded-xl p-4 space-y-2"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
                 style={{ color: "var(--pg-text-3)" }}>Depreciation Settings</p>
              {[
                { label: "Method", value: data.dep_method === "straight_line" ? "Straight Line" : "Reducing Balance" },
                { label: "Useful Life", value: `${data.useful_life_months} months` },
                { label: "Acquisition Date", value: new Date(data.acquisition_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) },
                { label: "Last Depreciated", value: data.last_dep_period ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>{label}</span>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            {data.status === "active" && (
              <div className="flex gap-2">
                <button onClick={() => onDepreciate(data)}
                        className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold text-white"
                        style={{ background: "#2563eb" }}>
                  <TrendingDown className="w-3.5 h-3.5" /> Depreciate
                </button>
                <button onClick={() => onDispose(data)}
                        className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold"
                        style={{ border: "1px solid #fca5a5", color: "#dc2626", background: "#fef2f2" }}>
                  <Trash2 className="w-3.5 h-3.5" /> Dispose
                </button>
              </div>
            )}

            {/* Depreciation history */}
            <div>
              <p className="text-[12px] font-bold mb-3" style={{ color: "var(--pg-text-1)" }}>
                Depreciation History ({data.dep_runs?.length ?? 0} runs)
              </p>
              {(data.dep_runs ?? []).length === 0 ? (
                <div className="py-8 text-center rounded-xl"
                     style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                  <TrendingDown className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                  <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>No depreciation runs yet.</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden"
                     style={{ border: "1px solid var(--pg-card-border)" }}>
                  {(data.dep_runs ?? []).map((run, i) => (
                    <div key={run.id}
                         className="flex items-center justify-between px-4 py-3"
                         style={{ borderBottom: i < data.dep_runs.length - 1 ? "1px solid var(--pg-row-border)" : "none",
                                  background: "var(--pg-card)" }}>
                      <div>
                        <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{run.period}</p>
                        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                          Book value after: {fmt(run.book_value_after)}
                        </p>
                      </div>
                      <span className="text-[13px] font-bold" style={{ color: "#dc2626" }}>
                        −{fmt(run.dep_amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Asset Row ─────────────────────────────────────────────────────────────────

function AssetRow({ asset, onView, onDepreciate, onDispose }: {
  asset: Asset;
  onView: () => void;
  onDepreciate: () => void;
  onDispose: () => void;
}) {
  const cfg = STATUS_CFG[asset.status];
  const depPct = asset.acquisition_cost > 0
    ? Math.round((asset.accum_depreciation / asset.acquisition_cost) * 100)
    : 0;

  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors cursor-pointer group"
         onClick={onView}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
           style={{ background: "#eff6ff" }}>
        <Package className="w-4 h-4 text-blue-500" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>{asset.name}</p>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
        </div>
        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
          {asset.reference} · {asset.category}
          {asset.last_dep_period && <> · Last dep: {asset.last_dep_period}</>}
        </p>
        {/* Depreciation progress bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full" style={{ background: "var(--pg-row-border)" }}>
            <div className="h-full rounded-full transition-all"
                 style={{ width: `${depPct}%`, background: depPct >= 100 ? "#475569" : "#2563eb" }} />
          </div>
          <span className="text-[10px] font-medium shrink-0" style={{ color: "var(--pg-text-3)" }}>{depPct}% dep.</span>
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>{fmt(asset.book_value)}</p>
        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
          of {fmt(asset.acquisition_cost)}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
           onClick={e => e.stopPropagation()}>
        {asset.status === "active" && (
          <>
            <button title="Depreciate" onClick={onDepreciate}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-blue-50"
                    style={{ border: "1px solid #bfdbfe" }}>
              <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
            </button>
            <button title="Dispose" onClick={onDispose}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-red-50"
                    style={{ border: "1px solid #fca5a5" }}>
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FixedAssetsPage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [showBulkDep, setShowBulkDep] = useState(false);
  const [depAsset, setDepAsset] = useState<Asset | null>(null);
  const [disposeAsset, setDisposeAsset] = useState<Asset | null>(null);
  const [viewAssetId, setViewAssetId] = useState<string | null>(null);

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["assets", subsidId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (subsidId) params.set("subsidiary_id", subsidId);
      if (statusFilter) params.set("status", statusFilter);
      const raw = await apiFetch(`/assets/fixed?${params}`);
      return Array.isArray(raw) ? (raw as Asset[]) : [];
    },
  });

  // Summary stats — always query ALL assets (no status filter) so the
  // summary cards show totals across all statuses even when a filter is active.
  const { data: allAssets = [] } = useQuery<Asset[]>({
    queryKey: ["assets", subsidId, "all"],
    staleTime: 0,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (subsidId) params.set("subsidiary_id", subsidId);
      const raw = await apiFetch(`/assets/fixed?${params}`);
      return Array.isArray(raw) ? (raw as Asset[]) : [];
    },
  });

  const active    = allAssets.filter(a => a.status === "active").length;
  const disposed  = allAssets.filter(a => a.status === "disposed").length;
  const fullyDep  = allAssets.filter(a => a.status === "fully_depreciated").length;
  const totalCost = allAssets.reduce((s, a) => s + a.acquisition_cost, 0);
  const totalNBV  = allAssets.reduce((s, a) => s + a.book_value, 0);

  return (
    <div className="max-w-[960px] mx-auto space-y-5">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Fixed Asset Register</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Track, depreciate, and dispose of fixed assets
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBulkDep(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold"
                  style={{ border: "1px solid #6ee7b7", color: "#059669", background: "#ecfdf5" }}>
            <RotateCcw className="w-3.5 h-3.5" /> Run Monthly Dep.
          </button>
          <button onClick={() => setShowRegister(true)}
                  className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
            <Plus className="w-3.5 h-3.5" /> Register Asset
          </button>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Assets", value: active,                   sub: "in service",        color: "#2563eb", bg: "#eff6ff" },
          { label: "Total Cost",    value: fmt(totalCost),           sub: "acquisition value", color: "#7c3aed", bg: "#f5f3ff" },
          { label: "Net Book Value", value: fmt(totalNBV),           sub: "current NBV",       color: "#059669", bg: "#ecfdf5" },
          { label: "Closed Out",    value: `${disposed + fullyDep}`, sub: `${disposed} disposed · ${fullyDep} fully dep.`, color: "#475569", bg: "#f1f5f9" },
        ].map(({ label, value, sub, color, bg }) => (
          <div key={label} className="rounded-2xl p-4"
               style={{ background: bg, border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color }}>{label}</p>
            <p className="text-[18px] font-bold" style={{ color }}>{value}</p>
            <p className="text-[10px] mt-0.5" style={{ color: `${color}99` }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Filter Tabs + List ─────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
           style={{ border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-3"
             style={{ borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-card)" }}>
          {FILTER_TABS.map(tab => (
            <button key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    className={cn("px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors",
                      statusFilter === tab.key
                        ? "text-blue-700 bg-blue-50"
                        : "hover:bg-slate-100")}
                    style={{ color: statusFilter === tab.key ? "#1d4ed8" : "var(--pg-text-3)" }}>
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
            {assets.length} asset{assets.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16" style={{ background: "var(--pg-card)" }}>
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6"
               style={{ background: "var(--pg-card)" }}>
            <Package className="w-8 h-8 mb-3 text-slate-200" />
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>No assets found</p>
            <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
              {statusFilter ? "Try a different filter." : "Register your first fixed asset to get started."}
            </p>
            {!statusFilter && (
              <button onClick={() => setShowRegister(true)}
                      className="mt-4 flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white"
                      style={{ background: "#2563eb" }}>
                <Plus className="w-3.5 h-3.5" /> Register Asset
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100/80" style={{ background: "var(--pg-card)" }}>
            {assets.map(asset => (
              <AssetRow
                key={asset.id}
                asset={asset}
                onView={() => setViewAssetId(asset.id)}
                onDepreciate={() => setDepAsset(asset)}
                onDispose={() => setDisposeAsset(asset)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showRegister && (
        <RegisterAssetModal subsidiaryId={subsidId} onClose={() => setShowRegister(false)} />
      )}
      {showBulkDep && (
        <BulkDepreciateModal subsidiaryId={subsidId} onClose={() => setShowBulkDep(false)} />
      )}
      {depAsset && (
        <DepreciateModal asset={depAsset} onClose={() => setDepAsset(null)} />
      )}
      {disposeAsset && (
        <DisposeModal asset={disposeAsset} onClose={() => setDisposeAsset(null)} />
      )}
      {viewAssetId && (
        <AssetDetail
          assetId={viewAssetId}
          onClose={() => setViewAssetId(null)}
          onDepreciate={a => { setViewAssetId(null); setDepAsset(a); }}
          onDispose={a => { setViewAssetId(null); setDisposeAsset(a); }}
        />
      )}
    </div>
  );
}
