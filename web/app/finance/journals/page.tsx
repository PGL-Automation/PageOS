"use client";

import { useState } from "react";
import { DataTable, Column, BulkAction } from "@/components/ui/data-table";
import { Plus, Download, Trash2, CheckCircle2, FileText, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types & Data ───────────────────────────────────────────────────────────────

type JournalStatus = "posted" | "draft" | "reversed" | "pending_approval";

type Journal = {
  id: string; date: string; reference: string; description: string;
  debitTotal: number; creditTotal: number; lines: number;
  createdBy: string; status: JournalStatus; type: string;
};

const DATA: Journal[] = [
  { id:"j1",  date:"01/11/2026",reference:"JV/2026/001", description:"NSIA Investment Receipt — Nov 2026",         debitTotal:5000000, creditTotal:5000000, lines:2, createdBy:"System",    status:"posted",           type:"Receipt" },
  { id:"j2",  date:"02/11/2026",reference:"JV/2026/002", description:"Capital Trust Portfolio Subscription",        debitTotal:12000000,creditTotal:12000000,lines:2, createdBy:"J. Eze",    status:"posted",           type:"Receipt" },
  { id:"j3",  date:"05/11/2026",reference:"JV/2026/003", description:"Stanbic Mortgage Monthly Repayment",          debitTotal:1250000, creditTotal:1250000, lines:2, createdBy:"System",    status:"posted",           type:"Payment" },
  { id:"j4",  date:"07/11/2026",reference:"JV/2026/004", description:"Suspense — Unidentified TRF/7832461",         debitTotal:470000,  creditTotal:470000,  lines:2, createdBy:"System",    status:"draft",            type:"Suspense" },
  { id:"j5",  date:"10/11/2026",reference:"JV/2026/005", description:"TechSoft Ltd Vendor Payment",                 debitTotal:320000,  creditTotal:320000,  lines:2, createdBy:"F. Okonkwo",status:"posted",           type:"Payment" },
  { id:"j6",  date:"15/11/2026",reference:"JV/2026/006", description:"Zenith Bank Client Remittance",               debitTotal:850000,  creditTotal:850000,  lines:2, createdBy:"System",    status:"posted",           type:"Receipt" },
  { id:"j7",  date:"18/11/2026",reference:"JV/2026/007", description:"Management Fee Accrual — Nov 2026",           debitTotal:280000,  creditTotal:280000,  lines:4, createdBy:"System",    status:"posted",           type:"Accrual" },
  { id:"j8",  date:"20/11/2026",reference:"JV/2026/008", description:"November 2026 Payroll",                       debitTotal:4850000, creditTotal:4850000, lines:8, createdBy:"A. Nwosu",  status:"posted",           type:"Payroll" },
  { id:"j9",  date:"22/11/2026",reference:"JV/2026/009", description:"Q4 Interest Accrual — Fixed Income Portfolio", debitTotal:3200000, creditTotal:3200000, lines:6, createdBy:"System",    status:"pending_approval", type:"Accrual" },
  { id:"j10", date:"25/11/2026",reference:"JV/2026/010", description:"Office Rent — November 2026",                 debitTotal:1200000, creditTotal:1200000, lines:2, createdBy:"B. Lawal",  status:"posted",           type:"Expense" },
  { id:"j11", date:"28/11/2026",reference:"JV/2026/011", description:"Depreciation — Q4 Fixed Assets",             debitTotal:580000,  creditTotal:580000,  lines:3, createdBy:"System",    status:"draft",            type:"Depreciation" },
  { id:"j12", date:"30/11/2026",reference:"JV/2026/012", description:"Month-end Closing Entries",                   debitTotal:0,       creditTotal:0,       lines:0, createdBy:"System",    status:"draft",            type:"Closing" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n / 100);
}

const STATUS_CFG: Record<JournalStatus, { label: string; bg: string; color: string }> = {
  posted:           { label: "Posted",           bg: "#d1fae5", color: "#065f46" },
  draft:            { label: "Draft",            bg: "#f1f5f9", color: "#475569" },
  reversed:         { label: "Reversed",         bg: "#fee2e2", color: "#991b1b" },
  pending_approval: { label: "Pending Approval", bg: "#fef3c7", color: "#92400e" },
};

const TYPE_COLORS: Record<string, string> = {
  Receipt: "#2563eb", Payment: "#dc2626", Accrual: "#7c3aed", Payroll: "#059669",
  Suspense: "#d97706", Expense: "#f97316", Depreciation: "#64748b", Closing: "#94a3b8",
};

// ── Columns ────────────────────────────────────────────────────────────────────

const COLUMNS: Column<Journal>[] = [
  { id: "date",        header: "Date",        accessor: "date",        sortable: true, width: "90px" },
  { id: "reference",   header: "Reference",   accessor: "reference",   sortable: true, width: "120px",
    cell: v => <code className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background:"var(--pg-muted-bg)", color:"var(--pg-text-2)" }}>{String(v)}</code> },
  { id: "type",        header: "Type",        accessor: "type",        sortable: true, width: "100px",
    cell: (v) => {
      const color = TYPE_COLORS[String(v)] ?? "#64748b";
      return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: color + "18", color }}>{String(v)}</span>;
    }},
  { id: "description", header: "Description", accessor: "description", sortable: true,
    cell: v => <span className="text-[12.5px]" style={{ color:"var(--pg-text-1)" }}>{String(v)}</span> },
  { id: "lines",       header: "Lines",       accessor: "lines",       sortable: true, align: "center", width: "60px",
    cell: v => <span className="text-[12px] tabular" style={{ color:"var(--pg-text-3)" }}>{String(v)}</span> },
  { id: "debitTotal",  header: "Debit",       accessor: "debitTotal",  sortable: true, align: "right", width: "110px",
    cell: v => (v as number) > 0 ? <span className="text-[12px] font-semibold tabular text-red-600 dark:text-red-400">{fmt(v as number)}</span> : <span style={{ color:"var(--pg-text-4)" }}>—</span> },
  { id: "creditTotal", header: "Credit",      accessor: "creditTotal", sortable: true, align: "right", width: "110px",
    cell: v => (v as number) > 0 ? <span className="text-[12px] font-semibold tabular text-emerald-600 dark:text-emerald-400">{fmt(v as number)}</span> : <span style={{ color:"var(--pg-text-4)" }}>—</span> },
  { id: "createdBy",   header: "Created by",  accessor: "createdBy",   sortable: true, width: "110px",
    cell: v => <span className="text-[12px]" style={{ color:"var(--pg-text-2)" }}>{String(v)}</span> },
  { id: "status",      header: "Status",      accessor: "status",      sortable: true, width: "130px",
    cell: v => { const s = STATUS_CFG[v as JournalStatus]; return s ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background:s.bg, color:s.color }}>{s.label}</span> : null; } },
];

