"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Bell, FileText, Search, ChevronDown,
  Loader2, AlertCircle, Eye, CalendarDays, FileX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

// ── Constants ──────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type DocumentRequest = {
  id: string;
  person_id: string;
  person_name: string;
  person_email: string;
  requested_by: string;
  requester_name: string;
  document_type: string;
  notes: string;
  due_date?: string;
  status: "pending" | "uploaded" | "declined";
  document_id?: string;
  declined_note: string;
  created_at: string;
  updated_at: string;
};

type Person = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

type StatusFilter = "all" | "pending" | "uploaded" | "declined";

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusChip(status: DocumentRequest["status"]) {
  const map: Record<DocumentRequest["status"], { label: string; bg: string; color: string }> = {
    pending:  { label: "Pending",  bg: "#fef3c7", color: "#d97706" },
    uploaded: { label: "Uploaded", bg: "#d1fae5", color: "#059669" },
    declined: { label: "Declined", bg: "#fee2e2", color: "#dc2626" },
  };
  const s = map[status];
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ── Fallback document types (shown when API is unavailable) ──────────────────

const FALLBACK_DOC_TYPES = [
  "Academic Certificate",
  "Professional Certification",
  "Means of Identification (NIN / Passport / Driver's Licence)",
  "Passport Photograph",
  "Birth Certificate",
  "Medical / Health Certificate",
  "Previous Employment Letter",
  "Reference Letter",
  "Proof of Address (Utility Bill)",
  "Bank Account Details",
  "Pension RSA PIN",
  "Tax Identification Number (TIN)",
  "Signed Employment Contract",
  "Emergency Contact / Next of Kin Form",
  "Other",
];

// ── New Request Modal ──────────────────────────────────────────────────────────

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [personSearch, setPersonSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [documentType, setDocumentType] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const { data: persons = [], isLoading: loadingPersons } = useQuery<Person[]>({
    queryKey: ["org-persons"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/users`, { credentials: "include" });
      if (!res.ok) return [];
      const raw = ((await res.json()) ?? []) as Array<{
        person_id?: string; display_name: string; email: string;
      }>;
      return raw
        .filter(u => u.person_id)
        .map(u => {
          const parts = u.display_name.split(" ");
          return {
            id: u.person_id!,
            first_name: parts[0] ?? "",
            last_name: parts.slice(1).join(" "),
            email: u.email,
          };
        });
    },
  });

  const { data: docTypesFromAPI = [] } = useQuery<string[]>({
    queryKey: ["hr-doc-types"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/hr/document-requests/types`, { credentials: "include" });
      if (!res.ok) return FALLBACK_DOC_TYPES;
      const data = ((await res.json()) ?? []) as string[];
      return data.length > 0 ? data : FALLBACK_DOC_TYPES;
    },
  });
  // Always show types — use API result or fallback
  const docTypes = docTypesFromAPI.length > 0 ? docTypesFromAPI : FALLBACK_DOC_TYPES;

  const filteredPersons = persons.filter((p) => {
    if (!personSearch) return true;
    const full = `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase();
    return full.includes(personSearch.toLowerCase());
  });

  function togglePerson(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (selectedIds.size === 0) { setError("Select at least one employee."); return; }
    if (!documentType) { setError("Please select a document type."); return; }
    setSending(true);
    try {
      const selected = persons.filter(p => selectedIds.has(p.id));
      const results = await Promise.all(selected.map(async person => {
        const res = await fetch(`${BASE}/api/v1/hr/document-requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            person_id: person.id,
            document_type: documentType,
            notes,
            due_date: dueDate || undefined,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          let msg = `Error ${res.status}`;
          try { msg = JSON.parse(text)?.error?.message ?? msg; } catch { /* */ }
          throw new Error(`Failed for ${person.first_name}: ${msg}`);
        }
        return res.json();
      }));
      queryClient.invalidateQueries({ queryKey: ["hr-doc-requests"] });
      queryClient.refetchQueries({ queryKey: ["hr-doc-requests"] });
      toast({
        title: "Requests sent",
        description: `Document request sent to ${results.length} employee${results.length !== 1 ? "s" : ""}.`,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>New Document Request</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Select employees and the document you need. Each will receive an email notification.
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 p-6 space-y-5">

            {/* Employee multi-select */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
                  Employees *
                </label>
                {selectedIds.size > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "#eff6ff", color: "#2563eb" }}>
                    {selectedIds.size} selected
                  </span>
                )}
              </div>
              {/* Search */}
              <div className="flex items-center gap-2 h-9 px-3 rounded-lg mb-2"
                   style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)" }}>
                <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                <input
                  value={personSearch}
                  onChange={e => setPersonSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="flex-1 text-[13px] bg-transparent outline-none"
                  style={{ color: "var(--pg-text-1)" }}
                />
                {loadingPersons && <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: "var(--pg-text-4)" }} />}
              </div>
              {/* Scrollable employee list */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pg-card-border)", maxHeight: 200, overflowY: "auto" }}>
                {filteredPersons.length === 0 ? (
                  <p className="px-4 py-4 text-[12px] text-center" style={{ color: "var(--pg-text-3)" }}>
                    {loadingPersons ? "Loading employees…" : "No employees found."}
                  </p>
                ) : filteredPersons.map((p, i) => {
                  const checked = selectedIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50/60 transition-colors"
                      style={{ borderBottom: i < filteredPersons.length - 1 ? "1px solid var(--pg-row-border)" : "none",
                               background: checked ? "#eff6ff" : undefined }}
                      onClick={() => togglePerson(p.id)}
                    >
                      <div className={cn("w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors",
                        checked ? "border-blue-500 bg-blue-500" : "border-slate-300")}
                           style={{ borderColor: checked ? "#2563eb" : undefined }}>
                        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                           style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                        {initials(`${p.first_name} ${p.last_name}`)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>
                          {p.first_name} {p.last_name}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>{p.email}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {filteredPersons.length > 0 && (
                <div className="flex gap-3 mt-1.5">
                  <button type="button" onClick={() => setSelectedIds(new Set(filteredPersons.map(p => p.id)))}
                          className="text-[11px] font-semibold" style={{ color: "#2563eb" }}>
                    Select all {filteredPersons.length > persons.length ? "visible" : ""}
                  </button>
                  {selectedIds.size > 0 && (
                    <button type="button" onClick={() => setSelectedIds(new Set())}
                            className="text-[11px] font-semibold" style={{ color: "#94a3b8" }}>
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Document type */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                Document Type *
              </label>
              <div className="relative">
                <select value={documentType} onChange={e => setDocumentType(e.target.value)} required
                        className="w-full h-10 px-3 pr-8 rounded-xl text-[13px] outline-none appearance-none"
                        style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)",
                                 color: documentType ? "var(--pg-text-1)" : "var(--pg-text-3)" }}>
                  <option value="">Select document type…</option>
                  {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                Notes <span style={{ color: "var(--pg-text-4)" }}>— optional</span>
              </label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Add instructions or context for the employee…"
                        rows={2}
                        className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none"
                        style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>

            {/* Due date */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                Due Date <span style={{ color: "var(--pg-text-4)" }}>— optional</span>
              </label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                     className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-[13px] text-red-600">{error}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 px-6 py-4 shrink-0" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              Cancel
            </button>
            <button type="submit" disabled={sending}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60 flex items-center gap-1.5"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {sending ? "Sending…" : `Send to ${selectedIds.size || ""} Employee${selectedIds.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Document View Modal ────────────────────────────────────────────────────────

function DocumentViewModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const downloadUrl = `${BASE}/api/v1/documents/${docId}/download`;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          maxHeight: "90vh",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ borderBottom: "1px solid var(--pg-row-border)" }}
        >
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Uploaded Document
          </p>
          <div className="flex items-center gap-2">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
            >
              Open / Download
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl"
              style={{ color: "var(--pg-text-3)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4" style={{ minHeight: 400 }}>
          <iframe
            src={downloadUrl}
            title="Document preview"
            className="w-full rounded-lg"
            style={{ height: "65vh", border: "none" }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const TABS: { key: StatusFilter; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "pending",  label: "Pending" },
  { key: "uploaded", label: "Uploaded" },
  { key: "declined", label: "Declined" },
];

export default function HRDocumentsPage() {
  useAuth(); // ensures auth context is loaded
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab]               = useState<StatusFilter>("all");
  const [showNewModal, setNewModal] = useState(false);
  const [viewDocId, setViewDocId]   = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery<DocumentRequest[]>({
    queryKey: ["hr-doc-requests", tab],
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const params = tab !== "all" ? `?status=${tab}` : "";
      const res = await fetch(`${BASE}/api/v1/hr/document-requests${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Error ${res.status}`);
      }
      return ((await res.json()) ?? []) as DocumentRequest[];
    },
  });

  const remindMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/v1/hr/document-requests/${id}/remind`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to send reminder" }));
        throw new Error((err as { message?: string }).message ?? "Failed to send reminder");
      }
      return res.json() as Promise<{ status: string }>;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["hr-doc-requests"] });
      const req = requests.find((r) => r.id === id);
      toast({
        title: "Reminder Sent",
        description: `Email reminder sent to ${req?.person_name ?? "employee"}.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Reminder Failed", description: err.message, variant: "destructive" });
    },
  });

  // Counts per tab (computed from "all" data — always fetch all for counts)
  const { data: allRequests = [] } = useQuery<DocumentRequest[]>({
    queryKey: ["hr-doc-requests", "all"],
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/hr/document-requests`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as DocumentRequest[];
    },
  });

  function countFor(status: StatusFilter) {
    if (status === "all") return allRequests.length;
    return allRequests.filter((r) => r.status === status).length;
  }

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Document Requests
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Track and manage employee document submissions across the organisation.
          </p>
        </div>
        <button
          onClick={() => setNewModal(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white shrink-0"
          style={{
            background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
            boxShadow: "0 1px 6px rgba(37,99,235,0.35)",
          }}
        >
          <Plus className="w-3.5 h-3.5" /> New Request
        </button>
      </div>

      {/* Filter tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
      >
        {TABS.map((t) => {
          const count = countFor(t.key);
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "h-7 px-3 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5"
              )}
              style={
                isActive
                  ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "white" }
                  : { color: "var(--pg-text-2)" }
              }
            >
              {t.label}
              {count > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
                  style={
                    isActive
                      ? { background: "rgba(255,255,255,0.25)", color: "white" }
                      : { background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }
                  }
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px var(--pg-card-shadow)",
        }}
      >
        {/* Table header */}
        <div
          className="hidden md:grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
          style={{
            gridTemplateColumns: "2fr 2fr 1.2fr 110px 90px 80px",
            borderBottom: "1px solid var(--pg-row-border)",
            color: "var(--pg-text-3)",
          }}
        >
          <span>Employee</span>
          <span>Document Type</span>
          <span>Due Date</span>
          <span>Status</span>
          <span>Requested</span>
          <span />
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex justify-center items-center py-16 gap-2" style={{ color: "var(--pg-text-3)" }}>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Loading requests…</span>
          </div>
        ) : requests.length === 0 ? (
          <EmptyState tab={tab} onNewRequest={() => setNewModal(true)} />
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {requests.map((req) => (
              <RequestRow
                key={req.id}
                req={req}
                onRemind={() => remindMutation.mutate(req.id)}
                remindingId={remindMutation.isPending ? remindMutation.variables : null}
                onViewDoc={(id) => setViewDocId(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewModal && <NewRequestModal onClose={() => setNewModal(false)} />}
      {viewDocId && <DocumentViewModal docId={viewDocId} onClose={() => setViewDocId(null)} />}
    </div>
  );
}

// ── Request Row ────────────────────────────────────────────────────────────────

type RequestRowProps = {
  req: DocumentRequest;
  onRemind: () => void;
  remindingId: string | null;
  onViewDoc: (docId: string) => void;
};

function RequestRow({ req, onRemind, remindingId, onViewDoc }: RequestRowProps) {
  const isReminding = remindingId === req.id;

  return (
    <div
      className="grid items-center gap-2 px-5 py-3.5 transition-colors"
      style={{
        gridTemplateColumns: "2fr 2fr 1.2fr 110px 90px 80px",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
    >
      {/* Employee */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ background: "linear-gradient(135deg,#64748b,#475569)" }}
        >
          {initials(req.person_name)}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>
            {req.person_name}
          </p>
          <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>
            {req.person_email}
          </p>
        </div>
      </div>

      {/* Document type */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <p className="text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>
            {req.document_type}
          </p>
        </div>
        {req.notes && (
          <p className="text-[11px] truncate mt-0.5 pl-5" style={{ color: "var(--pg-text-3)" }}>
            {req.notes}
          </p>
        )}
        {req.status === "declined" && req.declined_note && (
          <p
            className="text-[11px] truncate mt-0.5 pl-5 font-medium"
            style={{ color: "#dc2626" }}
          >
            Declined: {req.declined_note}
          </p>
        )}
      </div>

      {/* Due date */}
      <div>
        {req.due_date ? (
          <span className="flex items-center gap-1 text-[12px]" style={{ color: "var(--pg-text-2)" }}>
            <CalendarDays className="w-3 h-3 shrink-0" style={{ color: "var(--pg-text-4)" }} />
            {fmtDate(req.due_date)}
          </span>
        ) : (
          <span className="text-[12px]" style={{ color: "var(--pg-text-4)" }}>
            —
          </span>
        )}
      </div>

      {/* Status */}
      <div>{statusChip(req.status)}</div>

      {/* Requested at */}
      <div>
        <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
          {fmtDate(req.created_at)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 justify-end">
        {req.status === "pending" && (
          <button
            onClick={onRemind}
            disabled={isReminding}
            title="Send reminder email"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-60"
            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#fef3c7")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
          >
            {isReminding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Bell className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        {req.status === "uploaded" && req.document_id && (
          <button
            onClick={() => onViewDoc(req.document_id!)}
            title="View uploaded document"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#eff6ff")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────

function EmptyState({ tab, onNewRequest }: { tab: StatusFilter; onNewRequest: () => void }) {
  const messages: Record<StatusFilter, { title: string; sub: string }> = {
    all:      { title: "No document requests yet",   sub: "Create a request to ask an employee to submit a document." },
    pending:  { title: "No pending requests",        sub: "All requests have been fulfilled or there are none yet." },
    uploaded: { title: "No uploaded documents yet",  sub: "Documents uploaded by employees will appear here." },
    declined: { title: "No declined requests",       sub: "Requests declined by employees will appear here." },
  };
  const { title, sub } = messages[tab];

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--pg-muted-bg)" }}
      >
        <FileX className="w-7 h-7" style={{ color: "var(--pg-text-4)" }} />
      </div>
      <div className="text-center">
        <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
          {title}
        </p>
        <p className="text-[12px] mt-1 max-w-xs" style={{ color: "var(--pg-text-3)" }}>
          {sub}
        </p>
      </div>
      {tab === "all" && (
        <button
          onClick={onNewRequest}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
        >
          <Plus className="w-3.5 h-3.5" /> Create First Request
        </button>
      )}
    </div>
  );
}
