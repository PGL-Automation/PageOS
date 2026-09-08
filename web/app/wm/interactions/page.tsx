"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare,
  Plus,
  Filter,
  Search,
  Calendar,
  ChevronDown,
  ChevronRight,
  X,
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  FileText,
  Phone,
  Mail,
  Users,
  Loader2,
  Paperclip,
  ArrowRight,
  Edit2,
  Tag,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type InteractionCategory =
  | "request"
  | "enquiry"
  | "concern"
  | "complaint"
  | "instruction"
  | "meeting"
  | "visit"
  | "follow_up";
type InteractionStatus = "open" | "closed" | "pending" | "overdue" | "escalated";
type InteractionChannel = "phone" | "email" | "in_person" | "video" | "whatsapp" | "other";
type InteractionPriority = "low" | "normal" | "high" | "urgent";

type AttachmentMeta = {
  id:       string;  // document ID
  name:     string;  // original filename
  mimeType: string;
  size:     number;  // bytes
};

type Interaction = {
  id: string;
  client_id: string;
  client_name: string;
  wm_name: string;
  date: string;
  channel: InteractionChannel;
  category: InteractionCategory;
  subject: string;
  summary: string;
  participants?: string;
  next_action?: string;
  action_owner?: string;
  action_due?: string;
  priority: InteractionPriority;
  status: InteractionStatus;
  is_complaint: boolean;
  complaint_severity?: "low" | "medium" | "high" | "critical";
  created_at: string;
  updated_at: string;
  attachments_meta?: AttachmentMeta[];  // full metadata for each attached file
};

type Attachment = {
  id:        string;   // document ID from API (set after upload)
  localId:   string;   // temp ID for tracking before upload completes
  name:      string;   // original filename
  mimeType:  string;
  size:      number;
  uploading: boolean;
  error?:    string;
};

const DEMO_INTERACTIONS: Interaction[] = [
  {
    id: "i1",
    client_id: "c1",
    client_name: "Adaeze Okonkwo",
    wm_name: "Me",
    date: "2026-09-07",
    channel: "in_person",
    category: "meeting",
    subject: "Portfolio review Q3 2026",
    summary:
      "Reviewed Q3 portfolio performance. Client satisfied with returns. Discussed potential rollover of ₦500M FD maturing Sept 14.",
    next_action: "Send rollover proposal by Sept 9",
    action_owner: "WM",
    action_due: "2026-09-09",
    priority: "high",
    status: "open",
    is_complaint: false,
    created_at: "2026-09-07T10:30:00Z",
    updated_at: "2026-09-07T10:30:00Z",
  },
  {
    id: "i2",
    client_id: "c2",
    client_name: "Emeka Nwosu",
    wm_name: "Me",
    date: "2026-09-06",
    channel: "phone",
    category: "request",
    subject: "Redemption instruction — ₦200M",
    summary:
      "Client requested partial redemption of ₦200M from Access Bank FD. Confirmed bank details. Processing instruction.",
    next_action: "Submit redemption form to Ops",
    action_owner: "WM",
    action_due: "2026-09-06",
    priority: "urgent",
    status: "closed",
    is_complaint: false,
    created_at: "2026-09-06T14:00:00Z",
    updated_at: "2026-09-06T14:00:00Z",
  },
  {
    id: "i3",
    client_id: "c3",
    client_name: "Fatima Al-Hassan",
    wm_name: "Me",
    date: "2026-09-05",
    channel: "email",
    category: "complaint",
    subject: "Delay in statement delivery",
    summary:
      "Client complained about 3-week delay in receiving monthly investment statement. Escalated to ops team.",
    next_action: "Confirm statement sent and follow up",
    action_owner: "WM",
    action_due: "2026-09-07",
    priority: "high",
    status: "overdue",
    is_complaint: true,
    complaint_severity: "medium",
    created_at: "2026-09-05T09:00:00Z",
    updated_at: "2026-09-05T09:00:00Z",
  },
  {
    id: "i4",
    client_id: "c4",
    client_name: "Chukwudi Obi",
    wm_name: "Me",
    date: "2026-09-03",
    channel: "in_person",
    category: "visit",
    subject: "Courtesy visit — new client welcome",
    summary:
      "Initial welcome meeting with new client. Discussed investment objectives, risk tolerance and product options. FD placement of ₦1B under discussion.",
    next_action: "Send product term sheet",
    action_owner: "WM",
    action_due: "2026-09-05",
    priority: "normal",
    status: "closed",
    is_complaint: false,
    created_at: "2026-09-03T11:00:00Z",
    updated_at: "2026-09-03T11:00:00Z",
  },
  {
    id: "i5",
    client_id: "c5",
    client_name: "Ngozi Adeyemi",
    wm_name: "Me",
    date: "2026-09-01",
    channel: "whatsapp",
    category: "enquiry",
    subject: "T-bill rate enquiry",
    summary:
      "Client asked about current 91-day T-bill rates and whether to roll over maturing T-bill. Provided current rates.",
    next_action: "Follow up on rollover decision",
    action_owner: "WM",
    action_due: "2026-09-08",
    priority: "normal",
    status: "open",
    is_complaint: false,
    created_at: "2026-09-01T16:30:00Z",
    updated_at: "2026-09-01T16:30:00Z",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  meeting: "#7c3aed",
  visit: "#059669",
  phone: "#0891b2",
  email: "#1d4ed8",
  request: "#FF6600",
  complaint: "#dc2626",
  enquiry: "#d97706",
  follow_up: "#475569",
  instruction: "#FF6600",
  concern: "#d97706",
};

function fmtCompact(n: number, cur: string) {
  const sym = cur === "USD" ? "$" : "₦";
  if (n >= 1e9) return sym + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return sym + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return sym + (n / 1e3).toFixed(1) + "K";
  return sym + n.toLocaleString("en-NG");
}

function fmtDate(iso: string | undefined | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function CategoryIcon({ category }: { category: InteractionCategory }) {
  const size = 14;
  switch (category) {
    case "meeting":
      return <Users size={size} />;
    case "visit":
      return <User size={size} />;
    case "complaint":
      return <AlertCircle size={size} />;
    case "request":
    case "instruction":
      return <FileText size={size} />;
    case "follow_up":
      return <ArrowRight size={size} />;
    case "enquiry":
    case "concern":
      return <MessageSquare size={size} />;
    default:
      return <MessageSquare size={size} />;
  }
}

function ChannelBadge({ channel }: { channel: InteractionChannel }) {
  const labels: Record<InteractionChannel, string> = {
    phone: "Phone",
    email: "Email",
    in_person: "In-Person",
    video: "Video",
    whatsapp: "WhatsApp",
    other: "Other",
  };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 6,
        background: "var(--pg-muted-bg)",
        color: "var(--pg-text-3)",
        border: "1px solid var(--pg-card-border)",
      }}
    >
      {labels[channel] ?? channel}
    </span>
  );
}

