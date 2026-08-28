"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, DollarSign, BarChart3, Search, X, Plus, ChevronDown,
  Loader2, CheckCircle, AlertCircle, Filter, Users, Target,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type StageKey =
  | "qualification"
  | "proposal"
  | "negotiation"
  | "verbal_commit"
  | "closed_won"
  | "closed_lost";

const STAGES: { key: StageKey; label: string; headerBg: string; headerText: string; accent: string }[] = [
  { key: "qualification", label: "Qualification", headerBg: "#fff0e0", headerText: "#FF6600", accent: "#FF6600" },
  { key: "proposal",      label: "Proposal",      headerBg: "#ede9fe", headerText: "#7c3aed", accent: "#7c3aed" },
  { key: "negotiation",   label: "Negotiation",   headerBg: "#fef3c7", headerText: "#d97706", accent: "#d97706" },
  { key: "verbal_commit", label: "Verbal Commit",  headerBg: "#d1fae5", headerText: "#059669", accent: "#059669" },
  { key: "closed_won",    label: "Closed Won",     headerBg: "#d1fae5", headerText: "#065f46", accent: "#065f46" },
  { key: "closed_lost",   label: "Closed Lost",    headerBg: "#fee2e2", headerText: "#991b1b", accent: "#991b1b" },
];

const STAGE_LABEL: Record<StageKey, string> = {
  qualification: "Qualification",
  proposal:      "Proposal",
  negotiation:   "Negotiation",
  verbal_commit: "Verbal Commit",
  closed_won:    "Closed Won",
  closed_lost:   "Closed Lost",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Contact = {
  id: string;
  rm_person_id?: string;
  rm_name: string;
  first_name: string;
  last_name: string;
  full_name: string;
  company: string;
  job_title: string;
  email: string;
  phone: string;
  whatsapp: string;
  linkedin_url: string;
  address: string;
  contact_type: string;
  segment: string;
  stage: string;
  source: string;
  source_detail: string;
  estimated_aum?: number;
  annual_income?: number;
  risk_appetite: string;
  investment_goals: string[];
  preferred_products: string[];
  onboarding_client_id?: string;
  referred_by_contact_id?: string;
  referred_by_name?: string;
  background_notes: string;
  tags: string[];
  priority: string;
  last_interaction_at?: string;
  next_followup_date?: string;
  is_active: boolean;
  created_by_name: string;
  created_at: string;
  interaction_count: number;
  open_task_count: number;
  pipeline_value: number;
};

type Opportunity = {
  id: string;
  contact_id: string;
  contact_name: string;
  rm_name: string;
  title: string;
  product: string;
  estimated_value?: number;
  probability: number;
  weighted_value: number;
  stage: string;
  expected_close?: string;
  notes: string;
  lost_reason: string;
  created_by_name: string;
  created_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNaira(n: number): string {
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000)     return `₦${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000)         return `₦${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `₦${n.toLocaleString("en-NG")}`;
}

function fmtDate(d?: string): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function probColor(p: number): string {
  if (p >= 70) return "#059669";
  if (p >= 40) return "#d97706";
  return "#dc2626";
}

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? "Request failed");
  }
  return res.json();
}

// ── Opportunity Card ──────────────────────────────────────────────────────────

