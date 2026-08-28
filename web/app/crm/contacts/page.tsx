"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  X,
  Phone,
  Mail,
  MessageCircle,
  Building2,
  Users,
  Loader2,
  ChevronDown,
  CalendarDays,
  ClipboardList,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ─── Types ───────────────────────────────────────────────────────────────────

type Contact = {
  id: string;
  subsidiary_id?: string;
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
  contact_type:
    | "prospect"
    | "client"
    | "referral_source"
    | "introducer"
    | "partner"
    | "other";
  segment: "retail" | "hnw" | "uhnw" | "institutional" | "family_office";
  stage:
    | "new"
    | "contacted"
    | "qualified"
    | "proposal_sent"
    | "negotiation"
    | "converted"
    | "lost"
    | "dormant";
  source: string;
  source_detail: string;
  estimated_aum?: number;
  risk_appetite: string;
  priority: "low" | "medium" | "high" | "vip";
  last_interaction_at?: string;
  next_followup_date?: string;
  interaction_count: number;
  open_task_count: number;
  pipeline_value: number;
  created_by_name: string;
  created_at: string;
};

type NewContact = {
  first_name: string;
  last_name: string;
  company: string;
  job_title: string;
  email: string;
  phone: string;
  whatsapp: string;
  contact_type: string;
  segment: string;
  stage: string;
  source: string;
  source_detail: string;
  estimated_aum: string;
  risk_appetite: string;
  priority: string;
  background_notes: string;
  tags: string;
};

type NewInteraction = {
  contact_id: string;
  type: string;
  direction: string;
  subject: string;
  notes: string;
  outcome: string;
  duration_mins: string;
  interaction_date: string;
  next_action: string;
  next_action_date: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNaira(value: number): string {
  if (value >= 1_000_000_000) return `₦${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₦${(value / 1_000).toFixed(1)}K`;
  return `₦${value.toFixed(0)}`;
}

function formatRelativeDate(dateStr?: string): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const SEGMENT_COLORS: Record<string, { bg: string; text: string }> = {
  retail: { bg: "#fff7f0", text: "#E05500" },
  hnw: { bg: "#f5f3ff", text: "#6d28d9" },
  uhnw: { bg: "#fdf4ff", text: "#9333ea" },
  institutional: { bg: "#ecfeff", text: "#0e7490" },
  family_office: { bg: "#fff7ed", text: "#c2410c" },
};

const SEGMENT_AVATAR_BG: Record<string, string> = {
  retail: "#FF6600",
  hnw: "#7c3aed",
  uhnw: "#9333ea",
  institutional: "#0891b2",
  family_office: "#ea580c",
};

const STAGE_STYLES: Record<string, { bg: string; text: string }> = {
  new: { bg: "#f1f5f9", text: "#475569" },
  contacted: { bg: "#fff7f0", text: "#E05500" },
  qualified: { bg: "#f5f3ff", text: "#6d28d9" },
  proposal_sent: { bg: "#fffbeb", text: "#b45309" },
  negotiation: { bg: "#fff7ed", text: "#c2410c" },
  converted: { bg: "#f0fdf4", text: "#15803d" },
  lost: { bg: "#fef2f2", text: "#b91c1c" },
  dormant: { bg: "#f8fafc", text: "#64748b" },
};

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  prospect: { bg: "#fff7f0", text: "#E05500" },
  client: { bg: "#f0fdf4", text: "#15803d" },
  referral_source: { bg: "#fdf4ff", text: "#9333ea" },
  introducer: { bg: "#fff7ed", text: "#c2410c" },
  partner: { bg: "#ecfeff", text: "#0e7490" },
  other: { bg: "#f1f5f9", text: "#475569" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#94a3b8",
  medium: "#FF6600",
  high: "#f59e0b",
  vip: "#a855f7",
};

// ─── Label style ──────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  color: "var(--pg-text-3)",
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  display: "block",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 12px",
  borderRadius: 10,
  background: "var(--pg-muted-bg)",
  border: "1px solid var(--pg-card-border)",
  color: "var(--pg-text-1)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  cursor: "pointer",
};

