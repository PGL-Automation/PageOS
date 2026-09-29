"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Loader2, ExternalLink, Scale, Upload, BookOpen } from "lucide-react";
import { useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

function koboToNaira(k: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN",
    notation: "standard", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(k / 100);
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

function RunStatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() ?? "";
  let bg = "rgba(148,163,184,0.15)";
  let color = "var(--pg-text-3)";
  if (s === "in_progress" || s === "draft") {
    bg = "rgba(251,191,36,0.15)"; color = "#B45309";
  } else if (s === "closed") {
    bg = "rgba(34,197,94,0.15)"; color = "#15803D";
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", background: bg, color,
      borderRadius: "9999px", padding: "2px 10px", fontSize: "11px", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.03em",
    }}>
      {status}
    </span>
  );
}

export default function ReconciliationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const [accountSheet, setAccountSheet] = useState(false);
  const [runSheet, setRunSheet] = useState(false);
  const [syncingGLFor, setSyncingGLFor] = useState<string | null>(null);
  const [uploadingLedgerFor, setUploadingLedgerFor] = useState<string | null>(null);
  const [uploadingStatementFor, setUploadingStatementFor] = useState<string | null>(null);
  const ledgerInputRef = useRef<HTMLInputElement>(null);
  const statementInputRef = useRef<HTMLInputElement>(null);

  // Account form — GL-driven: user picks from Chart of Accounts, enters physical account number
  const [selectedGLCode, setSelectedGLCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  // Run form
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  // Hover state for rows
  const [hoveredAccount, setHoveredAccount] = useState<string | null>(null);
  const [hoveredRun, setHoveredRun] = useState<string | null>(null);

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["recon-accounts", subsidId],
    enabled: Boolean(subsidId),
    queryFn: async () => {
      const { data, error } = await api.GET("/reconciliation/accounts", {
        params: { query: { subsidiary_id: subsidId } },
      });
      if (error) throw new Error("Failed to fetch accounts");
      return data ?? [];
    },
  });

  // Active account: user's explicit selection, or first account when none chosen yet
  const activeAccountId = selectedAccountId || accounts[0]?.id || "";

  const { data: runs = [] } = useQuery({
    queryKey: ["recon-runs", activeAccountId],
    enabled: Boolean(activeAccountId),
    queryFn: async () => {
      const { data } = await api.GET("/reconciliation/runs", {
        params: { query: { bank_account_id: activeAccountId } },
      });
      return data ?? [];
    },
  });

  // GL bank accounts available for reconciliation (not yet registered)
  const { data: availableGL = [] } = useQuery<{ code: string; name: string }[]>({
    queryKey: ["recon-available-gl", subsidId],
    enabled: Boolean(subsidId) && accountSheet,
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts/available-gl?subsidiary_id=${subsidId}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGLCode) throw new Error("Please select a bank from the General Ledger");
      if (!accountNumber) throw new Error("Account number is required");
      const res = await fetch(`${BASE}/api/v1/reconciliation/accounts`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subsidiary_id: subsidId,
          gl_account_code: selectedGLCode,
          account_number: accountNumber,
          account_name: accountName,
          currency: "NGN",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to activate bank");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["recon-available-gl"] });
      setAccountSheet(false);
      setSelectedGLCode(""); setAccountNumber(""); setAccountName("");
      toast({ title: "Bank Activated for Reconciliation" });
    },
    onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
  });

  const syncGLMutation = useMutation({
    mutationFn: async ({ accountId, from, to }: { accountId: string; from: string; to: string }) => {
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts/${accountId}/sync-gl`,
        {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.message ?? "Sync failed");
      return json as { rows_synced: number };
    },
    onSuccess: (data) => {
      toast({ title: "GL Synced", description: `${data.rows_synced} new transaction${data.rows_synced !== 1 ? "s" : ""} pulled from finance journals.` });
      setSyncingGLFor(null);
    },
    onError: (e) => { toast({ title: "Sync Failed", description: (e as Error).message, variant: "destructive" }); setSyncingGLFor(null); },
  });

  const uploadStatementMutation = useMutation({
    mutationFn: async ({ accountId, file, periodStart, periodEnd }: { accountId: string; file: File; periodStart: string; periodEnd: string }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("period_start", periodStart);
      fd.append("period_end", periodEnd);
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts/${accountId}/statements`,
        { method: "POST", body: fd, credentials: "include" }
      );
      if (!res.ok) throw new Error("Statement upload failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Statement Uploaded", description: "Bank statement lines stored." });
      setUploadingStatementFor(null);
    },
    onError: (e) => toast({ title: "Upload Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const uploadLedgerMutation = useMutation({
    mutationFn: async ({ accountId, file }: { accountId: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts/${accountId}/ledger?subsidiary_id=${subsidId}`,
        { method: "POST", body: fd, credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Upload failed");
      return json as { rows_imported: number };
    },
    onSuccess: (data) => {
      toast({ title: "GL Ledger Uploaded", description: `${data.rows_imported} rows imported.` });
      setUploadingLedgerFor(null);
    },
    onError: (e) => { toast({ title: "Upload Failed", description: (e as Error).message, variant: "destructive" }); setUploadingLedgerFor(null); },
  });

  function onLedgerFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingLedgerFor) return;
    uploadLedgerMutation.mutate({ accountId: uploadingLedgerFor, file });
    e.target.value = "";
  }

  // Statement upload needs period dates — use a small prompt via form
  const [stmtFile, setStmtFile] = useState<File | null>(null);
  const [stmtStart, setStmtStart] = useState("");
  const [stmtEnd, setStmtEnd] = useState("");

  function onStatementFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStmtFile(file);
    e.target.value = "";
  }

  const createRunMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/reconciliation/runs", {
        body: { bank_account_id: activeAccountId, period_start: periodStart, period_end: periodEnd },
      });
      if (error || !data) throw new Error("Failed to create run");
      return data;
    },
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["recon-runs"] });
      setRunSheet(false);
      router.push(`/reconciliation/runs/${run.id}`);
    },
    onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
  });

  const col = {
    label: { fontSize: "11px", color: "var(--pg-text-3)", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 600 },
    data: { fontSize: "13px", color: "var(--pg-text-1)" },
    mono: { fontSize: "12px", fontFamily: "monospace", color: "var(--pg-text-2)" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Hidden file inputs */}
      <input ref={ledgerInputRef} type="file" style={{ display: "none" }} accept=".xlsx,.xls,.csv" onChange={onLedgerFileSelected} />
      <input ref={statementInputRef} type="file" style={{ display: "none" }} accept=".xlsx,.xls,.csv" onChange={onStatementFileSelected} />

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--pg-text-1)", display: "flex", alignItems: "center", gap: "10px" }}>
            <Scale style={{ width: "20px", height: "20px", color: "var(--pg-text-3)" }} />
            Bank Reconciliation
          </h1>
          <p style={{ fontSize: "13px", color: "var(--pg-text-3)", marginTop: "4px" }}>
            Match bank statements against the internal ledger
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setAccountSheet(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              border: "1px solid var(--pg-card-border)", background: "transparent",
              borderRadius: "12px", padding: "6px 14px", fontSize: "13px",
              color: "var(--pg-text-1)", cursor: "pointer",
            }}
          >
            <PlusCircle style={{ width: "14px", height: "14px" }} />
            Add Bank Account
          </button>
          <button
            onClick={() => setRunSheet(true)}
            disabled={accounts.length === 0}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              background: "linear-gradient(135deg,#FF6600,#E05500)",
              border: "none", borderRadius: "12px", padding: "6px 14px",
              fontSize: "13px", color: "#fff", cursor: accounts.length === 0 ? "not-allowed" : "pointer",
              opacity: accounts.length === 0 ? 0.5 : 1,
            }}
          >
            <PlusCircle style={{ width: "14px", height: "14px" }} />
            New Run
          </button>
        </div>
      </div>

      {/* Bank Accounts card */}
      <div style={{
        background: "var(--pg-card)", border: "1px solid var(--pg-card-border)",
        borderRadius: "16px", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--pg-card-border)" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--pg-text-1)" }}>Bank Accounts</span>
        </div>

        {/* Table header */}
        <div style={{
          display: "grid", gridTemplateColumns: "1.5fr 1.2fr 1.5fr 80px 90px 1fr",
          padding: "8px 20px", borderBottom: "1px solid var(--pg-row-border)",
          background: "var(--pg-muted-bg)",
        }}>
          {["Bank", "Account Number", "Account Name", "Currency", "Status", "Actions"].map((h, i) => (
            <span key={h} style={{ ...col.label, textAlign: i === 5 ? "right" : "left" }}>{h}</span>
          ))}
        </div>

        {accountsLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
            <Loader2 style={{ width: "20px", height: "20px", color: "var(--pg-text-3)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : accounts.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "var(--pg-text-3)" }}>
            No bank accounts yet. Add one to start reconciling.
          </div>
        ) : accounts.map(a => {
          const isActive = a.id === activeAccountId;
          const isHovered = hoveredAccount === a.id;
          return (
            <div
              key={a.id}
              onClick={() => setSelectedAccountId(a.id)}
              onMouseEnter={() => setHoveredAccount(a.id)}
              onMouseLeave={() => setHoveredAccount(null)}
              style={{
                display: "grid", gridTemplateColumns: "1.5fr 1.2fr 1.5fr 80px 90px 1fr",
                padding: "10px 20px", cursor: "pointer",
                borderBottom: "1px solid var(--pg-row-border)",
                borderLeft: isActive ? "2px solid #FF6600" : "2px solid transparent",
                background: isActive
                  ? "rgba(255,102,0,0.05)"
                  : isHovered ? "var(--pg-row-hover)" : "transparent",
                alignItems: "center",
              }}
            >
              <span style={{ ...col.data, fontWeight: 500 }}>{a.bank_name}</span>
              <span style={col.mono}>{a.account_number}</span>
              <span style={col.data}>{a.account_name}</span>
              <span style={col.data}>{a.currency}</span>
              <span>
                <RunStatusBadge status={a.status} />
              </span>
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  title="Sync internal transactions from finance journals (primary)"
                  disabled={syncGLMutation.isPending && syncingGLFor === a.id}
                  onClick={() => { setSyncingGLFor(a.id); syncGLMutation.mutate({ accountId: a.id, from: "", to: "" }); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    border: "1px solid var(--pg-card-border)", background: "transparent",
                    borderRadius: "8px", padding: "3px 8px", fontSize: "11px",
                    color: "var(--pg-text-2)", cursor: "pointer",
                  }}
                >
                  {syncGLMutation.isPending && syncingGLFor === a.id
                    ? <Loader2 style={{ width: "11px", height: "11px" }} />
                    : <BookOpen style={{ width: "11px", height: "11px" }} />}
                  Sync GL
                </button>
                <button
                  title="Upload GL export file (fallback)"
                  disabled={uploadLedgerMutation.isPending && uploadingLedgerFor === a.id}
                  onClick={() => { setUploadingLedgerFor(a.id); ledgerInputRef.current?.click(); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    border: "1px solid var(--pg-card-border)", background: "transparent",
                    borderRadius: "8px", padding: "3px 8px", fontSize: "11px",
                    color: "var(--pg-text-2)", cursor: "pointer",
                  }}
                >
                  {uploadLedgerMutation.isPending && uploadingLedgerFor === a.id
                    ? <Loader2 style={{ width: "11px", height: "11px" }} />
                    : <Upload style={{ width: "11px", height: "11px" }} />}
                  Upload GL
                </button>
                <button
                  title="Upload bank statement"
                  onClick={() => { setUploadingStatementFor(a.id); statementInputRef.current?.click(); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    border: "1px solid var(--pg-card-border)", background: "transparent",
                    borderRadius: "8px", padding: "3px 8px", fontSize: "11px",
                    color: "var(--pg-text-2)", cursor: "pointer",
                  }}
                >
                  <Upload style={{ width: "11px", height: "11px" }} />
                  Statement
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reconciliation Runs card */}
      {activeAccountId && (
        <div style={{
          background: "var(--pg-card)", border: "1px solid var(--pg-card-border)",
          borderRadius: "16px", overflow: "hidden",
        }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--pg-card-border)" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--pg-text-1)" }}>
              Reconciliation Runs — {accounts.find(a => a.id === activeAccountId)?.bank_name}
            </span>
          </div>

          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 140px 100px",
            padding: "8px 20px", borderBottom: "1px solid var(--pg-row-border)",
            background: "var(--pg-muted-bg)",
          }}>
            {["Period", "Status", ""].map((h, i) => (
              <span key={i} style={{ ...col.label, textAlign: i === 2 ? "right" : "left" }}>{h}</span>
            ))}
          </div>

          {runs.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "var(--pg-text-3)" }}>
              No runs yet. Create one to start matching.
            </div>
          ) : (runs as Array<{ id: string; period_start: string; period_end: string; status: string }>).map(run => (
            <div
              key={run.id}
              onMouseEnter={() => setHoveredRun(run.id)}
              onMouseLeave={() => setHoveredRun(null)}
              style={{
                display: "grid", gridTemplateColumns: "1fr 140px 100px",
                padding: "10px 20px", alignItems: "center",
                borderBottom: "1px solid var(--pg-row-border)",
                background: hoveredRun === run.id ? "var(--pg-row-hover)" : "transparent",
              }}
            >
              <span style={{ ...col.data, fontFamily: "monospace", fontSize: "12px" }}>
                {run.period_start?.slice(0, 10)} → {run.period_end?.slice(0, 10)}
              </span>
              <span>
                <RunStatusBadge status={run.status} />
              </span>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Link href={`/reconciliation/runs/${run.id}`}>
                  <button style={{
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    border: "1px solid var(--pg-card-border)", background: "transparent",
                    borderRadius: "8px", padding: "4px 10px", fontSize: "12px",
                    color: "var(--pg-text-2)", cursor: "pointer",
                  }}>
                    <ExternalLink style={{ width: "11px", height: "11px" }} /> Open
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Statement upload: period Sheet (shows after file is picked) */}
      <Sheet open={Boolean(stmtFile && uploadingStatementFor)} onOpenChange={() => { setStmtFile(null); setUploadingStatementFor(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Upload Bank Statement</SheetTitle>
            <SheetDescription>
              File selected: <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{stmtFile?.name}</span>.
              Enter the statement period before uploading.
            </SheetDescription>
          </SheetHeader>
          <form style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={e => {
            e.preventDefault();
            if (!stmtFile || !uploadingStatementFor) return;
            uploadStatementMutation.mutate({ accountId: uploadingStatementFor, file: stmtFile, periodStart: stmtStart, periodEnd: stmtEnd });
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><Label>Period Start</Label><Input type="date" value={stmtStart} onChange={e => setStmtStart(e.target.value)} required /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><Label>Period End</Label><Input type="date" value={stmtEnd} onChange={e => setStmtEnd(e.target.value)} required /></div>
            <button
              type="submit"
              disabled={uploadStatementMutation.isPending}
              style={{
                width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
                background: "linear-gradient(135deg,#FF6600,#E05500)", border: "none",
                borderRadius: "12px", padding: "8px 16px", fontSize: "13px",
                color: "#fff", cursor: "pointer", opacity: uploadStatementMutation.isPending ? 0.7 : 1,
              }}
            >
              {uploadStatementMutation.isPending ? <Loader2 style={{ width: "16px", height: "16px" }} /> : <Upload style={{ width: "16px", height: "16px" }} />}
              Upload Statement
            </button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Add Account Sheet */}
      <Sheet open={accountSheet} onOpenChange={setAccountSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Activate Bank for Reconciliation</SheetTitle>
            <SheetDescription>Select a bank from your General Ledger and provide the physical account number. The GL link is set automatically.</SheetDescription>
          </SheetHeader>
          <form style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={e => { e.preventDefault(); createAccountMutation.mutate(); }}>
            {/* Bank selector — sourced from Chart of Accounts (1100–1199 range) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Bank</Label>
              <p style={{ fontSize: "11px", color: "var(--pg-text-3)", marginTop: "-2px" }}>
                Select from your Chart of Accounts. Only banks not yet registered are shown.
              </p>
              <select
                value={selectedGLCode}
                onChange={e => setSelectedGLCode(e.target.value)}
                required
                style={{
                  height: "36px", padding: "0 10px", borderRadius: "8px",
                  border: "1px solid var(--pg-card-border)",
                  background: "var(--pg-card)", color: "var(--pg-text-1)",
                  fontSize: "13px", outline: "none",
                }}
              >
                <option value="">— Select a bank —</option>
                {availableGL.map(opt => (
                  <option key={opt.code} value={opt.code}>{opt.code} – {opt.name}</option>
                ))}
              </select>
              {availableGL.length === 0 && (
                <p style={{ fontSize: "11px", color: "#f59e0b" }}>
                  All GL bank accounts are already registered. Add new banks via Finance → General Ledger first.
                </p>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Account Number</Label>
              <Input placeholder="0123456789" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} required />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Account Name <span style={{ color: "var(--pg-text-4)", fontSize: "11px" }}>(optional — defaults to GL account name)</span></Label>
              <Input placeholder="Page Asset Management Limited" value={accountName} onChange={e => setAccountName(e.target.value)} />
            </div>
            <button
              type="submit"
              disabled={createAccountMutation.isPending}
              style={{
                width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
                background: "linear-gradient(135deg,#FF6600,#E05500)", border: "none",
                borderRadius: "12px", padding: "8px 16px", fontSize: "13px",
                color: "#fff", cursor: "pointer", opacity: createAccountMutation.isPending ? 0.7 : 1,
              }}
            >
              {createAccountMutation.isPending ? <Loader2 style={{ width: "16px", height: "16px" }} /> : null}
              Add Account
            </button>
          </form>
        </SheetContent>
      </Sheet>

      {/* New Run Sheet */}
      <Sheet open={runSheet} onOpenChange={setRunSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New Reconciliation Run</SheetTitle>
            <SheetDescription>Select a bank account and period. Auto-matching runs immediately after creation.</SheetDescription>
          </SheetHeader>
          <form style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={e => { e.preventDefault(); createRunMutation.mutate(); }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Bank Account</Label>
              <Select value={selectedAccountId || activeAccountId} onValueChange={v => setSelectedAccountId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bank_name} — {a.account_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><Label>Period Start</Label><Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} required /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><Label>Period End</Label><Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} required /></div>
            <button
              type="submit"
              disabled={createRunMutation.isPending || !activeAccountId}
              style={{
                width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
                background: "linear-gradient(135deg,#FF6600,#E05500)", border: "none",
                borderRadius: "12px", padding: "8px 16px", fontSize: "13px",
                color: "#fff", cursor: "pointer",
                opacity: (createRunMutation.isPending || !activeAccountId) ? 0.5 : 1,
              }}
            >
              {createRunMutation.isPending ? <Loader2 style={{ width: "16px", height: "16px" }} /> : null}
              Create Run &amp; Auto-Match
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
