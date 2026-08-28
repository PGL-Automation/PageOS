"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, AlertCircle, Loader2, X, ChevronDown,
  ChevronRight, Shield, Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ─────────────────────────────────────────────────────────────────────

type Remittance = {
  id: string; run_id: string; type: "paye" | "pension";
  amount: number; payment_date: string; reference: string;
  notes: string; created_at: string;
};

type RunSummary = {
  id: string; subsidiary_name: string;
  period_year: number; period_month: number; period_name: string;
  status: string; employee_count: number;
  total_paye: number; total_emp_pension: number; total_employer_pension: number;
  paye_paid: number; paye_outstanding: number;
  pension_due: number; pension_paid: number; pension_outstanding: number;
  remittances: Remittance[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ["", "Jan","Feb","Mar","Apr","May","Jun",
                "Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 2,
  }).format(n);
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/payroll${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(e.error?.message ?? e.message ?? "Request failed");
  }
  return res.json();
}

function remittanceStatus(outstanding: number, due: number) {
  if (due <= 0) return { label: "N/A",     bg: "#f1f5f9", color: "#94a3b8" };
  if (outstanding <= 0)   return { label: "Paid",    bg: "#d1fae5", color: "#065f46" };
  if (outstanding < due)  return { label: "Partial", bg: "#fef3c7", color: "#92400e" };
  return { label: "Unpaid",  bg: "#fee2e2", color: "#991b1b" };
}

// ── Record Remittance Modal ───────────────────────────────────────────────────

