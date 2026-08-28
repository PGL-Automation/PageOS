"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Download, Trash2, CheckCircle2, FileText,
  X, AlertCircle, Loader2, ChevronDown, RotateCcw,
  Eye, Check, ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type JournalStatus = "draft" | "pending_approval" | "posted" | "reversed";

type JournalHeader = {
  id: string; subsidiary_id?: string; subsidiary_name?: string;
  reference: string; date: string; type: string; description: string;
  status: JournalStatus; debit_total: number; credit_total: number;
  line_count: number; created_by: string; created_by_name: string;
  posted_by?: string; posted_at?: string;
  reversed_by?: string; reversed_at?: string; reversal_of?: string;
  created_at: string;
};

type JournalLine = {
  id: string; journal_id: string; line_number: number;
  account_code: string; account_name: string; narration: string;
  debit: number; credit: number;
};

type JournalWithLines = JournalHeader & { lines: JournalLine[] };

// ── Constants ──────────────────────────────────────────────────────────────────

const JOURNAL_TYPE_GROUPS: { group: string; types: string[] }[] = [
  { group: "Cash & Banking",         types: ["Receipt", "Payment", "Bank Transfer"] },
  { group: "Accruals & Adjustments", types: ["Accrual", "Prepayment", "Deferral", "Provision", "Write-off", "Reclassification"] },
  { group: "Payroll & Statutory",    types: ["Payroll", "PAYE / Tax Remittance", "Pension Remittance", "Withholding Tax", "VAT"] },
  { group: "Investments & Trading",  types: ["Investment Purchase", "Investment Sale", "Dividend Receipt", "Coupon Receipt", "Interest Income", "Mark-to-Market", "Trade Settlement", "Management Fee", "Performance Fee", "Brokerage Commission"] },
  { group: "Fixed Assets",           types: ["Capital Expenditure", "Depreciation", "Amortisation", "Asset Disposal"] },
  { group: "Period-end",             types: ["Opening Entry", "Month-end Closing", "Year-end Closing"] },
  { group: "Special & Corrections",  types: ["Reversal", "Suspense", "Intercompany", "Foreign Exchange", "General Journal"] },
  { group: "Regulatory (Nigerian)",  types: ["SEC Levy", "NGX / NSE Charges", "CSCS Charges"] },
];

const TYPE_COLORS: Record<string, string> = {
  Receipt: "#FF6600", Payment: "#dc2626", "Bank Transfer": "#0891b2",
  Accrual: "#7c3aed", Prepayment: "#a21caf", Deferral: "#9333ea",
  Provision: "#be185d", "Write-off": "#be123c", Reclassification: "#6d28d9",
  Payroll: "#059669", "PAYE / Tax Remittance": "#0d9488", "Pension Remittance": "#0f766e",
  "Withholding Tax": "#047857", VAT: "#065f46",
  "Investment Purchase": "#E05500", "Investment Sale": "#b45309",
  "Dividend Receipt": "#15803d", "Coupon Receipt": "#166534",
  "Interest Income": "#E05500", "Mark-to-Market": "#7c2d12",
  "Trade Settlement": "#1e3a8a", "Management Fee": "#4338ca",
  "Performance Fee": "#3730a3", "Brokerage Commission": "#E05500",
  "Capital Expenditure": "#1f2937", Depreciation: "#64748b",
  Amortisation: "#475569", "Asset Disposal": "#374151",
  "Opening Entry": "#6b7280", "Month-end Closing": "#94a3b8",
  "Year-end Closing": "#64748b",
  Reversal: "#dc2626", Suspense: "#d97706", Intercompany: "#c2410c",
  "Foreign Exchange": "#0369a1", "General Journal": "#475569",
  "SEC Levy": "#9a3412", "NGX / NSE Charges": "#7c3aed", "CSCS Charges": "#6d28d9",
};

