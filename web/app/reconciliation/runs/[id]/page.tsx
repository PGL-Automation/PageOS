"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, CheckCircle2, Link2, XCircle, Lock, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useParams } from "next/navigation";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

function koboToNaira(k: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN",
    notation: "standard", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(k / 100);
}

function fmt(dateStr: string | undefined | null) {
  if (!dateStr) return "—";
  return dateStr.slice(0, 10);
}

type FullMatchRow = {
  match_id: string;
  status: string;
  match_type: string;
  confidence_pct?: number | null;
  notes: string;
  bank_line_id?: string | null;
  bank_date?: string | null;
  bank_narration?: string;
  bank_debit_kobo?: number;
  bank_credit_kobo?: number;
  bank_reference?: string;
  ledger_txn_id?: string | null;
  ledger_date?: string | null;
  ledger_type?: string;
  ledger_direction?: string;
  ledger_amount_kobo?: number;
  ledger_reference?: string;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  matched: "default",
  unmatched_bank: "secondary",
  unmatched_internal: "destructive",
};

export default function RunPage() {
  const params = useParams();
  const runId = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedBankLine, setSelectedBankLine] = useState<string | null>(null);
  const [selectedInternalTxn, setSelectedInternalTxn] = useState<string | null>(null);
  const [matchNotes, setMatchNotes] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["recon-run", runId],
    queryFn: async () => {
      const { data, error } = await api.GET("/reconciliation/runs/{id}", {
        params: { path: { id: runId } },
      });
      if (error) throw new Error("Failed to fetch run");
      return data;
    },
  });

  const { data: unmatched } = useQuery({
    queryKey: ["recon-unmatched", runId],
    queryFn: async () => {
      const { data } = await api.GET("/reconciliation/runs/{id}/unmatched", {
        params: { path: { id: runId } },
      });
      return data;
    },
  });

  const { data: fullRows = [] } = useQuery<FullMatchRow[]>({
    queryKey: ["recon-run-full", runId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/reconciliation/runs/${runId}/full`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as FullMatchRow[];
    },
  });

  const isClosed = data?.run?.status === "closed";
  const canClose = (data?.summary?.unmatched_bank ?? 0) + (data?.summary?.unmatched_internal ?? 0) === 0;

  async function downloadExport() {
    setExporting(true);
    try {
      const res = await fetch(`${BASE}/api/v1/reconciliation/runs/${runId}/export`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `recon_${runId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Export Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const manualMatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBankLine || !selectedInternalTxn) throw new Error("Select both a bank line and internal transaction");
      const { error } = await api.POST("/reconciliation/runs/{id}/match", {
        params: { path: { id: runId } },
        body: { bank_line_id: selectedBankLine, internal_txn_id: selectedInternalTxn, notes: matchNotes },
      });
      if (error) throw new Error("Match failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["recon-unmatched", runId] });
      queryClient.invalidateQueries({ queryKey: ["recon-run-full", runId] });
      setSelectedBankLine(null); setSelectedInternalTxn(null); setMatchNotes("");
      toast({ title: "Matched", description: "Pair recorded successfully." });
    },
    onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
  });

  const markBankMutation = useMutation({
    mutationFn: async (bankLineId: string) => {
      const { error } = await api.POST("/reconciliation/runs/{id}/unmatched-bank", {
        params: { path: { id: runId } },
        body: { bank_line_id: bankLineId, notes: "Manually marked as unmatched" },
      });
      if (error) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["recon-unmatched", runId] });
      queryClient.invalidateQueries({ queryKey: ["recon-run-full", runId] });
      toast({ title: "Marked Unmatched" });
    },
  });

  const markInternalMutation = useMutation({
    mutationFn: async (txnId: string) => {
      const { error } = await api.POST("/reconciliation/runs/{id}/unmatched-internal", {
        params: { path: { id: runId } },
        body: { internal_txn_id: txnId, notes: "Manually marked as unmatched" },
      });
      if (error) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["recon-unmatched", runId] });
      queryClient.invalidateQueries({ queryKey: ["recon-run-full", runId] });
      toast({ title: "Marked Unmatched" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/reconciliation/runs/{id}/close", {
        params: { path: { id: runId } },
      });
      if (error) throw new Error((error as Record<string, string>).message ?? "Close failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["recon-run-full", runId] });
      toast({ title: "Run Closed", description: "This reconciliation run is now sealed." });
    },
    onError: (e) => toast({ title: "Close Failed", description: (e as Error).message, variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="flex h-[50vh] items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  );

  const sum = data?.summary;
  const bankLines = unmatched?.bank_lines ?? [];
  const internalTxns = unmatched?.internal_txns ?? [];

  // Separate the full rows into tabs for display
  const matchedRows = fullRows.filter(r => r.status === "matched");
  const unmatchedBankRows = fullRows.filter(r => r.status === "unmatched_bank");
  const unmatchedInternalRows = fullRows.filter(r => r.status === "unmatched_internal");

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/reconciliation">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reconciliation Run</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {fmt(data?.run?.period_start as string)} → {fmt(data?.run?.period_end as string)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={downloadExport} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export Excel
          </Button>
          <Badge variant={isClosed ? "default" : "secondary"} className="uppercase text-xs px-3">
            {data?.run?.status}
          </Badge>
          {!isClosed && (
            <Button
              onClick={() => closeMutation.mutate()}
              disabled={!canClose || closeMutation.isPending}
              title={!canClose ? "Resolve all unmatched items first" : undefined}
            >
              {closeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              Close Run
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Bank Lines", value: sum?.total_bank_lines ?? 0, color: "text-slate-900" },
          { label: "Internal Txns", value: sum?.total_internal_txns ?? 0, color: "text-slate-900" },
          { label: "Matched", value: sum?.matched ?? 0, color: "text-green-600" },
          { label: "Unmatched Bank", value: sum?.unmatched_bank ?? 0, color: "text-amber-600" },
          { label: "Unmatched Internal", value: sum?.unmatched_internal ?? 0, color: "text-red-600" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="text-center">
            <CardContent className="pt-4 pb-4">
              <p className={`text-2xl font-bold ${color}`}>{Number(value)}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Unmatched workspace — only when run is open */}
      {!isClosed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Unmatched bank lines */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Unmatched Bank Lines</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Narration</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankLines.length === 0
                    ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400 text-sm">All bank lines resolved</TableCell></TableRow>
                    : (bankLines as Array<{ id: string; txn_date: string; narration: string; debit_kobo: number; credit_kobo: number }>).map(line => (
                      <TableRow
                        key={line.id}
                        className={`cursor-pointer ${selectedBankLine === line.id ? "bg-orange-50 ring-1 ring-orange-400 ring-inset" : "hover:bg-slate-50"}`}
                        onClick={() => setSelectedBankLine(selectedBankLine === line.id ? null : line.id)}
                      >
                        <TableCell className="text-xs text-slate-500">{fmt(line.txn_date)}</TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate">{line.narration}</TableCell>
                        <TableCell className="text-right text-xs text-red-600">{line.debit_kobo > 0 ? koboToNaira(line.debit_kobo) : ""}</TableCell>
                        <TableCell className="text-right text-xs text-green-600">{line.credit_kobo > 0 ? koboToNaira(line.credit_kobo) : ""}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm"
                            onClick={e => { e.stopPropagation(); markBankMutation.mutate(line.id); }}
                            disabled={markBankMutation.isPending}>
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Unmatched internal transactions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Unmatched Internal Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dir</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {internalTxns.length === 0
                    ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400 text-sm">All internal transactions resolved</TableCell></TableRow>
                    : (internalTxns as Array<{ id: string; txn_date: string; type: string; direction: string; amount_kobo: number; reference: string }>).map(txn => (
                      <TableRow
                        key={txn.id}
                        className={`cursor-pointer ${selectedInternalTxn === txn.id ? "bg-orange-50 ring-1 ring-orange-400 ring-inset" : "hover:bg-slate-50"}`}
                        onClick={() => setSelectedInternalTxn(selectedInternalTxn === txn.id ? null : txn.id)}
                      >
                        <TableCell className="text-xs text-slate-500">{fmt(txn.txn_date)}</TableCell>
                        <TableCell className="text-xs capitalize">{txn.type?.replace("_", " ")}</TableCell>
                        <TableCell>
                          <Badge variant={txn.direction === "credit" ? "default" : "secondary"} className="text-xs">
                            {txn.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs">{koboToNaira(txn.amount_kobo)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm"
                            onClick={e => { e.stopPropagation(); markInternalMutation.mutate(txn.id); }}
                            disabled={markInternalMutation.isPending}>
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Manual match controls */}
      {!isClosed && (selectedBankLine || selectedInternalTxn) && (
        <Card className="border-blue-200 bg-orange-50">
          <CardContent className="pt-4 flex items-end gap-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-blue-800 flex items-center gap-2">
                <Link2 className="w-4 h-4" /> Manual Match
              </p>
              <p className="text-xs text-orange-600">
                {selectedBankLine ? "✓ Bank line selected" : "Select a bank line"} ·{" "}
                {selectedInternalTxn ? "✓ Internal txn selected" : "Select an internal transaction"}
              </p>
            </div>
            <div className="w-48">
              <Label className="text-xs text-orange-700">Notes (optional)</Label>
              <Input value={matchNotes} onChange={e => setMatchNotes(e.target.value)}
                placeholder="Reason…" className="mt-1 h-8 text-sm" />
            </div>
            <Button onClick={() => manualMatchMutation.mutate()}
              disabled={!selectedBankLine || !selectedInternalTxn || manualMatchMutation.isPending}
              className="shrink-0">
              {manualMatchMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Match Selected
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Full results — three sections */}
      {matchedRows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base text-green-700">Matched ({matchedRows.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank Date</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="text-right">Bank Amount</TableHead>
                  <TableHead>Ledger Date</TableHead>
                  <TableHead>Ledger Ref</TableHead>
                  <TableHead className="text-right">Ledger Amount</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchedRows.map(m => (
                  <TableRow key={m.match_id}>
                    <TableCell className="text-xs text-slate-500">{fmt(m.bank_date)}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{m.bank_narration || "—"}</TableCell>
                    <TableCell className="text-right text-xs">
                      {(m.bank_credit_kobo ?? 0) > 0
                        ? <span className="text-green-600">{koboToNaira(m.bank_credit_kobo!)}</span>
                        : <span className="text-red-600">{koboToNaira(m.bank_debit_kobo ?? 0)}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{fmt(m.ledger_date)}</TableCell>
                    <TableCell className="text-xs font-mono truncate max-w-[140px]">{m.ledger_reference || "—"}</TableCell>
                    <TableCell className="text-right text-xs">{koboToNaira(m.ledger_amount_kobo ?? 0)}</TableCell>
                    <TableCell className="text-xs capitalize text-slate-500">{m.match_type}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {unmatchedBankRows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base text-amber-700">In Bank, Not in Ledger ({unmatchedBankRows.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedBankRows.map(m => (
                  <TableRow key={m.match_id}>
                    <TableCell className="text-xs text-slate-500">{fmt(m.bank_date)}</TableCell>
                    <TableCell className="text-xs font-mono">{m.bank_reference || "—"}</TableCell>
                    <TableCell className="text-sm max-w-[240px] truncate">{m.bank_narration || "—"}</TableCell>
                    <TableCell className="text-right text-xs text-red-600">{(m.bank_debit_kobo ?? 0) > 0 ? koboToNaira(m.bank_debit_kobo!) : "—"}</TableCell>
                    <TableCell className="text-right text-xs text-green-600">{(m.bank_credit_kobo ?? 0) > 0 ? koboToNaira(m.bank_credit_kobo!) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {unmatchedInternalRows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base text-red-700">In Ledger, Not in Bank ({unmatchedInternalRows.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedInternalRows.map(m => (
                  <TableRow key={m.match_id}>
                    <TableCell className="text-xs text-slate-500">{fmt(m.ledger_date)}</TableCell>
                    <TableCell className="text-xs font-mono">{m.ledger_reference || "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{m.ledger_type?.replace("_", " ") || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={m.ledger_direction === "credit" ? "default" : "secondary"} className="text-xs">
                        {m.ledger_direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{koboToNaira(m.ledger_amount_kobo ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {fullRows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-slate-400 text-sm">
            No match data yet — run auto-match or match manually above.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
