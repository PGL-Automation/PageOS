"use client";

import { DataTable, Column, BulkAction } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownLeft, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Mock data ──────────────────────────────────────────────────────────────────

type GLEntry = {
  id: string; date: string; reference: string; description: string;
  account: string; accountCode: string; debit: number | null; credit: number | null;
  balance: number; period: string; postedBy: string; status: "posted" | "draft" | "reversed";
};

function makeEntries(): GLEntry[] {
  const rows: Omit<GLEntry,"id">[] = [
    { date:"01/11/2026",reference:"INV/2026/001",description:"NSIA Partners — Investment Receipt",  account:"Cash & Equivalents",  accountCode:"1001",debit:null,     credit:5000000, balance:12300000,period:"Nov 2026",postedBy:"System",   status:"posted" },
    { date:"01/11/2026",reference:"INV/2026/001",description:"NSIA Partners — Investment Receipt",  account:"Client Funds",        accountCode:"2001",debit:5000000,  credit:null,     balance:78450000,period:"Nov 2026",postedBy:"System",   status:"posted" },
    { date:"02/11/2026",reference:"PF/2026/0112", description:"Capital Trust — Portfolio Sub.",     account:"Cash & Equivalents",  accountCode:"1001",debit:null,     credit:12000000,balance:24300000,period:"Nov 2026",postedBy:"J. Eze",    status:"posted" },
    { date:"02/11/2026",reference:"PF/2026/0112", description:"Capital Trust — Portfolio Sub.",     account:"Client Funds",        accountCode:"2001",debit:12000000, credit:null,     balance:90450000,period:"Nov 2026",postedBy:"J. Eze",    status:"posted" },
    { date:"05/11/2026",reference:"MORT/2026/1110",description:"Stanbic Mortgage Repayment",        account:"Mortgage Payable",    accountCode:"3005",debit:null,     credit:1250000, balance:28500000,period:"Nov 2026",postedBy:"System",   status:"posted" },
    { date:"05/11/2026",reference:"MORT/2026/1110",description:"Stanbic Mortgage Repayment",        account:"Cash & Equivalents",  accountCode:"1001",debit:1250000,  credit:null,    balance:23050000,period:"Nov 2026",postedBy:"System",   status:"posted" },
    { date:"07/11/2026",reference:"SUS/2026/047",  description:"Unidentified Receipt — Suspense",   account:"Suspense Account",    accountCode:"9999",debit:null,     credit:470000,  balance:470000,  period:"Nov 2026",postedBy:"System",   status:"draft" },
    { date:"10/11/2026",reference:"VPAY/2026/1118",description:"TechSoft Ltd — Vendor Payment",     account:"Accounts Payable",    accountCode:"4001",debit:null,     credit:320000,  balance:12800000,period:"Nov 2026",postedBy:"F. Okonkwo",status:"posted" },
    { date:"10/11/2026",reference:"VPAY/2026/1118",description:"TechSoft Ltd — Vendor Payment",     account:"Cash & Equivalents",  accountCode:"1001",debit:320000,   credit:null,    balance:22730000,period:"Nov 2026",postedBy:"F. Okonkwo",status:"posted" },
    { date:"15/11/2026",reference:"REM/2026/1115",description:"Zenith Client Remittance",           account:"Cash & Equivalents",  accountCode:"1001",debit:null,     credit:850000,  balance:23580000,period:"Nov 2026",postedBy:"System",   status:"posted" },
    { date:"18/11/2026",reference:"FEE/2026/1118",description:"Management Fee — Nov 2026",          account:"Fee Income",          accountCode:"5002",debit:null,     credit:280000,  balance:3840000, period:"Nov 2026",postedBy:"System",   status:"posted" },
    { date:"20/11/2026",reference:"PAYROLL/NOV26",description:"November Payroll",                   account:"Staff Costs",         accountCode:"6001",debit:4850000,  credit:null,    balance:48500000,period:"Nov 2026",postedBy:"A. Nwosu",  status:"posted" },
    { date:"20/11/2026",reference:"PAYROLL/NOV26",description:"November Payroll",                   account:"Cash & Equivalents",  accountCode:"1001",debit:null,     credit:4850000, balance:18730000,period:"Nov 2026",postedBy:"A. Nwosu",  status:"reversed" },
    { date:"25/11/2026",reference:"RENT/2026/1125",description:"Office Rent — Nov 2026",            account:"Administration",      accountCode:"6005",debit:1200000,  credit:null,    balance:12000000,period:"Nov 2026",postedBy:"B. Lawal",  status:"posted" },
  ];
  return rows.map((r, i) => ({ ...r, id: `gl-${i+1}` }));
}

