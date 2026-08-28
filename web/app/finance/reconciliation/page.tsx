"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Upload, Download, Brain, Plus, Check, X,
  Sparkles, AlertCircle, ChevronDown, Filter, Search,
  ArrowUpRight, ArrowDownLeft, CheckCircle2, XCircle,
  Settings, Loader2, FileText, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type BankAccount = {
  id: string; subsidiary_id: string; bank_name: string;
  account_number: string; account_name: string; currency: string;
  gl_account_code: string;
  parser_column_map: Record<string, string>; status: string;
};

type Statement = {
  id: string; bank_account_id: string; period_start: string; period_end: string;
  opening_balance: number; closing_balance: number; status: string;
};

type ReconRun = {
  id: string; bank_account_id: string; period_start: string; period_end: string;
  status: string; reconciled_by?: string;
};

type RunSummary = {
  matched: number; unmatched_bank: number; unmatched_internal: number;
  total_bank_lines: number; total_internal_txns: number;
};

type RunDetails = { run: ReconRun; summary: RunSummary; matches: unknown[] };

type FullMatch = {
  match_id: string; status: string; match_type: string;
  confidence_pct?: number; notes: string;
  bank_line_id?: string; bank_date?: string; bank_narration: string;
  bank_debit_kobo: number; bank_credit_kobo: number; bank_reference: string;
  ledger_txn_id?: string; ledger_date?: string; ledger_type: string;
  ledger_direction: string; ledger_amount_kobo: number; ledger_reference: string;
};

type MatchFilter = "all" | "matched" | "unmatched" | "ai_suggested";

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

async function reconFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/reconciliation${path}`, {
    credentials: "include",
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message ?? "Request failed");
  }
  return res.json();
}

function kobo(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n / 100);
}

function shortKobo(n: number) {
  const v = n / 100;
  if (v >= 1e9) return `₦${(v/1e9).toFixed(1)}B`;
  if (v >= 1e6) return `₦${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `₦${(v/1e3).toFixed(0)}K`;
  return `₦${v.toFixed(0)}`;
}

// ── Account setup form ────────────────────────────────────────────────────────

const GL_ACCOUNT_OPTIONS = [
  { code: "1110", label: "1110 – Cash at Bank (GTBank)" },
  { code: "1111", label: "1111 – Cash at Bank (UBA)" },
  { code: "1112", label: "1112 – Cash at Bank (Stanbic)" },
  { code: "1113", label: "1113 – Cash at Bank (Access)" },
  { code: "1114", label: "1114 – Cash at Bank (Zenith)" },
  { code: "1115", label: "1115 – Cash at Bank (FCMB)" },
];

