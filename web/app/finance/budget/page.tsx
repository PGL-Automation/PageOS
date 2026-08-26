"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, AlertCircle, CheckCircle2, TrendingUp,
  TrendingDown, Minus, ChevronDown, ChevronRight, Edit3, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ─────────────────────────────────────────────────────────────────────

type BudgetLine = {
  account_code: string; account_name: string;
  account_group: string; account_type: "REVENUE" | "EXPENSE";
  budget: number; actual: number; variance: number; variance_pct: number;
};

type VarianceReport = {
  year: number; month: number;
  lines: BudgetLine[];
  total_revenue_budget: number; total_revenue_actual: number;
  total_expense_budget: number; total_expense_actual: number;
  net_budget: number; net_actual: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ["","January","February","March","April","May","June",
                "July","August","September","October","November","December"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 0,
  }).format(Math.abs(n));
}

function pct(n: number) {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(e.error?.message ?? e.message ?? "Request failed");
  }
  return res.json();
}

// Variance color: revenue = positive good; expense = negative good
function varianceColor(variance: number, type: string) {
  if (variance === 0) return "var(--pg-text-3)";
  const favorable = type === "REVENUE" ? variance > 0 : variance < 0;
  return favorable ? "#059669" : "#dc2626";
}

function varianceBg(variance: number, type: string) {
  if (variance === 0) return "transparent";
  const favorable = type === "REVENUE" ? variance > 0 : variance < 0;
  return favorable ? "#ecfdf5" : "#fef2f2";
}

// ── Inline budget cell ────────────────────────────────────────────────────────