const DATA = makeEntries();

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n / 100);
}

const STATUS_CFG = {
  posted:   { bg: "#d1fae5", color: "#065f46", label: "Posted" },
  draft:    { bg: "#fef3c7", color: "#92400e", label: "Draft" },
  reversed: { bg: "#fee2e2", color: "#991b1b", label: "Reversed" },
};

// ── Column definitions ─────────────────────────────────────────────────────────

const COLUMNS: Column<GLEntry>[] = [
  { id: "date",        header: "Date",        accessor: "date",        sortable: true, width: "90px" },
  { id: "reference",   header: "Reference",   accessor: "reference",   sortable: true,
    cell: v => <code className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background:"var(--pg-muted-bg)", color:"var(--pg-text-2)" }}>{String(v)}</code> },
  { id: "description", header: "Description", accessor: "description", sortable: true,
    cell: v => <span className="text-[12.5px]" style={{ color:"var(--pg-text-1)" }}>{String(v)}</span> },
  { id: "accountCode", header: "A/C",         accessor: "accountCode", sortable: true, width: "60px",
    cell: v => <span className="text-[11px] font-mono" style={{ color:"var(--pg-text-3)" }}>{String(v)}</span> },
  { id: "account",     header: "Account",     accessor: "account",     sortable: true,
    cell: v => <span className="text-[12px]" style={{ color:"var(--pg-text-2)" }}>{String(v)}</span> },
  { id: "debit",       header: "Debit",       accessor: "debit",       sortable: true, align: "right", width: "110px",
    cell: v => v != null ? (
      <div className="flex items-center justify-end gap-1">
        <ArrowDownLeft className="w-3 h-3 text-red-400" />
        <span className="text-[12px] font-semibold tabular text-red-600 dark:text-red-400">{fmt(v as number)}</span>
      </div>
    ) : <span className="text-[11px]" style={{ color:"var(--pg-text-4)" }}>—</span> },
  { id: "credit",      header: "Credit",      accessor: "credit",      sortable: true, align: "right", width: "110px",
    cell: v => v != null ? (
      <div className="flex items-center justify-end gap-1">
        <ArrowUpRight className="w-3 h-3 text-emerald-500" />
        <span className="text-[12px] font-semibold tabular text-emerald-600 dark:text-emerald-400">{fmt(v as number)}</span>
      </div>
    ) : <span className="text-[11px]" style={{ color:"var(--pg-text-4)" }}>—</span> },
  { id: "postedBy",    header: "Posted by",   accessor: "postedBy",    sortable: true, initiallyHidden: true,
    cell: v => <span className="text-[12px]" style={{ color:"var(--pg-text-2)" }}>{String(v)}</span> },
  { id: "status",      header: "Status",      accessor: "status",      sortable: true, width: "90px",
    cell: v => { const s = STATUS_CFG[v as keyof typeof STATUS_CFG]; return s ? (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background:s.bg, color:s.color }}>{s.label}</span>
    ) : null; } },
  { id: "period",      header: "Period",      accessor: "period",      sortable: true, initiallyHidden: true },
];

const BULK: BulkAction[] = [
  { label: "Export selected", icon: Download, onClick: ids => console.log("export", ids) },
  { label: "Reverse entries", icon: Trash2, destructive: true, onClick: ids => console.log("reverse", ids) },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const totalDebit  = DATA.reduce((s, r) => s + (r.debit  ?? 0), 0);
  const totalCredit = DATA.reduce((s, r) => s + (r.credit ?? 0), 0);

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color:"var(--pg-text-1)" }}>General Ledger</h1>
          <p className="text-[12px] mt-0.5" style={{ color:"var(--pg-text-3)" }}>Page Capital · November 2026</p>
        </div>
        <div className="flex gap-3 text-right">
          <div className="rounded-xl px-4 py-3" style={{ background:"var(--pg-card)", border:"1px solid var(--pg-card-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">Total Debits</p>
            <p className="text-[18px] font-bold tabular" style={{ color:"var(--pg-text-1)" }}>{fmt(totalDebit)}</p>
          </div>
          <div className="rounded-xl px-4 py-3" style={{ background:"var(--pg-card)", border:"1px solid var(--pg-card-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Total Credits</p>
            <p className="text-[18px] font-bold tabular" style={{ color:"var(--pg-text-1)" }}>{fmt(totalCredit)}</p>
          </div>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        data={DATA}
        searchPlaceholder="Search ledger…"
        searchKeys={["description","reference","account","accountCode"]}
        bulkActions={BULK}
        onExport={() => console.log("export all")}
        pageSize={20}
        emptyMessage="No ledger entries found."
      />
    </div>
  );
}
