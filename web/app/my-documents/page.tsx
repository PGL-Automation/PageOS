"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Upload, CheckCircle2, XCircle, Clock,
  Loader2, AlertCircle, X, FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type DocRequest = {
  id: string;
  person_id: string; person_name: string;
  requester_name: string;
  document_type: string; notes: string;
  due_date?: string;
  status: "pending" | "uploaded" | "declined";
  document_id?: string;
  declined_note: string;
  created_at: string; updated_at: string;
};

type Tab = "all" | "pending" | "uploaded" | "declined";

const STATUS_CFG = {
  pending:  { label: "Pending",  bg: "#fffbeb", color: "#d97706", icon: Clock },
  uploaded: { label: "Uploaded", bg: "#ecfdf5", color: "#059669", icon: CheckCircle2 },
  declined: { label: "Declined", bg: "#fef2f2", color: "#dc2626", icon: XCircle },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Request card ──────────────────────────────────────────────────────────────

function RequestCard({ req, onRefresh }: { req: DocRequest; onRefresh: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineNote, setDeclineNote] = useState("");

  const cfg = STATUS_CFG[req.status];
  const Icon = cfg.icon;

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      // Step 1: Upload the file to get a document_id
      const fd = new FormData();
      fd.append("file", file);
      fd.append("context", JSON.stringify({ document_request_id: req.id }));

      const upRes = await fetch(`${BASE}/api/v1/documents/`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!upRes.ok) {
        const e = await upRes.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? "Upload failed");
      }
      const { id: documentId } = await upRes.json() as { id: string };

      // Step 2: Mark the request as fulfilled
      const fulfillRes = await fetch(`${BASE}/api/v1/hr/document-requests/${req.id}/fulfill`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: documentId }),
      });
      if (!fulfillRes.ok) throw new Error("Failed to link document to request");

      toast({ title: "Document uploaded", description: `${req.document_type} has been submitted.` });
      onRefresh();
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleDecline() {
    setDeclining(true);
    try {
      const res = await fetch(`${BASE}/api/v1/hr/document-requests/${req.id}/decline`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: declineNote }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "Failed to decline" } }));
        throw new Error(err.error?.message ?? "Failed to decline");
      }
      toast({ title: "Request declined" });
      setShowDecline(false);
      onRefresh();
    } catch (err) {
      toast({ title: "Failed to decline", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDeclining(false);
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>

      {/* Main row */}
      <div className="flex items-start gap-4 p-5">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: cfg.bg }}>
          <FileText className="w-5 h-5" style={{ color: cfg.color }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                {req.document_type}
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                Requested by {req.requester_name} · {fmt(req.created_at)}
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: cfg.bg, color: cfg.color }}>
              <Icon className="w-3 h-3" />
              {cfg.label}
            </span>
          </div>

          {req.notes && (
            <div className="mt-2 px-3 py-2 rounded-lg text-[12px]"
                 style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
              {req.notes}
            </div>
          )}

          {req.due_date && req.status === "pending" && (
            <p className="text-[12px] mt-2 font-semibold"
               style={{ color: new Date(req.due_date) < new Date() ? "#dc2626" : "#d97706" }}>
              Due: {req.due_date}
            </p>
          )}

          {req.status === "uploaded" && (
            <p className="text-[12px] mt-2 font-medium text-emerald-600">
              ✓ Submitted on {fmt(req.updated_at)}
            </p>
          )}

          {req.status === "declined" && req.declined_note && (
            <p className="text-[12px] mt-2" style={{ color: "var(--pg-text-3)" }}>
              Reason: {req.declined_note}
            </p>
          )}
        </div>
      </div>

      {/* Actions for pending */}
      {req.status === "pending" && (
        <div className="px-5 pb-4 flex items-center gap-2" style={{ borderTop: "1px solid var(--pg-row-border)", paddingTop: 14 }}>
          <input ref={fileRef} type="file" className="hidden"
                 onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />

          <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                  style={{ background: uploading ? "#94a3b8" : "linear-gradient(135deg,#FF6600,#E05500)" }}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Uploading…" : "Upload Document"}
          </button>

          {!showDecline && (
            <button onClick={() => setShowDecline(true)}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-3)" }}>
              Can&apos;t provide
            </button>
          )}

          {showDecline && (
            <div className="flex-1 flex items-center gap-2">
              <input value={declineNote} onChange={e => setDeclineNote(e.target.value)}
                     placeholder="Reason (optional)"
                     className="flex-1 h-9 px-3 rounded-lg text-[12px] outline-none"
                     style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
              <button onClick={handleDecline} disabled={declining}
                      className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white"
                      style={{ background: "#dc2626" }}>
                {declining ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
              </button>
              <button onClick={() => { setShowDecline(false); setDeclineNote(""); }}
                      className="w-7 h-7 flex items-center justify-center" style={{ color: "var(--pg-text-4)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyDocumentsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");

  const { data: requests = [], isLoading } = useQuery<DocRequest[]>({
    queryKey: ["my-doc-requests", tab],
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (tab !== "all") p.set("status", tab);
      const res = await fetch(`${BASE}/api/v1/hr/document-requests/my?${p}`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as DocRequest[];
    },
  });

  const { data: pendingCount = 0 } = useQuery<number>({
    queryKey: ["my-doc-requests-count"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/hr/document-requests/my?status=pending`, { credentials: "include" });
      if (!res.ok) return 0;
      const data = ((await res.json()) ?? []) as DocRequest[];
      return data.length;
    },
    refetchInterval: 60_000,
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: "pending",  label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
    { key: "uploaded", label: "Uploaded" },
    { key: "declined", label: "Declined" },
    { key: "all",      label: "All" },
  ];

  return (
    <div className="max-w-[720px] mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
          My Document Requests
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          HR has requested these documents from you. Upload each one to keep your records up to date.
        </p>
      </div>

      {/* Info banner if pending */}
      {pendingCount > 0 && tab !== "pending" && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
             style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-[13px] text-amber-800">
            You have <strong>{pendingCount}</strong> pending document request{pendingCount !== 1 ? "s" : ""} awaiting your response.
          </p>
          <button onClick={() => setTab("pending")}
                  className="ml-auto text-[12px] font-semibold text-amber-700 hover:underline shrink-0">
            View →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl"
           style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={cn("flex-1 h-8 rounded-lg text-[12px] font-semibold transition-all",
                    tab === t.key ? "text-orange-700 shadow-sm" : "hover:bg-white/60")}
                  style={{ background: tab === t.key ? "white" : "transparent",
                           color: tab === t.key ? "#E05500" : "var(--pg-text-3)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl py-16 text-center"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <FileCheck className="w-9 h-9 mx-auto mb-3 text-slate-200" />
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
            {tab === "pending" ? "No pending requests" : `No ${tab} requests`}
          </p>
          <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
            {tab === "pending"
              ? "You're all caught up. HR will notify you when a document is needed."
              : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <RequestCard key={req.id} req={req}
                         onRefresh={() => {
                           qc.invalidateQueries({ queryKey: ["my-doc-requests"] });
                           qc.refetchQueries({ queryKey: ["my-doc-requests"] });
                           qc.invalidateQueries({ queryKey: ["my-doc-requests-count"] });
                         }} />
          ))}
        </div>
      )}
    </div>
  );
}
