"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Calendar,
  User,
  Tag,
  Plus,
  X,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  Filter,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact = {
  id: string;
  full_name: string;
  company: string;
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

type OrgUser = {
  id: string;
  display_name: string;
  email: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(task: Task): boolean {
  if (!task.due_date) return false;
  if (task.status === "completed") return false;
  return task.due_date < todayStr();
}

function isDueToday(task: Task): boolean {
  if (!task.due_date) return false;
  if (task.status === "completed") return false;
  return task.due_date === todayStr();
}

function isUpcoming(task: Task): boolean {
  if (!task.due_date) return false;
  if (task.status === "completed") return false;
  return task.due_date > todayStr();
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#94a3b8",
};

const TYPE_LABEL: Record<string, string> = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  proposal: "Proposal",
  document_request: "Document",
  kyc: "KYC",
  follow_up: "Follow Up",
  other: "Other",
};

const STATUS_PILL: Record<string, { bg: string; color: string; label: string }> = {
  open: { bg: "#dbeafe", color: "#1d4ed8", label: "Open" },
  in_progress: { bg: "#fef3c7", color: "#d97706", label: "In Progress" },
  completed: { bg: "#d1fae5", color: "#065f46", label: "Completed" },
};

function formatDueDate(dateStr?: string, taskStatus?: string): { label: string; color: string } {
  if (!dateStr) return { label: "No due date", color: "var(--pg-text-3)" };
  const today = todayStr();
  if (dateStr < today && taskStatus !== "completed") return { label: dateStr, color: "#ef4444" };
  if (dateStr === today) return { label: "Today", color: "#d97706" };
  return { label: dateStr, color: "var(--pg-text-3)" };
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ─── Searchable Dropdown ──────────────────────────────────────────────────────

function ContactSearch({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (v: { id: string; name: string } | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounce(q, 300);
  const ref = useRef<HTMLDivElement>(null);

  const { data: results = [] } = useQuery<Contact[]>({
    queryKey: ["crm-contact-search", dq],
    enabled: dq.length >= 1,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/crm/contacts?search=${encodeURIComponent(dq)}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (value) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: "var(--pg-text-1)", flex: 1 }}>{value.name}</span>
        <button
          type="button"
          onClick={() => { onChange(null); setQ(""); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pg-text-3)", padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        type="text"
        placeholder="Search contacts..."
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{
          width: "100%",
          padding: "7px 10px",
          borderRadius: 8,
          border: "1px solid var(--pg-card-border)",
          background: "var(--pg-muted-bg)",
          fontSize: 13,
          color: "var(--pg-text-1)",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            zIndex: 100,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange({ id: c.id, name: c.full_name }); setOpen(false); setQ(""); }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "9px 12px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--pg-text-1)",
                borderBottom: "1px solid var(--pg-row-border)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--pg-muted-bg)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <div style={{ fontWeight: 600 }}>{c.full_name}</div>
              {c.company && <div style={{ fontSize: 11, color: "var(--pg-text-3)" }}>{c.company}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserSearch({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (v: { id: string; name: string } | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounce(q, 300);
  const ref = useRef<HTMLDivElement>(null);

  const { data: results = [] } = useQuery<OrgUser[]>({
    queryKey: ["org-user-search", dq],
    enabled: dq.length >= 1,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/org/users?search=${encodeURIComponent(dq)}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (value) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: "var(--pg-text-1)", flex: 1 }}>{value.name}</span>
        <button
          type="button"
          onClick={() => { onChange(null); setQ(""); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pg-text-3)", padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        type="text"
        placeholder="Search users..."
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{
          width: "100%",
          padding: "7px 10px",
          borderRadius: 8,
          border: "1px solid var(--pg-card-border)",
          background: "var(--pg-muted-bg)",
          fontSize: 13,
          color: "var(--pg-text-1)",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            zIndex: 100,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {results.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onChange({ id: u.id, name: u.display_name }); setOpen(false); setQ(""); }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "9px 12px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--pg-text-1)",
                borderBottom: "1px solid var(--pg-row-border)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--pg-muted-bg)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <div style={{ fontWeight: 600 }}>{u.display_name}</div>
              <div style={{ fontSize: 11, color: "var(--pg-text-3)" }}>{u.email}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── New Task Modal ───────────────────────────────────────────────────────────

function NewTaskModal({
  onClose,
  onCreated,
  defaultAssignee,
}: {
  onClose: () => void;
  onCreated: () => void;
  defaultAssignee?: { id: string; name: string } | null;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState("follow_up");
  const [priority, setPriority] = useState("medium");
  const [contact, setContact] = useState<{ id: string; name: string } | null>(null);
  const [assignee, setAssignee] = useState<{ id: string; name: string } | null>(defaultAssignee ?? null);
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--pg-card-border)",
    background: "var(--pg-muted-bg)",
    fontSize: 13,
    color: "var(--pg-text-1)",
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!assignee) {
      toast({ title: "Please select an assignee", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        title: title.trim(),
        task_type: taskType,
        priority,
        assigned_to: assignee.id,
        assigned_name: assignee.name,
        description,
      };
      if (contact) {
        body.contact_id = contact.id;
        body.contact_name = contact.name;
      }
      if (dueDate) body.due_date = dueDate;

      const res = await fetch(`${BASE}/api/v1/crm/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create task");
      toast({ title: "Task created" });
      onCreated();
      onClose();
    } catch {
      toast({ title: "Failed to create task", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--pg-card)",
          borderRadius: 16,
          border: "1px solid var(--pg-card-border)",
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--pg-row-border)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pg-text-1)" }}>
            New Task
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pg-text-3)", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Title */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pg-text-2)", display: "block", marginBottom: 4 }}>
              Title <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter task title"
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Task Type + Priority */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pg-text-2)", display: "block", marginBottom: 4 }}>
                Task Type
              </label>
              <select value={taskType} onChange={e => setTaskType(e.target.value)} style={selectStyle}>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="email">Email</option>
                <option value="proposal">Proposal</option>
                <option value="document_request">Document Request</option>
                <option value="kyc">KYC</option>
                <option value="follow_up">Follow Up</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pg-text-2)", display: "block", marginBottom: 4 }}>
                Priority
              </label>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={selectStyle}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Contact */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pg-text-2)", display: "block", marginBottom: 4 }}>
              Contact (optional)
            </label>
            <ContactSearch value={contact} onChange={setContact} />
          </div>

          {/* Assigned To */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pg-text-2)", display: "block", marginBottom: 4 }}>
              Assigned To <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <UserSearch value={assignee} onChange={setAssignee} />
          </div>

          {/* Due Date */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pg-text-2)", display: "block", marginBottom: 4 }}>
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pg-text-2)", display: "block", marginBottom: 4 }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add notes or context..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "1px solid var(--pg-card-border)",
                background: "var(--pg-muted-bg)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--pg-text-2)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: "none",
                background: saving ? "#94a3b8" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                cursor: saving ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Complete Task Modal ──────────────────────────────────────────────────────

function CompleteModal({
  task,
  onClose,
  onCompleted,
}: {
  task: Task;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/v1/crm/tasks/${task.id}/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completion_notes: notes }),
      });
      if (!res.ok) throw new Error("Failed to complete task");
      toast({ title: "Task completed" });
      onCompleted();
      onClose();
    } catch {
      toast({ title: "Failed to complete task", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--pg-card)",
          borderRadius: 14,
          border: "1px solid var(--pg-card-border)",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "#d1fae5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCircle2 size={18} style={{ color: "#059669" }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pg-text-1)" }}>
            Complete Task
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--pg-text-2)", marginBottom: 16, lineHeight: 1.5 }}>
          Mark <strong>&ldquo;{task.title}&rdquo;</strong> as completed?
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pg-text-2)", display: "block", marginBottom: 4 }}>
            Completion Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="What was the outcome?"
            rows={3}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--pg-card-border)",
              background: "var(--pg-muted-bg)",
              fontSize: 13,
              color: "var(--pg-text-1)",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid var(--pg-card-border)",
              background: "var(--pg-muted-bg)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--pg-text-2)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: saving ? "#94a3b8" : "#059669",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            <Check size={13} />
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  selected,
  onSelect,
  onComplete,
  onToggleInProgress,
}: {
  task: Task;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onComplete: (task: Task) => void;
  onToggleInProgress: (task: Task) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const dotColor = PRIORITY_DOT[task.priority] ?? "#94a3b8";
  const statusPill = STATUS_PILL[task.status] ?? STATUS_PILL.open;
  const { label: dueDateLabel, color: dueDateColor } = formatDueDate(task.due_date, task.status);
  const typeLabel = TYPE_LABEL[task.task_type] ?? task.task_type;
  const isComplete = task.status === "completed";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderBottom: "1px solid var(--pg-row-border)",
        background: hovered ? "var(--pg-muted-bg)" : "transparent",
        transition: "background 0.12s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={e => onSelect(task.id, e.target.checked)}
        style={{ width: 15, height: 15, cursor: "pointer", flexShrink: 0, accentColor: "#7c3aed" }}
      />

      {/* Priority dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
        }}
      />

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: isComplete ? "var(--pg-text-3)" : "var(--pg-text-1)",
              textDecoration: isComplete ? "line-through" : "none",
              lineHeight: 1.3,
            }}
          >
            {task.title}
          </span>
          {task.contact_name && task.contact_id && (
            <Link
              href={`/crm/contacts/${task.contact_id}`}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 20,
                background: "#ede9fe",
                color: "#6d28d9",
                textDecoration: "none",
                flexShrink: 0,
              }}
              onClick={e => e.stopPropagation()}
            >
              {task.contact_name}
            </Link>
          )}
          {task.contact_name && !task.contact_id && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 20,
                background: "#ede9fe",
                color: "#6d28d9",
              }}
            >
              {task.contact_name}
            </span>
          )}
          {/* Type badge */}
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 20,
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              flexShrink: 0,
            }}
          >
            {typeLabel}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 3, flexWrap: "wrap" }}>
          {/* Assigned */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <User size={11} style={{ color: "var(--pg-text-3)" }} />
            <span style={{ fontSize: 11, color: "var(--pg-text-3)" }}>{task.assigned_name}</span>
          </div>
          {/* Due date */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Calendar size={11} style={{ color: dueDateColor }} />
            <span style={{ fontSize: 11, color: dueDateColor, fontWeight: dueDateColor === "#ef4444" ? 600 : 400 }}>
              {dueDateLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Status pill */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: "3px 9px",
          borderRadius: 20,
          background: statusPill.bg,
          color: statusPill.color,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {statusPill.label}
      </span>

      {/* Actions */}
      {!isComplete && (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {task.status === "open" && (
            <button
              type="button"
              onClick={() => onToggleInProgress(task)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--pg-card-border)",
                background: "var(--pg-muted-bg)",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--pg-text-2)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              In Progress
            </button>
          )}
          {task.status === "in_progress" && (
            <button
              type="button"
              onClick={() => onToggleInProgress(task)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #fbbf24",
                background: "#fef3c7",
                fontSize: 11,
                fontWeight: 600,
                color: "#d97706",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Open
            </button>
          )}
          <button
            type="button"
            onClick={() => onComplete(task)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              fontSize: 11,
              fontWeight: 600,
              color: "#16a34a",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
            }}
          >
            <Check size={11} />
            Complete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

type SectionDef = {
  key: string;
  label: string;
  bg: string;
  color: string;
  defaultCollapsed: boolean;
  tasks: Task[];
};

function TaskSection({
  section,
  selectedIds,
  onSelect,
  onComplete,
  onToggleInProgress,
}: {
  section: SectionDef;
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onComplete: (task: Task) => void;
  onToggleInProgress: (task: Task) => void;
}) {
  const [collapsed, setCollapsed] = useState(section.defaultCollapsed);

  if (section.tasks.length === 0) return null;

  return (
    <div>
      {/* Section header */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "7px 16px",
          background: section.bg,
          border: "none",
          borderBottom: "1px solid var(--pg-row-border)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {collapsed ? (
          <ChevronRight size={14} style={{ color: section.color, flexShrink: 0 }} />
        ) : (
          <ChevronDown size={14} style={{ color: section.color, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 12, fontWeight: 700, color: section.color }}>
          {section.label} ({section.tasks.length})
        </span>
      </button>

      {/* Rows */}
      {!collapsed &&
        section.tasks.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            selected={selectedIds.has(task.id)}
            onSelect={onSelect}
            onComplete={onComplete}
            onToggleInProgress={onToggleInProgress}
          />
        ))}
    </div>
  );
}

// ─── Flat Task List ───────────────────────────────────────────────────────────

function FlatTaskList({
  tasks,
  selectedIds,
  onSelect,
  onComplete,
  onToggleInProgress,
}: {
  tasks: Task[];
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onComplete: (task: Task) => void;
  onToggleInProgress: (task: Task) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <>
      {tasks.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          selected={selectedIds.has(task.id)}
          onSelect={onSelect}
          onComplete={onComplete}
          onToggleInProgress={onToggleInProgress}
        />
      ))}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabKey = "all" | "mine" | "due_today" | "overdue" | "completed";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "My Tasks" },
  { key: "due_today", label: "Due Today" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

export default function CRMTasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [showNewTask, setShowNewTask] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCompleting, setBulkCompleting] = useState(false);

  // ── Fetch all tasks ──
  const { data: allTasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["crm-tasks"],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/crm/tasks`, { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
  });

  // ── Toggle in-progress mutation ──
  const toggleInProgressMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === "in_progress" ? "open" : "in_progress";
      const res = await fetch(`${BASE}/api/v1/crm/tasks/${task.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update task");
    },
    onError: () => toast({ title: "Failed to update task status", variant: "destructive" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["crm-tasks"] }),
  });

  // ── Summary stats ──
  const today = todayStr();
  const openCount = allTasks.filter(t => t.status !== "completed").length;
  const dueTodayCount = allTasks.filter(t => isDueToday(t)).length;
  const overdueCount = allTasks.filter(t => isOverdue(t)).length;
  const completedCount = allTasks.filter(t => t.status === "completed").length;

  // ── Filtered tasks for the active tab ──
  const myName = user?.DisplayName ?? "";

  const tabFiltered: Task[] = (() => {
    switch (activeTab) {
      case "mine":
        return allTasks.filter(t => t.assigned_name === myName && t.status !== "completed");
      case "due_today":
        return allTasks.filter(t => isDueToday(t));
      case "overdue":
        return allTasks.filter(t => isOverdue(t));
      case "completed":
        return allTasks.filter(t => t.status === "completed");
      case "all":
      default:
        return allTasks;
    }
  })();

  // ── Search filter (client-side) ──
  const sq = search.trim().toLowerCase();
  const displayed: Task[] = sq
    ? tabFiltered.filter(
        t =>
          t.title.toLowerCase().includes(sq) ||
          (t.contact_name ?? "").toLowerCase().includes(sq) ||
          t.assigned_name.toLowerCase().includes(sq)
      )
    : tabFiltered;

  // ── Grouped sections (for All + My Tasks tabs) ──
  const useGrouped = activeTab === "all" || activeTab === "mine";

  const groups: SectionDef[] = useGrouped
    ? [
        {
          key: "overdue",
          label: "🔴 Overdue",
          bg: "#fee2e2",
          color: "#991b1b",
          defaultCollapsed: false,
          tasks: displayed.filter(t => isOverdue(t)),
        },
        {
          key: "due_today",
          label: "⚡ Due Today",
          bg: "#fef3c7",
          color: "#d97706",
          defaultCollapsed: false,
          tasks: displayed.filter(t => isDueToday(t)),
        },
        {
          key: "upcoming",
          label: "📅 Upcoming",
          bg: "#dbeafe",
          color: "#1d4ed8",
          defaultCollapsed: false,
          tasks: displayed.filter(t => isUpcoming(t)),
        },
        {
          key: "no_due",
          label: "— No Due Date",
          bg: "var(--pg-muted-bg)",
          color: "var(--pg-text-2)",
          defaultCollapsed: false,
          tasks: displayed.filter(t => !t.due_date && t.status !== "completed"),
        },
        {
          key: "completed",
          label: "✓ Completed",
          bg: "var(--pg-muted-bg)",
          color: "var(--pg-text-3)",
          defaultCollapsed: true,
          tasks: displayed.filter(t => t.status === "completed"),
        },
      ]
    : [];

  // ── Selection helpers ──
  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());

  // ── Bulk complete ──
  async function handleBulkComplete() {
    if (selectedIds.size === 0) return;
    setBulkCompleting(true);
    const ids = Array.from(selectedIds);
    let failed = 0;
    await Promise.all(
      ids.map(async id => {
        try {
          const res = await fetch(`${BASE}/api/v1/crm/tasks/${id}/complete`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completion_notes: "" }),
          });
          if (!res.ok) failed++;
        } catch {
          failed++;
        }
      })
    );
    setBulkCompleting(false);
    clearSelection();
    queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
    if (failed === 0) toast({ title: `${ids.length} task${ids.length > 1 ? "s" : ""} completed` });
    else toast({ title: `${ids.length - failed} completed, ${failed} failed`, variant: "destructive" });
  }

  // ── Empty state ──
  const isEmpty = !isLoading && displayed.length === 0;

  const emptyMessages: Record<TabKey, string> = {
    all: "No tasks yet. Create your first task to get started.",
    mine: "No open tasks assigned to you.",
    due_today: "Nothing due today. Enjoy!",
    overdue: "No overdue tasks.",
    completed: "No completed tasks yet.",
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--pg-text-1)", margin: 0 }}>
            Tasks
          </h1>
          <p style={{ fontSize: 13, color: "var(--pg-text-3)", marginTop: 4 }}>
            Manage your team&apos;s CRM tasks and follow-ups
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewTask(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 18px",
            height: 36,
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 1px 8px rgba(124,58,237,0.35)",
            flexShrink: 0,
          }}
        >
          <Plus size={15} />
          New Task
        </button>
      </div>

      {/* ── Summary strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          {
            label: "Open",
            value: openCount,
            color: "#2563eb",
            bg: "#eff6ff",
            icon: Circle,
            highlight: false,
          },
          {
            label: "Due Today",
            value: dueTodayCount,
            color: dueTodayCount > 0 ? "#d97706" : "#64748b",
            bg: dueTodayCount > 0 ? "#fef3c7" : "var(--pg-muted-bg)",
            icon: Clock,
            highlight: dueTodayCount > 0,
          },
          {
            label: "Overdue",
            value: overdueCount,
            color: overdueCount > 0 ? "#dc2626" : "#64748b",
            bg: overdueCount > 0 ? "#fee2e2" : "var(--pg-muted-bg)",
            icon: AlertCircle,
            highlight: overdueCount > 0,
          },
          {
            label: "Completed",
            value: completedCount,
            color: "#059669",
            bg: "#ecfdf5",
            icon: CheckCircle2,
            highlight: false,
          },
        ].map(s => (
          <div
            key={s.label}
            style={{
              background: "var(--pg-card)",
              border: `1px solid ${s.highlight ? s.color + "44" : "var(--pg-card-border)"}`,
              borderRadius: 14,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: s.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--pg-text-1)", lineHeight: 1 }}>
                {isLoading ? "—" : s.value}
              </div>
              <div style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter tabs + Search ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setActiveTab(tab.key); clearSelection(); }}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: isActive ? "none" : "1px solid var(--pg-card-border)",
                  background: isActive ? "#7c3aed" : "var(--pg-card)",
                  color: isActive ? "#fff" : "var(--pg-text-2)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
                {tab.key === "overdue" && overdueCount > 0 && (
                  <span
                    style={{
                      marginLeft: 5,
                      background: "#ef4444",
                      color: "#fff",
                      borderRadius: 20,
                      padding: "0 5px",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {overdueCount}
                  </span>
                )}
                {tab.key === "due_today" && dueTodayCount > 0 && (
                  <span
                    style={{
                      marginLeft: 5,
                      background: "#d97706",
                      color: "#fff",
                      borderRadius: 20,
                      padding: "0 5px",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {dueTodayCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--pg-text-3)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              paddingLeft: 32,
              paddingRight: 10,
              paddingTop: 7,
              paddingBottom: 7,
              borderRadius: 8,
              border: "1px solid var(--pg-card-border)",
              background: "var(--pg-card)",
              fontSize: 13,
              color: "var(--pg-text-1)",
              outline: "none",
              width: 220,
            }}
          />
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            background: "#f5f3ff",
            border: "1px solid #c4b5fd",
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          <Filter size={14} style={{ color: "#7c3aed" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#6d28d9", flex: 1 }}>
            {selectedIds.size} task{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <button
            type="button"
            onClick={handleBulkComplete}
            disabled={bulkCompleting}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: bulkCompleting ? "#94a3b8" : "#059669",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: bulkCompleting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {bulkCompleting && <Loader2 size={12} className="animate-spin" />}
            <Check size={12} />
            Complete Selected
          </button>
          <button
            type="button"
            onClick={clearSelection}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #c4b5fd",
              background: "transparent",
              color: "#6d28d9",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Main card ── */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 20px",
              gap: 10,
              color: "var(--pg-text-3)",
            }}
          >
            <Loader2 size={20} className="animate-spin" />
            <span style={{ fontSize: 14 }}>Loading tasks...</span>
          </div>
        ) : isEmpty ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 20px",
              textAlign: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#f5f3ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={24} style={{ color: "#7c3aed" }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--pg-text-1)", margin: 0 }}>
                {emptyMessages[activeTab]}
              </p>
              {activeTab === "all" && (
                <p style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 4 }}>
                  Track follow-ups, meetings, and client actions.
                </p>
              )}
            </div>
            {activeTab === "all" && (
              <button
                type="button"
                onClick={() => setShowNewTask(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: "#7c3aed",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                <Plus size={14} />
                New Task
              </button>
            )}
          </div>
        ) : useGrouped ? (
          <>
            {groups.map(section => (
              <TaskSection
                key={section.key}
                section={section}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onComplete={setCompleteTarget}
                onToggleInProgress={task => toggleInProgressMutation.mutate(task)}
              />
            ))}
          </>
        ) : (
          <FlatTaskList
            tasks={displayed}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onComplete={setCompleteTarget}
            onToggleInProgress={task => toggleInProgressMutation.mutate(task)}
          />
        )}
      </div>

      {/* ── Modals ── */}
      {showNewTask && (
        <NewTaskModal
          onClose={() => setShowNewTask(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["crm-tasks"] })}
          defaultAssignee={user ? { id: user.ID, name: user.DisplayName } : null}
        />
      )}
      {completeTarget && (
        <CompleteModal
          task={completeTarget}
          onClose={() => setCompleteTarget(null)}
          onCompleted={() => queryClient.invalidateQueries({ queryKey: ["crm-tasks"] })}
        />
      )}
    </div>
  );
}
