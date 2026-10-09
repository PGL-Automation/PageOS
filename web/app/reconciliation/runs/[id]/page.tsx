"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2, ArrowLeft, CheckCircle2, Link2, XCircle, Lock, Download, BookOpen, Send, ThumbsUp, ThumbsDown, AlertCircle } from "lucide-react";
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

type PostingType = {
  code: string;
  label: string;
  description: string;
  dr_gl_code: string;
  cr_gl_code: string;
  direction: string;
};

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

  // Classify & post state
  const [classifySheet, setClassifySheet] = useState(false);
  const [classifyMatchId, setClassifyMatchId] = useState<string>("");
  const [postingType, setPostingType] = useState("");
  const [drCode, setDrCode] = useState("");
  const [crCode, setCrCode] = useState("");
  const [classifyNotes, setClassifyNotes] = useState("");

  // Review state
  const [reviewNotes, setReviewNotes] = useState("");

  // Pagination & search
  const PAGE_SIZE = 50;
  const [tabPage, setTabPage] = useState(1);
  const [bankSearch, setBankSearch] = useState("");
  const [bankWorkspacePage, setBankWorkspacePage] = useState(1);
  const [internalSearch, setInternalSearch] = useState("");

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

  const { data: postingTypes = [] } = useQuery<PostingType[]>({
    queryKey: ["recon-posting-types"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/reconciliation/posting-types`, { credentials: "include" });
      if (!res.ok) return [];
      return (await res.json()) ?? [];
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

  // Reset to page 1 when tab changes
  const handleTabChange = (tab: Tab) => { setActiveTab(tab); setTabPage(1); };

  const runStatus = data?.run?.status ?? "";
  const isClosed = runStatus === "closed";
  const isPendingReview = runStatus === "pending_review";
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

  const classifyMutation = useMutation({
    mutationFn: async () => {
      if (!classifyMatchId) throw new Error("No match selected");

      const res = await fetch(`${BASE}/api/v1/reconciliation/runs/${runId}/matches/${classifyMatchId}/classify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posting_type: postingType, dr_gl_code: drCode, cr_gl_code: crCode, notes: classifyNotes }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error((j as Record<string,string>).message ?? "Classify failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-run-full", runId] });
      setClassifySheet(false);
      toast({ title: "Classified", description: "Bank line classified. You can now create the journal entry." });
    },
    onError: (e) => toast({ title: "Classify Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const postJournalMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await fetch(`${BASE}/api/v1/reconciliation/runs/${runId}/matches/${matchId}/post-journal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error((j as Record<string,string>).message ?? "Post failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-run-full", runId] });
      toast({ title: "Journal Created", description: "Draft journal entry created in the Finance module." });
    },
    onError: (e) => toast({ title: "Post Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/reconciliation/runs/${runId}/submit`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error((j as Record<string,string>).message ?? "Submit failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-run", runId] });
      toast({ title: "Submitted for Review", description: "A reviewer can now approve or reject this run." });
    },
    onError: (e) => toast({ title: "Submit Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: async (approved: boolean) => {
      const res = await fetch(`${BASE}/api/v1/reconciliation/runs/${runId}/review`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, notes: reviewNotes }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error((j as Record<string,string>).message ?? "Review failed"); }
    },
    onSuccess: (_d, approved) => {
      queryClient.invalidateQueries({ queryKey: ["recon-run", runId] });
      toast({ title: approved ? "Run Approved & Closed" : "Run Rejected", description: approved ? "Reconciliation sealed." : "Sent back to preparer." });
    },
    onError: (e) => toast({ title: "Review Failed", description: (e as Error).message, variant: "destructive" }),
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

  // Pagination for the bottom tab panel
  const activeTabRows = activeTab === "Matched" ? matchedRows
    : activeTab === "Unmatched Bank" ? unmatchedBankRows
    : activeTab === "Unmatched Internal" ? unmatchedInternalRows
    : adjustmentRows;
  const totalTabPages = Math.ceil(activeTabRows.length / PAGE_SIZE);
  const pagedTabRows = activeTabRows.slice((tabPage - 1) * PAGE_SIZE, tabPage * PAGE_SIZE) as typeof fullRows;

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
          {/* Preparer: submit for review */}
          {!isClosed && !isPendingReview && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={!canClose || submitMutation.isPending}
              title={!canClose ? "Resolve all unmatched items first" : "Submit for reviewer sign-off"}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                background: "linear-gradient(135deg,#FF6600,#E05500)", border: "none",
                borderRadius: "12px", padding: "6px 14px", fontSize: "13px",
                color: "#fff", cursor: (!canClose || submitMutation.isPending) ? "not-allowed" : "pointer",
                opacity: (!canClose || submitMutation.isPending) ? 0.5 : 1,
              }}
            >
              {submitMutation.isPending ? <Loader2 style={{ width: "14px", height: "14px" }} /> : <Send style={{ width: "14px", height: "14px" }} />}
              Submit for Review
            </button>
          )}
          {/* Reviewer: approve or reject */}
          {isPendingReview && (
            <>
              <button
                onClick={() => reviewMutation.mutate(false)}
                disabled={reviewMutation.isPending}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  background: "transparent", border: "1px solid #B91C1C",
                  borderRadius: "12px", padding: "6px 14px", fontSize: "13px",
                  color: "#B91C1C", cursor: reviewMutation.isPending ? "not-allowed" : "pointer",
                }}
              >
                {reviewMutation.isPending ? <Loader2 style={{ width: "14px", height: "14px" }} /> : <ThumbsDown style={{ width: "14px", height: "14px" }} />}
                Reject
              </button>
              <button
                onClick={() => reviewMutation.mutate(true)}
                disabled={reviewMutation.isPending}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  background: "linear-gradient(135deg,#16A34A,#15803D)", border: "none",
                  borderRadius: "12px", padding: "6px 14px", fontSize: "13px",
                  color: "#fff", cursor: reviewMutation.isPending ? "not-allowed" : "pointer",
                }}
              >
                {reviewMutation.isPending ? <Loader2 style={{ width: "14px", height: "14px" }} /> : <ThumbsUp style={{ width: "14px", height: "14px" }} />}
                Approve & Close
              </button>
            </>
          )}
        </div>
      </div>

      {/* Closed run notice */}
      {isClosed && (
        <div style={{
          background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.3)",
          borderRadius: "12px", padding: "12px 20px",
          display: "flex", alignItems: "center", gap: "12px",
        }}>
          <CheckCircle2 style={{ width: "16px", height: "16px", color: "#15803D", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#15803D" }}>Reconciliation closed</p>
            <p style={{ fontSize: "12px", color: "var(--pg-text-3)", marginTop: "2px" }}>
              This run is sealed. Use the tabs below to view matched items, posted journal entries, and adjustments.
            </p>
          </div>
          <button onClick={downloadExport} disabled={exporting} style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            border: "1px solid var(--pg-card-border)", background: "transparent",
            borderRadius: "10px", padding: "6px 14px", fontSize: "12px",
            color: "var(--pg-text-1)", cursor: exporting ? "not-allowed" : "pointer",
          }}>
            {exporting ? <Loader2 style={{ width: "13px", height: "13px" }} /> : <Download style={{ width: "13px", height: "13px" }} />}
            Export Excel
          </button>
        </div>
      )}

      {/* How-to guide for open runs */}
      {!isClosed && !isPendingReview && (sum?.unmatched_bank ?? 0) > 0 && (
        <div style={{
          background: "rgba(255,102,0,0.05)", border: "1px solid rgba(255,102,0,0.2)",
          borderRadius: "12px", padding: "12px 20px",
          display: "flex", alignItems: "center", gap: "20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#FF6600", color: "#fff", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>1</span>
            <span style={{ fontSize: "12px", color: "var(--pg-text-2)" }}>Select <strong>Unmatched Bank</strong> tab → click <strong>Classify</strong> on each item</span>
          </div>
          <span style={{ color: "var(--pg-text-3)", fontSize: "16px" }}>→</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#FF6600", color: "#fff", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>2</span>
            <span style={{ fontSize: "12px", color: "var(--pg-text-2)" }}>Click <strong>Post JE</strong> to create a draft journal entry in Finance</span>
          </div>
          <span style={{ color: "var(--pg-text-3)", fontSize: "16px" }}>→</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#FF6600", color: "#fff", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>3</span>
            <span style={{ fontSize: "12px", color: "var(--pg-text-2)" }}>When all resolved → <strong>Submit for Review</strong></span>
          </div>
        </div>
      )}

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
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--pg-card-border)", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--pg-text-1)", flex: 1 }}>Unmatched Bank Lines</span>
              <Input
                value={bankSearch}
                onChange={e => { setBankSearch(e.target.value); setBankWorkspacePage(1); }}
                placeholder="Search narration…"
                style={{ height: "26px", fontSize: "11px", width: "160px" }}
              />
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
            {(() => {
              type BankLine = { id: string; txn_date: string; narration: string; debit_kobo: number; credit_kobo: number };
              const allLines = bankLines as BankLine[];
              const filtered = bankSearch ? allLines.filter(l => l.narration?.toLowerCase().includes(bankSearch.toLowerCase())) : allLines;
              const totalBankPages = Math.ceil(filtered.length / PAGE_SIZE);
              const visible = filtered.slice((bankWorkspacePage - 1) * PAGE_SIZE, bankWorkspacePage * PAGE_SIZE);
              if (filtered.length === 0) return (
                <div style={{ padding: "32px 16px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>
                  {bankSearch ? "No matching bank lines" : "All bank lines resolved"}
                </div>
              );
              return (<>
              {visible.map((line) => {
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
              {totalBankPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderTop: "1px solid var(--pg-row-border)" }}>
                  <span style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>
                    {(bankWorkspacePage - 1) * PAGE_SIZE + 1}–{Math.min(bankWorkspacePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => setBankWorkspacePage(p => Math.max(1, p - 1))} disabled={bankWorkspacePage === 1}
                      style={{ fontSize: "11px", padding: "2px 8px", border: "1px solid var(--pg-card-border)", borderRadius: "6px", background: "transparent", cursor: bankWorkspacePage === 1 ? "not-allowed" : "pointer", opacity: bankWorkspacePage === 1 ? 0.4 : 1 }}>← Prev</button>
                    <button onClick={() => setBankWorkspacePage(p => Math.min(totalBankPages, p + 1))} disabled={bankWorkspacePage === totalBankPages}
                      style={{ fontSize: "11px", padding: "2px 8px", border: "1px solid var(--pg-card-border)", borderRadius: "6px", background: "transparent", cursor: bankWorkspacePage === totalBankPages ? "not-allowed" : "pointer", opacity: bankWorkspacePage === totalBankPages ? 0.4 : 1 }}>Next →</button>
                  </div>
                </div>
              )}
              </>);
            })()}
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
                  onClick={() => handleTabChange(tab)}
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
              {activeTabRows.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>No matched rows</div>
              ) : pagedTabRows.map(m => (
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
                display: "flex", alignItems: "center", gap: "8px",
                padding: "8px 20px", borderBottom: "1px solid var(--pg-card-border)",
                background: "rgba(251,191,36,0.06)",
              }}>
                <AlertCircle style={{ width: "13px", height: "13px", color: "#B45309", flexShrink: 0 }} />
                <span style={{ fontSize: "11px", color: "#B45309" }}>
                  These items are in the bank but not in the GL. Classify each one and create a journal entry to post it.
                </span>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "90px 110px 1fr 110px 110px 160px",
                padding: "7px 20px", borderBottom: "1px solid var(--pg-row-border)",
                background: "var(--pg-muted-bg)",
              }}>
                {["Date", "Reference", "Narration", "Debit", "Credit", ""].map((h, i) => (
                  <span key={i} style={{ ...colLabel, textAlign: i >= 3 && i < 5 ? "right" : "left" }}>{h}</span>
                ))}
              </div>
              {activeTabRows.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>No unmatched bank lines</div>
              ) : pagedTabRows.map(m => (
                <div
                  key={m.match_id}
                  onMouseEnter={() => setHoveredRow(m.match_id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    display: "grid", gridTemplateColumns: "90px 110px 1fr 110px 110px 160px",
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
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => {
                        setClassifyMatchId(m.match_id ?? "");
                        setPostingType(""); setDrCode(""); setCrCode(""); setClassifyNotes("");
                        setClassifySheet(true);
                      }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        fontSize: "11px", padding: "3px 10px",
                        border: "1px solid var(--pg-card-border)", borderRadius: "8px",
                        background: "transparent", cursor: "pointer", color: "var(--pg-text-2)",
                      }}
                    >
                      <BookOpen style={{ width: "11px", height: "11px" }} /> Classify
                    </button>
                    <button
                      onClick={() => postJournalMutation.mutate(m.match_id)}
                      disabled={postJournalMutation.isPending}
                      title="Create journal entry (classify first)"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        fontSize: "11px", padding: "3px 10px",
                        border: "1px solid #FF6600", borderRadius: "8px",
                        background: "rgba(255,102,0,0.07)", cursor: "pointer", color: "#C05000",
                      }}
                    >
                      {postJournalMutation.isPending
                        ? <Loader2 style={{ width: "11px", height: "11px" }} />
                        : <Send style={{ width: "11px", height: "11px" }} />}
                      Post JE
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Unmatched Internal tab */}
          {activeTab === "Unmatched Internal" && (
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "8px 20px", borderBottom: "1px solid var(--pg-card-border)",
                background: "rgba(148,163,184,0.06)",
              }}>
                <AlertCircle style={{ width: "13px", height: "13px", color: "var(--pg-text-3)", flexShrink: 0 }} />
                <span style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>
                  These items are in the GL but have no matching bank transaction. Read-only — no posting required. Acknowledge via the workspace above.
                </span>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "90px 110px 1fr 80px 110px",
                padding: "7px 20px", borderBottom: "1px solid var(--pg-row-border)",
                background: "var(--pg-muted-bg)",
              }}>
                {["Date", "Reference", "Type", "Dir", "Amount"].map((h, i) => (
                  <span key={h} style={{ ...colLabel, textAlign: i === 4 ? "right" : "left" }}>{h}</span>
                ))}
              </div>
              {activeTabRows.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>No unmatched GL rows</div>
              ) : pagedTabRows.map(m => (
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
              {activeTabRows.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--pg-text-3)" }}>No adjustments</div>
              ) : pagedTabRows.map(m => {
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

          {/* Shared pagination footer for all tabs */}
          {totalTabPages > 1 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 20px", borderTop: "1px solid var(--pg-card-border)",
              background: "var(--pg-muted-bg)",
            }}>
              <span style={{ fontSize: "11px", color: "var(--pg-text-3)" }}>
                Showing {(tabPage - 1) * PAGE_SIZE + 1}–{Math.min(tabPage * PAGE_SIZE, activeTabRows.length)} of {activeTabRows.length} items
              </span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button onClick={() => setTabPage(p => Math.max(1, p - 1))} disabled={tabPage === 1}
                  style={{ fontSize: "12px", padding: "4px 12px", border: "1px solid var(--pg-card-border)", borderRadius: "8px", background: "transparent", cursor: tabPage === 1 ? "not-allowed" : "pointer", opacity: tabPage === 1 ? 0.4 : 1, color: "var(--pg-text-1)" }}>
                  ← Prev
                </button>
                <span style={{ fontSize: "12px", color: "var(--pg-text-3)", minWidth: "80px", textAlign: "center" }}>
                  Page {tabPage} of {totalTabPages}
                </span>
                <button onClick={() => setTabPage(p => Math.min(totalTabPages, p + 1))} disabled={tabPage === totalTabPages}
                  style={{ fontSize: "12px", padding: "4px 12px", border: "1px solid var(--pg-card-border)", borderRadius: "8px", background: "transparent", cursor: tabPage === totalTabPages ? "not-allowed" : "pointer", opacity: tabPage === totalTabPages ? 0.4 : 1, color: "var(--pg-text-1)" }}>
                  Next →
                </button>
              </div>
            </div>
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

      {/* Pending review banner */}
      {isPendingReview && (
        <div style={{
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)",
          borderRadius: "14px", padding: "16px 20px",
          display: "flex", alignItems: "flex-start", gap: "14px",
        }}>
          <AlertCircle style={{ width: "18px", height: "18px", color: "#B45309", flexShrink: 0, marginTop: "1px" }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#B45309" }}>Awaiting Reviewer Sign-off</p>
            <p style={{ fontSize: "12px", color: "var(--pg-text-3)", marginTop: "4px" }}>
              This run has been submitted by the preparer and is pending approval. Add a note and approve or reject below.
            </p>
            <div style={{ marginTop: "10px", display: "flex", gap: "10px", alignItems: "center" }}>
              <Input
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Reviewer notes (optional)…"
                style={{ height: "32px", fontSize: "12px", maxWidth: "340px" }}
              />
              <button
                onClick={() => reviewMutation.mutate(false)}
                disabled={reviewMutation.isPending}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  fontSize: "12px", padding: "5px 14px",
                  border: "1px solid #B91C1C", borderRadius: "10px",
                  background: "transparent", cursor: "pointer", color: "#B91C1C",
                }}
              >
                <ThumbsDown style={{ width: "13px", height: "13px" }} /> Reject
              </button>
              <button
                onClick={() => reviewMutation.mutate(true)}
                disabled={reviewMutation.isPending}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  fontSize: "12px", padding: "5px 14px",
                  background: "linear-gradient(135deg,#16A34A,#15803D)", border: "none",
                  borderRadius: "10px", cursor: "pointer", color: "#fff",
                }}
              >
                {reviewMutation.isPending
                  ? <Loader2 style={{ width: "13px", height: "13px" }} />
                  : <ThumbsUp style={{ width: "13px", height: "13px" }} />}
                Approve & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classify bank line sheet */}
      <Sheet open={classifySheet} onOpenChange={setClassifySheet}>
        <SheetContent side="right" style={{ width: "420px", padding: "28px 24px" }}>
          <SheetHeader>
            <SheetTitle style={{ fontSize: "16px" }}>Classify Bank Line</SheetTitle>
            <SheetDescription style={{ fontSize: "12px" }}>
              Select the transaction type and confirm GL codes. A draft journal entry will be created in Finance.
            </SheetDescription>
          </SheetHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: "24px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label style={{ fontSize: "12px" }}>Transaction Type</Label>
              <Select
                value={postingType}
                onValueChange={(v: string | null) => {
                  if (!v) return;
                  setPostingType(v);
                  const pt = postingTypes.find(p => p.code === v);
                  if (pt) { setDrCode(pt.dr_gl_code); setCrCode(pt.cr_gl_code); }
                }}
              >
                <SelectTrigger style={{ height: "36px", fontSize: "12px" }}>
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {postingTypes.map(pt => (
                    <SelectItem key={pt.code} value={pt.code} style={{ fontSize: "12px" }}>
                      {pt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {postingType && (
                <p style={{ fontSize: "11px", color: "var(--pg-text-3)", marginTop: "2px" }}>
                  {postingTypes.find(p => p.code === postingType)?.description}
                </p>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Label style={{ fontSize: "12px" }}>DR Account Code</Label>
                <Input
                  value={drCode}
                  onChange={e => setDrCode(e.target.value)}
                  placeholder="e.g. 1123"
                  style={{ height: "36px", fontSize: "12px", fontFamily: "monospace" }}
                />
                <p style={{ fontSize: "10px", color: "var(--pg-text-3)" }}>
                  {drCode === "BANK" ? "Will use bank account GL code" : ""}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Label style={{ fontSize: "12px" }}>CR Account Code</Label>
                <Input
                  value={crCode}
                  onChange={e => setCrCode(e.target.value)}
                  placeholder="e.g. 2110"
                  style={{ height: "36px", fontSize: "12px", fontFamily: "monospace" }}
                />
                <p style={{ fontSize: "10px", color: "var(--pg-text-3)" }}>
                  {crCode === "BANK" ? "Will use bank account GL code" : ""}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label style={{ fontSize: "12px" }}>Notes (optional)</Label>
              <Input
                value={classifyNotes}
                onChange={e => setClassifyNotes(e.target.value)}
                placeholder="Additional context…"
                style={{ height: "36px", fontSize: "12px" }}
              />
            </div>

            <button
              onClick={() => classifyMutation.mutate()}
              disabled={!postingType || !drCode || !crCode || classifyMutation.isPending}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
                background: "linear-gradient(135deg,#FF6600,#E05500)", border: "none",
                borderRadius: "10px", padding: "9px 0", fontSize: "13px",
                color: "#fff", cursor: (!postingType || !drCode || !crCode) ? "not-allowed" : "pointer",
                opacity: (!postingType || !drCode || !crCode) ? 0.5 : 1, width: "100%",
              }}
            >
              {classifyMutation.isPending ? <Loader2 style={{ width: "14px", height: "14px" }} /> : <CheckCircle2 style={{ width: "14px", height: "14px" }} />}
              Save Classification
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