function StatusBadge({ status }: { status: InteractionStatus }) {
  const map: Record<InteractionStatus, { bg: string; color: string; label: string }> = {
    open: { bg: "#dbeafe", color: "#1d4ed8", label: "Open" },
    closed: { bg: "#d1fae5", color: "#065f46", label: "Closed" },
    pending: { bg: "#fef3c7", color: "#92400e", label: "Pending" },
    overdue: { bg: "#fee2e2", color: "#991b1b", label: "Overdue" },
    escalated: { bg: "#ede9fe", color: "#5b21b6", label: "Escalated" },
  };
  const s = map[status] ?? map.open;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 6,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

function PriorityDot({ priority }: { priority: InteractionPriority }) {
  const colors: Record<InteractionPriority, string> = {
    low: "#059669",
    normal: "#6b7280",
    high: "#d97706",
    urgent: "#dc2626",
  };
  return (
    <span title={priority} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: colors[priority],
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: 10, color: "var(--pg-text-3)", textTransform: "capitalize" }}>
        {priority}
      </span>
    </span>
  );
}

function SummaryCard({
  label,
  value,
  accentColor,
  icon,
}: {
  label: string;
  value: number | string;
  accentColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "0 1px 4px var(--pg-card-shadow)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div className="h-[3px]" style={{ background: accentColor }} />
      <div style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--pg-text-3)",
                marginBottom: 6,
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1,
                color: "var(--pg-text-1)",
              }}
            >
              {value}
            </div>
          </div>
          <div style={{ color: accentColor, opacity: 0.8 }}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

type FormData = {
  client_name: string;
  date: string;
  channel: InteractionChannel;
  category: InteractionCategory;
  subject: string;
  participants: string;
  summary: string;
  is_complaint: boolean;
  complaint_severity: "low" | "medium" | "high" | "critical";
  next_action: string;
  action_owner: string;
  action_due: string;
  priority: InteractionPriority;
};

