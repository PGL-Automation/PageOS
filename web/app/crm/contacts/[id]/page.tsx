"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  User, Mail, Phone, MessageCircle, MapPin,
  DollarSign, Shield, Target, Package, FileText, Tag, Star,
  Calendar, Clock, ChevronRight, X, Plus, Edit2,
  CheckCircle, Circle, Loader2, AlertCircle, ArrowRight,
  ExternalLink, Link2,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal_sent", "negotiation", "converted"];

const OPP_STAGES = ["prospecting", "qualified", "proposal_sent", "negotiation", "closed_won", "closed_lost"];

// ─── Types ────────────────────────────────────────────────────────────────────

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

type Interaction = {
  id: string;
  contact_id: string;
  contact_name: string;
  rm_name: string;
  type: string;
  direction: string;
  subject: string;
  notes: string;
  outcome: string;
  duration_mins?: number;
  location: string;
  interaction_date: string;
  next_action: string;
  next_action_date?: string;
  created_by_name: string;
  created_at: string;
};

type Task = {
  id: string;
  contact_id?: string;
  contact_name?: string;
  assigned_to?: string;
  assigned_name: string;
  title: string;
  description: string;
  task_type: string;
  priority: string;
  status: string;
  due_date?: string;
  completed_at?: string;
  completion_notes: string;
  created_by_name: string;
  created_at: string;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNGN(val?: number): string {
  if (val === undefined || val === null) return "—";
  if (val >= 1_000_000_000) return `₦${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `₦${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `₦${(val / 1_000).toFixed(1)}K`;
  return `₦${val.toLocaleString()}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map(w => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isOverdue(dueDateStr?: string, status?: string): boolean {
  if (!dueDateStr || status === "completed") return false;
  return new Date(dueDateStr) < new Date();
}

// ─── Badge color maps ──────────────────────────────────────────────────────────

const CONTACT_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  prospect: { bg: "#dbeafe", color: "#1d4ed8" },
  client:   { bg: "#d1fae5", color: "#065f46" },
  lead:     { bg: "#fef3c7", color: "#92400e" },
  partner:  { bg: "#ede9fe", color: "#5b21b6" },
  vendor:   { bg: "#f1f5f9", color: "#475569" },
  other:    { bg: "#f8fafc", color: "#64748b" },
};

const SEGMENT_COLORS: Record<string, { bg: string; color: string }> = {
  retail:        { bg: "#f1f5f9", color: "#475569" },
  hnwi:          { bg: "#fef3c7", color: "#b45309" },
  uhnwi:         { bg: "#fde68a", color: "#78350f" },
  institutional: { bg: "#ede9fe", color: "#5b21b6" },
  corporate:     { bg: "#dbeafe", color: "#1e40af" },
};

const STAGE_COLORS: Record<string, { bg: string; color: string }> = {
  new:           { bg: "#f1f5f9", color: "#64748b" },
  contacted:     { bg: "#dbeafe", color: "#1d4ed8" },
  qualified:     { bg: "#e0f2fe", color: "#0369a1" },
  proposal_sent: { bg: "#ede9fe", color: "#5b21b6" },
  negotiation:   { bg: "#fef3c7", color: "#92400e" },
  converted:     { bg: "#d1fae5", color: "#065f46" },
};

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  urgent: { bg: "#fee2e2", color: "#dc2626" },
  high:   { bg: "#fef3c7", color: "#b45309" },
  medium: { bg: "#dbeafe", color: "#1d4ed8" },
  low:    { bg: "#f1f5f9", color: "#64748b" },
};

const PRIORITY_DOT: Record<string, string> = {
  urgent: "#dc2626",
  high:   "#f97316",
  medium: "#3b82f6",
  low:    "#94a3b8",
};

const OUTCOME_COLORS: Record<string, { bg: string; color: string }> = {
  interested:        { bg: "#d1fae5", color: "#065f46" },
  not_interested:    { bg: "#fee2e2", color: "#991b1b" },
  follow_up_needed:  { bg: "#fef3c7", color: "#92400e" },
  converted:         { bg: "#d1fae5", color: "#059669" },
  no_response:       { bg: "#f1f5f9", color: "#64748b" },
};

const INTERACTION_TYPE_COLOR: Record<string, string> = {
  call:      "#3b82f6",
  meeting:   "#8b5cf6",
  email:     "#0ea5e9",
  whatsapp:  "#22c55e",
  linkedin:  "#0a66c2",
  referral:  "#f59e0b",
};

const OPP_STAGE_COLORS: Record<string, { bg: string; color: string }> = {
  prospecting:  { bg: "#f1f5f9", color: "#475569" },
  qualified:    { bg: "#dbeafe", color: "#1d4ed8" },
  proposal_sent:{ bg: "#ede9fe", color: "#5b21b6" },
  negotiation:  { bg: "#fef3c7", color: "#92400e" },
  closed_won:   { bg: "#d1fae5", color: "#065f46" },
  closed_lost:  { bg: "#fee2e2", color: "#991b1b" },
};

// ─── Pill badge component ─────────────────────────────────────────────────────

function Pill({
  label,
  bg,
  color,
  className = "",
}: {
  label: string;
  bg: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold capitalize ${className}`}
      style={{ background: bg, color }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          maxHeight: "90vh",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      className="flex items-center justify-between px-5 py-4 shrink-0"
      style={{ borderBottom: "1px solid var(--pg-card-border)" }}
    >
      <h3 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>{title}</h3>
      <button
        onClick={onClose}
        className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70"
        style={{ background: "var(--pg-muted-bg)" }}
      >
        <X className="w-4 h-4" style={{ color: "var(--pg-text-2)" }} />
      </button>
    </div>
  );
}

function ModalBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
      {children}
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-end gap-2 px-5 py-4 shrink-0"
      style={{ borderTop: "1px solid var(--pg-card-border)" }}
    >
      {children}
    </div>
  );
}