function RecordModal({ run, defaultType, onClose }: {
  run: RunSummary;
  defaultType: "paye" | "pension";
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType]         = useState<"paye" | "pension">(defaultType);
  const [amount, setAmount]     = useState("");
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [reference, setRef]     = useState("");
  const [notes, setNotes]       = useState("");
  const [bankCode, setBankCode] = useState("1110");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  const outstanding = type === "paye" ? run.paye_outstanding : run.pension_outstanding;
  const due         = type === "paye" ? run.total_paye       : run.pension_due;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/remittances", {
        method: "POST",
        body: JSON.stringify({
          run_id: run.id, type, amount: parseFloat(amount),
          payment_date: date, reference, notes,
          bank_account_code: bankCode,
        }),
      });
      qc.invalidateQueries({ queryKey: ["remittance-dashboard"] });
      toast({ title: "Remittance recorded", description: `${type.toUpperCase()} payment for ${run.period_name} posted to GL.` });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Record Remittance</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{run.period_name}</p>
          </div>
          <button onClick={onClose} style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px]"
                 style={{ background: "#fef2f2", color: "#dc2626" }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}

          {/* Type selector */}
          <div className="grid grid-cols-2 gap-2">
            {(["paye", "pension"] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                      className={cn("h-10 rounded-xl text-[12px] font-bold uppercase tracking-wide transition-colors",
                        type === t ? "text-white" : "")}
                      style={{
                        background: type === t ? (t === "paye" ? "#FF6600" : "#7c3aed") : "var(--pg-muted-bg)",
                        border: `1px solid ${type === t ? "transparent" : "var(--pg-card-border)"}`,
                        color: type === t ? "white" : "var(--pg-text-2)",
                      }}>
                {t === "paye" ? "PAYE → FIRS" : "Pension → PFA"}
              </button>
            ))}
          </div>

          {/* Outstanding summary */}
          <div className="rounded-xl p-3 grid grid-cols-3 gap-2 text-center"
               style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
            {[
              { label: "Total Due",    value: due,         color: "var(--pg-text-1)" },
              { label: "Already Paid", value: type === "paye" ? run.paye_paid : run.pension_paid, color: "#059669" },
              { label: "Outstanding",  value: outstanding, color: outstanding > 0 ? "#dc2626" : "#059669" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--pg-text-3)" }}>{label}</p>
                <p className="text-[12px] font-bold" style={{ color }}>{fmt(value)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Amount (₦) *</label>
              <input type="number" min="0.01" step="0.01" value={amount}
                     onChange={e => setAmount(e.target.value)} required
                     placeholder={outstanding > 0 ? outstanding.toFixed(2) : "0.00"}
                     className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none"
                     style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Payment Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                     className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none"
                     style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>
              {type === "paye" ? "FIRS Receipt / TCC Reference" : "PFA Remittance Reference"}
            </label>
            <input value={reference} onChange={e => setRef(e.target.value)}
                   placeholder="e.g. FIRS/2026/08/001234"
                   className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                   style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Paid From</label>
            <div className="relative">
              <select value={bankCode} onChange={e => setBankCode(e.target.value)}
                      className="w-full h-9 px-3 pr-8 rounded-lg text-[12px] font-mono outline-none appearance-none"
                      style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }}>
                <option value="1110">1110 – GTBank</option>
                <option value="1111">1111 – Zenith Bank</option>
                <option value="1112">1112 – Stanbic IBTC</option>
                <option value="1113">1113 – UBA</option>
                <option value="1114">1114 – Access Bank</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
                   placeholder="Optional"
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
                    style={{ background: saving ? "#94a3b8" : type === "paye" ? "#FF6600" : "#7c3aed" }}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Record & Post Journal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Run Row ───────────────────────────────────────────────────────────────────

function RunRow({ row, onRecord }: {
  row: RunSummary;
  onRecord: (run: RunSummary, type: "paye" | "pension") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const payeStatus    = remittanceStatus(row.paye_outstanding,    row.total_paye);
  const pensionStatus = remittanceStatus(row.pension_outstanding, row.pension_due);

  const allPaid = row.paye_outstanding <= 0 && row.pension_outstanding <= 0;
  const anyUnpaid = row.paye_outstanding > 0 || row.pension_outstanding > 0;

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>

      {/* Summary row */}
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/60 transition-colors"
           onClick={() => setExpanded(v => !v)}>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              {row.period_name}
            </p>
            {allPaid && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          </div>
          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
            {row.subsidiary_name} · {row.employee_count} employees
          </p>
        </div>

        {/* PAYE column */}
        <div className="text-right shrink-0 w-36">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--pg-text-3)" }}>PAYE</p>
          <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{fmt(row.total_paye)}</p>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: payeStatus.bg, color: payeStatus.color }}>
            {payeStatus.label}
          </span>
        </div>

        {/* Pension column */}
        <div className="text-right shrink-0 w-36">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--pg-text-3)" }}>Pension</p>
          <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{fmt(row.pension_due)}</p>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: pensionStatus.bg, color: pensionStatus.color }}>
            {pensionStatus.label}
          </span>
        </div>

        <ChevronRight className={cn("w-4 h-4 shrink-0 transition-transform", expanded && "rotate-90")}
                      style={{ color: "var(--pg-text-4)" }} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--pg-row-border)" }}>

          {/* Obligation breakdown */}
          <div className="px-5 py-4 grid grid-cols-2 gap-5">

            {/* PAYE */}
            <div className="rounded-xl p-3 space-y-2"
                 style={{ background: "#fff7f0", border: "1px solid #fed7aa" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="w-3.5 h-3.5 text-orange-500" />
                <p className="text-[11px] font-bold text-blue-800">PAYE → FIRS</p>
              </div>
              {[
                { label: "Total due",    value: row.total_paye },
                { label: "Paid",         value: row.paye_paid         },
                { label: "Outstanding",  value: row.paye_outstanding  },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[11px] text-orange-700">{label}</span>
                  <span className="text-[11px] font-mono font-semibold text-blue-900">{fmt(value)}</span>
                </div>
              ))}
              {row.paye_outstanding > 0 && (
                <button onClick={() => onRecord(row, "paye")}
                        className="w-full mt-1 h-8 rounded-lg text-[11px] font-bold text-white"
                        style={{ background: "#FF6600" }}>
                  Record PAYE Payment
                </button>
              )}
            </div>

            {/* Pension */}
            <div className="rounded-xl p-3 space-y-2"
                 style={{ background: "#f5f3ff", border: "1px solid #c4b5fd" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Landmark className="w-3.5 h-3.5 text-violet-500" />
                <p className="text-[11px] font-bold text-violet-800">Pension → PFA</p>
              </div>
              {[
                { label: "Employee (8%)",  value: row.total_emp_pension        },
                { label: "Employer (10%)", value: row.total_employer_pension   },
                { label: "Total due",      value: row.pension_due              },
                { label: "Paid",           value: row.pension_paid             },
                { label: "Outstanding",    value: row.pension_outstanding      },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[11px] text-violet-700">{label}</span>
                  <span className="text-[11px] font-mono font-semibold text-violet-900">{fmt(value)}</span>
                </div>
              ))}
              {row.pension_outstanding > 0 && (
                <button onClick={() => onRecord(row, "pension")}
                        className="w-full mt-1 h-8 rounded-lg text-[11px] font-bold text-white"
                        style={{ background: "#7c3aed" }}>
                  Record Pension Payment
                </button>
              )}
            </div>
          </div>

          {/* Remittance history */}
          {row.remittances && row.remittances.length > 0 && (
            <div className="px-5 pb-4">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
                 style={{ color: "var(--pg-text-3)" }}>Payment History</p>
              <div className="rounded-xl overflow-hidden"
                   style={{ border: "1px solid var(--pg-card-border)" }}>
                {row.remittances.map((rem, i) => (
                  <div key={rem.id}
                       className="flex items-center gap-3 px-4 py-3"
                       style={{ borderBottom: i < row.remittances.length - 1 ? "1px solid var(--pg-row-border)" : "none" }}>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0"
                          style={{ background: rem.type === "paye" ? "#fff7f0" : "#f5f3ff",
                                   color: rem.type === "paye" ? "#FF6600" : "#7c3aed" }}>
                      {rem.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                        {fmt(rem.amount)}
                      </p>
                      <p className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>
                        {rem.payment_date}
                        {rem.reference && ` · ${rem.reference}`}
                      </p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Links to schedules */}
          <div className="px-5 pb-4 flex gap-3">
            <Link href={`/payroll?run=${row.id}&schedule=paye`}
                  className="text-[11px] font-semibold"
                  style={{ color: "#FF6600" }}>
              View PAYE Schedule →
            </Link>
            <Link href={`/payroll?run=${row.id}&schedule=pension`}
                  className="text-[11px] font-semibold"
                  style={{ color: "#7c3aed" }}>
              View Pension Schedule →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RemittancePage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const [modal, setModal] = useState<{ run: RunSummary; type: "paye" | "pension" } | null>(null);

  const { data: rows = [], isLoading } = useQuery<RunSummary[]>({
    queryKey: ["remittance-dashboard", subsidId],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (subsidId) p.set("subsidiary_id", subsidId);
      const data = await apiFetch(`/remittances?${p}`);
      return Array.isArray(data) ? data as RunSummary[] : [];
    },
  });

  // Summary totals
  const totalPAYEDue        = rows.reduce((s, r) => s + r.total_paye,        0);
  const totalPAYEOutstanding = rows.reduce((s, r) => s + Math.max(0, r.paye_outstanding), 0);
  const totalPensionDue     = rows.reduce((s, r) => s + r.pension_due,       0);
  const totalPensionOutstanding = rows.reduce((s, r) => s + Math.max(0, r.pension_outstanding), 0);

  return (
    <div className="max-w-[900px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Statutory Remittance Schedule
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Track PAYE payments to FIRS and pension contributions to PFAs
          </p>
        </div>
        <Link href="/payroll"
              className="h-8 px-3 flex items-center rounded-xl text-[12px] font-semibold"
              style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
          ← Payroll Runs
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "PAYE Due",           value: totalPAYEDue,         color: "#FF6600", bg: "#fff7f0" },
          { label: "PAYE Outstanding",   value: totalPAYEOutstanding, color: totalPAYEOutstanding > 0 ? "#dc2626" : "#059669", bg: totalPAYEOutstanding > 0 ? "#fef2f2" : "#ecfdf5" },
          { label: "Pension Due",        value: totalPensionDue,      color: "#7c3aed", bg: "#f5f3ff" },
          { label: "Pension Outstanding",value: totalPensionOutstanding, color: totalPensionOutstanding > 0 ? "#dc2626" : "#059669", bg: totalPensionOutstanding > 0 ? "#fef2f2" : "#ecfdf5" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-2xl p-4"
               style={{ background: bg, border: "1px solid var(--pg-card-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color }}>{label}</p>
            <p className="text-[16px] font-bold" style={{ color }}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Compliance notice */}
      {(totalPAYEOutstanding > 0 || totalPensionOutstanding > 0) && (
        <div className="rounded-2xl p-4 flex items-start gap-3"
             style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[12px]" style={{ color: "#92400e" }}>
            PAYE is due to FIRS by the <strong>10th of the following month</strong>.
            Pension contributions must be remitted within <strong>7 working days</strong> of salary payment (PenCom guidelines).
            Late remittances attract penalties.
          </p>
        </div>
      )}

      {/* Run list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl py-16 text-center"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Shield className="w-8 h-8 mx-auto mb-3 text-slate-200" />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
            No approved payroll runs yet. Approve a payroll run to see remittance obligations.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <RunRow key={row.id} row={row}
                    onRecord={(run, type) => setModal({ run, type })} />
          ))}
        </div>
      )}

      {modal && (
        <RecordModal
          run={modal.run}
          defaultType={modal.type}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