function AddAccountForm({ subsidiaryId, onCreated }: { subsidiaryId: string; onCreated: () => void }) {
  const { toast } = useToast();
  const [bankName, setBankName]           = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName]     = useState("");
  const [currency, setCurrency]           = useState("NGN");
  const [glCode, setGlCode]               = useState("1110");
  const [saving, setSaving]               = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await reconFetch("/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subsidiary_id: subsidiaryId,
          bank_name: bankName,
          account_number: accountNumber,
          account_name: accountName,
          currency,
          gl_account_code: glCode,
        }),
      });
      toast({ title: "Bank Account Created" });
      onCreated();
    } catch (err) {
      toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-6 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Bank Name</label>
          <input value={bankName} onChange={e => setBankName(e.target.value)} required placeholder="GT Bank"
                 className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                 style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        </div>
        <div>
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Account Number</label>
          <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} required placeholder="0044456789"
                 className="w-full h-10 px-3 rounded-xl text-[13px] outline-none font-mono"
                 style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        </div>
        <div>
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Account Name</label>
          <input value={accountName} onChange={e => setAccountName(e.target.value)} required placeholder="Page Asset Management Ltd"
                 className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                 style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
        </div>
        <div>
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Currency</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
            <option value="NGN">NGN — Nigerian Naira</option>
            <option value="USD">USD — US Dollar</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
            GL Account Code <span className="text-[11px] font-normal" style={{ color: "var(--pg-text-3)" }}>— used to sync transactions from the journal ledger</span>
          </label>
          <select value={glCode} onChange={e => setGlCode(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none font-mono"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
            {GL_ACCOUNT_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={saving}
                className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
          {saving ? "Creating…" : "Add Bank Account"}
        </button>
      </div>
    </form>
  );
}

// ── File upload section ───────────────────────────────────────────────────────

// ── Inline GL code editor ─────────────────────────────────────────────────────

function GLCodeEditor({ account, onUpdated }: { account: BankAccount; onUpdated: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(!account.gl_account_code);
  const [value, setValue] = useState(account.gl_account_code || GL_ACCOUNT_OPTIONS[0].code);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (value === account.gl_account_code) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/v1/reconciliation/accounts/${account.id}/gl-code`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gl_account_code: value }),
      });
      if (!res.ok) throw new Error("Failed to update GL code");
      toast({ title: "GL account code updated" });
      onUpdated();
      setEditing(false);
    } catch (err) {
      toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const optionLabel = GL_ACCOUNT_OPTIONS.find(o => o.code === account.gl_account_code)?.label;

  return (
    <div className="rounded-xl p-3 mb-3" style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-semibold" style={{ color: "var(--pg-text-2)" }}>Linked GL Account</span>
        {!editing && (
          account.gl_account_code ? (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "#fff7f0", color: "#FF6600" }}>{account.gl_account_code}</span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "#fef2f2", color: "#dc2626" }}>not set</span>
          )
        )}
        {!editing && (
          <button onClick={() => setEditing(true)}
                  className="ml-auto text-[10px] font-semibold"
                  style={{ color: "#FF6600" }}>
            {account.gl_account_code ? "Change" : "Set now"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex gap-2 mt-2">
          <select value={value} onChange={e => setValue(e.target.value)}
                  className="flex-1 h-8 px-2 rounded-lg text-[12px] font-mono outline-none appearance-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
            {GL_ACCOUNT_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
          <button onClick={save} disabled={saving}
                  className="h-8 px-3 rounded-lg text-[11px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "#FF6600" }}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
          </button>
          {account.gl_account_code && (
            <button onClick={() => setEditing(false)}
                    className="h-8 px-2 rounded-lg text-[11px]"
                    style={{ color: "var(--pg-text-3)" }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
          {optionLabel ?? "All posted journals hitting this account code are pulled as internal transactions."}
        </p>
      )}
    </div>
  );
}

function UploadSection({
  account, subsidiaryId, statements, onUploaded,
}: {
  account: BankAccount;
  subsidiaryId: string;
  statements: Statement[];
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const statRef   = useRef<HTMLInputElement>(null);

  const [pendingStatFile, setPendingStatFile] = useState<File | null>(null);
  const [statResult,      setStatResult]      = useState<{ name: string; period: string } | null>(null);
  const [syncResult,      setSyncResult]      = useState<{ rows: number; from: string; to: string } | null>(null);

  const [statPeriodStart, setStatStart] = useState("");
  const [statPeriodEnd,   setStatEnd]   = useState("");
  const [openBal,  setOpenBal]          = useState("0");
  const [closeBal, setCloseBal]         = useState("0");

  const ledgRef   = useRef<HTMLInputElement>(null);

  const [syncFrom, setSyncFrom] = useState("");
  const [syncTo,   setSyncTo]   = useState("");
  const [showLedgerUpload, setShowLedgerUpload] = useState(false);
  const [pendingLedgerFile, setPendingLedgerFile] = useState<File | null>(null);
  const [ledgerResult, setLedgerResult] = useState<{ name: string; rows: number } | null>(null);

  const [uploadingBankStat, setUploadBankStat] = useState(false);
  const [syncingGL,         setSyncingGL]       = useState(false);
  const [uploadingLedger,   setUploadingLedger] = useState(false);

  // Pre-fill sync range from statement period when available
  const lastStatement = statements[0];

  function onStatFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { setPendingStatFile(f); setStatResult(null); }
    e.target.value = "";
  }

  // ── Upload bank statement ────────────────────────────────────────────────
  async function uploadStatement() {
    if (!pendingStatFile) return;
    if (!statPeriodStart || !statPeriodEnd) {
      toast({ title: "Set period dates first", description: "Both Period Start and Period End are required.", variant: "destructive" });
      return;
    }
    setUploadBankStat(true);
    try {
      const fd = new FormData();
      fd.append("file", pendingStatFile);
      fd.append("period_start",    statPeriodStart);
      fd.append("period_end",      statPeriodEnd);
      fd.append("opening_balance", String(Math.round(parseFloat(openBal)  * 100)));
      fd.append("closing_balance", String(Math.round(parseFloat(closeBal) * 100)));
      const res = await fetch(`${BASE}/api/v1/reconciliation/accounts/${account.id}/statements`, {
        method: "POST", credentials: "include", body: fd,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `Server error ${res.status}`);
      setStatResult({ name: pendingStatFile.name, period: `${statPeriodStart} → ${statPeriodEnd}` });
      setPendingStatFile(null);
      toast({ title: "Bank Statement Uploaded ✓", description: `${pendingStatFile.name} imported for ${statPeriodStart} → ${statPeriodEnd}` });
      onUploaded();
    } catch (err) {
      toast({ title: "Statement Upload Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploadBankStat(false);
    }
  }

  // ── Ledger file picked (secondary path) ─────────────────────────────────
  function onLedgerFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { setPendingLedgerFile(f); setLedgerResult(null); }
    e.target.value = "";
  }

  async function uploadLedger() {
    if (!pendingLedgerFile) return;
    setUploadingLedger(true);
    try {
      const fd = new FormData();
      fd.append("file", pendingLedgerFile);
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts/${account.id}/ledger?subsidiary_id=${subsidiaryId}`,
        { method: "POST", credentials: "include", body: fd },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `Server error ${res.status}`);
      const rows = body?.rows_imported ?? 0;
      setLedgerResult({ name: pendingLedgerFile.name, rows });
      setPendingLedgerFile(null);
      toast({ title: "GL Ledger Uploaded ✓", description: `${rows} transaction rows imported from ${pendingLedgerFile.name}` });
      onUploaded();
    } catch (err) {
      toast({ title: "Ledger Upload Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploadingLedger(false);
    }
  }

  // ── Sync GL from finance journals ────────────────────────────────────────
  async function syncFromJournals() {
    const from = syncFrom || lastStatement?.period_start?.slice(0, 10) || "";
    const to   = syncTo   || lastStatement?.period_end?.slice(0, 10)   || "";
    setSyncingGL(true);
    try {
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts/${account.id}/sync-gl`,
        {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? body?.message ?? `Server error ${res.status}`);
      const rows = body?.rows_synced ?? 0;
      setSyncResult({ rows, from, to });
      toast({ title: "GL Synced ✓", description: `${rows} new transaction${rows !== 1 ? "s" : ""} pulled from finance journals.` });
      onUploaded();
    } catch (err) {
      toast({ title: "GL Sync Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSyncingGL(false);
    }
  }

  const hasStatements = statements.length > 0;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              Step 2 — Upload Data
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Upload the bank statement CSV and GL ledger Excel, then create a reconciliation run.
            </p>
          </div>
          {hasStatements && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#d1fae5", color: "#065f46" }}>
              {statements.length} statement{statements.length > 1 ? "s" : ""} uploaded
            </span>
          )}
        </div>
      </div>

      {/* Previously uploaded statements */}
      {hasStatements && (
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--pg-row-border)", background: "rgba(16,185,129,0.04)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#059669" }}>Uploaded Statements</p>
          <div className="space-y-1">
            {statements.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-[11px]" style={{ color: "var(--pg-text-2)" }}>
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                <span className="font-mono">{s.period_start?.slice(0,10)}</span>
                <span style={{ color: "var(--pg-text-4)" }}>→</span>
                <span className="font-mono">{s.period_end?.slice(0,10)}</span>
                <span className="capitalize px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ background: s.status === "reconciled" ? "#d1fae5" : "#fef3c7", color: s.status === "reconciled" ? "#065f46" : "#92400e" }}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-5 grid md:grid-cols-2 gap-6">

        {/* ── Bank statement ─────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>
            1. Bank Statement (CSV or Excel)
          </p>

          {/* Success state */}
          {statResult && (
            <div className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-xl"
                 style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-semibold text-emerald-800">{statResult.name}</p>
                <p className="text-[11px] text-emerald-600">{statResult.period}</p>
              </div>
              <button onClick={() => setStatResult(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* File picked but not uploaded yet */}
          {pendingStatFile && !statResult && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2.5 rounded-xl"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
              <FileText className="w-4 h-4 shrink-0" style={{ color: "#FF6600" }} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{pendingStatFile.name}</p>
                <p className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>
                  {(pendingStatFile.size / 1024).toFixed(1)} KB — ready to upload
                </p>
              </div>
              <button onClick={() => setPendingStatFile(null)} style={{ color: "var(--pg-text-3)" }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Period + balance fields */}
          {!statResult && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { label: "Period Start", value: statPeriodStart, onChange: setStatStart, type: "date" },
                { label: "Period End",   value: statPeriodEnd,   onChange: setStatEnd,   type: "date" },
                { label: "Opening Bal (₦)", value: openBal,  onChange: setOpenBal, type: "number" },
                { label: "Closing Bal (₦)", value: closeBal, onChange: setCloseBal, type: "number" },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>{f.label}</label>
                  <input type={f.type} value={f.value} onChange={e => f.onChange(e.target.value)}
                         className="w-full h-9 px-2 rounded-lg text-[12px] outline-none font-mono"
                         style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
                </div>
              ))}
            </div>
          )}

          <input ref={statRef} type="file" accept=".csv,.CSV,.xlsx,.xls,.XLSX" className="hidden" onChange={onStatFilePicked} />

          {!pendingStatFile && !statResult && (
            <button onClick={() => statRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-[12px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
              <Upload className="w-3.5 h-3.5" /> Choose Statement File (CSV or Excel)
            </button>
          )}

          {pendingStatFile && !statResult && (
            <button onClick={uploadStatement} disabled={uploadingBankStat}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-[12px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
              {uploadingBankStat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploadingBankStat ? "Uploading…" : `Upload ${pendingStatFile.name}`}
            </button>
          )}

          {statResult && (
            <button onClick={() => { setStatResult(null); statRef.current?.click(); }}
                    className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-[12px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              <Upload className="w-3.5 h-3.5" /> Upload Another Statement
            </button>
          )}

          <p className="text-[10px] mt-2" style={{ color: "var(--pg-text-4)" }}>
            CSV or Excel with columns: Date, Debit, Credit, Balance, Narration, Reference
          </p>
        </div>

        {/* ── GL Sync ────────────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>
            2. Internal Ledger (from Finance Journals)
          </p>

          {/* Success state */}
          {syncResult && (
            <div className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-xl"
                 style={{ background: "#f5f3ff", border: "1px solid #c4b5fd" }}>
              <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-semibold text-violet-800">
                  {syncResult.rows} transaction{syncResult.rows !== 1 ? "s" : ""} synced
                </p>
                <p className="text-[11px] text-violet-600">
                  {syncResult.from} → {syncResult.to} · GL {account.gl_account_code || "—"}
                </p>
              </div>
              <button onClick={() => setSyncResult(null)} className="ml-auto text-violet-400 hover:text-violet-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* GL code — inline editable */}
          <GLCodeEditor account={account} onUpdated={onUploaded} />

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>From</label>
              <input type="date"
                     value={syncFrom || lastStatement?.period_start?.slice(0, 10) || ""}
                     onChange={e => setSyncFrom(e.target.value)}
                     className="w-full h-9 px-2 rounded-lg text-[12px] outline-none font-mono"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>To</label>
              <input type="date"
                     value={syncTo || lastStatement?.period_end?.slice(0, 10) || ""}
                     onChange={e => setSyncTo(e.target.value)}
                     className="w-full h-9 px-2 rounded-lg text-[12px] outline-none font-mono"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          </div>

          <button onClick={syncFromJournals} disabled={syncingGL || !account.gl_account_code}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
            {syncingGL ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncingGL ? "Syncing…" : "Sync from Finance Journals"}
          </button>

          <p className="text-[10px] mt-2" style={{ color: "var(--pg-text-4)" }}>
            Pulls all posted journal lines for the linked GL code. Already-synced entries are skipped automatically.
          </p>

          {/* ── Secondary: manual GL export upload ──────────────────────── */}
          <div className="mt-4 pt-4" style={{ borderTop: "1px dashed var(--pg-row-border)" }}>
            <button onClick={() => setShowLedgerUpload(v => !v)}
                    className="flex items-center gap-1.5 text-[11px] font-medium w-full"
                    style={{ color: "var(--pg-text-3)" }}>
              <Upload className="w-3 h-3" />
              Or upload a GL export file instead
              <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform", showLedgerUpload && "rotate-180")} />
            </button>

            {showLedgerUpload && (
              <div className="mt-3 space-y-2">
                {ledgerResult && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                       style={{ background: "#f5f3ff", border: "1px solid #c4b5fd" }}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-violet-800 truncate">{ledgerResult.name}</p>
                      <p className="text-[10px] text-violet-600">{ledgerResult.rows} rows imported</p>
                    </div>
                    <button onClick={() => setLedgerResult(null)} className="shrink-0 text-violet-400 hover:text-violet-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {pendingLedgerFile && !ledgerResult && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                       style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                    <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "#7c3aed" }} />
                    <p className="flex-1 text-[11px] truncate" style={{ color: "var(--pg-text-1)" }}>{pendingLedgerFile.name}</p>
                    <button onClick={() => setPendingLedgerFile(null)} style={{ color: "var(--pg-text-3)" }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <input ref={ledgRef} type="file" accept=".xlsx,.xls,.XLSX,.csv,.CSV" className="hidden" onChange={onLedgerFilePicked} />

                {!pendingLedgerFile && !ledgerResult && (
                  <button onClick={() => ledgRef.current?.click()}
                          className="w-full h-9 flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium"
                          style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)", background: "var(--pg-muted-bg)" }}>
                    <Upload className="w-3.5 h-3.5" /> Choose GL Export File
                  </button>
                )}

                {pendingLedgerFile && !ledgerResult && (
                  <button onClick={uploadLedger} disabled={uploadingLedger}
                          className="w-full h-9 flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-60"
                          style={{ background: "#059669" }}>
                    {uploadingLedger ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {uploadingLedger ? "Uploading…" : `Upload ${pendingLedgerFile.name}`}
                  </button>
                )}

                <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                  Providus GL Excel (.xlsx) or generic CSV. Use this if the journal module doesn&apos;t cover all transactions.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step 3 prompt */}
      {(statResult || hasStatements) && syncResult && (
        <div className="flex items-center gap-3 px-5 py-4"
             style={{ borderTop: "1px solid var(--pg-row-border)", background: "rgba(255,102,0,0.04)" }}>
          <CheckCircle2 className="w-4 h-4 text-orange-500 shrink-0" />
          <p className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
            Statement uploaded and GL synced. Select a date range above and click <strong>New Run</strong> to start auto-matching.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Match row ──────────────────────────────────────────────────────────────────

function MatchRowContent({
  m, onAccept, onDismiss, isSelected, onClick,
}: { m: FullMatch; onAccept?: () => void; onDismiss?: () => void; isSelected?: boolean; onClick?: () => void }) {
  const bankAmt = m.bank_credit_kobo > 0 ? m.bank_credit_kobo : -m.bank_debit_kobo;
  const bankDir = m.bank_credit_kobo > 0 ? "credit" : "debit";

  // Show as AI suggestion when match_type=auto and confidence < 100
  const isAI = m.match_type === "auto" && (m.confidence_pct ?? 100) < 100;

  const STATUS_CFG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
    matched:            { icon: CheckCircle2, color: "#059669", bg: "#d1fae5", label: isAI ? `AI ${m.confidence_pct}%` : `✓ ${m.confidence_pct ?? 100}%` },
    unmatched_bank:     { icon: AlertCircle,  color: "#d97706", bg: "#fef3c7", label: "Bank only" },
    unmatched_internal: { icon: AlertCircle,  color: "#dc2626", bg: "#fee2e2", label: "Ledger only" },
    adjustment:         { icon: RefreshCw,    color: "#0891b2", bg: "#ecfeff", label: "Adjustment" },
  };
  const cfgKey = isAI ? "matched" : m.status;
  const cfg = STATUS_CFG[cfgKey] ?? STATUS_CFG.unmatched_bank;
  const statusBg = isAI ? "#ede9fe" : cfg.bg;
  const statusColor = isAI ? "#7c3aed" : cfg.color;
  const StatusIcon = isAI ? Sparkles : cfg.icon;

  const isUnmatched = m.status === "unmatched_bank" || m.status === "unmatched_internal";

  return (
    <tr key={m.match_id}
        className={cn("border-b transition-colors", isUnmatched && "cursor-pointer", isSelected && "ring-2 ring-inset ring-orange-400")}
        style={{ borderColor: "var(--pg-row-border)", background: isSelected ? "rgba(255,102,0,0.07)" : undefined }}
        onClick={onClick}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = isSelected ? "rgba(255,102,0,0.07)" : ""; }}>
      {/* Bank side */}
      <td className="py-3 pl-5 pr-3 w-28">
        <span className="text-[11px] font-mono" style={{ color: "var(--pg-text-3)" }}>{m.bank_date ?? "—"}</span>
      </td>
      <td className="py-3 pr-3 max-w-[200px]">
        {m.bank_line_id ? (
          <div>
            <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{m.bank_narration || m.bank_reference || "—"}</p>
            <p className="text-[10px] font-mono truncate" style={{ color: "var(--pg-text-4)" }}>{m.bank_reference}</p>
          </div>
        ) : <span style={{ color: "var(--pg-text-4)" }}>—</span>}
      </td>
      <td className="py-3 pr-4 text-right w-28">
        {m.bank_line_id ? (
          <div className="flex items-center justify-end gap-1">
            {bankDir === "credit" ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownLeft className="w-3 h-3 text-red-400" />}
            <span className={cn("text-[12px] font-semibold tabular", bankDir === "credit" ? "text-emerald-600" : "text-red-500")}>
              {shortKobo(Math.abs(bankAmt))}
            </span>
          </div>
        ) : <span style={{ color: "var(--pg-text-4)" }}>—</span>}
      </td>

      {/* Status / actions */}
      <td className="py-3 px-3 w-32 text-center">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: statusBg, color: statusColor }}>
          <StatusIcon className="w-2.5 h-2.5" />
          {isAI ? `AI ${m.confidence_pct}%` : cfg.label}
        </span>
        {/* Accept / Dismiss for matched AI rows */}
        {isAI && (onAccept || onDismiss) && (
          <div className="flex justify-center gap-1 mt-1">
            {onAccept  && <button onClick={e => { e.stopPropagation(); onAccept(); }}  title="Accept match"  className="w-5 h-5 flex items-center justify-center rounded bg-emerald-500 hover:bg-emerald-600 transition-colors"><Check className="w-2.5 h-2.5 text-white"/></button>}
            {onDismiss && <button onClick={e => { e.stopPropagation(); onDismiss(); }} title="Dismiss match" className="w-5 h-5 flex items-center justify-center rounded bg-red-400 hover:bg-red-500 transition-colors"><X className="w-2.5 h-2.5 text-white"/></button>}
          </div>
        )}
        {/* Unmatched — click to select for manual match */}
        {isUnmatched && (
          <p className="text-[9px] mt-1" style={{ color: isSelected ? "#FF6600" : "var(--pg-text-4)" }}>
            {isSelected ? "✓ Selected" : "Click to select"}
          </p>
        )}
      </td>

      {/* Ledger side */}
      <td className="py-3 pl-3 pr-3 w-28">
        <span className="text-[11px] font-mono" style={{ color: "var(--pg-text-3)" }}>{m.ledger_date ?? "—"}</span>
      </td>
      <td className="py-3 pr-3 max-w-[200px]">
        {m.ledger_txn_id ? (
          <div>
            <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{m.ledger_type || m.ledger_reference || "—"}</p>
            <p className="text-[10px] font-mono truncate" style={{ color: "var(--pg-text-4)" }}>{m.ledger_reference}</p>
          </div>
        ) : <span style={{ color: "var(--pg-text-4)" }}>—</span>}
      </td>
      <td className="py-3 pr-5 text-right w-28">
        {m.ledger_txn_id ? (
          <div className="flex items-center justify-end gap-1">
            {m.ledger_direction === "credit" ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownLeft className="w-3 h-3 text-red-400" />}
            <span className={cn("text-[12px] font-semibold tabular", m.ledger_direction === "credit" ? "text-emerald-600" : "text-red-500")}>
              {shortKobo(m.ledger_amount_kobo)}
            </span>
          </div>
        ) : <span style={{ color: "var(--pg-text-4)" }}>—</span>}
      </td>
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const { subsidiary }  = useAuth();
  const { toast }       = useToast();
  const queryClient     = useQueryClient();
  const [selectedAccountId, setSelectedAccountId]   = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId]           = useState<string | null>(null);
  const [filter, setFilter]                         = useState<MatchFilter>("all");
  const [search, setSearch]                         = useState("");
  const [showAddAccount, setShowAddAccount]          = useState(false);
  const [newRunStart, setNewRunStart]               = useState("");
  const [newRunEnd,   setNewRunEnd]                 = useState("");
  const [creatingRun, setCreatingRun]               = useState(false);
  // Manual match selection state
  const [selectedBankMatchId, setSelectedBankMatchId]     = useState<string | null>(null);
  const [selectedLedgerMatchId, setSelectedLedgerMatchId] = useState<string | null>(null);
  const [manualMatching, setManualMatching]               = useState(false);

  const subsidId = subsidiary?.ID ?? "";

  // Fetch bank accounts
  const { data: accounts = [], refetch: refetchAccounts } = useQuery<BankAccount[]>({
    queryKey: ["recon-accounts", subsidId],
    enabled: Boolean(subsidId),
    queryFn: async () => {
      const raw = await reconFetch(`/accounts?subsidiary_id=${subsidId}`);
      return Array.isArray(raw) ? (raw as BankAccount[]) : [];
    },
  });

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? accounts[0] ?? null;

  // Set default account
  const effectiveAccountId = selectedAccountId ?? selectedAccount?.id ?? null;

  // Fetch runs for selected account
  const { data: runs = [], refetch: refetchRuns } = useQuery<ReconRun[]>({
    queryKey: ["recon-runs", effectiveAccountId],
    enabled: Boolean(effectiveAccountId),
    queryFn: async () => {
      const raw = await reconFetch(`/runs?bank_account_id=${effectiveAccountId}`);
      return Array.isArray(raw) ? (raw as ReconRun[]) : [];
    },
  });

  const selectedRun = runs.find(r => r.id === selectedRunId) ?? null;

  // Fetch statements for the selected account (to show upload history)
  const { data: statements = [], refetch: refetchStatements } = useQuery<Statement[]>({
    queryKey: ["recon-statements", effectiveAccountId],
    enabled: Boolean(effectiveAccountId),
    queryFn: async () => {
      const raw = await reconFetch(`/accounts/${effectiveAccountId}/statements`);
      return Array.isArray(raw) ? (raw as Statement[]) : [];
    },
  });

  // Fetch run details (summary)
  const { data: runDetails } = useQuery<RunDetails>({
    queryKey: ["recon-run-details", selectedRunId],
    enabled: Boolean(selectedRunId),
    queryFn: () => reconFetch(`/runs/${selectedRunId}`),
  });

  // Fetch full match view (bank + ledger details)
  const { data: fullMatches = [], isLoading: matchesLoading } = useQuery<FullMatch[]>({
    queryKey: ["recon-full", selectedRunId],
    enabled: Boolean(selectedRunId),
    queryFn: async () => {
      const raw = await reconFetch(`/runs/${selectedRunId}/full`);
      return Array.isArray(raw) ? (raw as FullMatch[]) : [];
    },
  });

  // Create a new reconciliation run (auto-matches on creation)
  async function createRun() {
    if (!effectiveAccountId || !newRunStart || !newRunEnd) {
      toast({ title: "Set period dates first", variant: "destructive" });
      return;
    }
    setCreatingRun(true);
    try {
      const run: ReconRun = await reconFetch("/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank_account_id: effectiveAccountId, period_start: newRunStart, period_end: newRunEnd }),
      });
      await refetchRuns();
      setSelectedRunId(run.id);
      toast({ title: "Run Created", description: "Auto-matching complete." });
    } catch (err) {
      toast({ title: "Create Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setCreatingRun(false);
    }
  }

  // Close a run
  const closeMutation = useMutation({
    mutationFn: () => reconFetch(`/runs/${selectedRunId}/close`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-run-details", selectedRunId] });
      queryClient.invalidateQueries({ queryKey: ["recon-runs", effectiveAccountId] });
      toast({ title: "Run Closed", description: "Reconciliation finalised and locked." });
    },
    onError: (err: Error) => {
      const msg = err.message.includes("unmatched") ? "Cannot close — there are still unmatched items. Resolve them first." : err.message;
      toast({ title: "Close Failed", description: msg, variant: "destructive" });
    },
  });

  // ── Match actions ─────────────────────────────────────────────────────────

  // Dismiss an AI suggestion by un-matching the pair
  async function dismissMatch(matchId: string) {
    if (!selectedRunId) return;
    try {
      await reconFetch(`/runs/${selectedRunId}/matches/${matchId}/unmatch`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
      queryClient.invalidateQueries({ queryKey: ["recon-full", selectedRunId] });
      queryClient.invalidateQueries({ queryKey: ["recon-run-details", selectedRunId] });
      toast({ title: "Match Dismissed", description: "Item returned to unmatched." });
    } catch (err) {
      toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  // Confirm an AI suggestion (no-op API — already saved, just clear the AI filter indicator)
  function acceptMatch(matchId: string) {
    // The match is already saved in the database — accepting just removes it from the "AI Review" filter
    queryClient.setQueryData<FullMatch[]>(["recon-full", selectedRunId], (prev) =>
      prev?.map(m => m.match_id === matchId ? { ...m, match_type: "manual" } : m)
    );
    toast({ title: "Match Confirmed" });
  }

  // Perform a manual match between a selected bank line and ledger txn
  async function confirmManualMatch() {
    if (!selectedRunId || !selectedBankMatchId || !selectedLedgerMatchId) return;
    const bankMatch   = fullMatches.find(m => m.match_id === selectedBankMatchId);
    const ledgerMatch = fullMatches.find(m => m.match_id === selectedLedgerMatchId);
    if (!bankMatch?.bank_line_id || !ledgerMatch?.ledger_txn_id) {
      toast({ title: "Invalid selection", description: "Select one unmatched bank line and one unmatched ledger entry.", variant: "destructive" });
      return;
    }
    setManualMatching(true);
    try {
      await reconFetch(`/runs/${selectedRunId}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank_line_id: bankMatch.bank_line_id, internal_txn_id: ledgerMatch.ledger_txn_id, notes: "Manual match" }),
      });
      setSelectedBankMatchId(null);
      setSelectedLedgerMatchId(null);
      queryClient.invalidateQueries({ queryKey: ["recon-full", selectedRunId] });
      queryClient.invalidateQueries({ queryKey: ["recon-run-details", selectedRunId] });
      toast({ title: "Manual Match Created" });
    } catch (err) {
      toast({ title: "Match Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setManualMatching(false);
    }
  }

  // Toggle manual match selection for an unmatched row
  function toggleSelection(m: FullMatch) {
    if (m.status === "unmatched_bank") {
      setSelectedBankMatchId(id => id === m.match_id ? null : m.match_id);
    } else if (m.status === "unmatched_internal") {
      setSelectedLedgerMatchId(id => id === m.match_id ? null : m.match_id);
    }
  }

  // Stats from run details
  const summary = runDetails?.summary;
  const total       = (summary?.total_bank_lines ?? 0);
  const matched     = (summary?.matched ?? 0);
  const unmatchedB  = (summary?.unmatched_bank ?? 0);
  const unmatchedI  = (summary?.unmatched_internal ?? 0);
  const matchPct    = total > 0 ? Math.round((matched / total) * 100) : 0;

  // AI-suggested = auto-matched with confidence < 100% (not a separate status value).
  const isAISuggested = (m: FullMatch) =>
    m.match_type === "auto" && (m.confidence_pct ?? 100) < 100;

  // Filter matches
  const filtered = fullMatches.filter(m => {
    if (filter === "matched"      && m.status !== "matched")            return false;
    if (filter === "unmatched"    && !m.status.startsWith("unmatched")) return false;
    if (filter === "ai_suggested" && !isAISuggested(m))                 return false;
    if (search) {
      const q = search.toLowerCase();
      return m.bank_narration?.toLowerCase().includes(q)
          || m.bank_reference?.toLowerCase().includes(q)
          || m.ledger_reference?.toLowerCase().includes(q);
    }
    return true;
  });

  const aiPending = fullMatches.filter(isAISuggested).length;

  // Difference calculation
  const bankTotal   = fullMatches.reduce((s, m) => s + (m.bank_credit_kobo - m.bank_debit_kobo), 0);
  const ledgerTotal = fullMatches.reduce((s, m) => s + (m.ledger_direction === "credit" ? m.ledger_amount_kobo : -m.ledger_amount_kobo), 0);
  const difference  = Math.abs(bankTotal - ledgerTotal);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-violet-500" />
            <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Bank Reconciliation</h1>
            {selectedRun && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: selectedRun.status === "closed" ? "#d1fae5" : "#fef3c7", color: selectedRun.status === "closed" ? "#065f46" : "#d97706" }}>
                {selectedRun.status === "closed" ? "Closed" : "In Progress"}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {subsidiary?.Name ?? "Page Group"} · FinOps
          </p>
        </div>
        <div className="flex gap-2">
          {selectedRun && selectedRun.status !== "closed" && (
            <button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
              {closeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Close Run
            </button>
          )}
          <button onClick={() => setShowAddAccount(a => !a)}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors"
                  style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)", background: "var(--pg-card)" }}>
            <Settings className="w-3.5 h-3.5" /> Accounts
          </button>
        </div>
      </div>

      {/* Account + Run selectors */}
      <div className="flex flex-wrap items-center gap-3">
        {accounts.length > 0 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5" style={{ color: "var(--pg-text-3)" }} />
            <select value={effectiveAccountId ?? ""} onChange={e => { setSelectedAccountId(e.target.value); setSelectedRunId(null); }}
                    className="h-9 px-3 rounded-xl text-[12px] font-medium outline-none appearance-none"
                    style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.bank_name} — {a.account_number} ({a.currency})</option>
              ))}
            </select>
          </div>
        )}
        {runs.length > 0 && (
          <select value={selectedRunId ?? ""} onChange={e => setSelectedRunId(e.target.value)}
                  className="h-9 px-3 rounded-xl text-[12px] font-medium outline-none appearance-none"
                  style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}>
            <option value="">Select reconciliation run…</option>
            {runs.map(r => (
              <option key={r.id} value={r.id}>
                {r.period_start?.slice(0,10)} → {r.period_end?.slice(0,10)} [{r.status}]
              </option>
            ))}
          </select>
        )}

        {/* New run */}
        {effectiveAccountId && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={newRunStart} onChange={e => setNewRunStart(e.target.value)}
                   className="h-9 px-2 rounded-xl text-[12px] outline-none"
                   style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>→</span>
            <input type="date" value={newRunEnd} onChange={e => setNewRunEnd(e.target.value)}
                   className="h-9 px-2 rounded-xl text-[12px] outline-none"
                   style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            <button onClick={createRun} disabled={creatingRun}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[12px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
              {creatingRun ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {creatingRun ? "Running AI Match…" : "New Run"}
            </button>
          </div>
        )}
      </div>

      {/* Add account form */}
      {showAddAccount && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Add Bank Account</h3>
            <button onClick={() => setShowAddAccount(false)} style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
          </div>
          <AddAccountForm subsidiaryId={subsidId} onCreated={() => { refetchAccounts(); setShowAddAccount(false); }} />
        </div>
      )}

      {/* No accounts */}
      {accounts.length === 0 && !showAddAccount && (
        <div className="rounded-2xl flex flex-col items-center justify-center py-20 gap-4"
             style={{ background: "var(--pg-card)", border: "2px dashed var(--pg-card-border)" }}>
          <Building2 className="w-10 h-10" style={{ color: "var(--pg-text-4)" }} />
          <div className="text-center">
            <p className="text-[15px] font-semibold" style={{ color: "var(--pg-text-1)" }}>No Bank Accounts</p>
            <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>Add a bank account to start reconciling.</p>
          </div>
          <button onClick={() => setShowAddAccount(true)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
            <Plus className="w-3.5 h-3.5" /> Add Bank Account
          </button>
        </div>
      )}

      {/* Upload section — always visible when an account is selected */}
      {effectiveAccountId && accounts.find(a => a.id === effectiveAccountId) && (
        <UploadSection
          account={accounts.find(a => a.id === effectiveAccountId)!}
          subsidiaryId={subsidId}
          statements={statements}
          onUploaded={() => {
            queryClient.invalidateQueries({ queryKey: ["recon-statements", effectiveAccountId] });
            refetchStatements();
          }}
        />
      )}

      {/* Stats strip (when run selected) */}
      {selectedRun && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Matched",          value: matched.toLocaleString(),   sub: `${matchPct}% of bank`,  color: "#059669", border: "#a7f3d0" },
            { label: "Bank Unmatched",   value: unmatchedB.toString(),       sub: "No ledger entry",       color: "#d97706", border: "#fde68a" },
            { label: "Ledger Unmatched", value: unmatchedI.toString(),       sub: "No bank entry",         color: "#dc2626", border: "#fca5a5" },
            { label: "Net Difference",   value: difference > 0 ? shortKobo(difference) : "₦0", sub: difference > 0 ? "Review required" : "Balanced ✓", color: difference > 0 ? "#7c3aed" : "#059669", border: difference > 0 ? "#c4b5fd" : "#a7f3d0" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4 bg-white dark:bg-[#0f131d] relative overflow-hidden"
                 style={{ border: `1px solid ${s.border}`, boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: s.color }} />
              <p className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: s.color }}>{s.label}</p>
              <p className="text-[24px] font-bold tabular leading-none mt-1.5" style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
              <p className="text-[11px] mt-1" style={{ color: s.color + "cc" }}>{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* AI banner */}
      {selectedRun && aiPending > 0 && (
        <div className="flex items-start gap-3 px-5 py-4 rounded-xl"
             style={{ background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", border: "1px solid #c4b5fd" }}>
          <Brain className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-violet-900">
              {aiPending} AI suggestion{aiPending > 1 ? "s" : ""} pending review
            </p>
            <p className="text-[12px] text-violet-700 mt-0.5">
              Auto-matched with moderate confidence. Click ✓ or ✗ to accept or dismiss each one.
            </p>
          </div>
        </div>
      )}

      {/* Match table */}
      {selectedRun && (
        <>
          {/* Filter bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              {(["all","matched","unmatched","ai_suggested"] as MatchFilter[]).map(f => {
                const counts: Record<MatchFilter, number> = {
                  all: fullMatches.length,
                  matched: matched,
                  unmatched: unmatchedB + unmatchedI,
                  ai_suggested: aiPending,
                };
                return (
                  <button key={f} onClick={() => setFilter(f)}
                          className={cn("flex items-center gap-1 h-7 px-3 rounded-lg text-[11px] font-medium transition-all capitalize", filter === f ? "text-white" : "")}
                          style={filter === f ? { background: "linear-gradient(135deg,#FF6600,#E05500)" } : { color: "var(--pg-text-2)" }}>
                    {f.replace("_", " ")}
                    <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded-full", filter === f ? "bg-white/20 text-white" : "")}
                          style={filter !== f ? { background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" } : undefined}>
                      {counts[f]}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <Search className="w-3.5 h-3.5" style={{ color: "var(--pg-text-3)" }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions…"
                     className="text-[12px] bg-transparent outline-none w-44" style={{ color: "var(--pg-text-1)" }} />
            </div>
          </div>

          {/* Split table */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="grid" style={{ gridTemplateColumns: "1fr 28px 1fr" }}>
              {/* Bank header */}
              <div className="px-5 py-3 text-[11px] font-semibold" style={{ borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-2)" }}>
                Bank Statement — {selectedAccount?.bank_name} {selectedAccount?.account_number}
              </div>
              <div style={{ borderBottom: "1px solid var(--pg-row-border)" }} />
              {/* Ledger header */}
              <div className="px-5 py-3 text-[11px] font-semibold" style={{ borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-2)" }}>
                General Ledger — {subsidiary?.Name}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                    {["Date","Narration","Amount","Match","Date","Entry","Amount"].map((h, i) => (
                      <th key={i} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)", paddingLeft: i === 0 ? 20 : 12, paddingRight: i === 6 ? 20 : 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matchesLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="py-3 px-3">
                            <div className="h-3 rounded-full animate-pulse" style={{ background: "var(--pg-skeleton)", width: "70%" }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12">
                        <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No transactions match the current filter.</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map(m => {
                      const isSelectedBank   = selectedBankMatchId   === m.match_id;
                      const isSelectedLedger = selectedLedgerMatchId === m.match_id;
                      const isSelected = isSelectedBank || isSelectedLedger;
                      const isAI = m.match_type === "auto" && (m.confidence_pct ?? 100) < 100;
                      return (
                        <MatchRowContent key={m.match_id} m={m}
                          onAccept={isAI ? () => acceptMatch(m.match_id) : undefined}
                          onDismiss={isAI ? () => dismissMatch(m.match_id) : undefined}
                          isSelected={isSelected}
                          onClick={() => toggleSelection(m)} />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Manual match action bar */}
            {(selectedBankMatchId || selectedLedgerMatchId) && (
              <div className="flex items-center justify-between px-5 py-3 gap-4"
                   style={{ borderTop: "1px solid var(--pg-row-border)", background: "rgba(255,102,0,0.05)" }}>
                <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                  <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", selectedBankMatchId ? "text-orange-700 bg-orange-100" : "text-slate-400 bg-slate-100")}>
                    {selectedBankMatchId ? "✓ Bank item selected" : "Select an unmatched bank line"}
                  </span>
                  <span style={{ color: "var(--pg-text-4)" }}>↔</span>
                  <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", selectedLedgerMatchId ? "text-violet-700 bg-violet-100" : "text-slate-400 bg-slate-100")}>
                    {selectedLedgerMatchId ? "✓ Ledger item selected" : "Select an unmatched ledger entry"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setSelectedBankMatchId(null); setSelectedLedgerMatchId(null); }}
                          className="h-8 px-3 rounded-lg text-[12px] font-medium transition-colors"
                          style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                    Cancel
                  </button>
                  <button onClick={confirmManualMatch}
                          disabled={!selectedBankMatchId || !selectedLedgerMatchId || manualMatching}
                          className="h-8 px-4 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40"
                          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
                    {manualMatching ? "Matching…" : "Confirm Manual Match"}
                  </button>
                </div>
              </div>
            )}

            {filtered.length > 0 && (
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                  {filtered.length} of {fullMatches.length} transactions
                </span>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                  <span>Bank total: <strong>{shortKobo(Math.abs(bankTotal))}</strong></span>
                  <span>·</span>
                  <span>Ledger total: <strong>{shortKobo(Math.abs(ledgerTotal))}</strong></span>
                  {difference > 0 && <span className="font-bold text-amber-600">Diff: {shortKobo(difference)}</span>}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Run history — always visible when an account is selected.
          Data is permanently saved in the database. Every run, its matches,
          and all statement lines remain available indefinitely. */}
      {effectiveAccountId && runs.length > 0 && (
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              Saved Reconciliation Runs
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              All runs are permanently saved. Click any run to reload its match results.
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {runs.map(r => (
              <button key={r.id}
                      onClick={() => setSelectedRunId(r.id)}
                      className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors"
                      style={{ background: selectedRunId === r.id ? "rgba(255,102,0,0.05)" : undefined }}
                      onMouseEnter={e => { if (selectedRunId !== r.id) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                      onMouseLeave={e => { if (selectedRunId !== r.id) (e.currentTarget as HTMLElement).style.background = ""; }}>
                <RefreshCw className="w-4 h-4 shrink-0" style={{ color: r.status === "closed" ? "#059669" : "#d97706" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>
                    {r.period_start?.slice(0,10)} → {r.period_end?.slice(0,10)}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                    ID: <code className="font-mono">{r.id.slice(-8).toUpperCase()}</code>
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 capitalize"
                      style={{ background: r.status === "closed" ? "#d1fae5" : "#fef3c7", color: r.status === "closed" ? "#065f46" : "#92400e" }}>
                  {r.status}
                </span>
                {selectedRunId === r.id && (
                  <span className="text-[11px] font-semibold text-orange-600 shrink-0">Viewing ▶</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