// ─── Form field helpers ───────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--pg-text-3)" }}>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "10px",
  border: "1px solid var(--pg-card-border)",
  background: "var(--pg-muted-bg)",
  color: "var(--pg-text-1)",
  fontSize: "13px",
  outline: "none",
};

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{ ...inputStyle, cursor: "pointer", ...props.style }}>
      {props.children}
    </select>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      {...props}
      style={{ ...inputStyle, resize: "vertical", ...props.style }}
    />
  );
}

// ─── Button helpers ───────────────────────────────────────────────────────────

function PrimaryBtn({
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`flex items-center gap-1.5 px-4 h-9 rounded-xl text-[13px] font-semibold text-white ${props.className ?? ""}`}
      style={{
        background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
        boxShadow: "0 1px 8px rgba(37,99,235,0.3)",
        opacity: (props.disabled || loading) ? 0.6 : 1,
        cursor: (props.disabled || loading) ? "not-allowed" : "pointer",
        ...props.style,
      }}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}

function SecondaryBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex items-center gap-1.5 px-4 h-9 rounded-xl text-[13px] font-semibold ${props.className ?? ""}`}
      style={{
        background: "var(--pg-muted-bg)",
        border: "1px solid var(--pg-card-border)",
        color: "var(--pg-text-2)",
        cursor: "pointer",
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

// ─── Log Interaction Modal ────────────────────────────────────────────────────

function LogInteractionModal({
  contactId,
  rmName,
  onClose,
}: {
  contactId: string;
  rmName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type: "call",
    direction: "outbound",
    subject: "",
    notes: "",
    outcome: "follow_up_needed",
    duration_mins: "",
    location: "",
    interaction_date: new Date().toISOString().split("T")[0],
    next_action: "",
    next_action_date: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        contact_id: contactId,
        rm_name: rmName,
        type: form.type,
        direction: form.direction,
        subject: form.subject,
        notes: form.notes,
        outcome: form.outcome,
        location: form.location,
        interaction_date: form.interaction_date,
        next_action: form.next_action,
      };
      if (form.duration_mins) body.duration_mins = parseInt(form.duration_mins, 10);
      if (form.next_action_date) body.next_action_date = form.next_action_date;

      const res = await fetch(`${BASE}/api/v1/crm/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Interaction logged" });
      qc.invalidateQueries({ queryKey: ["crm-interactions", contactId] });
      qc.invalidateQueries({ queryKey: ["crm-contact", contactId] });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Failed to log interaction", description: e.message, variant: "destructive" });
    },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Log Interaction" onClose={onClose} />
      <ModalBody>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type *</Label>
            <Select value={form.type} onChange={set("type")}>
              {["call","meeting","email","whatsapp","linkedin","referral"].map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Direction *</Label>
            <Select value={form.direction} onChange={set("direction")}>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Subject *</Label>
          <Input value={form.subject} onChange={set("subject")} placeholder="e.g. Portfolio review call" />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={set("notes")} placeholder="What was discussed..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Outcome</Label>
            <Select value={form.outcome} onChange={set("outcome")}>
              {["interested","not_interested","follow_up_needed","converted","no_response"].map(o => (
                <option key={o} value={o}>{o.replace(/_/g," ")}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Duration (mins)</Label>
            <Input type="number" value={form.duration_mins} onChange={set("duration_mins")} placeholder="30" min="0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Interaction Date *</Label>
            <Input type="date" value={form.interaction_date} onChange={set("interaction_date")} />
          </div>
          <div>
            <Label>Location</Label>
            <Input value={form.location} onChange={set("location")} placeholder="Office / Phone / Zoom" />
          </div>
        </div>
        <div>
          <Label>Next Action</Label>
          <Input value={form.next_action} onChange={set("next_action")} placeholder="e.g. Send proposal" />
        </div>
        <div>
          <Label>Next Action Date</Label>
          <Input type="date" value={form.next_action_date} onChange={set("next_action_date")} />
        </div>
      </ModalBody>
      <ModalFooter>
        <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
        <PrimaryBtn
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          disabled={!form.subject || !form.interaction_date}
        >
          Log Interaction
        </PrimaryBtn>
      </ModalFooter>
    </Modal>
  );
}

// ─── New Task Modal ───────────────────────────────────────────────────────────

function NewTaskModal({
  contactId,
  onClose,
}: {
  contactId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    task_type: "follow_up",
    priority: "medium",
    assigned_to: "",
    due_date: "",
    description: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        contact_id: contactId,
        title: form.title,
        task_type: form.task_type,
        priority: form.priority,
        description: form.description,
      };
      if (form.assigned_to) body.assigned_to = form.assigned_to;
      if (form.due_date) body.due_date = form.due_date;

      const res = await fetch(`${BASE}/api/v1/crm/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Task created" });
      qc.invalidateQueries({ queryKey: ["crm-tasks", contactId] });
      qc.invalidateQueries({ queryKey: ["crm-contact", contactId] });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Failed to create task", description: e.message, variant: "destructive" });
    },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="New Task" onClose={onClose} />
      <ModalBody>
        <div>
          <Label>Title *</Label>
          <Input value={form.title} onChange={set("title")} placeholder="e.g. Send Q3 report" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Task Type</Label>
            <Select value={form.task_type} onChange={set("task_type")}>
              {["follow_up","call","meeting","document","research","other"].map(t => (
                <option key={t} value={t}>{t.replace(/_/g," ")}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={form.priority} onChange={set("priority")}>
              {["low","medium","high","urgent"].map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Assigned To</Label>
            <Input value={form.assigned_to} onChange={set("assigned_to")} placeholder="Person ID or email" />
          </div>
          <div>
            <Label>Due Date</Label>
            <Input type="date" value={form.due_date} onChange={set("due_date")} />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={form.description} onChange={set("description")} placeholder="Task details..." />
        </div>
      </ModalBody>
      <ModalFooter>
        <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
        <PrimaryBtn loading={mutation.isPending} onClick={() => mutation.mutate()} disabled={!form.title}>
          Create Task
        </PrimaryBtn>
      </ModalFooter>
    </Modal>
  );
}

// ─── Complete Task Modal ──────────────────────────────────────────────────────

function CompleteTaskModal({
  taskId,
  contactId,
  onClose,
}: {
  taskId: string;
  contactId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/crm/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completion_notes: notes }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Task completed" });
      qc.invalidateQueries({ queryKey: ["crm-tasks", contactId] });
      qc.invalidateQueries({ queryKey: ["crm-contact", contactId] });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Failed to complete task", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Complete Task" onClose={onClose} />
      <ModalBody>
        <div>
          <Label>Completion Notes</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="How was it resolved..." />
        </div>
      </ModalBody>
      <ModalFooter>
        <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
        <PrimaryBtn loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Mark Complete
        </PrimaryBtn>
      </ModalFooter>
    </Modal>
  );
}

// ─── New Opportunity Modal ────────────────────────────────────────────────────

function NewOpportunityModal({
  contactId,
  contactName,
  rmName,
  onClose,
}: {
  contactId: string;
  contactName: string;
  rmName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    product: "",
    estimated_value: "",
    probability: "50",
    stage: "prospecting",
    expected_close: "",
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        contact_id: contactId,
        contact_name: contactName,
        rm_name: rmName,
        title: form.title,
        product: form.product,
        probability: parseInt(form.probability, 10),
        stage: form.stage,
        notes: form.notes,
      };
      if (form.estimated_value) body.estimated_value = parseFloat(form.estimated_value);
      if (form.expected_close) body.expected_close = form.expected_close;

      const res = await fetch(`${BASE}/api/v1/crm/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Opportunity created" });
      qc.invalidateQueries({ queryKey: ["crm-opportunities", contactId] });
      qc.invalidateQueries({ queryKey: ["crm-contact", contactId] });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Failed to create opportunity", description: e.message, variant: "destructive" });
    },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="New Opportunity" onClose={onClose} />
      <ModalBody>
        <div>
          <Label>Title *</Label>
          <Input value={form.title} onChange={set("title")} placeholder="e.g. Fixed Income Investment" />
        </div>
        <div>
          <Label>Product *</Label>
          <Input value={form.product} onChange={set("product")} placeholder="e.g. T-Bills, Eurobond, Mutual Fund" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Estimated Value (₦)</Label>
            <Input type="number" value={form.estimated_value} onChange={set("estimated_value")} placeholder="5000000" min="0" />
          </div>
          <div>
            <Label>Probability (%)</Label>
            <Input type="number" value={form.probability} onChange={set("probability")} min="0" max="100" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Stage</Label>
            <Select value={form.stage} onChange={set("stage")}>
              {OPP_STAGES.map(s => (
                <option key={s} value={s}>{s.replace(/_/g," ")}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Expected Close</Label>
            <Input type="date" value={form.expected_close} onChange={set("expected_close")} />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={set("notes")} placeholder="Additional context..." />
        </div>
      </ModalBody>
      <ModalFooter>
        <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
        <PrimaryBtn
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          disabled={!form.title || !form.product}
        >
          Create Opportunity
        </PrimaryBtn>
      </ModalFooter>
    </Modal>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({
  contact,
  onLogInteraction,
  onAddTask,
  onAddOpportunity,
  onEditTab,
}: {
  contact: Contact;
  onLogInteraction: () => void;
  onAddTask: () => void;
  onAddOpportunity: () => void;
  onEditTab: () => void;
}) {
  const stageIndex = PIPELINE_STAGES.indexOf(contact.stage);

  const typeColors = CONTACT_TYPE_COLORS[contact.contact_type] ?? { bg: "#f1f5f9", color: "#64748b" };
  const segColors = SEGMENT_COLORS[contact.segment] ?? { bg: "#f1f5f9", color: "#64748b" };
  const stageColors = STAGE_COLORS[contact.stage] ?? { bg: "#f1f5f9", color: "#64748b" };
  const prioColors = PRIORITY_COLORS[contact.priority] ?? { bg: "#f1f5f9", color: "#64748b" };

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {/* ── Left column ── */}
      <div className="flex-[2] space-y-4">

        {/* Header card */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-[18px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
            >
              {initials(contact.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[18px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
                {contact.full_name}
              </h2>
              <p className="text-[13px] mt-0.5" style={{ color: "var(--pg-text-2)" }}>
                {contact.job_title}{contact.company ? ` · ${contact.company}` : ""}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <Pill label={contact.contact_type} bg={typeColors.bg} color={typeColors.color} />
                <Pill label={contact.segment} bg={segColors.bg} color={segColors.color} />
                <Pill label={contact.stage.replace(/_/g," ")} bg={stageColors.bg} color={stageColors.color} />
                <Pill label={contact.priority} bg={prioColors.bg} color={prioColors.color} />
              </div>
            </div>
          </div>
        </div>

        {/* Contact info grid */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Contact Info</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#eff6ff" }}>
                  <Mail className="w-4 h-4" style={{ color: "#2563eb" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>Email</p>
                  <p className="text-[12.5px] truncate group-hover:underline" style={{ color: "var(--pg-text-1)" }}>{contact.email}</p>
                </div>
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#f0fdf4" }}>
                  <Phone className="w-4 h-4" style={{ color: "#16a34a" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>Phone</p>
                  <p className="text-[12.5px] truncate group-hover:underline" style={{ color: "var(--pg-text-1)" }}>{contact.phone}</p>
                </div>
              </a>
            )}
            {contact.whatsapp && (
              <a href={`https://wa.me/${contact.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#f0fdf4" }}>
                  <MessageCircle className="w-4 h-4" style={{ color: "#22c55e" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>WhatsApp</p>
                  <p className="text-[12.5px] truncate group-hover:underline" style={{ color: "var(--pg-text-1)" }}>{contact.whatsapp}</p>
                </div>
              </a>
            )}
            {contact.linkedin_url && (
              <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#eff6ff" }}>
                  <Link2 className="w-4 h-4" style={{ color: "#0a66c2" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>LinkedIn</p>
                  <p className="flex items-center gap-1 text-[12.5px] truncate group-hover:underline" style={{ color: "var(--pg-text-1)" }}>
                    View profile <ExternalLink className="w-3 h-3 shrink-0" />
                  </p>
                </div>
              </a>
            )}
            {contact.address && (
              <div className="flex items-center gap-2.5 sm:col-span-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#fef3c7" }}>
                  <MapPin className="w-4 h-4" style={{ color: "#b45309" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>Address</p>
                  <p className="text-[12.5px]" style={{ color: "var(--pg-text-1)" }}>{contact.address}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Financial Profile */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Financial Profile</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="w-3.5 h-3.5" style={{ color: "#2563eb" }} />
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>Est. AUM</p>
              </div>
              <p className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>{fmtNGN(contact.estimated_aum)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="w-3.5 h-3.5" style={{ color: "#16a34a" }} />
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>Annual Income</p>
              </div>
              <p className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>{fmtNGN(contact.annual_income)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="w-3.5 h-3.5" style={{ color: "#8b5cf6" }} />
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>Risk Appetite</p>
              </div>
              <p className="text-[14px] font-bold capitalize" style={{ color: "var(--pg-text-1)" }}>{contact.risk_appetite || "—"}</p>
            </div>
          </div>
          {Array.isArray(contact.investment_goals) && contact.investment_goals.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="w-3.5 h-3.5" style={{ color: "#f59e0b" }} />
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>Investment Goals</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {contact.investment_goals.map((g, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "#fef3c7", color: "#92400e" }}>
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(contact.preferred_products) && contact.preferred_products.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Package className="w-3.5 h-3.5" style={{ color: "#3b82f6" }} />
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>Preferred Products</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {contact.preferred_products.map((p, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "#dbeafe", color: "#1e40af" }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Background Notes */}
        {contact.background_notes && (
          <div
            className="rounded-2xl p-5"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
          >
            <div className="flex items-center gap-1.5 mb-3">
              <FileText className="w-3.5 h-3.5" style={{ color: "var(--pg-text-3)" }} />
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Background Notes</p>
            </div>
            <pre className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans" style={{ color: "var(--pg-text-2)" }}>
              {contact.background_notes}
            </pre>
          </div>
        )}

        {/* Tags */}
        {Array.isArray(contact.tags) && contact.tags.length > 0 && (
          <div
            className="rounded-2xl p-5"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
          >
            <div className="flex items-center gap-1.5 mb-3">
              <Tag className="w-3.5 h-3.5" style={{ color: "var(--pg-text-3)" }} />
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Tags</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((t, i) => (
                <span key={i} className="px-2.5 py-0.5 rounded-full text-[11.5px] font-medium" style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)", border: "1px solid var(--pg-card-border)" }}>
                  #{t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right column ── */}
      <div className="lg:w-[280px] space-y-4">

        {/* Action buttons */}
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <button
            onClick={onEditTab}
            className="w-full flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold"
            style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)", cursor: "pointer" }}
          >
            <Edit2 className="w-3.5 h-3.5" /> Edit Contact
          </button>
          <button
            onClick={onLogInteraction}
            className="w-full flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", cursor: "pointer" }}
          >
            <MessageCircle className="w-3.5 h-3.5" /> Log Interaction
          </button>
          <button
            onClick={onAddTask}
            className="w-full flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold"
            style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)", cursor: "pointer" }}
          >
            <CheckCircle className="w-3.5 h-3.5" /> Add Task
          </button>
          <button
            onClick={onAddOpportunity}
            className="w-full flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold"
            style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)", cursor: "pointer" }}
          >
            <Star className="w-3.5 h-3.5" /> Add Opportunity
          </button>
        </div>

        {/* Stage stepper */}
        <div
          className="rounded-2xl p-4"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Pipeline Stage</p>
          <div className="flex items-center">
            {PIPELINE_STAGES.map((s, i) => {
              const isPast    = i < stageIndex;
              const isCurrent = i === stageIndex;
              const isLast    = i === PIPELINE_STAGES.length - 1;
              return (
                <div key={s} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                      style={{
                        background: isPast
                          ? "#2563eb"
                          : isCurrent
                          ? "linear-gradient(135deg,#2563eb,#1d4ed8)"
                          : "var(--pg-muted-bg)",
                        border: isCurrent ? "2px solid #2563eb" : "1px solid var(--pg-card-border)",
                        boxShadow: isCurrent ? "0 0 0 3px rgba(37,99,235,0.15)" : "none",
                        color: (isPast || isCurrent) ? "white" : "var(--pg-text-3)",
                      }}
                    >
                      {isPast ? "✓" : i + 1}
                    </div>
                    <span
                      className="text-[8.5px] font-medium mt-1 text-center leading-tight"
                      style={{ color: (isPast || isCurrent) ? "#2563eb" : "var(--pg-text-3)" }}
                    >
                      {s.replace(/_/g,"\n")}
                    </span>
                  </div>
                  {!isLast && (
                    <div
                      className="h-px flex-1 mx-0.5 mb-4"
                      style={{ background: isPast ? "#2563eb" : "var(--pg-card-border)" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick stats */}
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Quick Stats</p>
          {[
            { label: "Interactions", value: String(contact.interaction_count ?? 0), icon: MessageCircle, color: "#2563eb" },
            { label: "Open Tasks", value: String(contact.open_task_count ?? 0), icon: CheckCircle, color: "#f59e0b" },
            { label: "Pipeline Value", value: fmtNGN(contact.pipeline_value), icon: DollarSign, color: "#16a34a" },
          ].map(stat => (
            <div key={stat.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: stat.color + "15" }}>
                  <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
                </div>
                <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{stat.label}</span>
              </div>
              <span className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Info card */}
        <div
          className="rounded-2xl p-4 space-y-2.5"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Details</p>
          {[
            ...(contact.referred_by_name ? [{ label: "Referred By", value: contact.referred_by_name }] : []),
            { label: "Source", value: contact.source || "—" },
            ...(contact.source_detail ? [{ label: "Source Detail", value: contact.source_detail }] : []),
            { label: "RM", value: contact.rm_name || "—" },
            { label: "Created By", value: contact.created_by_name || "—" },
            { label: "Created At", value: fmtDate(contact.created_at) },
            { label: "Last Interaction", value: fmtDate(contact.last_interaction_at) },
            { label: "Next Followup", value: fmtDate(contact.next_followup_date) },
          ].map(row => (
            <div key={row.label} className="flex justify-between items-start gap-2">
              <span className="text-[11px] shrink-0" style={{ color: "var(--pg-text-3)" }}>{row.label}</span>
              <span className="text-[11.5px] font-medium text-right" style={{ color: "var(--pg-text-1)" }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Interactions ────────────────────────────────────────────────────────

function InteractionsTab({
  contactId,
  rmName,
}: {
  contactId: string;
  rmName: string;
}) {
  const [showModal, setShowModal] = useState(false);

  const { data: interactions = [], isLoading } = useQuery<Interaction[]>({
    queryKey: ["crm-interactions", contactId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/crm/interactions?contact_id=${contactId}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
  });

  const sorted = [...interactions].sort(
    (a, b) => new Date(b.interaction_date).getTime() - new Date(a.interaction_date).getTime()
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>
          Interaction Timeline
        </h3>
        <PrimaryBtn onClick={() => setShowModal(true)}>
          <Plus className="w-3.5 h-3.5" /> Log Interaction
        </PrimaryBtn>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
        </div>
      ) : sorted.length === 0 ? (
        <div
          className="rounded-2xl flex flex-col items-center justify-center py-16"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <MessageCircle className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-3)" }} />
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>No interactions yet</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>Log the first one to start tracking this relationship.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(item => {
            const typeColor = INTERACTION_TYPE_COLOR[item.type] ?? "#64748b";
            const outcomeColors = OUTCOME_COLORS[item.outcome] ?? { bg: "#f1f5f9", color: "#64748b" };
            return (
              <div
                key={item.id}
                className="rounded-2xl p-4 flex gap-3"
                style={{
                  background: "var(--pg-card)",
                  border: "1px solid var(--pg-card-border)",
                  borderLeft: `3px solid ${typeColor}`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className="text-[10.5px] font-bold px-2 py-0.5 rounded-full capitalize"
                      style={{ background: typeColor + "18", color: typeColor }}
                    >
                      {item.type}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full capitalize font-medium"
                      style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)", border: "1px solid var(--pg-card-border)" }}
                    >
                      {item.direction}
                    </span>
                    <span className="text-[11px] ml-auto" style={{ color: "var(--pg-text-3)" }}>
                      {fmtDate(item.interaction_date)}
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--pg-text-1)" }}>
                    {item.subject}
                  </p>
                  {item.notes && (
                    <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--pg-text-2)" }}>
                      {item.notes}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {item.outcome && (
                      <Pill label={item.outcome} bg={outcomeColors.bg} color={outcomeColors.color} />
                    )}
                    {item.duration_mins !== undefined && item.duration_mins > 0 && (
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                        <Clock className="w-3 h-3" /> {item.duration_mins}m
                      </span>
                    )}
                    <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                      by {item.created_by_name}
                    </span>
                  </div>
                  {item.next_action && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                      <ArrowRight className="w-3 h-3 shrink-0" style={{ color: "#f59e0b" }} />
                      <p className="text-[11.5px]" style={{ color: "var(--pg-text-2)" }}>
                        <span className="font-semibold">Next:</span> {item.next_action}
                        {item.next_action_date && ` · ${fmtDate(item.next_action_date)}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <LogInteractionModal
          contactId={contactId}
          rmName={rmName}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ─── Tab: Tasks ───────────────────────────────────────────────────────────────

function TasksTab({ contactId }: { contactId: string }) {
  const [showNewModal, setShowNewModal] = useState(false);
  const [completeTaskId, setCompleteTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "completed">("all");

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["crm-tasks", contactId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/crm/tasks?contact_id=${contactId}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
  });

  const filtered = tasks.filter(t => {
    if (filter === "open") return t.status !== "completed";
    if (filter === "completed") return t.status === "completed";
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--pg-muted-bg)" }}>
          {(["all", "open", "completed"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 h-7 rounded-lg text-[12px] font-semibold capitalize transition-all"
              style={{
                background: filter === f ? "var(--pg-card)" : "transparent",
                color: filter === f ? "var(--pg-text-1)" : "var(--pg-text-3)",
                boxShadow: filter === f ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <PrimaryBtn onClick={() => setShowNewModal(true)}>
          <Plus className="w-3.5 h-3.5" /> New Task
        </PrimaryBtn>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-2xl flex flex-col items-center justify-center py-16"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <CheckCircle className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-3)" }} />
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>No tasks</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
            {filter === "all" ? "Create the first task for this contact." : `No ${filter} tasks.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const isCompleted = task.status === "completed";
            const overdue = isOverdue(task.due_date, task.status);
            const dotColor = PRIORITY_DOT[task.priority] ?? "#94a3b8";
            const statusColors = isCompleted
              ? { bg: "#d1fae5", color: "#065f46" }
              : { bg: "#fef3c7", color: "#92400e" };

            return (
              <div
                key={task.id}
                className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{
                  background: "var(--pg-card)",
                  border: "1px solid var(--pg-card-border)",
                  opacity: isCompleted ? 0.7 : 1,
                }}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className="text-[13px] font-semibold"
                      style={{
                        color: "var(--pg-text-1)",
                        textDecoration: isCompleted ? "line-through" : "none",
                      }}
                    >
                      {task.title}
                    </p>
                    <Pill label={task.task_type} bg="var(--pg-muted-bg)" color="var(--pg-text-2)" />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                      {task.assigned_name}
                    </span>
                    {task.due_date && (
                      <span
                        className="flex items-center gap-1 text-[11px] font-medium"
                        style={{ color: overdue ? "#dc2626" : "var(--pg-text-3)" }}
                      >
                        <Calendar className="w-3 h-3" />
                        {fmtDate(task.due_date)}
                        {overdue && " · Overdue"}
                      </span>
                    )}
                  </div>
                </div>
                <Pill label={task.status} bg={statusColors.bg} color={statusColors.color} />
                {!isCompleted && (
                  <button
                    onClick={() => setCompleteTaskId(task.id)}
                    className="flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-semibold shrink-0"
                    style={{
                      background: "#d1fae5",
                      color: "#065f46",
                      border: "1px solid #a7f3d0",
                      cursor: "pointer",
                    }}
                  >
                    <CheckCircle className="w-3 h-3" /> Complete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showNewModal && (
        <NewTaskModal contactId={contactId} onClose={() => setShowNewModal(false)} />
      )}
      {completeTaskId && (
        <CompleteTaskModal
          taskId={completeTaskId}
          contactId={contactId}
          onClose={() => setCompleteTaskId(null)}
        />
      )}
    </div>
  );
}

// ─── Tab: Opportunities ───────────────────────────────────────────────────────

function OpportunitiesTab({
  contactId,
  contactName,
  rmName,
}: {
  contactId: string;
  contactName: string;
  rmName: string;
}) {
  const [showNewModal, setShowNewModal] = useState(false);
  const [stageDropdown, setStageDropdown] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: opps = [], isLoading } = useQuery<Opportunity[]>({
    queryKey: ["crm-opportunities", contactId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/crm/opportunities?contact_id=${contactId}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
  });

  const stageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const res = await fetch(`${BASE}/api/v1/crm/opportunities/${id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Stage updated" });
      qc.invalidateQueries({ queryKey: ["crm-opportunities", contactId] });
      setStageDropdown(null);
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update stage", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>Opportunities</h3>
        <PrimaryBtn onClick={() => setShowNewModal(true)}>
          <Plus className="w-3.5 h-3.5" /> New Opportunity
        </PrimaryBtn>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
        </div>
      ) : opps.length === 0 ? (
        <div
          className="rounded-2xl flex flex-col items-center justify-center py-16"
          style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
        >
          <Star className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-3)" }} />
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>No opportunities</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>Track deals and investments with this contact.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {opps.map(opp => {
            const stageColors = OPP_STAGE_COLORS[opp.stage] ?? { bg: "#f1f5f9", color: "#64748b" };
            const probPct = Math.min(100, Math.max(0, opp.probability ?? 0));
            const probColor = probPct >= 70 ? "#16a34a" : probPct >= 40 ? "#f59e0b" : "#dc2626";

            return (
              <div
                key={opp.id}
                className="rounded-2xl p-4"
                style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {/* Stage badge with dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setStageDropdown(stageDropdown === opp.id ? null : opp.id)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold capitalize cursor-pointer"
                          style={{ background: stageColors.bg, color: stageColors.color }}
                        >
                          {opp.stage.replace(/_/g, " ")}
                          <ChevronRight className="w-3 h-3" style={{ transform: stageDropdown === opp.id ? "rotate(90deg)" : "none" }} />
                        </button>
                        {stageDropdown === opp.id && (
                          <div
                            className="absolute top-full left-0 mt-1 z-20 rounded-xl overflow-hidden py-1"
                            style={{
                              background: "var(--pg-card)",
                              border: "1px solid var(--pg-card-border)",
                              boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                              minWidth: "160px",
                            }}
                          >
                            {OPP_STAGES.map(s => {
                              const sc = OPP_STAGE_COLORS[s] ?? { bg: "#f1f5f9", color: "#64748b" };
                              return (
                                <button
                                  key={s}
                                  onClick={() => stageMutation.mutate({ id: opp.id, stage: s })}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium capitalize text-left hover:opacity-80"
                                  style={{ color: "var(--pg-text-1)", cursor: "pointer" }}
                                >
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sc.color }} />
                                  {s.replace(/_/g, " ")}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                        {opp.rm_name}
                      </span>
                    </div>
                    <p className="text-[13.5px] font-bold leading-snug" style={{ color: "var(--pg-text-1)" }}>
                      {opp.title}
                    </p>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-2)" }}>
                      {opp.product}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                      {fmtNGN(opp.estimated_value)}
                    </p>
                    {opp.expected_close && (
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                        Close: {fmtDate(opp.expected_close)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Probability bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>Probability</span>
                    <span className="text-[11px] font-semibold" style={{ color: probColor }}>{probPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--pg-muted-bg)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${probPct}%`, background: probColor }}
                    />
                  </div>
                  {opp.weighted_value > 0 && (
                    <p className="text-[10.5px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                      Weighted: {fmtNGN(opp.weighted_value)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNewModal && (
        <NewOpportunityModal
          contactId={contactId}
          contactName={contactName}
          rmName={rmName}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  );
}

// ─── Tab: Edit ────────────────────────────────────────────────────────────────

function EditTab({ contact }: { contact: Contact }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    first_name: contact.first_name ?? "",
    last_name: contact.last_name ?? "",
    company: contact.company ?? "",
    job_title: contact.job_title ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    whatsapp: contact.whatsapp ?? "",
    linkedin_url: contact.linkedin_url ?? "",
    address: contact.address ?? "",
    contact_type: contact.contact_type ?? "prospect",
    segment: contact.segment ?? "retail",
    stage: contact.stage ?? "new",
    source: contact.source ?? "referral",
    source_detail: contact.source_detail ?? "",
    estimated_aum: contact.estimated_aum !== undefined ? String(contact.estimated_aum) : "",
    annual_income: contact.annual_income !== undefined ? String(contact.annual_income) : "",
    risk_appetite: contact.risk_appetite ?? "moderate",
    investment_goals: Array.isArray(contact.investment_goals) ? contact.investment_goals.join(", ") : "",
    preferred_products: Array.isArray(contact.preferred_products) ? contact.preferred_products.join(", ") : "",
    priority: contact.priority ?? "medium",
    tags: Array.isArray(contact.tags) ? contact.tags.join(", ") : "",
    next_followup_date: contact.next_followup_date ? contact.next_followup_date.split("T")[0] : "",
    background_notes: contact.background_notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        first_name: form.first_name,
        last_name: form.last_name,
        company: form.company,
        job_title: form.job_title,
        email: form.email,
        phone: form.phone,
        whatsapp: form.whatsapp,
        linkedin_url: form.linkedin_url,
        address: form.address,
        contact_type: form.contact_type,
        segment: form.segment,
        stage: form.stage,
        source: form.source,
        source_detail: form.source_detail,
        risk_appetite: form.risk_appetite,
        priority: form.priority,
        background_notes: form.background_notes,
        investment_goals: form.investment_goals.split(",").map(s => s.trim()).filter(Boolean),
        preferred_products: form.preferred_products.split(",").map(s => s.trim()).filter(Boolean),
        tags: form.tags.split(",").map(s => s.trim()).filter(Boolean),
      };
      if (form.estimated_aum) body.estimated_aum = parseFloat(form.estimated_aum);
      if (form.annual_income) body.annual_income = parseFloat(form.annual_income);
      if (form.next_followup_date) body.next_followup_date = form.next_followup_date;

      const res = await fetch(`${BASE}/api/v1/crm/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact updated" });
      qc.invalidateQueries({ queryKey: ["crm-contact", contact.id] });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update contact", description: e.message, variant: "destructive" });
    },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div
      className="rounded-2xl p-6 space-y-5"
      style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Basic Info</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>First Name *</Label>
            <Input value={form.first_name} onChange={set("first_name")} placeholder="First name" />
          </div>
          <div>
            <Label>Last Name *</Label>
            <Input value={form.last_name} onChange={set("last_name")} placeholder="Last name" />
          </div>
          <div>
            <Label>Company *</Label>
            <Input value={form.company} onChange={set("company")} placeholder="Company name" />
          </div>
          <div>
            <Label>Job Title</Label>
            <Input value={form.job_title} onChange={set("job_title")} placeholder="CEO, CFO..." />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={set("email")} placeholder="name@company.com" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={set("phone")} placeholder="+234..." />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp} onChange={set("whatsapp")} placeholder="+234..." />
          </div>
          <div>
            <Label>LinkedIn URL</Label>
            <Input value={form.linkedin_url} onChange={set("linkedin_url")} placeholder="https://linkedin.com/in/..." />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={set("address")} placeholder="Full address" />
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--pg-row-border)", paddingTop: "16px" }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Classification</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <Label>Contact Type</Label>
            <Select value={form.contact_type} onChange={set("contact_type")}>
              {["prospect","client","lead","partner","vendor","other"].map(v => (
                <option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Segment</Label>
            <Select value={form.segment} onChange={set("segment")}>
              {["retail","hnwi","uhnwi","institutional","corporate"].map(v => (
                <option key={v} value={v}>{v.toUpperCase()}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Stage</Label>
            <Select value={form.stage} onChange={set("stage")}>
              {PIPELINE_STAGES.map(v => (
                <option key={v} value={v}>{v.replace(/_/g," ")}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Source</Label>
            <Select value={form.source} onChange={set("source")}>
              {["referral","cold_call","event","linkedin","website","broker","other"].map(v => (
                <option key={v} value={v}>{v.replace(/_/g," ")}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Source Detail</Label>
            <Input value={form.source_detail} onChange={set("source_detail")} placeholder="e.g. John Doe referral" />
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={form.priority} onChange={set("priority")}>
              {["low","medium","high","urgent"].map(v => (
                <option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--pg-row-border)", paddingTop: "16px" }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Financial Profile</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <Label>Estimated AUM (₦)</Label>
            <Input type="number" value={form.estimated_aum} onChange={set("estimated_aum")} placeholder="50000000" min="0" />
          </div>
          <div>
            <Label>Annual Income (₦)</Label>
            <Input type="number" value={form.annual_income} onChange={set("annual_income")} placeholder="12000000" min="0" />
          </div>
          <div>
            <Label>Risk Appetite</Label>
            <Select value={form.risk_appetite} onChange={set("risk_appetite")}>
              {["conservative","moderate","aggressive"].map(v => (
                <option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label>Investment Goals (comma-separated)</Label>
            <Textarea value={form.investment_goals} onChange={set("investment_goals")} placeholder="Capital preservation, Wealth accumulation, Retirement planning" rows={2} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label>Preferred Products (comma-separated)</Label>
            <Textarea value={form.preferred_products} onChange={set("preferred_products")} placeholder="T-Bills, Eurobonds, Mutual Funds, Fixed Income" rows={2} />
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--pg-row-border)", paddingTop: "16px" }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pg-text-3)" }}>Additional Info</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Next Followup Date</Label>
            <Input type="date" value={form.next_followup_date} onChange={set("next_followup_date")} />
          </div>
          <div>
            <Label>Tags (comma-separated)</Label>
            <Input value={form.tags} onChange={set("tags")} placeholder="vip, referral, urgent" />
          </div>
          <div className="sm:col-span-2">
            <Label>Background Notes</Label>
            <Textarea value={form.background_notes} onChange={set("background_notes")} placeholder="Key context, relationship history..." rows={4} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end pt-2">
        <PrimaryBtn
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          disabled={!form.first_name || !form.last_name || !form.company}
        >
          Save Changes
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = "overview" | "interactions" | "tasks" | "opportunities" | "edit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview",      label: "Overview" },
  { key: "interactions",  label: "Interactions" },
  { key: "tasks",         label: "Tasks" },
  { key: "opportunities", label: "Opportunities" },
  { key: "edit",          label: "Edit" },
];

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [showLogModal, setShowLogModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showOppModal, setShowOppModal] = useState(false);

  const { data: contact, isLoading, error } = useQuery<Contact>({
    queryKey: ["crm-contact", id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/crm/contacts/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to load contact (${res.status})`);
      return res.json() as Promise<Contact>;
    },
    enabled: Boolean(id),
  });

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--pg-text-3)" }} />
      </div>
    );
  }

  // ── Error ──
  if (error || !contact) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <AlertCircle className="w-10 h-10" style={{ color: "#dc2626" }} />
        <p className="text-[15px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
          {error ? (error as Error).message : "Contact not found"}
        </p>
      </div>
    );
  }

  const rmName = contact.rm_name || user?.DisplayName || "";

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      {/* ── Page header ── */}
      <div className="flex items-center gap-2" style={{ color: "var(--pg-text-3)" }}>
        <span className="text-[12px]">CRM</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-[12px]">Contacts</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{contact.full_name}</span>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 h-9 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-all"
            style={{
              background: activeTab === tab.key
                ? "linear-gradient(135deg,#2563eb,#1d4ed8)"
                : "var(--pg-muted-bg)",
              color: activeTab === tab.key ? "white" : "var(--pg-text-2)",
              border: activeTab === tab.key ? "none" : "1px solid var(--pg-card-border)",
              boxShadow: activeTab === tab.key ? "0 1px 8px rgba(37,99,235,0.3)" : "none",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === "overview" && (
        <OverviewTab
          contact={contact}
          onLogInteraction={() => setShowLogModal(true)}
          onAddTask={() => setShowTaskModal(true)}
          onAddOpportunity={() => setShowOppModal(true)}
          onEditTab={() => setActiveTab("edit")}
        />
      )}
      {activeTab === "interactions" && (
        <InteractionsTab contactId={id} rmName={rmName} />
      )}
      {activeTab === "tasks" && (
        <TasksTab contactId={id} />
      )}
      {activeTab === "opportunities" && (
        <OpportunitiesTab contactId={id} contactName={contact.full_name} rmName={rmName} />
      )}
      {activeTab === "edit" && (
        <EditTab contact={contact} />
      )}

      {/* ── Global modals (triggered from Overview actions) ── */}
      {showLogModal && (
        <LogInteractionModal
          contactId={id}
          rmName={rmName}
          onClose={() => setShowLogModal(false)}
        />
      )}
      {showTaskModal && (
        <NewTaskModal contactId={id} onClose={() => setShowTaskModal(false)} />
      )}
      {showOppModal && (
        <NewOpportunityModal
          contactId={id}
          contactName={contact.full_name}
          rmName={rmName}
          onClose={() => setShowOppModal(false)}
        />
      )}
    </div>
  );
}