// ─── Filter chips ────────────────────────────────────────────────────────────

type FilterChipsProps = {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
};

function FilterChips({ label, options, value, onChange }: FilterChipsProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--pg-text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}:
      </span>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            height: 26,
            padding: "0 10px",
            borderRadius: 20,
            border: "1px solid",
            borderColor: value === opt.value ? "#7c3aed" : "var(--pg-card-border)",
            background: value === opt.value ? "#7c3aed" : "var(--pg-muted-bg)",
            color: value === opt.value ? "#fff" : "var(--pg-text-2)",
            fontSize: 12,
            fontWeight: value === opt.value ? 700 : 400,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Create Contact Modal ─────────────────────────────────────────────────────

const EMPTY_CONTACT: NewContact = {
  first_name: "",
  last_name: "",
  company: "",
  job_title: "",
  email: "",
  phone: "",
  whatsapp: "",
  contact_type: "prospect",
  segment: "retail",
  stage: "new",
  source: "referral",
  source_detail: "",
  estimated_aum: "",
  risk_appetite: "moderate",
  priority: "medium",
  background_notes: "",
  tags: "",
};

type CreateContactModalProps = {
  onClose: () => void;
  onCreated: () => void;
};

function CreateContactModal({ onClose, onCreated }: CreateContactModalProps) {
  const [form, setForm] = useState<NewContact>(EMPTY_CONTACT);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async (payload: NewContact) => {
      const body = {
        ...payload,
        estimated_aum: payload.estimated_aum ? parseFloat(payload.estimated_aum) : undefined,
        tags: payload.tags
          ? payload.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      };
      const res = await fetch(`${BASE}/api/v1/crm/contacts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to create contact");
      }
      return res.json();
    },
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function set(field: keyof NewContact, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.first_name.trim()) { setError("First name is required."); return; }
    if (!form.last_name.trim()) { setError("Last name is required."); return; }
    mutation.mutate(form);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--pg-card-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pg-text-1)" }}>
            New Contact
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "var(--pg-muted-bg)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--pg-text-2)",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          style={{ flex: 1, overflowY: "auto", padding: "20px" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Name row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>First Name *</label>
                <input
                  style={inputStyle}
                  value={form.first_name}
                  onChange={(e) => set("first_name", e.target.value)}
                  placeholder="Emeka"
                />
              </div>
              <div>
                <label style={labelStyle}>Last Name *</label>
                <input
                  style={inputStyle}
                  value={form.last_name}
                  onChange={(e) => set("last_name", e.target.value)}
                  placeholder="Okafor"
                />
              </div>
            </div>

            {/* Company / Job */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Company</label>
                <input
                  style={inputStyle}
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                  placeholder="Zenith Industries"
                />
              </div>
              <div>
                <label style={labelStyle}>Job Title</label>
                <input
                  style={inputStyle}
                  value={form.job_title}
                  onChange={(e) => set("job_title", e.target.value)}
                  placeholder="CEO"
                />
              </div>
            </div>

            {/* Contact details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  style={inputStyle}
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="emeka@example.com"
                />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  style={inputStyle}
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+2348012345678"
                />
              </div>
              <div>
                <label style={labelStyle}>WhatsApp</label>
                <input
                  style={inputStyle}
                  value={form.whatsapp}
                  onChange={(e) => set("whatsapp", e.target.value)}
                  placeholder="+2348012345678"
                />
              </div>
            </div>

            {/* Classification */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Contact Type</label>
                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={form.contact_type}
                    onChange={(e) => set("contact_type", e.target.value)}
                  >
                    <option value="prospect">Prospect</option>
                    <option value="client">Client</option>
                    <option value="referral_source">Referral Source</option>
                    <option value="introducer">Introducer</option>
                    <option value="partner">Partner</option>
                    <option value="other">Other</option>
                  </select>
                  <ChevronDown
                    size={13}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--pg-text-3)",
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Segment</label>
                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={form.segment}
                    onChange={(e) => set("segment", e.target.value)}
                  >
                    <option value="retail">Retail</option>
                    <option value="hnw">HNW</option>
                    <option value="uhnw">UHNW</option>
                    <option value="institutional">Institutional</option>
                    <option value="family_office">Family Office</option>
                  </select>
                  <ChevronDown
                    size={13}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--pg-text-3)",
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Stage</label>
                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={form.stage}
                    onChange={(e) => set("stage", e.target.value)}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="proposal_sent">Proposal Sent</option>
                    <option value="negotiation">Negotiation</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost</option>
                    <option value="dormant">Dormant</option>
                  </select>
                  <ChevronDown
                    size={13}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--pg-text-3)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Source */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Source</label>
                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={form.source}
                    onChange={(e) => set("source", e.target.value)}
                  >
                    <option value="referral">Referral</option>
                    <option value="cold_call">Cold Call</option>
                    <option value="event">Event</option>
                    <option value="social_media">Social Media</option>
                    <option value="website">Website</option>
                    <option value="walk_in">Walk In</option>
                    <option value="existing_client">Existing Client</option>
                    <option value="other">Other</option>
                  </select>
                  <ChevronDown
                    size={13}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--pg-text-3)",
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Source Detail</label>
                <input
                  style={inputStyle}
                  value={form.source_detail}
                  onChange={(e) => set("source_detail", e.target.value)}
                  placeholder="e.g. Referred by Adaeze Nwosu"
                />
              </div>
            </div>

            {/* AUM / Risk / Priority */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Estimated AUM (₦)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  value={form.estimated_aum}
                  onChange={(e) => set("estimated_aum", e.target.value)}
                  placeholder="50000000"
                />
              </div>
              <div>
                <label style={labelStyle}>Risk Appetite</label>
                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={form.risk_appetite}
                    onChange={(e) => set("risk_appetite", e.target.value)}
                  >
                    <option value="conservative">Conservative</option>
                    <option value="moderate">Moderate</option>
                    <option value="balanced">Balanced</option>
                    <option value="aggressive">Aggressive</option>
                  </select>
                  <ChevronDown
                    size={13}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--pg-text-3)",
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Priority</label>
                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={form.priority}
                    onChange={(e) => set("priority", e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="vip">VIP</option>
                  </select>
                  <ChevronDown
                    size={13}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--pg-text-3)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={labelStyle}>Background Notes</label>
              <textarea
                style={{
                  ...inputStyle,
                  height: 72,
                  padding: "8px 12px",
                  resize: "vertical",
                }}
                value={form.background_notes}
                onChange={(e) => set("background_notes", e.target.value)}
                placeholder="Key context about this contact..."
              />
            </div>

            {/* Tags */}
            <div>
              <label style={labelStyle}>Tags (comma-separated)</label>
              <input
                style={inputStyle}
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="oil & gas, lagos, referral"
              />
            </div>

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--pg-muted-bg)",
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-2)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                style={{
                  flex: 2,
                  height: 36,
                  borderRadius: 10,
                  background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                  border: "none",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: mutation.isPending ? "not-allowed" : "pointer",
                  boxShadow: "0 1px 8px rgba(124,58,237,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  opacity: mutation.isPending ? 0.7 : 1,
                }}
              >
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Create Contact
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Log Interaction Modal ────────────────────────────────────────────────────

const nowIso = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const EMPTY_INTERACTION: NewInteraction = {
  contact_id: "",
  type: "call",
  direction: "outbound",
  subject: "",
  notes: "",
  outcome: "positive",
  duration_mins: "",
  interaction_date: nowIso(),
  next_action: "",
  next_action_date: "",
};

type LogInteractionModalProps = {
  contact: Contact;
  onClose: () => void;
  onLogged: () => void;
};

function LogInteractionModal({ contact, onClose, onLogged }: LogInteractionModalProps) {
  const [form, setForm] = useState<NewInteraction>({
    ...EMPTY_INTERACTION,
    contact_id: contact.id,
  });
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async (payload: NewInteraction) => {
      const body = {
        ...payload,
        duration_mins: payload.duration_mins ? parseInt(payload.duration_mins) : undefined,
        next_action_date: payload.next_action_date || undefined,
      };
      const res = await fetch(`${BASE}/api/v1/crm/interactions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to log interaction");
      }
      return res.json();
    },
    onSuccess: () => {
      onLogged();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function set(field: keyof NewInteraction, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.subject.trim()) { setError("Subject is required."); return; }
    mutation.mutate(form);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "88vh",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--pg-card-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pg-text-1)" }}>
              Log Interaction
            </div>
            <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 2 }}>
              {contact.full_name}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "var(--pg-muted-bg)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--pg-text-2)",
            }}
          >
            <X size={15} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ flex: 1, overflowY: "auto", padding: "20px" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Type / Direction */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Type</label>
                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={form.type}
                    onChange={(e) => set("type", e.target.value)}
                  >
                    <option value="call">Call</option>
                    <option value="meeting">Meeting</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="site_visit">Site Visit</option>
                    <option value="video_call">Video Call</option>
                    <option value="other">Other</option>
                  </select>
                  <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--pg-text-3)" }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Direction</label>
                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={form.direction}
                    onChange={(e) => set("direction", e.target.value)}
                  >
                    <option value="outbound">Outbound</option>
                    <option value="inbound">Inbound</option>
                  </select>
                  <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--pg-text-3)" }} />
                </div>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label style={labelStyle}>Subject *</label>
              <input
                style={inputStyle}
                value={form.subject}
                onChange={(e) => set("subject", e.target.value)}
                placeholder="Introductory call re: fixed income portfolio"
              />
            </div>

            {/* Notes */}
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea
                style={{ ...inputStyle, height: 72, padding: "8px 12px", resize: "vertical" }}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Summary of what was discussed..."
              />
            </div>

            {/* Outcome / Duration */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Outcome</label>
                <div style={{ position: "relative" }}>
                  <select
                    style={selectStyle}
                    value={form.outcome}
                    onChange={(e) => set("outcome", e.target.value)}
                  >
                    <option value="positive">Positive</option>
                    <option value="neutral">Neutral</option>
                    <option value="negative">Negative</option>
                    <option value="no_contact">No Contact</option>
                  </select>
                  <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--pg-text-3)" }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Duration (mins)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  value={form.duration_mins}
                  onChange={(e) => set("duration_mins", e.target.value)}
                  placeholder="30"
                />
              </div>
            </div>

            {/* Date */}
            <div>
              <label style={labelStyle}>Date & Time</label>
              <input
                style={inputStyle}
                type="datetime-local"
                value={form.interaction_date}
                onChange={(e) => set("interaction_date", e.target.value)}
              />
            </div>

            {/* Next action */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Next Action</label>
                <input
                  style={inputStyle}
                  value={form.next_action}
                  onChange={(e) => set("next_action", e.target.value)}
                  placeholder="Send proposal deck"
                />
              </div>
              <div>
                <label style={labelStyle}>Next Action Date</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={form.next_action_date}
                  onChange={(e) => set("next_action_date", e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--pg-muted-bg)",
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-2)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                style={{
                  flex: 2,
                  height: 36,
                  borderRadius: 10,
                  background: "linear-gradient(135deg,#FF6600,#E05500)",
                  border: "none",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: mutation.isPending ? "not-allowed" : "pointer",
                  boxShadow: "0 1px 8px rgba(255,102,0,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  opacity: mutation.isPending ? 0.7 : 1,
                }}
              >
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Log Interaction
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Contact Card ─────────────────────────────────────────────────────────────

type ContactCardProps = {
  contact: Contact;
  onLogInteraction: (c: Contact) => void;
};

function ContactCard({ contact, onLogInteraction }: ContactCardProps) {
  const router = useRouter();
  const avatarBg = SEGMENT_AVATAR_BG[contact.segment] ?? "#7c3aed";
  const typeStyle = TYPE_STYLES[contact.contact_type] ?? TYPE_STYLES.other;
  const stageStyle = STAGE_STYLES[contact.stage] ?? STAGE_STYLES.new;
  const priorityColor = PRIORITY_COLORS[contact.priority] ?? "#94a3b8";

  return (
    <div
      onClick={() => router.push(`/crm/contacts/${contact.id}`)}
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "var(--pg-card-shadow)",
        borderRadius: 16,
        padding: "16px 20px",
        cursor: "pointer",
        transition: "box-shadow 0.15s",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 4px 20px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--pg-card-shadow)";
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: avatarBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 15,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initials(contact.full_name)}
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--pg-text-1)",
                }}
              >
                {contact.full_name}
              </span>
              {/* Priority dot */}
              <div
                title={contact.priority}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: priorityColor,
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 2 }}>
              {[contact.job_title, contact.company].filter(Boolean).join(" · ")}
            </div>
          </div>

          {/* Badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 10,
                background: typeStyle.bg,
                color: typeStyle.text,
                textTransform: "capitalize",
              }}
            >
              {contact.contact_type.replace("_", " ")}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 10,
                background: stageStyle.bg,
                color: stageStyle.text,
                textTransform: "capitalize",
              }}
            >
              {contact.stage.replace("_", " ")}
            </span>
          </div>
        </div>

        {/* Contact details row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--pg-text-2)",
                textDecoration: "none",
              }}
            >
              <Mail size={12} style={{ color: "var(--pg-text-3)" }} />
              {contact.email}
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--pg-text-2)",
                textDecoration: "none",
              }}
            >
              <Phone size={12} style={{ color: "var(--pg-text-3)" }} />
              {contact.phone}
            </a>
          )}
          {contact.estimated_aum && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--pg-text-2)",
              }}
            >
              <Building2 size={12} style={{ color: "var(--pg-text-3)" }} />
              AUM: {formatNaira(contact.estimated_aum)}
            </span>
          )}
        </div>

        {/* Footer row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 10,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 11,
              color: "var(--pg-text-3)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <CalendarDays size={11} />
              Last: {formatRelativeDate(contact.last_interaction_at)}
            </span>
            {contact.open_task_count > 0 && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  color: "#ea580c",
                  fontWeight: 600,
                }}
              >
                <ClipboardList size={11} />
                {contact.open_task_count} open task{contact.open_task_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLogInteraction(contact);
              }}
              style={{
                height: 28,
                padding: "0 10px",
                borderRadius: 8,
                background: "#fff7f0",
                border: "1px solid #fed7aa",
                color: "#E05500",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <MessageCircle size={11} />
              Log
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/crm/contacts/${contact.id}`);
              }}
              style={{
                height: 28,
                padding: "0 10px",
                borderRadius: 8,
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-card-border)",
                color: "var(--pg-text-2)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "#f5f3ff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <Users size={36} style={{ color: "#7c3aed" }} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--pg-text-1)", marginBottom: 8 }}>
        No contacts yet
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--pg-text-3)",
          maxWidth: 320,
          lineHeight: 1.6,
          marginBottom: 24,
        }}
      >
        Add your first prospect to get started. Track interactions, pipeline, and client
        relationships all in one place.
      </div>
      <button
        onClick={onAdd}
        style={{
          height: 38,
          padding: "0 20px",
          borderRadius: 10,
          background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
          border: "none",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          boxShadow: "0 1px 8px rgba(124,58,237,0.35)",
        }}
      >
        <Plus size={15} />
        Add First Contact
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "prospect", label: "Prospect" },
  { value: "client", label: "Client" },
  { value: "referral_source", label: "Referral" },
  { value: "introducer", label: "Introducer" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
];

const STAGE_OPTIONS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "negotiation", label: "Negotiation" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
  { value: "dormant", label: "Dormant" },
];

const SEGMENT_OPTIONS = [
  { value: "", label: "All" },
  { value: "retail", label: "Retail" },
  { value: "hnw", label: "HNW" },
  { value: "uhnw", label: "UHNW" },
  { value: "institutional", label: "Institutional" },
  { value: "family_office", label: "Family Office" },
];

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [logTarget, setLogTarget] = useState<Contact | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<Contact[]>({
    queryKey: ["crm", "contacts", search, typeFilter, stageFilter, segmentFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);
      if (stageFilter) params.set("stage", stageFilter);
      if (segmentFilter) params.set("segment", segmentFilter);
      const res = await fetch(`${BASE}/api/v1/crm/contacts?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load contacts");
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 30_000,
  });

  const contacts: Contact[] = Array.isArray(data) ? data : [];

  function handleCreated() {
    queryClient.invalidateQueries({ queryKey: ["crm", "contacts"] });
    queryClient.invalidateQueries({ queryKey: ["crm", "dashboard"] });
  }

  function handleLogged() {
    queryClient.invalidateQueries({ queryKey: ["crm", "contacts"] });
    queryClient.invalidateQueries({ queryKey: ["crm", "dashboard"] });
  }

  const hasFilters = !!(search || typeFilter || stageFilter || segmentFilter);

  return (
    <>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pg-text-1)", margin: 0 }}>
              Contacts
            </h1>
            <p style={{ fontSize: 13, color: "var(--pg-text-3)", marginTop: 4 }}>
              {isLoading ? "Loading..." : `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`}
              {hasFilters ? " (filtered)" : ""}
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 10,
              background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
              border: "none",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 1px 8px rgba(124,58,237,0.35)",
            }}
          >
            <Plus size={15} />
            New Contact
          </button>
        </div>

        {/* ── Search + Filters ── */}
        <div
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "var(--pg-card-shadow)",
            borderRadius: 16,
            padding: "14px 16px",
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Search bar */}
          <div style={{ position: "relative" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--pg-text-3)",
                pointerEvents: "none",
              }}
            />
            <input
              ref={searchRef}
              style={{
                width: "100%",
                height: 38,
                padding: "0 36px 0 36px",
                borderRadius: 10,
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-card-border)",
                color: "var(--pg-text-1)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, company, phone..."
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                  alignItems: "center",
                  color: "var(--pg-text-3)",
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <FilterChips
              label="Type"
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={setTypeFilter}
            />
            <FilterChips
              label="Stage"
              options={STAGE_OPTIONS}
              value={stageFilter}
              onChange={setStageFilter}
            />
            <FilterChips
              label="Segment"
              options={SEGMENT_OPTIONS}
              value={segmentFilter}
              onChange={setSegmentFilter}
            />
          </div>

          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setTypeFilter("");
                setStageFilter("");
                setSegmentFilter("");
              }}
              style={{
                alignSelf: "flex-start",
                fontSize: 12,
                color: "#7c3aed",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontWeight: 600,
              }}
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* ── Contact List ── */}
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                style={{
                  height: 100,
                  borderRadius: 16,
                  background: "var(--pg-card)",
                  border: "1px solid var(--pg-card-border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "var(--pg-skeleton)",
                    opacity: 0.6,
                  }}
                />
              </div>
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "var(--pg-card-shadow)",
              borderRadius: 16,
            }}
          >
            <EmptyState onAdd={() => setShowCreateModal(true)} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onLogInteraction={(c) => setLogTarget(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showCreateModal && (
        <CreateContactModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
      {logTarget && (
        <LogInteractionModal
          contact={logTarget}
          onClose={() => setLogTarget(null)}
          onLogged={handleLogged}
        />
      )}
    </>
  );
}