function OppCard({
  opp,
  onMoveRequest,
}: {
  opp: Opportunity;
  onMoveRequest: (opp: Opportunity) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pColor = probColor(opp.probability);

  return (
    <div
      className="rounded-xl p-3 select-none relative"
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: hovered ? "0 4px 12px rgba(0,0,0,0.10)" : "0 1px 3px rgba(0,0,0,0.06)",
        transform: hovered ? "translateY(-1px)" : "",
        transition: "box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Contact name → link */}
      <Link
        href={`/crm/contacts/${opp.contact_id}`}
        className="text-[12px] font-semibold hover:underline leading-tight block truncate"
        style={{ color: "#FF6600" }}
        onClick={e => e.stopPropagation()}
      >
        {opp.contact_name}
      </Link>

      {/* Title */}
      <p className="text-[12.5px] font-bold mt-0.5 leading-snug line-clamp-2" style={{ color: "var(--pg-text-1)" }}>
        {opp.title}
      </p>

      {/* Product pill */}
      {opp.product && (
        <span
          className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1.5"
          style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
        >
          {opp.product}
        </span>
      )}

      {/* Value + probability */}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[12px] font-bold" style={{ color: "var(--pg-text-1)" }}>
          {opp.estimated_value != null ? fmtNaira(opp.estimated_value) : "—"}
        </span>
        <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>·</span>
        <span className="text-[11px] font-semibold" style={{ color: pColor }}>
          {opp.probability}%
        </span>
      </div>

      {/* Expected close */}
      {opp.expected_close && (
        <p className="text-[10.5px] mt-1" style={{ color: "var(--pg-text-3)" }}>
          Close: {fmtDate(opp.expected_close)}
        </p>
      )}

      {/* RM name */}
      <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--pg-text-3)" }}>
        {opp.rm_name || "—"}
      </p>

      {/* Move button (on hover) */}
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onMoveRequest(opp); }}
          className="absolute top-2 right-2 flex items-center gap-1 h-6 px-2 rounded-lg text-[10px] font-semibold"
          style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)", border: "1px solid var(--pg-card-border)" }}
        >
          Move <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {/* Probability bar */}
      <div className="mt-2.5 rounded-full overflow-hidden" style={{ height: 3, background: "var(--pg-row-border)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${opp.probability}%`, background: pColor, transition: "width 0.3s" }}
        />
      </div>
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  opps,
  onMoveRequest,
}: {
  stage: typeof STAGES[number];
  opps: Opportunity[];
  onMoveRequest: (opp: Opportunity) => void;
}) {
  const totalValue = opps.reduce((s, o) => s + (o.estimated_value ?? 0), 0);

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden flex-shrink-0"
      style={{
        width: 280,
        background: "var(--pg-surface, #f8fafc)",
        border: "1px solid var(--pg-card-border)",
        borderTop: `3px solid ${stage.accent}`,
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5"
        style={{ background: stage.headerBg, borderBottom: "1px solid var(--pg-card-border)" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: stage.headerText }}>
            {stage.label}
          </span>
          <span
            className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: stage.accent + "22", color: stage.accent }}
          >
            {opps.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className="text-[11px] font-semibold mt-0.5" style={{ color: stage.headerText }}>
            {fmtNaira(totalValue)}
          </p>
        )}
      </div>

      {/* Cards */}
      <div
        className="flex-1 p-2 space-y-2 overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 310px)" }}
      >
        {opps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center mb-2"
              style={{ background: stage.accent + "15" }}
            >
              <Target className="w-4 h-4" style={{ color: stage.accent }} />
            </div>
            <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>No opportunities</p>
          </div>
        ) : (
          opps.map(opp => (
            <OppCard key={opp.id} opp={opp} onMoveRequest={onMoveRequest} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Stage Move Dropdown ───────────────────────────────────────────────────────

function StageMoveDropdown({
  opp,
  onClose,
  anchorRef,
}: {
  opp: Opportunity;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dropRef = useRef<HTMLDivElement>(null);

  const moveMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      return apiFetch(`/crm/opportunities/${id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage }),
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["crm-opportunities"] });
      toast({ title: `Moved to ${STAGE_LABEL[vars.stage as StageKey] ?? vars.stage}` });
      onClose();
    },
    onError: (err) => {
      toast({ title: "Move failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={dropRef}
      className="fixed z-50 rounded-xl overflow-hidden shadow-2xl"
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        minWidth: 180,
      }}
    >
      <div className="px-3 py-2 border-b" style={{ borderColor: "var(--pg-row-border)" }}>
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>
          Move to stage
        </p>
      </div>
      {STAGES.map(s => (
        <button
          key={s.key}
          disabled={s.key === opp.stage || moveMutation.isPending}
          onClick={() => moveMutation.mutate({ id: opp.id, stage: s.key })}
          className="w-full flex items-center gap-2 px-3 py-2 text-left disabled:opacity-40 transition-colors"
          style={{ color: "var(--pg-text-1)" }}
          onMouseEnter={e => { if (s.key !== opp.stage) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
        >
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.accent }} />
          <span className="text-[12.5px] font-medium flex-1">{s.label}</span>
          {s.key === opp.stage && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
          {moveMutation.isPending && moveMutation.variables?.stage === s.key && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
          )}
        </button>
      ))}
    </div>
  );
}

// ── New Opportunity Modal ─────────────────────────────────────────────────────

function NewOppModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Pick<Contact, "id" | "full_name"> | null>(null);
  const [showContactDrop, setShowContactDrop] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [title, setTitle] = useState("");
  const [product, setProduct] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [probability, setProbability] = useState(50);
  const [stage, setStage] = useState<StageKey>("qualification");
  const [expectedClose, setExpectedClose] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  // Debounce contact search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(contactSearch), 300);
    return () => clearTimeout(t);
  }, [contactSearch]);

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["crm-contacts-search", debouncedSearch],
    queryFn: async () => {
      const url = debouncedSearch
        ? `${BASE}/api/v1/crm/contacts?search=${encodeURIComponent(debouncedSearch)}`
        : `${BASE}/api/v1/crm/contacts`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      const raw = await res.json();
      return Array.isArray(raw) ? (raw as Contact[]) : [];
    },
    enabled: debouncedSearch.length >= 1,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      contact_id: string;
      contact_name: string;
      title: string;
      product: string;
      estimated_value?: number;
      probability: number;
      stage: string;
      expected_close?: string;
      notes: string;
    }) => {
      return apiFetch("/crm/opportunities", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-opportunities"] });
      toast({ title: "Opportunity created" });
      onClose();
    },
    onError: (err) => {
      setError((err as Error).message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedContact) { setError("Please select a contact."); return; }
    if (!title.trim())    { setError("Title is required."); return; }
    if (!product.trim())  { setError("Product is required."); return; }

    createMutation.mutate({
      contact_id:      selectedContact.id,
      contact_name:    selectedContact.full_name,
      title:           title.trim(),
      product:         product.trim(),
      estimated_value: estimatedValue ? parseFloat(estimatedValue) : undefined,
      probability,
      stage,
      expected_close:  expectedClose || undefined,
      notes:           notes.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.35)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--pg-row-border)" }}
        >
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            New Opportunity
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--pg-text-3)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: "80vh" }}>

            {/* Contact picker */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
                Contact *
              </label>
              {selectedContact ? (
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: "#fff7f0", border: "1px solid #fed7aa" }}
                >
                  <span className="text-[13px] font-semibold text-orange-700">{selectedContact.full_name}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedContact(null); setContactSearch(""); }}
                    className="w-5 h-5 flex items-center justify-center rounded text-orange-500 hover:text-orange-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div
                    className="flex items-center gap-2 px-3 rounded-xl"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)" }}
                  >
                    <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={e => { setContactSearch(e.target.value); setShowContactDrop(true); }}
                      onFocus={() => setShowContactDrop(true)}
                      placeholder="Search contacts…"
                      className="flex-1 h-9 text-[13px] bg-transparent outline-none"
                      style={{ color: "var(--pg-text-1)" }}
                    />
                  </div>
                  {showContactDrop && contacts.length > 0 && (
                    <div
                      className="absolute z-50 top-full left-0 mt-1 w-full rounded-xl overflow-hidden shadow-xl"
                      style={{
                        background: "var(--pg-card)",
                        border: "1px solid var(--pg-card-border)",
                        maxHeight: 200,
                        overflowY: "auto",
                      }}
                    >
                      {contacts.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => {
                            setSelectedContact({ id: c.id, full_name: c.full_name });
                            setShowContactDrop(false);
                            setContactSearch("");
                          }}
                          className="w-full flex flex-col px-3 py-2 text-left transition-colors"
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
                        >
                          <span className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>
                            {c.full_name}
                          </span>
                          {c.company && (
                            <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{c.company}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. USD Fixed Income Portfolio ₦200M"
                className="w-full h-9 px-3 rounded-xl text-[13px] outline-none"
                style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
              />
            </div>

            {/* Product */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
                Product / Fund *
              </label>
              <input
                type="text"
                value={product}
                onChange={e => setProduct(e.target.value)}
                placeholder="e.g. Dollar Fund, Eurobond, T-Bills"
                className="w-full h-9 px-3 rounded-xl text-[13px] outline-none"
                style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
              />
            </div>

            {/* Value + probability */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
                  Estimated Value (₦)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={estimatedValue}
                  onChange={e => setEstimatedValue(e.target.value)}
                  placeholder="0"
                  className="w-full h-9 px-3 rounded-xl text-[13px] outline-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
                  Probability: {probability}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={probability}
                  onChange={e => setProbability(Number(e.target.value))}
                  className="w-full mt-2"
                  style={{ accentColor: probColor(probability) }}
                />
              </div>
            </div>

            {/* Stage + close date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
                  Stage
                </label>
                <div className="relative">
                  <select
                    value={stage}
                    onChange={e => setStage(e.target.value as StageKey)}
                    className="w-full h-9 px-3 pr-8 rounded-xl text-[13px] outline-none appearance-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                  >
                    {STAGES.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-4)" }} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
                  Expected Close
                </label>
                <input
                  type="date"
                  value={expectedClose}
                  onChange={e => setExpectedClose(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl text-[13px] outline-none"
                  style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>
                Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any additional context…"
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-[13px] outline-none resize-none"
                style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
              >
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-[13px] text-red-600">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex justify-end gap-2 px-6 py-4"
            style={{ borderTop: "1px solid var(--pg-row-border)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl text-[13px] font-medium"
              style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", boxShadow: "0 1px 6px rgba(124,58,237,0.35)" }}
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-3.5 h-3.5" /> Create</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CRMPipelinePage() {
  useAuth();

  const [search, setSearch] = useState("");
  const [rmFilter, setRmFilter] = useState("all");
  const [showNewOpp, setShowNewOpp] = useState(false);

  // Stage move state
  const [moveTarget, setMoveTarget] = useState<Opportunity | null>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const dropAnchorRef = useRef<HTMLDivElement | null>(null);

  const handleMoveRequest = useCallback((opp: Opportunity, e?: React.MouseEvent) => {
    setMoveTarget(opp);
    if (e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, []);

  const { data: opps = [], isLoading } = useQuery<Opportunity[]>({
    queryKey: ["crm-opportunities"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/crm/opportunities`, { credentials: "include" });
      if (!res.ok) return [];
      const raw = await res.json();
      return Array.isArray(raw) ? (raw as Opportunity[]) : [];
    },
    refetchInterval: 60_000,
  });

  // Unique RM names for filter
  const rmNames = Array.from(new Set(opps.map(o => o.rm_name).filter(Boolean)));

  // Filter
  const filtered = opps.filter(o => {
    if (rmFilter !== "all" && o.rm_name !== rmFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.contact_name.toLowerCase().includes(q) ||
        o.title.toLowerCase().includes(q) ||
        o.product.toLowerCase().includes(q) ||
        o.rm_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Summary stats
  const activePipeline = filtered
    .filter(o => o.stage !== "closed_lost")
    .reduce((s, o) => s + (o.estimated_value ?? 0), 0);

  const weightedPipeline = filtered
    .filter(o => o.stage !== "closed_lost" && o.stage !== "closed_won")
    .reduce((s, o) => s + o.weighted_value, 0);

  const wonValue = filtered
    .filter(o => o.stage === "closed_won")
    .reduce((s, o) => s + (o.estimated_value ?? 0), 0);

  const totalDeals = filtered.length;

  const summaryStats = [
    {
      label: "Total Pipeline",
      value: fmtNaira(activePipeline),
      icon: DollarSign,
      color: "#FF6600",
      bg: "#fff7f0",
    },
    {
      label: "Weighted Pipeline",
      value: fmtNaira(weightedPipeline),
      icon: BarChart3,
      color: "#7c3aed",
      bg: "#f5f3ff",
    },
    {
      label: "Total Deals",
      value: String(totalDeals),
      icon: Target,
      color: "#d97706",
      bg: "#fffbeb",
    },
    {
      label: "Won This View",
      value: fmtNaira(wonValue),
      icon: TrendingUp,
      color: "#059669",
      bg: "#ecfdf5",
    },
  ];

  return (
    <div className="-mx-6 xl:-mx-8 -mt-6 xl:-mt-8 flex flex-col">

      {/* Top bar */}
      <div
        className="sticky top-0 z-20 px-5 py-3 flex items-center gap-3 flex-wrap"
        style={{
          background: "var(--pg-card)",
          borderBottom: "1px solid var(--pg-card-border)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Title */}
        <div className="mr-2">
          <h1 className="text-[17px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
            Pipeline
          </h1>
          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
            CRM · opportunity board
          </p>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 h-9 px-3 rounded-xl flex-1 min-w-[180px] max-w-xs"
          style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}
        >
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contact, title, product…"
            className="flex-1 text-[12px] bg-transparent outline-none"
            style={{ color: "var(--pg-text-1)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--pg-text-3)" }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* RM filter */}
        <div className="relative">
          <div
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl"
            style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}
          >
            <Filter className="w-3 h-3" style={{ color: "var(--pg-text-3)" }} />
            <select
              value={rmFilter}
              onChange={e => setRmFilter(e.target.value)}
              className="text-[12px] bg-transparent outline-none appearance-none pr-4"
              style={{ color: "var(--pg-text-1)" }}
            >
              <option value="all">All RMs</option>
              {rmNames.map(rm => (
                <option key={rm} value={rm}>{rm}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
          </div>
        </div>

        {/* New opportunity */}
        <button
          onClick={() => setShowNewOpp(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white ml-auto"
          style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", boxShadow: "0 1px 8px rgba(124,58,237,0.35)" }}
        >
          <Plus className="w-3.5 h-3.5" /> New Opportunity
        </button>
      </div>

      {/* Summary strip */}
      <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryStats.map(s => (
          <div
            key={s.label}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: s.bg }}
            >
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: s.color }}>
                {s.label}
              </p>
              <p className="text-[15px] font-bold tabular leading-tight" style={{ color: "var(--pg-text-1)" }}>
                {isLoading ? "—" : s.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
        </div>
      ) : (
        <div className="overflow-x-auto pb-6" style={{ WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}>
          <div className="flex gap-4 px-5 pb-2" style={{ minWidth: "max-content" }}>
            {STAGES.map(stage => {
              const colOpps = filtered.filter(o => o.stage === stage.key);
              return (
                <KanbanColumn
                  key={stage.key}
                  stage={stage}
                  opps={colOpps}
                  onMoveRequest={(opp) => {
                    setMoveTarget(opp);
                    // compute position lazily via the DOM — we'll position below the card
                    // We set a rough position; the dropdown uses fixed positioning
                    const rect = document.activeElement?.getBoundingClientRect();
                    setDropdownPos({
                      top: rect ? rect.bottom + 4 : 200,
                      left: rect ? rect.left : 200,
                    });
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Stage move dropdown */}
      {moveTarget && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMoveTarget(null)}
          />
          <div
            className="fixed z-50"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <StageMoveDropdown
              opp={moveTarget}
              onClose={() => setMoveTarget(null)}
              anchorRef={dropAnchorRef}
            />
          </div>
        </>
      )}

      {/* New opportunity modal */}
      {showNewOpp && <NewOppModal onClose={() => setShowNewOpp(false)} />}
    </div>
  );
}
