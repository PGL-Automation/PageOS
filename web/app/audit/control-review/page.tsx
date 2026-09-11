"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Search, X, AlertCircle, Loader2,
  Zap, ClipboardList, ChevronDown,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type ReviewItem = {
  id: string;
  reference_no: string;
  title: string;
  item_type: string;
  business_unit: string;
  risk_level: string;
  status: string;
  priority: string;
  submitter_name: string;
  assigned_reviewer_name: string;
  submission_date: string;
  due_date?: string;
  age_in_days: number;
  is_overdue: boolean;
  exception_count: number;
  document_count: number;
  checklist_total: number;
  checklist_done: number;
  compliance_required: boolean;
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending_review:       { label: "Pending Review",   color: "#d97706", bg: "#fffbeb" },
  awaiting_information: { label: "Awaiting Info",    color: "#7c3aed", bg: "#f5f3ff" },
  under_review:         { label: "Under Review",     color: "#1d4ed8", bg: "#eff6ff" },
  exception_raised:     { label: "Exception Raised", color: "#dc2626", bg: "#fef2f2" },
  escalated:            { label: "Escalated",        color: "#991b1b", bg: "#fef2f2" },
  completed:            { label: "Completed",        color: "#059669", bg: "#ecfdf5" },
};

const RISK_CFG: Record<string, { color: string; bg: string }> = {
  critical: { color: "#dc2626", bg: "#fef2f2" },
  high:     { color: "#ea580c", bg: "#fff7ed" },
  medium:   { color: "#d97706", bg: "#fffbeb" },
  low:      { color: "#64748b", bg: "#f1f5f9" },
};

const BU_LABELS: Record<string, string> = {
  wealth_management:   "Wealth Mgmt",
  portfolio_management: "Portfolio Mgmt",
  finance_operations:  "Finance & Ops",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  client_instruction:  "Client Instruction",
  investment_schedule: "Investment Schedule",
  account_opening:     "Account Opening",
  kyc_validation:      "KYC Validation",
  symplus_posting:     "Symplus Posting",
  bank_reconciliation: "Bank Reconciliation",
  other:               "Other",
};

type StatusFilter =
  | "all"
  | "pending_review"
  | "awaiting_information"
  | "under_review"
  | "exception_raised"
  | "escalated"
  | "completed";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all",                  label: "All" },
  { id: "pending_review",       label: "Pending Review" },
  { id: "awaiting_information", label: "Awaiting Info" },
  { id: "under_review",         label: "Under Review" },
  { id: "exception_raised",     label: "Exception Raised" },
  { id: "escalated",            label: "Escalated" },
  { id: "completed",            label: "Completed" },
];

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

// ─── New Review Item Dialog ──────────────────────────────────────────────────

function NewReviewItemDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle]           = useState("");
  const [itemType, setItemType]     = useState("");
  const [businessUnit, setBU]       = useState("");
  const [riskLevel, setRisk]        = useState("");
  const [priority, setPriority]     = useState("normal");
  const [dueDate, setDueDate]       = useState("");
  const [complianceReq, setComp]    = useState(false);
  const [description, setDesc]      = useState("");
  const [instructions, setInstr]    = useState("");
  const [linkedClient, setClient]   = useState("");
  const [linkedTx, setTx]           = useState("");
  const [error, setError]           = useState("");

  const mutation = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch(`${BASE}/api/v1/internal-audit/review-items`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error((err as { message?: string }).message ?? "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-review-items"] });
      toast({ title: "Review Item Created", description: `"${title}" has been added to the queue.` });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (!itemType)     { setError("Item Type is required."); return; }
    if (!businessUnit) { setError("Business Unit is required."); return; }
    if (!riskLevel)    { setError("Risk Level is required."); return; }
    setError("");
    mutation.mutate({
      title:                 title.trim(),
      item_type:             itemType,
      business_unit:         businessUnit,
      risk_level:            riskLevel,
      priority,
      due_date:              dueDate || null,
      description:           description.trim() || null,
      instructions:          instructions.trim() || null,
      compliance_required:   complianceReq,
      linked_client_ref:     linkedClient.trim() || null,
      linked_transaction_ref: linkedTx.trim() || null,
    });
  }

  const inputCls = "w-full h-10 px-3 rounded-xl text-[13px] outline-none";
  const inputStyle = {
    background: "var(--pg-muted-bg)",
    border: "1px solid var(--pg-card-border)",
    color: "var(--pg-text-1)",
  };
  const selectStyle = {
    ...inputStyle,
    appearance: "none" as const,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl overflow-hidden my-8"
        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>New Review Item</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Add a new item to the control review queue</p>
          </div>
          <button onClick={onClose} style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Title *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)} required
              placeholder="e.g. Client instruction verification — Ade Johnson"
              className={inputCls} style={inputStyle}
            />
          </div>

          {/* Item Type + Business Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Item Type *</label>
              <div className="relative">
                <select value={itemType} onChange={e => setItemType(e.target.value)} required
                        className={inputCls + " pr-8"} style={selectStyle}>
                  <option value="">Select…</option>
                  <option value="client_instruction">Client Instruction</option>
                  <option value="investment_schedule">Investment Schedule</option>
                  <option value="account_opening">Account Opening</option>
                  <option value="kyc_validation">KYC Validation</option>
                  <option value="symplus_posting">Symplus Posting</option>
                  <option value="bank_reconciliation">Bank Reconciliation</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Business Unit *</label>
              <div className="relative">
                <select value={businessUnit} onChange={e => setBU(e.target.value)} required
                        className={inputCls + " pr-8"} style={selectStyle}>
                  <option value="">Select…</option>
                  <option value="wealth_management">Wealth Management</option>
                  <option value="portfolio_management">Portfolio Management</option>
                  <option value="finance_operations">Finance & Operations</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
              </div>
            </div>
          </div>

          {/* Risk Level + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Risk Level *</label>
              <div className="relative">
                <select value={riskLevel} onChange={e => setRisk(e.target.value)} required
                        className={inputCls + " pr-8"} style={selectStyle}>
                  <option value="">Select…</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Priority</label>
              <div className="relative">
                <select value={priority} onChange={e => setPriority(e.target.value)}
                        className={inputCls + " pr-8"} style={selectStyle}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
              </div>
            </div>
          </div>

          {/* Due Date + Compliance */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Due Date</label>
              <input
                type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className={inputCls} style={inputStyle}
              />
            </div>
            <div>
              <label className="flex items-center gap-2 h-10 cursor-pointer">
                <input
                  type="checkbox" checked={complianceReq} onChange={e => setComp(e.target.checked)}
                  className="w-4 h-4 rounded accent-orange-500"
                />
                <span className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>Compliance Review Required</span>
              </label>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Description</label>
            <textarea
              value={description} onChange={e => setDesc(e.target.value)} rows={2}
              placeholder="Brief description of this review item…"
              className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none"
              style={inputStyle}
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Review Instructions</label>
            <textarea
              value={instructions} onChange={e => setInstr(e.target.value)} rows={2}
              placeholder="Specific instructions for the reviewer…"
              className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none"
              style={inputStyle}
            />
          </div>

          {/* Linked References */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Linked Client Reference</label>
              <input
                value={linkedClient} onChange={e => setClient(e.target.value)}
                placeholder="e.g. CLT-0042"
                className={inputCls} style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Linked Transaction Ref</label>
              <input
                value={linkedTx} onChange={e => setTx(e.target.value)}
                placeholder="e.g. TXN-20260901-001"
                className={inputCls} style={inputStyle}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button
              type="button" onClick={onClose}
              className="h-9 px-4 rounded-xl text-[13px] font-medium"
              style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
            >Cancel</button>
            <button
              type="submit" disabled={mutation.isPending}
              className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60 flex items-center gap-2"
              style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ControlReviewQueuePage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [buFilter, setBuFilter]         = useState("");
  const [riskFilter, setRiskFilter]     = useState("");
  const [search, setSearch]             = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (buFilter)               params.set("business_unit", buFilter);
  if (riskFilter)             params.set("risk_level", riskFilter);
  if (search)                 params.set("search", search);

  const { data: items = [], isLoading } = useQuery<ReviewItem[]>({
    queryKey: ["audit-review-items", statusFilter, buFilter, riskFilter, search],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/internal-audit/review-items?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const json = await res.json();
      return (json?.items ?? json ?? []) as ReviewItem[];
    },
  });

  const overdueCount = items.filter(i => i.is_overdue).length;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Back link */}
      <Link
        href="/audit"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium hover:underline"
        style={{ color: "var(--pg-text-3)" }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Internal Audit
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>Control Review Queue</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Track and manage all internal audit control review items across business units.
          </p>
        </div>
        <button
          onClick={() => setShowNewDialog(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
        >
          <Plus className="w-4 h-4" />
          New Review Item
        </button>
      </div>

      {/* Filter bar */}
      <div className="space-y-3">
        {/* Status tabs */}
        <div className="flex gap-1 p-1 rounded-xl overflow-x-auto"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {STATUS_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setStatusFilter(t.id)}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap"
              style={statusFilter === t.id
                ? { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "white" }
                : { color: "var(--pg-text-2)" }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Dropdowns + search */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Business Unit */}
          <div className="relative">
            <select
              value={buFilter} onChange={e => setBuFilter(e.target.value)}
              className="h-9 pl-3 pr-8 rounded-xl text-[12px] outline-none appearance-none"
              style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)", minWidth: 160 }}
            >
              <option value="">All Business Units</option>
              <option value="wealth_management">Wealth Management</option>
              <option value="portfolio_management">Portfolio Management</option>
              <option value="finance_operations">Finance & Operations</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
          </div>

          {/* Risk Level */}
          <div className="relative">
            <select
              value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
              className="h-9 pl-3 pr-8 rounded-xl text-[12px] outline-none appearance-none"
              style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)", minWidth: 130 }}
            >
              <option value="">All Risk Levels</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl flex-1 min-w-[200px] max-w-xs"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, reference…"
              className="flex-1 text-[12px] bg-transparent outline-none"
              style={{ color: "var(--pg-text-1)" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ color: "var(--pg-text-4)" }}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary row */}
      {!isLoading && (
        <div className="flex items-center gap-4 text-[12px]" style={{ color: "var(--pg-text-3)" }}>
          <span>
            <strong style={{ color: "var(--pg-text-1)" }}>{items.length}</strong> item{items.length !== 1 ? "s" : ""}
          </span>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 font-semibold" style={{ color: "#dc2626" }}>
              <AlertCircle className="w-3.5 h-3.5" />
              {overdueCount} overdue
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-14 gap-2 rounded-2xl"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <ClipboardList className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No review items found.</p>
          <button
            onClick={() => setShowNewDialog(true)}
            className="mt-1 text-[12px] font-semibold hover:underline"
            style={{ color: "#FF6600" }}
          >
            + Add one now
          </button>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          {/* Table header */}
          <div
            className="grid text-[10px] font-bold uppercase tracking-wider px-4 py-2.5"
            style={{
              gridTemplateColumns: "90px 1fr 110px 100px 70px 90px 90px 36px 76px 110px 50px 40px",
              borderBottom: "1px solid var(--pg-row-border)",
              color: "var(--pg-text-4)",
              background: "var(--pg-muted-bg)",
            }}
          >
            <span>Reference</span>
            <span>Title</span>
            <span>Type</span>
            <span>Unit</span>
            <span>Risk</span>
            <span>Submitter</span>
            <span>Reviewer</span>
            <span>Age</span>
            <span>Due</span>
            <span>Status</span>
            <span className="text-center">Chklist</span>
            <span className="text-center">Exc</span>
          </div>

          {/* Rows */}
          {items.map(item => {
            const st      = STATUS_CFG[item.status] ?? { label: item.status, color: "#64748b", bg: "#f1f5f9" };
            const risk    = RISK_CFG[item.risk_level] ?? { color: "#64748b", bg: "#f1f5f9" };
            const isUrgent = item.priority === "urgent";

            return (
              <div
                key={item.id}
                className="grid items-center px-4 py-3 cursor-pointer transition-colors"
                style={{
                  gridTemplateColumns: "90px 1fr 110px 100px 70px 90px 90px 36px 76px 110px 50px 40px",
                  borderBottom: "1px solid var(--pg-row-border)",
                  borderLeft: item.is_overdue ? "3px solid #dc2626" : "3px solid transparent",
                }}
                onClick={() => router.push(`/audit/control-review/${item.id}`)}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
              >
                {/* Reference */}
                <span className="text-[10px] font-mono truncate" style={{ color: "var(--pg-text-4)" }}>
                  {item.reference_no}
                </span>

                {/* Title */}
                <span className="text-[12px] font-semibold truncate pr-2 flex items-center gap-1" style={{ color: "var(--pg-text-1)" }}>
                  {isUrgent && <Zap className="w-3 h-3 shrink-0 text-orange-500" />}
                  {item.title}
                </span>

                {/* Type */}
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full truncate inline-block max-w-full"
                  style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)", border: "1px solid var(--pg-card-border)" }}
                >
                  {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
                </span>

                {/* Business Unit */}
                <span className="text-[11px] truncate" style={{ color: "var(--pg-text-2)" }}>
                  {BU_LABELS[item.business_unit] ?? item.business_unit}
                </span>

                {/* Risk */}
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize inline-block"
                  style={{ background: risk.bg, color: risk.color }}
                >
                  {item.risk_level}
                </span>

                {/* Submitter */}
                <span className="text-[11px] truncate" style={{ color: "var(--pg-text-2)" }}>
                  {item.submitter_name || "—"}
                </span>

                {/* Reviewer */}
                <span
                  className="text-[11px] truncate"
                  style={item.assigned_reviewer_name
                    ? { color: "var(--pg-text-2)" }
                    : { color: "var(--pg-text-4)", fontStyle: "italic" }}
                >
                  {item.assigned_reviewer_name || "Unassigned"}
                </span>

                {/* Age */}
                <span
                  className="text-[11px] font-medium"
                  style={{ color: item.age_in_days > 7 ? "#ea580c" : "var(--pg-text-3)" }}
                >
                  {item.age_in_days}d
                </span>

                {/* Due date */}
                <span
                  className="text-[11px]"
                  style={{ color: item.is_overdue ? "#dc2626" : "var(--pg-text-3)", fontWeight: item.is_overdue ? 600 : 400 }}
                >
                  {formatDate(item.due_date)}
                </span>

                {/* Status */}
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block truncate"
                  style={{ background: st.bg, color: st.color }}
                >
                  {st.label}
                </span>

                {/* Checklist */}
                <span className="text-[11px] text-center" style={{ color: "var(--pg-text-3)" }}>
                  {item.checklist_done}/{item.checklist_total}
                </span>

                {/* Exceptions */}
                <span
                  className="text-[11px] font-bold text-center"
                  style={{ color: item.exception_count > 0 ? "#dc2626" : "var(--pg-text-4)" }}
                >
                  {item.exception_count > 0 ? item.exception_count : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      {showNewDialog && <NewReviewItemDialog onClose={() => setShowNewDialog(false)} />}
    </div>
  );
}