function BudgetCell({ code, value, onChange }: {
  code: string; value: number; onChange: (code: string, v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setRaw(value === 0 ? "" : String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 10);
  }

  function commit() {
    const parsed = parseFloat(raw) || 0;
    onChange(code, parsed);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number" min="0" step="1"
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-full text-right font-mono text-[12px] outline-none px-1 rounded"
        style={{ background: "#eff6ff", border: "1px solid #93c5fd", color: "#1d4ed8" }}
      />
    );
  }

  return (
    <div onClick={startEdit}
         className="flex items-center justify-end gap-1 cursor-pointer group rounded px-1 hover:bg-slate-100 transition-colors">
      <span className="text-[12px] font-mono" style={{ color: value > 0 ? "var(--pg-text-1)" : "var(--pg-text-4)" }}>
        {value > 0 ? fmt(value) : "—"}
      </span>
      <Edit3 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" style={{ color: "var(--pg-text-3)" }} />
    </div>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────

function GroupSection({ group, lines, budgets, onBudgetChange, editMode }: {
  group: string;
  lines: BudgetLine[];
  budgets: Record<string, number>;
  onBudgetChange: (code: string, v: number) => void;
  editMode: boolean;
}) {
  const [open, setOpen] = useState(true);
  const type = lines[0]?.account_type;

  const groupBudget = lines.reduce((s, l) => s + (budgets[l.account_code] ?? l.budget), 0);
  const groupActual = lines.reduce((s, l) => s + l.actual, 0);
  const groupVar    = groupActual - groupBudget;

  return (
    <div>
      {/* Group header */}
      <div className="flex items-center gap-2 px-5 py-2.5 cursor-pointer hover:bg-slate-50/60 transition-colors"
           style={{ borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}
           onClick={() => setOpen(v => !v)}>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />}
        <span className="text-[11px] font-bold flex-1" style={{ color: "var(--pg-text-2)" }}>{group}</span>
        <span className="text-[11px] font-mono" style={{ color: "var(--pg-text-3)" }}>{fmt(groupBudget)}</span>
        <span className="text-[11px] font-mono w-32 text-right" style={{ color: "var(--pg-text-1)" }}>{fmt(groupActual)}</span>
        <span className="text-[11px] font-mono w-28 text-right"
              style={{ color: varianceColor(groupVar, type) }}>
          {groupVar > 0 ? "+" : groupVar < 0 ? "−" : ""}{fmt(groupVar)}
        </span>
      </div>

      {/* Account rows */}
      {open && lines.map(line => {
        const budget = budgets[line.account_code] ?? line.budget;
        const variance = line.actual - budget;
        const vpct = budget !== 0 ? (variance / budget) * 100 : 0;

        return (
          <div key={line.account_code}
               className="flex items-center gap-2 px-5 py-2.5"
               style={{ borderBottom: "1px solid var(--pg-row-border)", background: varianceBg(variance, line.account_type) }}>
            <div className="w-4" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px]" style={{ color: "var(--pg-text-1)" }}>{line.account_name}</p>
              <p className="text-[10px] font-mono" style={{ color: "var(--pg-text-4)" }}>{line.account_code}</p>
            </div>
            {/* Budget col — editable */}
            <div className="w-32">
              {editMode
                ? <BudgetCell code={line.account_code} value={budget} onChange={onBudgetChange} />
                : <span className="block text-right text-[12px] font-mono" style={{ color: "var(--pg-text-2)" }}>
                    {budget > 0 ? fmt(budget) : "—"}
                  </span>}
            </div>
            {/* Actual */}
            <div className="w-32 text-right">
              <span className="text-[12px] font-mono" style={{ color: "var(--pg-text-1)" }}>
                {line.actual !== 0 ? fmt(line.actual) : "—"}
              </span>
            </div>
            {/* Variance */}
            <div className="w-28 text-right">
              {(variance !== 0 || budget !== 0) ? (
                <span className="text-[12px] font-mono font-semibold"
                      style={{ color: varianceColor(variance, line.account_type) }}>
                  {variance > 0 ? "+" : variance < 0 ? "−" : ""}{fmt(variance)}
                </span>
              ) : <span style={{ color: "var(--pg-text-4)" }}>—</span>}
            </div>
            {/* Variance % */}
            <div className="w-20 text-right">
              {budget > 0 ? (
                <span className="text-[11px] font-semibold"
                      style={{ color: varianceColor(variance, line.account_type) }}>
                  {pct(vpct)}
                </span>
              ) : <span style={{ color: "var(--pg-text-4)" }}>—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";
  const { toast } = useToast();
  const qc = useQueryClient();

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [editMode, setEditMode] = useState(false);

  // Local budget overrides (code → amount)
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  // Clear local edits when period changes
  useEffect(() => { setBudgets({}); setEditMode(false); }, [year, month, subsidId]);

  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (subsidId) params.set("subsidiary_id", subsidId);

  const { data, isLoading, error } = useQuery<VarianceReport>({
    queryKey: ["budget-variance", subsidId, year, month],
    queryFn: () => apiFetch(`/budget/variance?${params}`) as Promise<VarianceReport>,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(budgets).map(([account_code, amount]) => ({
        account_code, amount,
      }));
      if (entries.length === 0) return;
      await apiFetch(`/budget?${params}`, {
        method: "PUT",
        body: JSON.stringify({ entries }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-variance", subsidId, year, month] });
      setEditMode(false);
      toast({ title: "Budget saved", description: `${MONTHS[month]} ${year} budget updated.` });
    },
    onError: (err) => toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" }),
  });

  const handleBudgetChange = useCallback((code: string, v: number) => {
    setBudgets(prev => ({ ...prev, [code]: v }));
  }, []);

  // Merge server data with local edits
  const mergedLines: BudgetLine[] = (data?.lines ?? []).map(l => ({
    ...l,
    budget: budgets[l.account_code] ?? l.budget,
    variance: l.actual - (budgets[l.account_code] ?? l.budget),
    variance_pct: (budgets[l.account_code] ?? l.budget) !== 0
      ? ((l.actual - (budgets[l.account_code] ?? l.budget)) / (budgets[l.account_code] ?? l.budget)) * 100
      : 0,
  }));

  const hasEdits = Object.keys(budgets).length > 0;

  // Group lines by account_group, then by type
  const revenueGroups = groupBy(mergedLines.filter(l => l.account_type === "REVENUE"), l => l.account_group);
  const expenseGroups = groupBy(mergedLines.filter(l => l.account_type === "EXPENSE"), l => l.account_group);

  const totalRevenueBudget = mergedLines.filter(l => l.account_type === "REVENUE").reduce((s, l) => s + l.budget, 0);
  const totalRevenueActual = data?.total_revenue_actual ?? 0;
  const totalExpenseBudget = mergedLines.filter(l => l.account_type === "EXPENSE").reduce((s, l) => s + l.budget, 0);
  const totalExpenseActual = data?.total_expense_actual ?? 0;
  const netBudget = totalRevenueBudget - totalExpenseBudget;
  const netActual = totalRevenueActual - totalExpenseActual;
  const netVariance = netActual - netBudget;

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Budget vs Actual</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Click any budget cell to edit. Changes apply to {MONTHS[month]} {year}.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <div className="flex items-center gap-1">
            <button onClick={() => { if (month === 1) { setYear(y => y-1); setMonth(12); } else setMonth(m => m-1); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[13px] font-bold"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>‹</button>
            <span className="text-[13px] font-semibold w-32 text-center" style={{ color: "var(--pg-text-1)" }}>
              {MONTHS[month]} {year}
            </span>
            <button onClick={() => { if (month === 12) { setYear(y => y+1); setMonth(1); } else setMonth(m => m+1); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[13px] font-bold"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>›</button>
          </div>

          {editMode ? (
            <>
              <button onClick={() => { setEditMode(false); setBudgets({}); }}
                      className="h-8 px-3 rounded-xl text-[12px] font-semibold"
                      style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                Cancel
              </button>
              <button onClick={() => saveMutation.mutate()}
                      disabled={!hasEdits || saveMutation.isPending}
                      className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "#059669" }}>
                {saveMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                Save {hasEdits ? `(${Object.keys(budgets).length})` : ""}
              </button>
            </>
          ) : (
            <button onClick={() => setEditMode(true)}
                    className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              <Edit3 className="w-3.5 h-3.5" /> Edit Budget
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Revenue",  budget: totalRevenueBudget, actual: totalRevenueActual, type: "REVENUE", color: "#059669", bg: "#ecfdf5" },
            { label: "Expenses", budget: totalExpenseBudget, actual: totalExpenseActual, type: "EXPENSE", color: "#dc2626", bg: "#fef2f2" },
            { label: "Net Income", budget: netBudget, actual: netActual, type: "REVENUE", color: netActual >= 0 ? "#059669" : "#dc2626", bg: netActual >= 0 ? "#ecfdf5" : "#fef2f2" },
          ].map(({ label, budget, actual, type, color, bg }) => {
            const variance = actual - budget;
            const favorable = type === "REVENUE" ? variance >= 0 : variance <= 0;
            return (
              <div key={label} className="rounded-2xl p-4"
                   style={{ background: bg, border: "1px solid var(--pg-card-border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color }}>{label}</p>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[18px] font-bold" style={{ color }}>{fmt(actual)}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: `${color}99` }}>
                      Budget: {fmt(budget)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-bold" style={{ color: favorable ? "#059669" : "#dc2626" }}>
                      {variance >= 0 ? "+" : "−"}{fmt(variance)}
                    </p>
                    {budget > 0 && (
                      <p className="text-[10px]" style={{ color: favorable ? "#059669" : "#dc2626" }}>
                        {pct((variance / budget) * 100)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-[12px]"
             style={{ background: "#fef2f2", color: "#dc2626" }}>
          <AlertCircle className="w-4 h-4 shrink-0" /> Failed to load budget data
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden"
             style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>

          {/* Column headers */}
          <div className="flex items-center gap-2 px-5 py-3"
               style={{ borderBottom: "2px solid var(--pg-card-border)", background: "var(--pg-muted-bg)" }}>
            <div className="flex-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Account</div>
            <div className="w-32 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Budget</div>
            <div className="w-32 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Actual</div>
            <div className="w-28 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Variance</div>
            <div className="w-20 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Var %</div>
          </div>

          {/* Revenue */}
          {Object.keys(revenueGroups).length > 0 && (
            <>
              <div className="px-5 py-2" style={{ background: "#ecfdf5", borderBottom: "1px solid var(--pg-row-border)" }}>
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">Revenue</p>
              </div>
              {Object.entries(revenueGroups).map(([group, lines]) => (
                <GroupSection key={group} group={group} lines={lines}
                              budgets={budgets} onBudgetChange={handleBudgetChange} editMode={editMode} />
              ))}
              <TotalRow label="Total Revenue" budget={totalRevenueBudget} actual={totalRevenueActual} type="REVENUE" color="#059669" bg="#ecfdf5" />
            </>
          )}

          {/* Expenses */}
          {Object.keys(expenseGroups).length > 0 && (
            <>
              <div className="px-5 py-2" style={{ background: "#fef2f2", borderBottom: "1px solid var(--pg-row-border)" }}>
                <p className="text-[11px] font-bold uppercase tracking-widest text-red-700">Expenses</p>
              </div>
              {Object.entries(expenseGroups).map(([group, lines]) => (
                <GroupSection key={group} group={group} lines={lines}
                              budgets={budgets} onBudgetChange={handleBudgetChange} editMode={editMode} />
              ))}
              <TotalRow label="Total Expenses" budget={totalExpenseBudget} actual={totalExpenseActual} type="EXPENSE" color="#dc2626" bg="#fef2f2" />
            </>
          )}

          {/* Net */}
          <div className="flex items-center gap-2 px-5 py-4"
               style={{ background: netVariance >= 0 ? "#ecfdf5" : "#fef2f2", borderTop: "2px solid var(--pg-card-border)" }}>
            <p className="flex-1 text-[13px] font-bold" style={{ color: netVariance >= 0 ? "#065f46" : "#991b1b" }}>
              Net Income
            </p>
            <p className="w-32 text-right font-mono font-semibold text-[12px]" style={{ color: "var(--pg-text-2)" }}>{fmt(netBudget)}</p>
            <p className="w-32 text-right font-mono font-bold text-[13px]" style={{ color: netActual >= 0 ? "#059669" : "#dc2626" }}>{fmt(netActual)}</p>
            <p className="w-28 text-right font-mono font-bold text-[13px]" style={{ color: netVariance >= 0 ? "#059669" : "#dc2626" }}>
              {netVariance >= 0 ? "+" : "−"}{fmt(netVariance)}
            </p>
            <p className="w-20 text-right text-[11px] font-semibold" style={{ color: netVariance >= 0 ? "#059669" : "#dc2626" }}>
              {netBudget !== 0 ? pct((netVariance / Math.abs(netBudget)) * 100) : "—"}
            </p>
          </div>

          {/* Empty state */}
          {mergedLines.length === 0 && !isLoading && (
            <div className="py-14 text-center">
              <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
                No budget entries or journal postings for {MONTHS[month]} {year}.
              </p>
              <button onClick={() => setEditMode(true)}
                      className="mt-3 text-[12px] font-semibold"
                      style={{ color: "#2563eb" }}>
                Set budgets for this period →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TotalRow({ label, budget, actual, type, color, bg }: {
  label: string; budget: number; actual: number;
  type: string; color: string; bg: string;
}) {
  const variance = actual - budget;
  const favorable = type === "REVENUE" ? variance >= 0 : variance <= 0;
  return (
    <div className="flex items-center gap-2 px-5 py-3"
         style={{ background: bg, borderTop: `1px solid ${color}33`, borderBottom: "1px solid var(--pg-row-border)" }}>
      <p className="flex-1 text-[12px] font-bold" style={{ color }}>{label}</p>
      <p className="w-32 text-right font-mono font-semibold text-[12px]" style={{ color }}>{fmt(budget)}</p>
      <p className="w-32 text-right font-mono font-bold text-[12px]" style={{ color }}>{fmt(actual)}</p>
      <p className="w-28 text-right font-mono font-bold text-[12px]"
         style={{ color: favorable ? "#059669" : "#dc2626" }}>
        {variance >= 0 ? "+" : "−"}{fmt(variance)}
      </p>
      <p className="w-20 text-right text-[11px] font-semibold"
         style={{ color: favorable ? "#059669" : "#dc2626" }}>
        {budget > 0 ? pct((variance / budget) * 100) : "—"}
      </p>
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