const BULK: BulkAction[] = [
  { label: "Post selected",   icon: CheckCircle2, onClick: ids => alert(`Post ${ids.length} entries`) },
  { label: "Export",          icon: Download,     onClick: ids => alert(`Export ${ids.length}`) },
  { label: "Delete drafts",   icon: Trash2, destructive: true, onClick: ids => alert(`Delete ${ids.length}`) },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function JournalsPage() {
  const [showNewForm, setShowNewForm] = useState(false);

  const posted  = DATA.filter(j => j.status === "posted").length;
  const drafts  = DATA.filter(j => j.status === "draft").length;
  const pending = DATA.filter(j => j.status === "pending_approval").length;

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color:"var(--pg-text-1)" }}>Journal Entries</h1>
          <p className="text-[12px] mt-0.5" style={{ color:"var(--pg-text-3)" }}>Page Capital · November 2026 · {DATA.length} entries</p>
        </div>
        <button onClick={() => setShowNewForm(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background:"linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow:"0 1px 6px rgba(37,99,235,0.35)" }}>
          <Plus className="w-3.5 h-3.5" /> New Journal
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[{ label:"Posted", n:posted, color:"#059669", bg:"#d1fae5" }, { label:"Drafts", n:drafts, color:"#475569", bg:"#f1f5f9" }, { label:"Pending Approval", n:pending, color:"#d97706", bg:"#fef3c7" }].map(s => (
          <div key={s.label} className="rounded-xl px-5 py-4 flex items-center gap-4" style={{ background:"var(--pg-card)", border:`1px solid var(--pg-card-border)` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:s.bg }}>
              <FileText className="w-4.5 h-4.5" style={{ color:s.color, width:18, height:18 }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:s.color }}>{s.label}</p>
              <p className="text-[24px] font-bold tabular leading-none mt-0.5" style={{ color:"var(--pg-text-1)" }}>{s.n}</p>
            </div>
          </div>
        ))}
      </div>

      {/* New journal form (progressive disclosure) */}
      {showNewForm && (
        <div className="rounded-2xl overflow-hidden" style={{ background:"var(--pg-card)", border:"1px solid #bfdbfe" }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:"1px solid var(--pg-row-border)" }}>
            <h2 className="text-[13px] font-semibold" style={{ color:"var(--pg-text-1)" }}>New Journal Entry</h2>
            <button onClick={() => setShowNewForm(false)} className="text-[11px]" style={{ color:"var(--pg-text-3)" }}>Cancel</button>
          </div>
          <div className="p-5 grid md:grid-cols-3 gap-4">
            {[{ label:"Date", type:"date", placeholder:"" }, { label:"Reference", type:"text", placeholder:"JV/2026/013" }, { label:"Type", type:"select", placeholder:"Select type" }].map(f => (
              <div key={f.label}>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color:"var(--pg-text-3)" }}>{f.label}</label>
                <input type={f.type === "select" ? "text" : f.type} placeholder={f.placeholder}
                       className="w-full h-9 px-3 rounded-lg text-[13px] outline-none transition-all"
                       style={{ background:"var(--pg-input)", border:"1px solid var(--pg-input-border)", color:"var(--pg-text-1)" }} />
              </div>
            ))}
            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color:"var(--pg-text-3)" }}>Description</label>
              <input type="text" placeholder="Describe the nature of this journal entry…"
                     className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                     style={{ background:"var(--pg-input)", border:"1px solid var(--pg-input-border)", color:"var(--pg-text-1)" }} />
            </div>
            <div className="md:col-span-3 flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewForm(false)}
                      className="h-9 px-4 rounded-xl text-[13px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                      style={{ border:"1px solid var(--pg-card-border)", color:"var(--pg-text-2)" }}>
                Cancel
              </button>
              <button className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                      style={{ background:"linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                Save as Draft
              </button>
            </div>
          </div>
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        data={DATA}
        searchPlaceholder="Search journals…"
        searchKeys={["reference","description","type","createdBy"]}
        bulkActions={BULK}
        onExport={() => alert("export")}
        pageSize={15}
        emptyMessage="No journal entries found."
      />
    </div>
  );
}
