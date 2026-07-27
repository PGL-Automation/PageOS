"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Loader2, ExternalLink, Scale, Upload, BookOpen } from "lucide-react";
import { useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

const RUN_STATUS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary", in_progress: "secondary", closed: "default",
};

function koboToNaira(k: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN",
    notation: "standard", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(k / 100);
}

export default function ReconciliationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const [accountSheet, setAccountSheet] = useState(false);
  const [runSheet, setRunSheet] = useState(false);
  const [uploadingLedgerFor, setUploadingLedgerFor] = useState<string | null>(null);
  const [uploadingStatementFor, setUploadingStatementFor] = useState<string | null>(null);
  const ledgerInputRef = useRef<HTMLInputElement>(null);
  const statementInputRef = useRef<HTMLInputElement>(null);

  // Account form
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  // Run form
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

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

  const { data: runs = [] } = useQuery({
    queryKey: ["recon-runs", selectedAccountId],
    enabled: Boolean(selectedAccountId),
    queryFn: async () => {
      const { data } = await api.GET("/reconciliation/runs", {
        params: { query: { bank_account_id: selectedAccountId } },
      });
      return data ?? [];
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/reconciliation/accounts", {
        body: { subsidiary_id: subsidId, bank_name: bankName, account_number: accountNumber, account_name: accountName, currency: "NGN" },
      });
      if (error || !data) throw new Error("Failed to create account");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-accounts"] });
      setAccountSheet(false);
      setBankName(""); setAccountNumber(""); setAccountName("");
      toast({ title: "Account Added" });
    },
    onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
  });

  const uploadLedgerMutation = useMutation({
    mutationFn: async ({ accountId, file }: { accountId: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `http://localhost:8081/api/v1/reconciliation/accounts/${accountId}/ledger?subsidiary_id=${subsidId}`,
        { method: "POST", body: fd, credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error((json as Record<string, string>).message ?? "Upload failed");
      return json as { rows_imported: number };
    },
    onSuccess: (data) => {
      toast({ title: "Ledger Uploaded", description: `${data.rows_imported} rows imported as internal transactions.` });
      setUploadingLedgerFor(null);
    },
    onError: (e) => toast({ title: "Upload Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const uploadStatementMutation = useMutation({
    mutationFn: async ({ accountId, file, periodStart, periodEnd }: { accountId: string; file: File; periodStart: string; periodEnd: string }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("period_start", periodStart);
      fd.append("period_end", periodEnd);
      const res = await fetch(
        `http://localhost:8081/api/v1/reconciliation/accounts/${accountId}/statements`,
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

  function triggerLedgerUpload(accountId: string) {
    setUploadingLedgerFor(accountId);
    ledgerInputRef.current?.click();
  }

  function triggerStatementUpload(accountId: string) {
    setUploadingStatementFor(accountId);
    statementInputRef.current?.click();
  }

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
        body: { bank_account_id: selectedAccountId, period_start: periodStart, period_end: periodEnd },
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

  return (
    <div className="space-y-8">
      {/* Hidden file inputs */}
      <input ref={ledgerInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={onLedgerFileSelected} />
      <input ref={statementInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={onStatementFileSelected} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <Scale className="w-7 h-7 text-slate-400" />
            Bank Reconciliation
          </h1>
          <p className="text-slate-500 text-sm mt-1">Match bank statements against the internal ledger</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAccountSheet(true)}>
            <PlusCircle className="mr-2 w-4 h-4" /> Add Bank Account
          </Button>
          <Button onClick={() => setRunSheet(true)} disabled={accounts.length === 0}>
            <PlusCircle className="mr-2 w-4 h-4" /> New Run
          </Button>
        </div>
      </div>

      {/* Bank Accounts */}
      <Card>
        <CardHeader><CardTitle>Bank Accounts</CardTitle></CardHeader>
        <CardContent>
          {accountsLoading
            ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank</TableHead>
                    <TableHead>Account Number</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0
                    ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-slate-400">No bank accounts yet. Add one to start reconciling.</TableCell></TableRow>
                    : accounts.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.bank_name}</TableCell>
                        <TableCell className="font-mono text-sm">{a.account_number}</TableCell>
                        <TableCell>{a.account_name}</TableCell>
                        <TableCell>{a.currency}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{a.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" title="Upload GL ledger"
                              disabled={uploadLedgerMutation.isPending && uploadingLedgerFor === a.id}
                              onClick={() => triggerLedgerUpload(a.id)}>
                              {uploadLedgerMutation.isPending && uploadingLedgerFor === a.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <BookOpen className="w-3.5 h-3.5" />}
                              <span className="ml-1 hidden lg:inline">Ledger</span>
                            </Button>
                            <Button variant="ghost" size="sm" title="Upload bank statement"
                              onClick={() => { setUploadingStatementFor(a.id); statementInputRef.current?.click(); }}>
                              <Upload className="w-3.5 h-3.5" />
                              <span className="ml-1 hidden lg:inline">Statement</span>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedAccountId(a.id)}>
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span className="ml-1 hidden lg:inline">Runs</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      {/* Runs for selected account */}
      {selectedAccountId && (
        <Card>
          <CardHeader>
            <CardTitle>
              Reconciliation Runs — {accounts.find(a => a.id === selectedAccountId)?.bank_name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.length === 0
                  ? <TableRow><TableCell colSpan={3} className="text-center py-10 text-slate-400">No runs yet. Create one to start matching.</TableCell></TableRow>
                  : (runs as Array<{ id: string; period_start: string; period_end: string; status: string }>).map(run => (
                    <TableRow key={run.id}>
                      <TableCell className="text-sm">
                        {run.period_start?.slice(0, 10)} → {run.period_end?.slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={RUN_STATUS[run.status] ?? "secondary"} className="uppercase text-xs">
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/reconciliation/runs/${run.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1">
                            <ExternalLink className="w-3.5 h-3.5" /> Open
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Statement upload: period Sheet (shows after file is picked) */}
      <Sheet open={Boolean(stmtFile && uploadingStatementFor)} onOpenChange={() => { setStmtFile(null); setUploadingStatementFor(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Upload Bank Statement</SheetTitle>
            <SheetDescription>
              File selected: <span className="font-mono text-xs">{stmtFile?.name}</span>.
              Enter the statement period before uploading.
            </SheetDescription>
          </SheetHeader>
          <form className="mt-6 space-y-4" onSubmit={e => {
            e.preventDefault();
            if (!stmtFile || !uploadingStatementFor) return;
            uploadStatementMutation.mutate({ accountId: uploadingStatementFor, file: stmtFile, periodStart: stmtStart, periodEnd: stmtEnd });
          }}>
            <div className="space-y-2"><Label>Period Start</Label><Input type="date" value={stmtStart} onChange={e => setStmtStart(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Period End</Label><Input type="date" value={stmtEnd} onChange={e => setStmtEnd(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={uploadStatementMutation.isPending}>
              {uploadStatementMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload Statement
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Add Account Sheet */}
      <Sheet open={accountSheet} onOpenChange={setAccountSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add Bank Account</SheetTitle>
            <SheetDescription>Register a bank account for reconciliation. You can configure the CSV column map after creation.</SheetDescription>
          </SheetHeader>
          <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); createAccountMutation.mutate(); }}>
            <div className="space-y-2"><Label>Bank Name</Label><Input placeholder="GTBank" value={bankName} onChange={e => setBankName(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Account Number</Label><Input placeholder="0123456789" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Account Name</Label><Input placeholder="Page Capital Ltd" value={accountName} onChange={e => setAccountName(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={createAccountMutation.isPending}>
              {createAccountMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Account
            </Button>
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
          <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); createRunMutation.mutate(); }}>
            <div className="space-y-2">
              <Label>Bank Account</Label>
              <Select value={selectedAccountId} onValueChange={v => setSelectedAccountId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bank_name} — {a.account_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Period Start</Label><Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Period End</Label><Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={createRunMutation.isPending || !selectedAccountId}>
              {createRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Run &amp; Auto-Match
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