const defaultForm: FormData = {
  client_name: "",
  date: new Date().toISOString().slice(0, 10),
  channel: "in_person",
  category: "meeting",
  subject: "",
  participants: "",
  summary: "",
  is_complaint: false,
  complaint_severity: "medium",
  next_action: "",
  action_owner: "",
  action_due: "",
  priority: "normal",
};

export default function InteractionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [showModal, setShowModal]           = useState(false);
  const [submitting, setSubmitting]         = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus]     = useState("all");
  const [filterPeriod, setFilterPeriod]     = useState("month");
  const [searchQ, setSearchQ]               = useState("");
  const [form, setForm]                     = useState<FormData>(defaultForm);
  const [attachments, setAttachments]       = useState<Attachment[]>([]);
  const [hoveredRow, setHoveredRow]         = useState<string | null>(null);
  // Interactions created this session (stored locally until backend is available)
  const [localInteractions, setLocalInteractions] = useState<Interaction[]>([]);

  const { data: rawInteractions = [] } = useQuery<Interaction[]>({
    queryKey: ["wm-interactions"],
    queryFn: () =>
      fetch(BASE + "/api/v1/wm/interactions", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
  });

  // Prefer server data; fall back to local + demo when backend isn't available yet
  const interactions: Interaction[] =
    rawInteractions.length > 0
      ? rawInteractions
      : [...localInteractions, ...DEMO_INTERACTIONS];

  const filtered = interactions.filter((i) => {
    if (filterCategory !== "all" && i.category !== filterCategory) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    const q = searchQ.toLowerCase();
    if (q && !i.client_name.toLowerCase().includes(q) && !i.subject.toLowerCase().includes(q))
      return false;
    return true;
  });

  const totalThisMonth = interactions.length;
  const openFollowUps = interactions.filter(
    (i) => i.status === "open" && i.next_action
  ).length;
  const overdueActions = interactions.filter((i) => i.status === "overdue").length;
  const complaints = interactions.filter((i) => i.is_complaint).length;

  async function uploadFile(file: File): Promise<string> {
    const fd = new globalThis.FormData();
    fd.append("file", file);
    fd.append("vault_type", "personal");
    fd.append("category", "wm_interaction");
    const res = await fetch(`${BASE}/api/v1/documents/`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any)?.error?.message ?? "Upload failed");
    }
    const { id } = await res.json() as { id: string };
    return id;
  }

  function handleFileSelect(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: "File too large", description: `${file.name} exceeds 20 MB limit`, variant: "destructive" });
        return;
      }
      const localId = Math.random().toString(36).slice(2);
      const att: Attachment = { id: "", localId, name: file.name, mimeType: file.type, size: file.size, uploading: true };
      setAttachments(prev => [...prev, att]);
      uploadFile(file)
        .then(docId => {
          setAttachments(prev => prev.map(a => a.localId === localId ? { ...a, id: docId, uploading: false } : a));
        })
        .catch(err => {
          setAttachments(prev => prev.map(a => a.localId === localId ? { ...a, uploading: false, error: (err as Error).message } : a));
        });
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // Wait for any still-uploading attachments to finish
    const stillUploading = attachments.some(a => a.uploading);
    if (stillUploading) {
      toast({ title: "Please wait", description: "Files are still uploading." });
      return;
    }

    setSubmitting(true);
    const payload = {
      ...form,
      document_ids: attachments.filter(a => a.id).map(a => a.id),
    };

    // Build a local record immediately so the UI updates right away
    const localRecord: Interaction = {
      id:           `local-${Date.now()}`,
      client_id:    "",
      client_name:  form.client_name || "—",
      wm_name:      user?.DisplayName ?? "Me",
      date:         form.date,
      channel:      form.channel,
      category:     form.category,
      subject:      form.subject,
      summary:      form.summary,
      participants: form.participants || undefined,
      next_action:  form.next_action  || undefined,
      action_owner: form.action_owner || undefined,
      action_due:   form.action_due   || undefined,
      priority:     form.priority,
      status:       "open",
      is_complaint: form.is_complaint,
      complaint_severity: form.is_complaint ? form.complaint_severity : undefined,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
      // Store full file metadata so the detail panel can show names/icons/sizes
      attachments_meta: attachments
        .filter(a => a.id)
        .map(a => ({ id: a.id, name: a.name, mimeType: a.mimeType, size: a.size })),
    };
    setLocalInteractions(prev => [localRecord, ...prev]);

    // Close modal and reset immediately — don't make the user wait
    setShowModal(false);
    setForm(defaultForm);
    setAttachments([]);
    setSubmitting(false);
    toast({ title: "Interaction logged", description: `${form.subject || "Interaction"} recorded successfully.` });

    // Fire the API in the background (will start working once the backend endpoint is added)
    fetch(BASE + "/api/v1/wm/interactions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => { /* backend not yet available — local record already saved */ });
  }

  const inputStyle: React.CSSProperties = {
    height: 36,
    padding: "0 12px",
    borderRadius: 12,
    fontSize: 13,
    outline: "none",
    background: "var(--pg-muted-bg)",
    border: "1px solid var(--pg-card-border)",
    color: "var(--pg-text-1)",
    width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--pg-text-3)",
    marginBottom: 4,
    display: "block",
  };

  return (
    <div style={{ padding: 28, background: "var(--pg-bg)", minHeight: "100vh" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--pg-text-1)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Interaction Log
          </h1>
          <p style={{ fontSize: 13, color: "var(--pg-text-3)", margin: "4px 0 0" }}>
            Client and prospect interaction history
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => {}}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
              border: "1px solid var(--pg-card-border)",
              cursor: "pointer",
            }}
          >
            Export
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "linear-gradient(135deg,#FF6600,#E05500)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Plus size={15} />
            Log Interaction
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <SummaryCard
          label="Total This Month"
          value={totalThisMonth}
          accentColor="#1d4ed8"
          icon={<MessageSquare size={20} />}
        />
        <SummaryCard
          label="Open Follow-ups"
          value={openFollowUps}
          accentColor="#d97706"
          icon={<Clock size={20} />}
        />
        <SummaryCard
          label="Overdue Actions"
          value={overdueActions}
          accentColor="#dc2626"
          icon={<AlertCircle size={20} />}
        />
        <SummaryCard
          label="Complaints"
          value={complaints}
          accentColor={complaints > 0 ? "#dc2626" : "#6b7280"}
          icon={<AlertCircle size={20} />}
        />
      </div>

      {/* FILTER BAR */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px var(--pg-card-shadow)",
          borderRadius: 16,
          padding: "14px 18px",
          marginBottom: 20,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        {/* Period */}
        <div style={{ display: "flex", gap: 4 }}>
          {["today", "week", "month", "custom"].map((p) => (
            <button
              key={p}
              onClick={() => setFilterPeriod(p)}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid var(--pg-card-border)",
                cursor: "pointer",
                background: filterPeriod === p ? "linear-gradient(135deg,#FF6600,#E05500)" : "var(--pg-muted-bg)",
                color: filterPeriod === p ? "#fff" : "var(--pg-text-2)",
              }}
            >
              {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom"}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: "var(--pg-card-border)" }} />

        {/* Category */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ ...inputStyle, width: 140, height: 32 }}
        >
          <option value="all">All Categories</option>
          <option value="meeting">Meeting</option>
          <option value="visit">Visit</option>
          <option value="phone">Call</option>
          <option value="email">Email</option>
          <option value="request">Request</option>
          <option value="complaint">Complaint</option>
          <option value="follow_up">Follow-up</option>
          <option value="enquiry">Enquiry</option>
        </select>

        {/* Status */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ ...inputStyle, width: 130, height: 32 }}
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="overdue">Overdue</option>
          <option value="escalated">Escalated</option>
        </select>

        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--pg-text-3)",
            }}
          />
          <input
            type="text"
            placeholder="Search client or subject…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            style={{ ...inputStyle, height: 32, paddingLeft: 30 }}
          />
        </div>

        {(filterCategory !== "all" || filterStatus !== "all" || searchQ) && (
          <button
            onClick={() => {
              setFilterCategory("all");
              setFilterStatus("all");
              setSearchQ("");
            }}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid var(--pg-card-border)",
              cursor: "pointer",
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-3)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <X size={12} />
            Clear filters
          </button>
        )}
      </div>

      {/* DEMO BANNER */}
      {localInteractions.length === 0 && rawInteractions.length === 0 && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: 12,
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertCircle size={15} />
          Sample interactions shown. Start logging interactions to build your client history.
        </div>
      )}

      {/* INTERACTION FEED */}
      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {false ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: 200,
                color: "var(--pg-text-3)",
              }}
            >
              <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                background: "var(--pg-card)",
                border: "1px solid var(--pg-card-border)",
                borderRadius: 16,
                padding: 40,
                textAlign: "center",
                color: "var(--pg-text-3)",
              }}
            >
              <MessageSquare size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>No interactions found</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting your filters</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((interaction) => {
                const catColor = CATEGORY_COLORS[interaction.category] ?? "#6b7280";
                const isHovered = hoveredRow === interaction.id;
                const isSelected = selectedInteraction?.id === interaction.id;
                return (
                  <div
                    key={interaction.id}
                    onClick={() => setSelectedInteraction(interaction)}
                    onMouseEnter={() => setHoveredRow(interaction.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      background: isSelected
                        ? "var(--pg-row-hover)"
                        : isHovered
                        ? "var(--pg-row-hover)"
                        : "var(--pg-card)",
                      border: isSelected
                        ? `1px solid ${catColor}40`
                        : "1px solid var(--pg-card-border)",
                      boxShadow: "0 1px 4px var(--pg-card-shadow)",
                      borderRadius: 14,
                      overflow: "hidden",
                      cursor: "pointer",
                      display: "flex",
                      transition: "background 0.15s",
                    }}
                  >
                    {/* Left accent bar */}
                    <div style={{ width: 4, background: catColor, flexShrink: 0 }} />

                    <div style={{ flex: 1, padding: "14px 16px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                        }}
                      >
                        {/* Left content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Top row: category icon + client + channel badge */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 26,
                                height: 26,
                                borderRadius: 8,
                                background: catColor + "18",
                                color: catColor,
                                flexShrink: 0,
                              }}
                            >
                              <CategoryIcon category={interaction.category} />
                            </span>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: "var(--pg-text-1)",
                              }}
                            >
                              {interaction.client_name}
                            </span>
                            <ChannelBadge channel={interaction.channel} />
                            {interaction.is_complaint && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  background: "#fee2e2",
                                  color: "#991b1b",
                                }}
                              >
                                Complaint
                              </span>
                            )}
                          </div>

                          {/* Subject */}
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--pg-text-1)",
                              marginBottom: 4,
                            }}
                          >
                            {interaction.subject}
                          </div>

                          {/* Summary */}
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--pg-text-3)",
                              lineHeight: 1.5,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              marginBottom: interaction.next_action ? 8 : 0,
                            }}
                          >
                            {interaction.summary}
                          </div>

                          {/* Next action */}
                          {interaction.next_action && (
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 11,
                                color: "#92400e",
                                background: "#fef3c7",
                                border: "1px solid #fcd34d",
                                borderRadius: 8,
                                padding: "4px 10px",
                                marginTop: 2,
                              }}
                            >
                              <ArrowRight size={11} />
                              <span>
                                {interaction.next_action}
                                {interaction.action_due && (
                                  <> · Due {fmtDate(interaction.action_due)}</>
                                )}
                                {interaction.action_owner && (
                                  <> · {interaction.action_owner}</>
                                )}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Right: date + status + priority */}
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 6,
                            flexShrink: 0,
                          }}
                        >
                          <span style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
                            {fmtDate(interaction.date)}
                          </span>
                          <StatusBadge status={interaction.status} />
                          <PriorityDot priority={interaction.priority} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* DETAIL PANEL */}
        {selectedInteraction && (
          <div
            style={{
              width: 400,
              flexShrink: 0,
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 1px 4px var(--pg-card-shadow)",
              borderRadius: 16,
              overflow: "hidden",
              position: "sticky",
              top: 24,
              alignSelf: "flex-start",
              maxHeight: "calc(100vh - 120px)",
              overflowY: "auto",
            }}
          >
            {/* Detail header accent */}
            <div
              className="h-[3px]"
              style={{
                background: CATEGORY_COLORS[selectedInteraction.category] ?? "#6b7280",
              }}
            />

            <div style={{ padding: "16px 20px" }}>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background:
                          (CATEGORY_COLORS[selectedInteraction.category] ?? "#6b7280") + "18",
                        color: CATEGORY_COLORS[selectedInteraction.category] ?? "#6b7280",
                      }}
                    >
                      <CategoryIcon category={selectedInteraction.category} />
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: CATEGORY_COLORS[selectedInteraction.category] ?? "#6b7280",
                      }}
                    >
                      {selectedInteraction.category.replace("_", " ")}
                    </span>
                  </div>
                  <div
                    style={{ fontSize: 15, fontWeight: 700, color: "var(--pg-text-1)" }}
                  >
                    {selectedInteraction.client_name}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedInteraction(null)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--pg-text-3)",
                    padding: 4,
                    borderRadius: 8,
                    display: "flex",
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Subject */}
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--pg-text-1)",
                  marginBottom: 16,
                  lineHeight: 1.4,
                }}
              >
                {selectedInteraction.subject}
              </div>

              {/* Meta info */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 16,
                  padding: "12px 14px",
                  background: "var(--pg-muted-bg)",
                  borderRadius: 10,
                }}
              >
                <div>
                  <div style={labelStyle}>Date</div>
                  <div style={{ fontSize: 13, color: "var(--pg-text-1)" }}>
                    {fmtDate(selectedInteraction.date)}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Channel</div>
                  <ChannelBadge channel={selectedInteraction.channel} />
                </div>
                {selectedInteraction.participants && (
                  <div style={{ gridColumn: "1/-1" }}>
                    <div style={labelStyle}>Participants</div>
                    <div style={{ fontSize: 13, color: "var(--pg-text-1)" }}>
                      {selectedInteraction.participants}
                    </div>
                  </div>
                )}
                <div>
                  <div style={labelStyle}>Status</div>
                  <StatusBadge status={selectedInteraction.status} />
                </div>
                <div>
                  <div style={labelStyle}>Priority</div>
                  <PriorityDot priority={selectedInteraction.priority} />
                </div>
              </div>

              {/* Summary */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--pg-text-3)",
                    marginBottom: 6,
                  }}
                >
                  Summary
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--pg-text-2)",
                    lineHeight: 1.6,
                    background: "var(--pg-muted-bg)",
                    padding: "12px 14px",
                    borderRadius: 10,
                  }}
                >
                  {selectedInteraction.summary}
                </div>
              </div>

              {/* Next Action */}
              {selectedInteraction.next_action && (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fcd34d",
                    borderRadius: 10,
                    padding: "12px 14px",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#92400e",
                      marginBottom: 6,
                    }}
                  >
                    Next Action
                  </div>
                  <div style={{ fontSize: 13, color: "#78350f", fontWeight: 500 }}>
                    {selectedInteraction.next_action}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      marginTop: 8,
                      fontSize: 11,
                      color: "#92400e",
                    }}
                  >
                    {selectedInteraction.action_due && (
                      <span>
                        <Clock size={10} style={{ display: "inline", marginRight: 3 }} />
                        Due {fmtDate(selectedInteraction.action_due)}
                      </span>
                    )}
                    {selectedInteraction.action_owner && (
                      <span>
                        <User size={10} style={{ display: "inline", marginRight: 3 }} />
                        {selectedInteraction.action_owner}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Complaint section */}
              {selectedInteraction.is_complaint && (
                <div
                  style={{
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    borderRadius: 10,
                    padding: "12px 14px",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#991b1b",
                      marginBottom: 6,
                    }}
                  >
                    Complaint Details
                  </div>
                  {selectedInteraction.complaint_severity && (
                    <div style={{ fontSize: 13, color: "#7f1d1d" }}>
                      Severity:{" "}
                      <span style={{ fontWeight: 700, textTransform: "capitalize" }}>
                        {selectedInteraction.complaint_severity}
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#991b1b", marginTop: 4 }}>
                    Escalation status: {selectedInteraction.status === "escalated" ? "Escalated" : "Not escalated"}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {selectedInteraction.attachments_meta && selectedInteraction.attachments_meta.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.08em", color: "var(--pg-text-3)", marginBottom: 8,
                  }}>
                    Attachments ({selectedInteraction.attachments_meta.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selectedInteraction.attachments_meta.map((att) => {
                      const isImage = att.mimeType.startsWith("image/");
                      const isPdf   = att.mimeType === "application/pdf";
                      const icon    = isImage ? "🖼" : isPdf ? "📄" : "📎";
                      const iconBg  = isImage ? "#dbeafe" : isPdf ? "#fee2e2" : "#f1f5f9";
                      const url     = `${BASE}/api/v1/documents/${att.id}/download`;
                      const sizeKb  = (att.size / 1024).toFixed(0);

                      return (
                        <a
                          key={att.id}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: "var(--pg-muted-bg)",
                            border: "1px solid var(--pg-card-border)",
                            textDecoration: "none",
                            transition: "border-color 0.15s",
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "#FF6600"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)"}
                        >
                          {/* File type icon */}
                          <div style={{
                            width: 34, height: 34, borderRadius: 8,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: iconBg, fontSize: 16, flexShrink: 0,
                          }}>
                            {icon}
                          </div>

                          {/* Filename + size */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 12, fontWeight: 600,
                              color: "var(--pg-text-1)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {att.name}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 1 }}>
                              {sizeKb} KB · {isImage ? "Image" : isPdf ? "PDF" : "File"}
                            </div>
                          </div>

                          {/* Open indicator */}
                          <div style={{
                            fontSize: 11, fontWeight: 600, color: "#FF6600",
                            display: "flex", alignItems: "center", gap: 3, flexShrink: 0,
                          }}>
                            Open ↗
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Audit trail */}
              <div
                style={{
                  fontSize: 11,
                  color: "var(--pg-text-4)",
                  marginBottom: 16,
                  padding: "8px 0",
                  borderTop: "1px solid var(--pg-card-border)",
                }}
              >
                Logged by {selectedInteraction.wm_name} · {relTime(selectedInteraction.created_at)}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 600,
                    background: "var(--pg-muted-bg)",
                    color: "var(--pg-text-2)",
                    border: "1px solid var(--pg-card-border)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Edit2 size={13} />
                  Edit
                </button>
                <button
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    background: "linear-gradient(135deg,#059669,#047857)",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <CheckCircle2 size={13} />
                  Mark Resolved
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* LOG INTERACTION MODAL */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowModal(false);
              setForm(defaultForm);
              setAttachments([]);
            }
          }}
        >
          <div
            style={{
              background: "var(--pg-card)",
              borderRadius: 20,
              width: "100%",
              maxWidth: 680,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            {/* Modal header accent */}
            <div className="h-[3px]" style={{ background: "#FF6600" }} />

            <div style={{ padding: "20px 24px" }}>
              {/* Modal header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 16, fontWeight: 700, color: "var(--pg-text-1)" }}
                  >
                    Log Interaction
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 2 }}>
                    Record a new client or prospect interaction
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setForm(defaultForm);
                    setAttachments([]);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--pg-text-3)",
                    padding: 4,
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {/* Row 1: Client + Date */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <label style={labelStyle}>Client *</label>
                    <input
                      type="text"
                      required
                      placeholder="Client name"
                      value={form.client_name}
                      onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Date *</label>
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Row 2: Channel + Category */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <label style={labelStyle}>Channel</label>
                    <select
                      value={form.channel}
                      onChange={(e) => setForm({ ...form, channel: e.target.value as InteractionChannel })}
                      style={inputStyle}
                    >
                      <option value="phone">Phone</option>
                      <option value="email">Email</option>
                      <option value="in_person">In-Person</option>
                      <option value="video">Video</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as InteractionCategory })}
                      style={inputStyle}
                    >
                      <option value="meeting">Meeting</option>
                      <option value="visit">Visit</option>
                      <option value="request">Request</option>
                      <option value="enquiry">Enquiry</option>
                      <option value="concern">Concern</option>
                      <option value="complaint">Complaint</option>
                      <option value="instruction">Instruction</option>
                      <option value="follow_up">Follow-up</option>
                    </select>
                  </div>
                </div>

                {/* Subject */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Subject *</label>
                  <input
                    type="text"
                    required
                    placeholder="Brief subject of the interaction"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                {/* Participants */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Participants (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Client, WM, Relationship Manager"
                    value={form.participants}
                    onChange={(e) => setForm({ ...form, participants: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                {/* Summary */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Summary *</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Detailed notes about the interaction…"
                    value={form.summary}
                    onChange={(e) => setForm({ ...form, summary: e.target.value })}
                    style={{
                      ...inputStyle,
                      height: "auto",
                      padding: "10px 12px",
                      resize: "vertical",
                    }}
                  />
                </div>

                {/* Is Complaint toggle */}
                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      background: "var(--pg-muted-bg)",
                      borderRadius: 10,
                      border: "1px solid var(--pg-card-border)",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        flex: 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={form.is_complaint}
                        onChange={(e) => setForm({ ...form, is_complaint: e.target.checked })}
                        style={{ width: 16, height: 16, accentColor: "#dc2626" }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pg-text-1)" }}>
                        This is a complaint
                      </span>
                    </label>
                    {form.is_complaint && (
                      <select
                        value={form.complaint_severity}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            complaint_severity: e.target.value as FormData["complaint_severity"],
                          })
                        }
                        style={{ ...inputStyle, width: 140, height: 32 }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    )}
                  </div>
                </div>

                {/* Row: Next Action + Action Owner + Action Due */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr",
                    gap: 14,
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <label style={labelStyle}>Next Action</label>
                    <input
                      type="text"
                      placeholder="What needs to happen next?"
                      value={form.next_action}
                      onChange={(e) => setForm({ ...form, next_action: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Action Owner</label>
                    <input
                      type="text"
                      placeholder="WM / Ops"
                      value={form.action_owner}
                      onChange={(e) => setForm({ ...form, action_owner: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Due Date</label>
                    <input
                      type="date"
                      value={form.action_due}
                      onChange={(e) => setForm({ ...form, action_due: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Priority */}
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: e.target.value as InteractionPriority })
                    }
                    style={{ ...inputStyle, maxWidth: 200 }}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                {/* ── Attachments ───────────────────────────────────────────────────── */}
                <div style={{ marginTop: 20, borderTop: "1px solid var(--pg-card-border)", paddingTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pg-text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    Attachments (optional)
                  </div>
                  <p style={{ fontSize: 11, color: "var(--pg-text-3)", marginBottom: 10 }}>
                    Attach screenshots, WhatsApp conversations, emails or supporting documents.
                  </p>

                  {/* Drop zone */}
                  <label
                    htmlFor="attachment-input"
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: 6, padding: "16px 12px", borderRadius: 12, cursor: "pointer",
                      border: "2px dashed var(--pg-card-border)", background: "var(--pg-muted-bg)",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "#FF6600"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)"}
                  >
                    <Paperclip size={18} style={{ color: "var(--pg-text-3)" }} />
                    <span style={{ fontSize: 12, color: "var(--pg-text-3)", textAlign: "center" }}>
                      Drop files here or <span style={{ color: "#FF6600", fontWeight: 600 }}>click to browse</span>
                    </span>
                    <span style={{ fontSize: 10, color: "var(--pg-text-4)" }}>PNG, JPG, PDF, DOCX — max 20 MB each</span>
                  </label>
                  <input
                    id="attachment-input"
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx"
                    style={{ display: "none" }}
                    onChange={e => handleFileSelect(e.target.files)}
                  />

                  {/* Attachment list */}
                  {attachments.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                      {attachments.map(att => (
                        <div key={att.localId} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                          borderRadius: 10, background: "var(--pg-card)", border: "1px solid var(--pg-card-border)",
                        }}>
                          {/* Icon based on mime type */}
                          <div style={{
                            width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                            background: att.mimeType.startsWith("image/") ? "#dbeafe" : att.mimeType === "application/pdf" ? "#fee2e2" : "#f1f5f9",
                            flexShrink: 0,
                          }}>
                            {att.mimeType.startsWith("image/")
                              ? <span style={{ fontSize: 14 }}>🖼</span>
                              : att.mimeType === "application/pdf"
                              ? <span style={{ fontSize: 14 }}>📄</span>
                              : <span style={{ fontSize: 14 }}>📎</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pg-text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {att.name}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--pg-text-3)" }}>
                              {att.uploading
                                ? "Uploading…"
                                : att.error
                                ? <span style={{ color: "#dc2626" }}>{att.error}</span>
                                : `${(att.size / 1024).toFixed(0)} KB · Uploaded`}
                            </div>
                          </div>
                          {att.uploading
                            ? <Loader2 size={14} style={{ color: "var(--pg-text-3)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
                            : <button
                                type="button"
                                onClick={() => setAttachments(prev => prev.filter(a => a.localId !== att.localId))}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, flexShrink: 0 }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fee2e2"}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                              >
                                <X size={14} style={{ color: "#dc2626" }} />
                              </button>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Modal footer buttons */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    paddingTop: 16,
                    borderTop: "1px solid var(--pg-card-border)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setForm(defaultForm);
                      setAttachments([]);
                    }}
                    style={{
                      height: 36,
                      padding: "0 16px",
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      background: "var(--pg-muted-bg)",
                      color: "var(--pg-text-2)",
                      border: "1px solid var(--pg-card-border)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      height: 36,
                      padding: "0 20px",
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      background: "linear-gradient(135deg,#FF6600,#E05500)",
                      border: "none",
                      cursor: submitting ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.7 : 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {submitting && (
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    )}
                    Log Interaction
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
