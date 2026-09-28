"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function RunStatusBadge({ status }: { status: string | undefined }) {
  const s = (status ?? "").toLowerCase();
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
      {status ?? "—"}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string | undefined }) {
  const isCredit = direction === "credit";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: isCredit ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
      color: isCredit ? "#15803D" : "#B91C1C",
      borderRadius: "9999px", padding: "2px 8px", fontSize: "11px", fontWeight: 600,
      textTransform: "capitalize",
    }}>
      {direction ?? "—"}
    </span>
  );
}

const TABS = ["Matched", "Unmatched Bank", "Unmatched Internal", "Adjustments"] as const;
type Tab = typeof TABS[number];

const colLabel: React.CSSProperties = {
  fontSize: "11px", color: "var(--pg-text-3)",
  textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
};
const colData: React.CSSProperties = { fontSize: "12px", color: "var(--pg-text-1)" };
const colMuted: React.CSSProperties = { fontSize: "12px", color: "var(--pg-text-3)" };
const colMono: React.CSSProperties = { fontSize: "11px", fontFamily: "monospace", color: "var(--pg-text-2)" };

export default function RunPage() {
  const params = useParams();
  const runId = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedBankLine, setSelectedBankLine] = useState<string | null>(null);
  const [selectedInternalTxn, setSelectedInternalTxn] = useState<string | null>(null);
  const [matchNotes, setMatchNotes] = useState("");
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Matched");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

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
    <div style={{ display: "flex", height: "50vh", alignItems: "center", justifyContent: "center" }}>
      <Loader2 style={{ width: "32px", height: "32px", color: "var(--pg-text-3)", animation: "spin 1s linear infinite" }} />
    </div>
  );

  const sum = data?.summary;
  const bankLines = unmatched?.bank_lines ?? [];
  const internalTxns = unmatched?.internal_txns ?? [];

  const matchedRows = fullRows.filter(r => r.status === "matched");
  const unmatchedBankRows = fullRows.filter(r => r.status === "unmatched_bank");
  const unmatchedInternalRows = fullRows.filter(r => r.status === "unmatched_internal");
  const adjustmentRows = fullRows.filter(r => r.status === "adjustment");

  const metrics = [
    { label: "Bank Lines", value: sum?.total_bank_lines ?? 0, color: "var(--pg-text-1)" },
    { label: "Internal Txns", value: sum?.total_internal_txns ?? 0, color: "var(--pg-text-1)" },
    { label: "Matched", value: sum?.matched ?? 0, color: "#15803D" },
    { label: "Unmatched Bank", value: sum?.unmatched_bank ?? 0, color: "#B45309" },
    { label: "Unmatched Internal", value: sum?.unmatched_internal ?? 0, color: "#B91C1C" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1280px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Link href="/reconciliation">
          <button style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            border: "1px solid var(--pg-card-border)", background: "transparent",
            borderRadius: "8px", padding: "5px 10px", fontSize: "12px",
            color: "var(--pg-text-2)", cursor: "pointer",
          }}>
            <ArrowLeft style={{ width: "13px", height: "13px" }} /> Back
          </button>
        </Link>

        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--pg-text-1)" }}>Reconciliation Run</h1>
          <p style={{ fontSize: "13px", color: "var(--pg-text-3)", marginTop: "2px" }}>
            {fmt(data?.run?.period_start as string)} → {fmt(data?.run?.period_end as string)}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <RunStatusBadge status={data?.run?.status} />
          <button
            onClick={downloadExport}
            disabled={exporting}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              border: "1px solid var(--pg-card-border)", background: "transparent",
              borderRadius: "12px", padding: "6px 14px", fontSize: "13px",
              color: "var(--pg-text-1)", cursor: exporting ? "not-allowed" : "pointer",
              opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? <Loader2 style={{ width: "14px", height: "14px" }} /> : <Download style={{ width: "14px", height: "14px" }} />}
            Export Excel
          </button>
          {!isClosed && (
            <button
              onClick={() => closeMutation.mutate()}
              disabled={!canClose || closeMutation.isPending}
              title={!canClose ? "Resolve all unmatched items first" : undefined}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                background: "linear-gradient(135deg,#FF6600,#E05500)", border: "none",
                borderRadius: "12px", padding: "6px 14px", fontSize: "13px",
                color: "#fff", cursor: (!canClose || closeMutation.isPending) ? "not-allowed" : "pointer",
                opacity: (!canClose || closeMutation.isPending) ? 0.5 : 1,
              }}
            >
              {closeMutation.isPending ? <Loader2 style={{ width: "14px", height: "14px" }} /> : <Lock style={{ width: "14px", height: "14px" }} />}
              Close Run
            </button>
          )}
        </div>
      </div>

      {/* Summary metric chips */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {metrics.map(({ label, value, color }) => (
          <div key={label} style={{
            background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)",
            borderRadius: "10px", padding: "8px 16px", display: "flex", flexDirection: "column", gap: "2px",
          }}>
            <span style={{ fontSize: "18px", fontWeight: 700, color }}>{Number(value)}</span>
            <span style={{ fontSize: "11px", color: "var(--pg-text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Unmatched workspace — two columns, only when open */}
      {!isClosed && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

          {/* Unmatched bank lines */}
          <div style={{
            background: "var(--pg-card)", border: "1px solid var(--pg-card-border)",
            borderRadius: "16px", overflow: "hidden",
          }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--pg-card-border)" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--pg-text-1)" }}>Unmatched Bank Lines</span>
            </div>
            {/* Column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: "80px 1fr 90px 90px 32px",
              padding: "6px 14px", borderBottom: "1px solid var(--pg-row-border)",
              background: "var(--pg-muted-bg)",
            }}>
              {["Date", "Narration", "Debit", "Credit", ""].map((h, i) => (
                <span key={i} style={{ ...colLabel, textAlign: i >= 2 && i < 4 ? "right" : "left" }}>{h}</span>
              ))}
            </div>
            {bankLines.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>
                All bank lines resolved
              </div>
            ) : (bankLines as Array<{ id: string; txn_date: string; narration: string; debit_kobo: number; credit_kobo: number }>).map(line => {
              const isSel = selectedBankLine === line.id;
              return (
                <div
                  key={line.id}
                  onClick={() => setSelectedBankLine(isSel ? null : line.id)}
                  onMouseEnter={() => setHoveredRow(`bank-${line.id}`)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    display: "grid", gridTemplateColumns: "80px 1fr 90px 90px 32px",
                    padding: "8px 14px", cursor: "pointer", alignItems: "center",
                    borderBottom: "1px solid var(--pg-row-border)",
                    borderLeft: isSel ? "2px solid #FF6600" : "2px solid transparent",
                    background: isSel ? "rgba(255,102,0,0.06)" : hoveredRow === `bank-${line.id}` ? "var(--pg-row-hover)" : "transparent",
                  }}
                >
                  <span style={colMuted}>{fmt(line.txn_date)}</span>
                  <span style={{ ...colData, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.narration}</span>
                  <span style={{ ...colData, textAlign: "right", color: "#B91C1C", fontSize: "11px" }}>{line.debit_kobo > 0 ? koboToNaira(line.debit_kobo) : ""}</span>
                  <span style={{ ...colData, textAlign: "right", color: "#15803D", fontSize: "11px" }}>{line.credit_kobo > 0 ? koboToNaira(line.credit_kobo) : ""}</span>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={e => { e.stopPropagation(); markBankMutation.mutate(line.id); }}
                      disabled={markBankMutation.isPending}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--pg-text-3)" }}
                    >
                      <XCircle style={{ width: "13px", height: "13px" }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Unmatched internal transactions */}
          <div style={{
            background: "var(--pg-card)", border: "1px solid var(--pg-card-border)",
            borderRadius: "16px", overflow: "hidden",
          }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--pg-card-border)" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--pg-text-1)" }}>Unmatched Internal Transactions</span>
            </div>
            {/* Column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: "80px 1fr 70px 90px 32px",
              padding: "6px 14px", borderBottom: "1px solid var(--pg-row-border)",
              background: "var(--pg-muted-bg)",
            }}>
              {["Date", "Type", "Dir", "Amount", ""].map((h, i) => (
                <span key={i} style={{ ...colLabel, textAlign: i === 3 ? "right" : "left" }}>{h}</span>
              ))}
            </div>
            {internalTxns.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>
                All internal transactions resolved
              </div>
            ) : (internalTxns as Array<{ id: string; txn_date: string; type: string; direction: string; amount_kobo: number; reference: string }>).map(txn => {
              const isSel = selectedInternalTxn === txn.id;
              return (
                <div
                  key={txn.id}
                  onClick={() => setSelectedInternalTxn(isSel ? null : txn.id)}
                  onMouseEnter={() => setHoveredRow(`int-${txn.id}`)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    display: "grid", gridTemplateColumns: "80px 1fr 70px 90px 32px",
                    padding: "8px 14px", cursor: "pointer", alignItems: "center",
                    borderBottom: "1px solid var(--pg-row-border)",
                    borderLeft: isSel ? "2px solid #FF6600" : "2px solid transparent",
                    background: isSel ? "rgba(255,102,0,0.06)" : hoveredRow === `int-${txn.id}` ? "var(--pg-row-hover)" : "transparent",
                  }}
                >
                  <span style={colMuted}>{fmt(txn.txn_date)}</span>
                  <span style={{ ...colData, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {txn.type?.replace("_", " ")}
                  </span>
                  <DirectionBadge direction={txn.direction} />
                  <span style={{ ...colData, textAlign: "right", fontSize: "11px" }}>{koboToNaira(txn.amount_kobo)}</span>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={e => { e.stopPropagation(); markInternalMutation.mutate(txn.id); }}
                      disabled={markInternalMutation.isPending}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--pg-text-3)" }}
                    >
                      <XCircle style={{ width: "13px", height: "13px" }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual match bar */}
      {!isClosed && (selectedBankLine || selectedInternalTxn) && (
        <div style={{
          background: "rgba(255,102,0,0.05)", border: "1px solid rgba(255,102,0,0.25)",
          borderRadius: "12px", padding: "14px 20px",
          display: "flex", alignItems: "center", gap: "16px",
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#C05000", display: "flex", alignItems: "center", gap: "6px" }}>
              <Link2 style={{ width: "14px", height: "14px" }} /> Manual Match
            </p>
            <p style={{ fontSize: "11px", color: "var(--pg-text-3)", marginTop: "2px" }}>
              {selectedBankLine ? "✓ Bank line selected" : "Select a bank line"} ·{" "}
              {selectedInternalTxn ? "✓ Internal txn selected" : "Select an internal transaction"}
            </p>
          </div>
          <div style={{ width: "180px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <Label style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>Notes (optional)</Label>
            <Input value={matchNotes} onChange={e => setMatchNotes(e.target.value)}
              placeholder="Reason…" style={{ height: "30px", fontSize: "12px" }} />
          </div>
          <button
            onClick={() => manualMatchMutation.mutate()}
            disabled={!selectedBankLine || !selectedInternalTxn || manualMatchMutation.isPending}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0,
              background: "linear-gradient(135deg,#FF6600,#E05500)", border: "none",
              borderRadius: "10px", padding: "7px 16px", fontSize: "13px",
              color: "#fff", cursor: (!selectedBankLine || !selectedInternalTxn) ? "not-allowed" : "pointer",
              opacity: (!selectedBankLine || !selectedInternalTxn) ? 0.5 : 1,
            }}
          >
            {manualMatchMutation.isPending ? <Loader2 style={{ width: "14px", height: "14px" }} /> : <CheckCircle2 style={{ width: "14px", height: "14px" }} />}
            Match Selected
          </button>
        </div>
      )}

      {/* Tab interface for full results */}
      {fullRows.length > 0 && (
        <div style={{
          background: "var(--pg-card)", border: "1px solid var(--pg-card-border)",
          borderRadius: "16px", overflow: "hidden",
        }}>
          {/* Tab bar */}
          <div style={{
            display: "flex", borderBottom: "1px solid var(--pg-card-border)",
            padding: "0 20px",
          }}>
            {TABS.map(tab => {
              const count = tab === "Matched" ? matchedRows.length
                : tab === "Unmatched Bank" ? unmatchedBankRows.length
                : tab === "Unmatched Internal" ? unmatchedInternalRows.length
                : adjustmentRows.length;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: "12px 16px", fontSize: "13px",
                    color: isActive ? "var(--pg-text-1)" : "var(--pg-text-3)",
                    fontWeight: isActive ? 600 : 400,
                    borderBottom: isActive ? "2px solid #FF6600" : "2px solid transparent",
                    marginBottom: "-1px",
                    display: "flex", alignItems: "center", gap: "6px",
                  }}
                >
                  {tab}
                  <span style={{
                    fontSize: "11px", fontWeight: 600,
                    background: isActive ? "rgba(255,102,0,0.12)" : "var(--pg-muted-bg)",
                    color: isActive ? "#FF6600" : "var(--pg-text-3)",
                    borderRadius: "9999px", padding: "1px 7px",
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Matched tab */}
          {activeTab === "Matched" && (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr 110px 90px 1fr 110px 90px",
                padding: "7px 20px", borderBottom: "1px solid var(--pg-row-border)",
                background: "var(--pg-muted-bg)",
              }}>
                {["Bank Date", "Narration", "Bank Amt", "Ledger Date", "Ledger Ref", "Ledger Amt", "Type"].map((h, i) => (
                  <span key={h} style={{ ...colLabel, textAlign: i === 2 || i === 5 ? "right" : "left" }}>{h}</span>
                ))}
              </div>
              {matchedRows.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>No matched rows</div>
              ) : matchedRows.map(m => (
                <div
                  key={m.match_id}
                  onMouseEnter={() => setHoveredRow(m.match_id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    display: "grid", gridTemplateColumns: "90px 1fr 110px 90px 1fr 110px 90px",
                    padding: "8px 20px", alignItems: "center",
                    borderBottom: "1px solid var(--pg-row-border)",
                    background: hoveredRow === m.match_id ? "var(--pg-row-hover)" : "transparent",
                  }}
                >
                  <span style={colMuted}>{fmt(m.bank_date)}</span>
                  <span style={{ ...colData, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.bank_narration || "—"}</span>
                  <span style={{ ...colData, textAlign: "right", fontSize: "11px" }}>
                    {(m.bank_credit_kobo ?? 0) > 0
                      ? <span style={{ color: "#15803D" }}>{koboToNaira(m.bank_credit_kobo!)}</span>
                      : <span style={{ color: "#B91C1C" }}>{koboToNaira(m.bank_debit_kobo ?? 0)}</span>}
                  </span>
                  <span style={colMuted}>{fmt(m.ledger_date)}</span>
                  <span style={{ ...colMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.ledger_reference || "—"}</span>
                  <span style={{ ...colData, textAlign: "right", fontSize: "11px" }}>{koboToNaira(m.ledger_amount_kobo ?? 0)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ ...colMuted, textTransform: "capitalize" }}>{m.match_type}</span>
                    {m.confidence_pct != null && (
                      <span style={{
                        fontSize: "10px", fontWeight: 600,
                        background: "rgba(34,197,94,0.12)", color: "#15803D",
                        borderRadius: "9999px", padding: "1px 6px",
                      }}>
                        {m.confidence_pct}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Unmatched Bank tab */}
          {activeTab === "Unmatched Bank" && (
            <>
              <div style={{
                display: "grid", gridTemplateColumns: "90px 110px 1fr 110px 110px",
                padding: "7px 20px", borderBottom: "1px solid var(--pg-row-border)",
                background: "var(--pg-muted-bg)",
              }}>
                {["Date", "Reference", "Narration", "Debit", "Credit"].map((h, i) => (
                  <span key={h} style={{ ...colLabel, textAlign: i >= 3 ? "right" : "left" }}>{h}</span>
                ))}
              </div>
              {unmatchedBankRows.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>No unmatched bank lines</div>
              ) : unmatchedBankRows.map(m => (
                <div
                  key={m.match_id}
                  onMouseEnter={() => setHoveredRow(m.match_id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    display: "grid", gridTemplateColumns: "90px 110px 1fr 110px 110px",
                    padding: "8px 20px", alignItems: "center",
                    borderBottom: "1px solid var(--pg-row-border)",
                    background: hoveredRow === m.match_id ? "var(--pg-row-hover)" : "transparent",
                  }}
                >
                  <span style={colMuted}>{fmt(m.bank_date)}</span>
                  <span style={colMono}>{m.bank_reference || "—"}</span>
                  <span style={{ ...colData, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.bank_narration || "—"}</span>
                  <span style={{ ...colData, textAlign: "right", fontSize: "11px", color: "#B91C1C" }}>
                    {(m.bank_debit_kobo ?? 0) > 0 ? koboToNaira(m.bank_debit_kobo!) : "—"}
                  </span>
                  <span style={{ ...colData, textAlign: "right", fontSize: "11px", color: "#15803D" }}>
                    {(m.bank_credit_kobo ?? 0) > 0 ? koboToNaira(m.bank_credit_kobo!) : "—"}
                  </span>
                </div>
              ))}
            </>
          )}

          {/* Unmatched Internal tab */}
          {activeTab === "Unmatched Internal" && (
            <>
              <div style={{
                display: "grid", gridTemplateColumns: "90px 110px 1fr 80px 110px",
                padding: "7px 20px", borderBottom: "1px solid var(--pg-row-border)",
                background: "var(--pg-muted-bg)",
              }}>
                {["Date", "Reference", "Type", "Dir", "Amount"].map((h, i) => (
                  <span key={h} style={{ ...colLabel, textAlign: i === 4 ? "right" : "left" }}>{h}</span>
                ))}
              </div>
              {unmatchedInternalRows.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>No unmatched internal rows</div>
              ) : unmatchedInternalRows.map(m => (
                <div
                  key={m.match_id}
                  onMouseEnter={() => setHoveredRow(m.match_id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    display: "grid", gridTemplateColumns: "90px 110px 1fr 80px 110px",
                    padding: "8px 20px", alignItems: "center",
                    borderBottom: "1px solid var(--pg-row-border)",
                    background: hoveredRow === m.match_id ? "var(--pg-row-hover)" : "transparent",
                  }}
                >
                  <span style={colMuted}>{fmt(m.ledger_date)}</span>
                  <span style={colMono}>{m.ledger_reference || "—"}</span>
                  <span style={{ ...colData, textTransform: "capitalize" }}>{m.ledger_type?.replace("_", " ") || "—"}</span>
                  <DirectionBadge direction={m.ledger_direction} />
                  <span style={{ ...colData, textAlign: "right", fontSize: "11px" }}>{koboToNaira(m.ledger_amount_kobo ?? 0)}</span>
                </div>
              ))}
            </>
          )}

          {/* Adjustments tab */}
          {activeTab === "Adjustments" && (
            <>
              <div style={{
                display: "grid", gridTemplateColumns: "90px 70px 1fr 110px 1fr",
                padding: "7px 20px", borderBottom: "1px solid var(--pg-row-border)",
                background: "var(--pg-muted-bg)",
              }}>
                {["Date", "Side", "Narration / Reference", "Amount", "Notes"].map((h, i) => (
                  <span key={h} style={{ ...colLabel, textAlign: i === 3 ? "right" : "left" }}>{h}</span>
                ))}
              </div>
              {adjustmentRows.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>No adjustments</div>
              ) : adjustmentRows.map(m => {
                const isBank = Boolean(m.bank_line_id);
                return (
                  <div
                    key={m.match_id}
                    onMouseEnter={() => setHoveredRow(m.match_id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      display: "grid", gridTemplateColumns: "90px 70px 1fr 110px 1fr",
                      padding: "8px 20px", alignItems: "center",
                      borderBottom: "1px solid var(--pg-row-border)",
                      background: hoveredRow === m.match_id ? "var(--pg-row-hover)" : "transparent",
                    }}
                  >
                    <span style={colMuted}>{fmt(isBank ? m.bank_date : m.ledger_date)}</span>
                    <span>
                      <span style={{
                        display: "inline-flex", alignItems: "center",
                        border: "1px solid var(--pg-card-border)",
                        borderRadius: "9999px", padding: "1px 8px",
                        fontSize: "11px", color: "var(--pg-text-2)",
                      }}>
                        {isBank ? "Bank" : "Ledger"}
                      </span>
                    </span>
                    <span style={{ ...colData, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isBank ? (m.bank_narration || m.bank_reference || "—") : (m.ledger_reference || m.ledger_type || "—")}
                    </span>
                    <span style={{ ...colMuted, textAlign: "right", fontSize: "11px" }}>
                      {isBank
                        ? ((m.bank_credit_kobo ?? 0) > 0 ? koboToNaira(m.bank_credit_kobo!) : koboToNaira(m.bank_debit_kobo ?? 0))
                        : koboToNaira(m.ledger_amount_kobo ?? 0)}
                    </span>
                    <span style={{ ...colMuted, fontSize: "11px" }}>{m.notes || "—"}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {fullRows.length === 0 && (
        <div style={{
          background: "var(--pg-card)", border: "1px solid var(--pg-card-border)",
          borderRadius: "16px", padding: "48px", textAlign: "center",
          fontSize: "13px", color: "var(--pg-text-3)",
        }}>
          No match data yet — run auto-match or match manually above.
        </div>
      )}
    </div>
  );
}