const STATUS_CFG: Record<JournalStatus, { label: string; bg: string; color: string }> = {
  draft:            { label: "Draft",            bg: "#f1f5f9", color: "#475569" },
  pending_approval: { label: "Pending Approval", bg: "#fef3c7", color: "#92400e" },
  posted:           { label: "Posted",           bg: "#d1fae5", color: "#065f46" },
  reversed:         { label: "Reversed",         bg: "#fee2e2", color: "#991b1b" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? "#64748b";
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: color + "18", color }}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: JournalStatus }) {
  const s = STATUS_CFG[status];
  return s ? (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  ) : null;
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(err.error?.message ?? "Request failed");
  }
  return res.json();
}

// ── Account autocomplete input ────────────────────────────────────────────────

type CoAAccount = { code: string; name: string; account_type: string; normal_balance: string };

function AccountInput({ value, onSelect, placeholder }: {
  value: string;
  onSelect: (code: string, name: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);

  const { data: accounts = [] } = useQuery<CoAAccount[]>({
    queryKey: ["accounts-search", q],
    queryFn: async () => {
      if (q.length < 1) return [];
      const res = await fetch(`${BASE}/api/v1/finance/accounts?q=${encodeURIComponent(q)}&active=true`, { credentials: "include" });
      if (!res.ok) return [];
      const raw = await res.json();
      const all = Array.isArray(raw) ? (raw as CoAAccount[]) : [];
      return all.filter(a => !a.account_type.includes("header")).slice(0, 10);
    },
    enabled: q.length >= 1,
  });

  return (
    <div className="relative">
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Account code or name"}
        className="w-full h-8 px-2 rounded-md text-[12px] font-mono outline-none"
        style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
      />
      {open && accounts.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 rounded-xl overflow-hidden shadow-xl"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {accounts.map(a => (
            <button key={a.code}
                    onMouseDown={() => { onSelect(a.code, a.name); setQ(a.code); setOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              <code className="text-[11px] font-mono shrink-0" style={{ color: "var(--pg-text-3)" }}>{a.code}</code>
              <p className="text-[12px] truncate flex-1" style={{ color: "var(--pg-text-1)" }}>{a.name}</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: a.normal_balance === "DR" ? "#fff7f0" : "#fef2f2",
                             color: a.normal_balance === "DR" ? "#FF6600" : "#dc2626" }}>
                {a.normal_balance}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Line-item row type (local form state) ─────────────────────────────────────

type LineRow = { key: string; accountCode: string; accountName: string; narration: string; debit: string; credit: string };

function emptyLine(): LineRow {
  return { key: crypto.randomUUID(), accountCode: "", accountName: "", narration: "", debit: "", credit: "" };
}

// ── Create Journal Modal ───────────────────────────────────────────────────────

function CreateJournalModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [postAfterSave, setPostAfterSave] = useState(false);

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function updateLine(key: string, field: keyof LineRow, value: string) {
    setLines(ls => ls.map(l => {
      if (l.key !== key) return l;
      // Enforce: only one of debit/credit per row.
      if (field === "debit"  && value) return { ...l, debit: value,  credit: "" };
      if (field === "credit" && value) return { ...l, credit: value, debit: "" };
      return { ...l, [field]: value };
    }));
  }

  function addLine() { setLines(ls => [...ls, emptyLine()]); }
  function removeLine(key: string) {
    if (lines.length <= 2) return;
    setLines(ls => ls.filter(l => l.key !== key));
  }

  type SaveMode = "draft" | "submit" | "post";

  async function submit(mode: SaveMode) {
    setError(""); setSaving(true); setPostAfterSave(mode === "post");
    try {
      const payload = {
        date, type, description,
        lines: lines
          .filter(l => l.accountCode || l.debit || l.credit)
          .map(l => ({
            account_code: l.accountCode,
            account_name: l.accountName,
            narration:    l.narration,
            debit:        parseFloat(l.debit)  || 0,
            credit:       parseFloat(l.credit) || 0,
          })),
      };
      const journal: JournalHeader = await apiFetch("/journals", {
        method: "POST", body: JSON.stringify(payload),
      });

      if (mode === "post") {
        await apiFetch(`/journals/${journal.id}/post`, { method: "POST" });
        toast({ title: "Journal Created & Posted", description: journal.reference });
      } else if (mode === "submit") {
        await apiFetch(`/journals/${journal.id}/submit`, { method: "POST" });
        toast({ title: "Submitted for Approval", description: journal.reference });
      } else {
        toast({ title: "Saved as Draft", description: journal.reference });
      }

      queryClient.invalidateQueries({ queryKey: ["journals"] });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
         style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
         onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl overflow-hidden my-4"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 32px 80px rgba(0,0,0,0.4)" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>New Journal Entry</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto" style={{ maxHeight: "80vh" }}>
          {/* Header fields */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                     className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Type *</label>
              <div className="relative">
                <select value={type} onChange={e => setType(e.target.value)} required
                        className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                        style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: type ? "var(--pg-text-1)" : "var(--pg-text-4)" }}>
                  <option value="" disabled>Select type…</option>
                  {JOURNAL_TYPE_GROUPS.map(grp => (
                    <optgroup key={grp.group} label={grp.group}>
                      {grp.types.map(t => <option key={t} value={t}>{t}</option>)}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-4)" }} />
              </div>
            </div>
            <div className="col-span-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Description *</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                     placeholder="Describe this journal entry…"
                     className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>
                Journal Lines
              </p>
              <button onClick={addLine}
                      className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold"
                      style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                <Plus className="w-3 h-3" /> Add Line
              </button>
            </div>

            {/* Table header */}
            <div className="grid text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-t-lg"
                 style={{ gridTemplateColumns: "120px 1fr 1fr 120px 120px 32px", background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
              <span>Account Code</span>
              <span>Account Name</span>
              <span>Narration</span>
              <span className="text-right">Debit (₦)</span>
              <span className="text-right">Credit (₦)</span>
              <span />
            </div>

            <div className="divide-y rounded-b-lg overflow-hidden"
                 style={{ borderColor: "var(--pg-row-border)", border: "1px solid var(--pg-card-border)", borderTop: "none" }}>
              {lines.map((line, idx) => (
                <div key={line.key}
                     className="grid items-center gap-2 px-3 py-2"
                     style={{ gridTemplateColumns: "120px 1fr 1fr 120px 120px 32px" }}>
                  <AccountInput
                    value={line.accountCode}
                    placeholder={`ACC${String(idx + 1).padStart(3, "0")}`}
                    onSelect={(code, name) => {
                      setLines(ls => ls.map(l => l.key === line.key ? { ...l, accountCode: code, accountName: name } : l));
                    }}
                  />
                  <input value={line.accountName}
                         onChange={e => updateLine(line.key, "accountName", e.target.value)}
                         placeholder="Account name (auto-filled)"
                         className="h-8 px-2 rounded-md text-[12px] outline-none"
                         style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                  <input value={line.narration}
                         onChange={e => updateLine(line.key, "narration", e.target.value)}
                         placeholder="Optional narration"
                         className="h-8 px-2 rounded-md text-[12px] outline-none"
                         style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                  <input type="number" min="0" step="0.01"
                         value={line.debit}
                         onChange={e => updateLine(line.key, "debit", e.target.value)}
                         placeholder="0.00"
                         className="h-8 px-2 rounded-md text-[12px] font-mono text-right outline-none"
                         style={{ background: line.debit ? "#fef2f2" : "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: line.debit ? "#dc2626" : "var(--pg-text-1)" }} />
                  <input type="number" min="0" step="0.01"
                         value={line.credit}
                         onChange={e => updateLine(line.key, "credit", e.target.value)}
                         placeholder="0.00"
                         className="h-8 px-2 rounded-md text-[12px] font-mono text-right outline-none"
                         style={{ background: line.credit ? "#ecfdf5" : "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: line.credit ? "#059669" : "var(--pg-text-1)" }} />
                  <button onClick={() => removeLine(line.key)}
                          disabled={lines.length <= 2}
                          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30"
                          style={{ color: "var(--pg-text-4)" }}
                          onMouseEnter={e => lines.length > 2 && ((e.currentTarget as HTMLElement).style.background = "#fee2e2")}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Running totals */}
            <div className="mt-3 flex items-center justify-end gap-6">
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Total Debit</p>
                <p className="text-[14px] font-bold tabular" style={{ color: "#dc2626" }}>{fmt(totalDebit)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Total Credit</p>
                <p className="text-[14px] font-bold tabular" style={{ color: "#059669" }}>{fmt(totalCredit)}</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                   style={{ background: isBalanced ? "#d1fae5" : "#fee2e2", border: `1px solid ${isBalanced ? "#a7f3d0" : "#fca5a5"}` }}>
                {isBalanced
                  ? <><Check className="w-4 h-4 text-emerald-600" /><span className="text-[12px] font-bold text-emerald-700">Balanced</span></>
                  : <><AlertCircle className="w-4 h-4 text-red-500" /><span className="text-[12px] font-bold text-red-600">
                      {totalDebit === 0 && totalCredit === 0 ? "No amounts entered" : `Out by ${fmt(Math.abs(totalDebit - totalCredit))}`}
                    </span></>
                }
              </div>
            </div>
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
            <button onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              Cancel
            </button>
            <button onClick={() => submit("draft")} disabled={saving}
                    className="h-9 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-60"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}>
              {saving && !postAfterSave ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save as Draft"}
            </button>
            <button onClick={() => submit("submit")} disabled={saving || !isBalanced}
                    className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#d97706,#b45309)" }}
                    title={!isBalanced ? "Balance the journal before submitting" : "Send for approval"}>
              {saving && !postAfterSave ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit for Approval"}
            </button>
            <button onClick={() => submit("post")} disabled={saving || !isBalanced}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
                    title={!isBalanced ? "Journal must be balanced before posting" : ""}>
              {saving && postAfterSave ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-3.5 h-3.5 inline mr-1" />Save & Post</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Journal Detail Panel ───────────────────────────────────────────────────────

function JournalDetailPanel({ journalId, onClose }: { journalId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<JournalWithLines>({
    queryKey: ["journal", journalId],
    queryFn: () => apiFetch(`/journals/${journalId}`),
  });

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div>
          <h3 className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            {data?.reference ?? "Loading…"}
          </h3>
          {data && <StatusBadge status={data.status} />}
        </div>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded" style={{ color: "var(--pg-text-3)" }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
      ) : data ? (
        <div className="p-5 space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            {[
              ["Date", fmtDate(data.date)],
              ["Type", data.type],
              ["Created by", data.created_by_name || "—"],
              ["Description", data.description],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--pg-text-4)" }}>{k}</p>
                <p style={{ color: "var(--pg-text-1)" }}>{v}</p>
              </div>
            ))}
          </div>

          {/* Lines table */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pg-card-border)" }}>
            <div className="grid text-[9px] font-bold uppercase tracking-wider px-3 py-2"
                 style={{ gridTemplateColumns: "80px 1fr 1fr 90px 90px", background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
              <span>Code</span><span>Account</span><span>Narration</span>
              <span className="text-right">Debit</span><span className="text-right">Credit</span>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {(data.lines ?? []).map(l => (
                <div key={l.id} className="grid items-center gap-2 px-3 py-2"
                     style={{ gridTemplateColumns: "80px 1fr 1fr 90px 90px" }}>
                  <code className="text-[10px] font-mono" style={{ color: "var(--pg-text-3)" }}>{l.account_code}</code>
                  <p className="text-[12px] truncate" style={{ color: "var(--pg-text-1)" }}>{l.account_name}</p>
                  <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>{l.narration || "—"}</p>
                  <p className="text-[12px] font-mono text-right" style={{ color: l.debit > 0 ? "#dc2626" : "var(--pg-text-4)" }}>
                    {l.debit > 0 ? fmt(l.debit) : "—"}
                  </p>
                  <p className="text-[12px] font-mono text-right" style={{ color: l.credit > 0 ? "#059669" : "var(--pg-text-4)" }}>
                    {l.credit > 0 ? fmt(l.credit) : "—"}
                  </p>
                </div>
              ))}
            </div>
            {/* Totals row */}
            <div className="grid items-center gap-2 px-3 py-2 font-bold"
                 style={{ gridTemplateColumns: "80px 1fr 1fr 90px 90px", background: "var(--pg-muted-bg)", borderTop: "2px solid var(--pg-card-border)" }}>
              <span /><span className="text-[11px] col-span-2" style={{ color: "var(--pg-text-3)" }}>Total</span>
              <p className="text-[12px] font-bold tabular text-right" style={{ color: "#dc2626" }}>{fmt(data.debit_total)}</p>
              <p className="text-[12px] font-bold tabular text-right" style={{ color: "#059669" }}>{fmt(data.credit_total)}</p>
            </div>
          </div>

          {data.reversal_of && (
            <p className="text-[11px] px-3 py-2 rounded-lg" style={{ background: "#fef2f2", color: "#991b1b" }}>
              Reversal of journal {data.reversal_of.slice(0, 8)}…
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const STATUS_TABS = ["all", "draft", "pending_approval", "posted", "reversed"] as const;
type StatusTab = typeof STATUS_TABS[number];

export default function JournalsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof JournalHeader>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const { data: journals = [], isLoading } = useQuery<JournalHeader[]>({
    queryKey: ["journals", statusTab],
    queryFn: async () => {
      const raw = await apiFetch(`/journals${statusTab !== "all" ? `?status=${statusTab}` : ""}`);
      return Array.isArray(raw) ? (raw as JournalHeader[]) : [];
    },
    refetchInterval: 30000,
  });

  const postMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/journals/${id}/post`, { method: "POST" }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      queryClient.invalidateQueries({ queryKey: ["journal", id] });
      toast({ title: "Journal Posted" });
    },
    onError: (err) => toast({ title: "Post Failed", description: (err as Error).message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/journals/${id}/submit`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["journals"] }); toast({ title: "Submitted for Approval" }); },
    onError: (err) => toast({ title: "Submit Failed", description: (err as Error).message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/journals/${id}/approve`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["journals"] }); toast({ title: "Journal Approved & Posted" }); },
    onError: (err) => toast({ title: "Approval Failed", description: (err as Error).message, variant: "destructive" }),
  });

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote]   = useState("");

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiFetch(`/journals/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      setRejectingId(null); setRejectNote("");
      toast({ title: "Journal Rejected — returned to draft" });
    },
    onError: (err) => toast({ title: "Rejection Failed", description: (err as Error).message, variant: "destructive" }),
  });

  const reverseMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/journals/${id}/reverse`, { method: "POST" }),
    onSuccess: (reversal: JournalHeader) => {
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      toast({ title: "Journal Reversed", description: `Reversal created: ${reversal.reference}` });
    },
    onError: (err) => toast({ title: "Reversal Failed", description: (err as Error).message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/journals/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      setSelectedId(null);
      toast({ title: "Draft Deleted" });
    },
    onError: (err) => toast({ title: "Delete Failed", description: (err as Error).message, variant: "destructive" }),
  });

  function toggleSort(field: keyof JournalHeader) {
    if (sortField === field) setSortAsc(v => !v);
    else { setSortField(field); setSortAsc(true); }
  }

  const filtered = journals
    .filter(j => {
      if (!search) return true;
      const q = search.toLowerCase();
      return j.reference.toLowerCase().includes(q)
        || j.description.toLowerCase().includes(q)
        || j.type.toLowerCase().includes(q)
        || j.created_by_name.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const av = a[sortField] as string | number;
      const bv = b[sortField] as string | number;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });

  const posted  = journals.filter(j => j.status === "posted").length;
  const drafts  = journals.filter(j => j.status === "draft").length;
  const pending = journals.filter(j => j.status === "pending_approval").length;

  function SortHeader({ field, label, align }: { field: keyof JournalHeader; label: string; align?: string }) {
    const active = sortField === field;
    return (
      <button onClick={() => toggleSort(field)}
              className={cn("flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider", align === "right" && "ml-auto")}
              style={{ color: active ? "var(--pg-text-1)" : "var(--pg-text-3)" }}>
        {label}
        <ArrowUpDown className={cn("w-3 h-3 transition-opacity", active ? "opacity-100" : "opacity-40")} />
      </button>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Journal Entries</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            General ledger · {journals.length} entr{journals.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}>
          <Plus className="w-3.5 h-3.5" /> New Journal
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Posted",           n: posted,  color: "#059669", bg: "#d1fae5" },
          { label: "Drafts",           n: drafts,  color: "#475569", bg: "#f1f5f9" },
          { label: "Pending Approval", n: pending, color: "#d97706", bg: "#fef3c7" },
        ].map(s => (
          <div key={s.label} className="rounded-xl px-5 py-4 flex items-center gap-4"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.bg }}>
              <FileText style={{ color: s.color, width: 18, height: 18 }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
              <p className="text-[24px] font-bold tabular leading-none mt-0.5" style={{ color: "var(--pg-text-1)" }}>{s.n}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl flex-1 max-w-xs"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <svg className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Search by reference, description, type…"
                 className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
        </div>

        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {STATUS_TABS.map(t => (
            <button key={t} onClick={() => setStatusTab(t)}
                    className="h-7 px-3 rounded-lg text-[11px] font-medium capitalize transition-all"
                    style={statusTab === t
                      ? { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "white" }
                      : { color: "var(--pg-text-2)" }}>
              {t === "pending_approval" ? "Pending" : t}
            </button>
          ))}
        </div>

        <button onClick={() => {
          const csv = ["Reference,Date,Type,Description,Status,Debit,Credit,Created By",
            ...filtered.map(j => [j.reference, j.date, j.type, `"${j.description}"`, j.status, j.debit_total, j.credit_total, j.created_by_name].join(","))
          ].join("\n");
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
          a.download = `journals-${new Date().toISOString().slice(0,10)}.csv`;
          a.click();
        }}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-medium"
                style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      {/* Main table + detail panel */}
      <div className={cn("grid gap-5", selectedId ? "xl:grid-cols-5" : "grid-cols-1")}>

        {/* Table */}
        <div className={selectedId ? "xl:col-span-3" : ""}>
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            {/* Column headers */}
            <div className="grid items-center gap-3 px-4 py-3"
                 style={{ gridTemplateColumns: "100px 110px 100px 1fr 90px 90px 120px 110px", borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}>
              <SortHeader field="date"        label="Date" />
              <SortHeader field="reference"   label="Reference" />
              <SortHeader field="type"        label="Type" />
              <SortHeader field="description" label="Description" />
              <SortHeader field="debit_total"  label="Debit"  align="right" />
              <SortHeader field="credit_total" label="Credit" align="right" />
              <SortHeader field="status"      label="Status" />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Actions</span>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--pg-text-4)" }} />
                <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
                  {search ? "No journals match your search." : "No journal entries yet — create one to get started."}
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {filtered.map(j => {
                  const isSelected = selectedId === j.id;
                  return (
                    <div key={j.id}
                         className="grid items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                         style={{
                           gridTemplateColumns: "100px 110px 100px 1fr 90px 90px 120px 110px",
                           background: isSelected ? "rgba(255,102,0,0.05)" : undefined,
                         }}
                         onClick={() => setSelectedId(isSelected ? null : j.id)}
                         onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                         onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = ""; }}>

                      <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{fmtDate(j.date)}</p>

                      <code className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
                        {j.reference}
                      </code>

                      <TypeBadge type={j.type} />

                      <p className="text-[12.5px] truncate" style={{ color: "var(--pg-text-1)" }}>{j.description}</p>

                      <p className="text-[12px] font-semibold tabular text-right" style={{ color: "#dc2626" }}>
                        {j.debit_total > 0 ? fmt(j.debit_total) : "—"}
                      </p>
                      <p className="text-[12px] font-semibold tabular text-right" style={{ color: "#059669" }}>
                        {j.credit_total > 0 ? fmt(j.credit_total) : "—"}
                      </p>

                      <StatusBadge status={j.status} />

                      {/* Row actions */}
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setSelectedId(isSelected ? null : j.id)}
                                title="View lines"
                                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                                style={{ color: "var(--pg-text-3)" }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {j.status === "draft" && (
                          <>
                            <button onClick={() => submitMutation.mutate(j.id)}
                                    disabled={submitMutation.isPending}
                                    title="Submit for approval"
                                    className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold text-white"
                                    style={{ background: "linear-gradient(135deg,#d97706,#b45309)" }}>
                              Submit
                            </button>
                            <button onClick={() => postMutation.mutate(j.id)}
                                    disabled={postMutation.isPending}
                                    title="Post directly"
                                    className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold text-white"
                                    style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
                              <CheckCircle2 className="w-3 h-3" /> Post
                            </button>
                          </>
                        )}
                        {j.status === "pending_approval" && (
                          <>
                            <button onClick={() => approveMutation.mutate(j.id)}
                                    disabled={approveMutation.isPending}
                                    title="Approve & post"
                                    className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold text-white"
                                    style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </button>
                            <button onClick={() => { setRejectingId(j.id); setRejectNote(""); }}
                                    title="Reject"
                                    className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold"
                                    style={{ border: "1px solid #fca5a5", color: "#dc2626" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fef2f2"}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                              <X className="w-3 h-3" /> Reject
                            </button>
                          </>
                        )}

                        {j.status === "posted" && (
                          <button onClick={() => {
                            if (confirm(`Reverse "${j.reference}"? This will create a counter-entry.`)) {
                              reverseMutation.mutate(j.id);
                            }
                          }}
                                  disabled={reverseMutation.isPending}
                                  title="Reverse journal"
                                  className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold transition-colors"
                                  style={{ border: "1px solid #fca5a5", color: "#dc2626" }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fef2f2"}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                            <RotateCcw className="w-3 h-3" /> Reverse
                          </button>
                        )}

                        {j.status === "draft" && (
                          <button onClick={() => {
                            if (confirm("Delete this draft?")) deleteMutation.mutate(j.id);
                          }}
                                  title="Delete draft"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                                  style={{ color: "#dc2626" }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fef2f2"}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div className="xl:col-span-2">
            <JournalDetailPanel journalId={selectedId} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>

      {showCreate && <CreateJournalModal onClose={() => setShowCreate(false)} />}

      {/* Reject modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
             onClick={() => setRejectingId(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h2 className="text-[15px] font-bold text-red-600">Reject Journal</h2>
              <button onClick={() => setRejectingId(null)} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Reason for rejection *</label>
                <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3}
                          placeholder="Explain why this journal is being rejected…"
                          className="w-full px-3 py-2 rounded-xl text-[13px] outline-none resize-none"
                          style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setRejectingId(null)}
                        className="h-9 px-4 rounded-xl text-[13px] font-medium"
                        style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
                <button onClick={() => rejectMutation.mutate({ id: rejectingId, note: rejectNote })}
                        disabled={!rejectNote.trim() || rejectMutation.isPending}
                        className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                        style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}>
                  {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reject"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
