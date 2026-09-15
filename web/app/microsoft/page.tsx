"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Link2Off, ExternalLink, Send, Plus, ChevronLeft,
  AlertTriangle, RefreshCw, Search, ArrowUp,
} from "lucide-react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { FileAttachmentCard } from "./FileAttachmentCard";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type Status = { connected: boolean; microsoft_email: string; needs_reconnect: boolean };
type MailMessage = {
  id: string; subject: string; bodyPreview: string; conversationId?: string;
  receivedDateTime: string; isRead: boolean; senderName: string; senderEmail: string;
};
type CalendarEvent = {
  id: string; subject: string; start: string; end: string;
  location: string; isOnlineMeeting: boolean; onlineMeetingUrl: string;
};
type TeamsAttachment = { id: string; contentType: string; contentUrl: string; name: string };
type TeamsReaction = { reactionType: string; senderName: string; senderMsId: string };
type TeamsMessage = {
  id: string; chatId: string; body: string; sentAt: string; senderName: string; senderMsId: string;
  attachments?: TeamsAttachment[]; reactions?: TeamsReaction[];
};
type ChatSummary = {
  id: string; chatType: string; topic: string;
  withName: string; withEmail: string; lastMessage: TeamsMessage;
};
type ChatPage = { messages: TeamsMessage[]; nextLink: string };
type Presence = { availability: string; activity: string };
type OrgUser = { id: string; displayName: string; mail: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatEventTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos", weekday: "short", month: "short",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function presenceColor(a: string): string {
  switch (a) {
    case "Available":                  return "#22c55e";
    case "Busy": case "DoNotDisturb": return "#ef4444";
    case "Away": case "BeRightBack":  return "#eab308";
    default:                           return "#6b7280";
  }
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").trim();
}

function encodeId(id: string) { return encodeURIComponent(id); }

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/msgraph${path}`, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(err?.error?.message ?? "Request failed");
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : {};
}

// ── Browser notifications ──────────────────────────────────────────────────────

function useBrowserNotifications() {
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
}

function notify(title: string, body: string, icon = "/outlook-logo.svg") {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  new Notification(title, { body: body.slice(0, 100), icon });
}

// ── Unread badge hook ──────────────────────────────────────────────────────────

function useUnreadCount(connected: boolean) {
  return useQuery({
    queryKey: ["msgraph-unread"],
    queryFn: () => api("/unread-count") as Promise<{ emails: number }>,
    enabled: connected,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// ── Panel shell ────────────────────────────────────────────────────────────────

function Panel({ logo, title, action, children, loading, badge }: {
  logo: string; title: string; action?: React.ReactNode;
  children: React.ReactNode; loading?: boolean; badge?: number;
}) {
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5"
           style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div className="relative shrink-0">
          <Image src={logo} alt={title} width={18} height={18} />
          {!!badge && badge > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                  style={{ background: "#ef4444" }}>
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
        <span className="text-[13px] font-bold flex-1" style={{ color: "var(--pg-text-1)" }}>{title}</span>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--pg-text-4)" }} />}
        {action}
      </div>
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 480 }}>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-center py-10 text-[12px]" style={{ color: "var(--pg-text-3)" }}>{text}</p>;
}

// ── Mail panel ─────────────────────────────────────────────────────────────────

function MailPanel({ unreadCount }: { unreadCount?: number }) {
  const { toast } = useToast();
  const prevMailRef = useRef<string[]>([]);
  const [view, setView] = useState<"inbox" | "thread" | "compose">("inbox");
  const [selectedMail, setSelectedMail] = useState<MailMessage | null>(null);
  const [replyMode, setReplyMode] = useState<"reply" | "replyAll" | null>(null);
  const [replyText, setReplyText] = useState("");
  const [compose, setCompose] = useState({ to: "", subject: "", body: "" });
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["msgraph-mail"],
    queryFn: () => api("/mail") as Promise<{ messages: MailMessage[] }>,
    staleTime: 60_000, refetchInterval: 120_000,
  });

  // Notify on new emails
  useEffect(() => {
    const ids = (data?.messages ?? []).map(m => m.id);
    const prev = prevMailRef.current;
    if (prev.length > 0) {
      const newMsgs = (data?.messages ?? []).filter(m => !prev.includes(m.id));
      newMsgs.forEach(m => notify(`New email from ${m.senderName}`, m.subject, "/outlook-logo.svg"));
    }
    prevMailRef.current = ids;
  }, [data]);

  const { data: threadData, isLoading: threadLoading } = useQuery({
    queryKey: ["msgraph-thread", selectedMail?.conversationId],
    queryFn: () => api(`/mail/thread/${selectedMail!.conversationId}`) as Promise<{ messages: MailMessage[] }>,
    enabled: !!selectedMail?.conversationId && view === "thread",
    staleTime: 120_000,
  });

  const { data: bodyData } = useQuery({
    queryKey: ["msgraph-mail-body", selectedMail?.id],
    queryFn: () => api(`/mail/${selectedMail!.id}`) as Promise<{ body: string }>,
    enabled: !!selectedMail && view === "thread",
    staleTime: 300_000,
  });

  async function sendReply() {
    if (!selectedMail || !replyText.trim()) return;
    setSending(true);
    try {
      await api(`/mail/${selectedMail.id}/${replyMode === "replyAll" ? "reply-all" : "reply"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: replyText }),
      });
      toast({ title: "Reply sent" });
      setReplyText(""); setReplyMode(null);
    } catch (e) {
      toast({ title: "Failed to send", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  }

  async function sendCompose() {
    if (!compose.to || !compose.subject) return;
    setSending(true);
    try {
      await api("/mail/compose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(compose),
      });
      toast({ title: "Email sent" });
      setCompose({ to: "", subject: "", body: "" }); setView("inbox");
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  }

  const messages = data?.messages ?? [];
  const thread = threadData?.messages ?? [];

  const composeBtn = (
    <button onClick={() => setView("compose")}
            className="flex items-center gap-1 h-6 px-2 rounded-lg text-[11px] font-semibold"
            style={{ background: "var(--pg-accent)", color: "white" }}>
      <Plus className="w-3 h-3" /> Compose
    </button>
  );

  // ── Compose view ──
  if (view === "compose") return (
    <Panel logo="/outlook-logo.svg" title="New Email" badge={unreadCount}
           action={<button onClick={() => setView("inbox")} className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>Cancel</button>}>
      <div className="p-4 space-y-2">
        <input value={compose.to} onChange={e => setCompose(p => ({ ...p, to: e.target.value }))}
               placeholder="To (email address)" className="w-full px-3 py-2 text-[12px] rounded-lg outline-none"
               style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
        <input value={compose.subject} onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))}
               placeholder="Subject" className="w-full px-3 py-2 text-[12px] rounded-lg outline-none"
               style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
        <textarea value={compose.body} onChange={e => setCompose(p => ({ ...p, body: e.target.value }))}
                  placeholder="Write your message…" rows={8} className="w-full px-3 py-2 text-[12px] rounded-lg outline-none resize-none"
                  style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
        <button onClick={sendCompose} disabled={sending || !compose.to || !compose.subject}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold text-white"
                style={{ background: "#0078d4", opacity: sending ? 0.6 : 1 }}>
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send
        </button>
      </div>
    </Panel>
  );

  // ── Thread view ──
  if (view === "thread" && selectedMail) return (
    <Panel logo="/outlook-logo.svg" title={selectedMail.subject} badge={unreadCount}
           loading={threadLoading}
           action={<button onClick={() => { setView("inbox"); setSelectedMail(null); setReplyMode(null); setReplyText(""); }}
                           className="flex items-center gap-1 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                     <ChevronLeft className="w-3 h-3" /> Inbox
                   </button>}>
      <div className="flex flex-col h-full">
        {/* Thread messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {thread.length > 0
            ? thread.map((msg, i) => (
                <div key={msg.id} className="rounded-xl p-3"
                     style={{ background: i === thread.length - 1 ? "var(--pg-muted-bg)" : "transparent",
                              border: "1px solid var(--pg-card-border)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                      {msg.senderName}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>
                      {relativeTime(msg.receivedDateTime)}
                    </span>
                  </div>
                  <p className="text-[12px]" style={{ color: "var(--pg-text-2)", lineHeight: 1.6 }}>
                    {i === thread.length - 1 && bodyData?.body
                      ? <span dangerouslySetInnerHTML={{ __html: bodyData.body }} />
                      : msg.bodyPreview}
                  </p>
                </div>
              ))
            : <div className="rounded-xl p-3" style={{ border: "1px solid var(--pg-card-border)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{selectedMail.senderName}</span>
                  <span className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>{relativeTime(selectedMail.receivedDateTime)}</span>
                </div>
                {bodyData?.body
                  ? <div className="text-[12px]" style={{ color: "var(--pg-text-2)", lineHeight: 1.6 }}
                         dangerouslySetInnerHTML={{ __html: bodyData.body }} />
                  : <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{selectedMail.bodyPreview}</p>}
              </div>
          }
        </div>

        {/* Reply form */}
        <div className="p-4 space-y-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
          {!replyMode
            ? <div className="flex gap-2">
                <button onClick={() => setReplyMode("reply")} className="h-7 px-4 rounded-lg text-[12px] font-medium text-white"
                        style={{ background: "#0078d4" }}>Reply</button>
                <button onClick={() => setReplyMode("replyAll")} className="h-7 px-4 rounded-lg text-[12px] font-medium"
                        style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Reply All</button>
              </div>
            : <>
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                          placeholder={replyMode === "replyAll" ? "Reply to all…" : "Write your reply…"}
                          rows={3} className="w-full px-3 py-2 text-[12px] rounded-lg outline-none resize-none"
                          style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
                <div className="flex gap-2">
                  <button onClick={sendReply} disabled={sending || !replyText.trim()}
                          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold text-white"
                          style={{ background: "#0078d4", opacity: (sending || !replyText.trim()) ? 0.6 : 1 }}>
                    {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send
                  </button>
                  <button onClick={() => { setReplyMode(null); setReplyText(""); }}
                          className="h-7 px-3 rounded-lg text-[12px]"
                          style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
                </div>
              </>
          }
        </div>
      </div>
    </Panel>
  );

  // ── Inbox view ──
  return (
    <Panel logo="/outlook-logo.svg" title="Outlook Mail" loading={isLoading} action={composeBtn} badge={unreadCount}>
      {messages.length === 0 && !isLoading
        ? <EmptyState text="Inbox is empty" />
        : messages.map(m => (
          <div key={m.id} className="px-5 py-3 cursor-pointer transition-colors"
               style={{ borderBottom: "1px solid var(--pg-row-border)" }}
               onClick={() => { setSelectedMail(m); setView("thread"); }}
               onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
               onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[12px] truncate max-w-[200px] ${!m.isRead ? "font-bold" : "font-medium"}`}
                    style={{ color: "var(--pg-text-1)" }}>
                {m.senderName || m.senderEmail}
              </span>
              <span className="text-[10px] shrink-0" style={{ color: "var(--pg-text-3)" }}>
                {relativeTime(m.receivedDateTime)}
              </span>
            </div>
            <p className={`text-[11px] truncate mt-0.5 ${!m.isRead ? "font-semibold" : ""}`}
               style={{ color: "var(--pg-text-2)" }}>{m.subject}</p>
            <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              {m.bodyPreview?.slice(0, 80)}
            </p>
          </div>
        ))
      }
    </Panel>
  );
}

// ── Calendar panel ─────────────────────────────────────────────────────────────

function CalendarPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: "", date: "", startTime: "09:00", endTime: "10:00", location: "", isOnline: false, attendees: "" });
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["msgraph-calendar"],
    queryFn: () => api("/calendar") as Promise<{ events: CalendarEvent[] }>,
    staleTime: 60_000, refetchInterval: 120_000,
  });

  async function createEvent() {
    if (!form.subject || !form.date) return;
    setSaving(true);
    try {
      await api("/calendar/events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.subject, body: "",
          start: `${form.date}T${form.startTime}:00`, end: `${form.date}T${form.endTime}:00`,
          timeZone: "Africa/Lagos", location: form.location, isOnline: form.isOnline,
          attendees: form.attendees.split(",").map(s => s.trim()).filter(Boolean),
        }),
      });
      toast({ title: "Event created", description: form.subject });
      setForm({ subject: "", date: "", startTime: "09:00", endTime: "10:00", location: "", isOnline: false, attendees: "" });
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["msgraph-calendar"] });
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  const events = data?.events ?? [];
  const newBtn = (
    <button onClick={() => setCreating(v => !v)}
            className="flex items-center gap-1 h-6 px-2 rounded-lg text-[11px] font-semibold"
            style={{ background: "var(--pg-accent)", color: "white" }}>
      <Plus className="w-3 h-3" /> New
    </button>
  );

  return (
    <Panel logo="/calendar-logo.svg" title="Outlook Calendar" loading={isLoading} action={newBtn}>
      {creating && (
        <div className="p-4 space-y-2" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                 placeholder="Event title" className="w-full px-3 py-1.5 text-[12px] rounded-lg outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <div className="flex gap-2 flex-wrap">
            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                   className="flex-1 min-w-0 px-3 py-1.5 text-[12px] rounded-lg outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
            <input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                   className="w-24 px-2 py-1.5 text-[12px] rounded-lg outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
            <span className="text-[12px] self-center" style={{ color: "var(--pg-text-3)" }}>–</span>
            <input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
                   className="w-24 px-2 py-1.5 text-[12px] rounded-lg outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          </div>
          <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                 placeholder="Location (optional)" className="w-full px-3 py-1.5 text-[12px] rounded-lg outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <input value={form.attendees} onChange={e => setForm(p => ({ ...p, attendees: e.target.value }))}
                 placeholder="Invite people (emails, comma-separated)" className="w-full px-3 py-1.5 text-[12px] rounded-lg outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: "var(--pg-text-2)" }}>
            <input type="checkbox" checked={form.isOnline} onChange={e => setForm(p => ({ ...p, isOnline: e.target.checked }))} />
            Make it a Teams meeting
          </label>
          <div className="flex gap-2">
            <button onClick={createEvent} disabled={saving || !form.subject || !form.date}
                    className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold text-white"
                    style={{ background: "#0078d4", opacity: (saving || !form.subject || !form.date) ? 0.6 : 1 }}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Create
            </button>
            <button onClick={() => setCreating(false)} className="h-7 px-3 rounded-lg text-[12px]"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
          </div>
        </div>
      )}
      {events.length === 0 && !isLoading
        ? <EmptyState text="No upcoming events" />
        : events.map(e => (
          <div key={e.id} className="px-5 py-3 transition-colors"
               style={{ borderBottom: "1px solid var(--pg-row-border)" }}
               onMouseEnter={el => (el.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
               onMouseLeave={el => (el.currentTarget as HTMLElement).style.background = ""}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>{e.subject}</p>
              {e.isOnlineMeeting && e.onlineMeetingUrl && (
                <a href={e.onlineMeetingUrl} target="_blank" rel="noreferrer" title="Join" className="shrink-0">
                  <ExternalLink className="w-3 h-3" style={{ color: "var(--pg-accent)" }} />
                </a>
              )}
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-2)" }}>{formatEventTime(e.start)}</p>
            {e.location && <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-3)" }}>{e.location}</p>}
          </div>
        ))
      }
    </Panel>
  );
}

// ── Presence panel ─────────────────────────────────────────────────────────────

function PresencePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["msgraph-presence"],
    queryFn: () => api("/presence") as Promise<Presence>,
    staleTime: 30_000, refetchInterval: 60_000,
  });
  return (
    <Panel logo="/teams-logo.svg" title="Teams Presence" loading={isLoading}>
      {data ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-6 h-6 rounded-full" style={{ background: presenceColor(data.availability) }} />
          <p className="text-[16px] font-bold" style={{ color: "var(--pg-text-1)" }}>{data.availability}</p>
          <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>{data.activity}</p>
        </div>
      ) : !isLoading ? <EmptyState text="Presence unavailable" /> : null}
    </Panel>
  );
}

// ── Teams Chat panel ───────────────────────────────────────────────────────────

function TeamsPanel() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevChatsRef = useRef<string[]>([]);

  const [selectedChat, setSelectedChat] = useState<ChatSummary | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [chatLimit, setChatLimit] = useState(20);
  const [olderNextLink, setOlderNextLink] = useState<string | null>(null);
  const [olderMessages, setOlderMessages] = useState<TeamsMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [startingChat, setStartingChat] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: chatsData, isLoading } = useQuery({
    queryKey: ["msgraph-teams", chatLimit],
    queryFn: () => api(`/teams/chats?top=${chatLimit}`) as Promise<{ chats: ChatSummary[] }>,
    staleTime: 60_000, refetchInterval: 120_000,
  });

  // Notify on new chats
  useEffect(() => {
    const ids = (chatsData?.chats ?? []).map(c => c.id);
    const prev = prevChatsRef.current;
    if (prev.length > 0) {
      const newChats = (chatsData?.chats ?? []).filter(c => !prev.includes(c.id));
      newChats.forEach(c => notify(
        `New message from ${c.lastMessage.senderName || c.withName}`,
        stripHtml(c.lastMessage.body), "/teams-logo.svg"
      ));
    }
    prevChatsRef.current = ids;
  }, [chatsData]);

  const { data: pageData, isLoading: pageLoading } = useQuery({
    queryKey: ["msgraph-chat-page", selectedChat?.id],
    queryFn: async () => {
      const page = await api(`/teams/${encodeId(selectedChat!.id)}/page?top=50`) as ChatPage;
      setOlderNextLink(page.nextLink || null);
      setOlderMessages([]);
      return page;
    },
    enabled: !!selectedChat,
    staleTime: 30_000,
  });

  const { data: searchData } = useQuery({
    queryKey: ["msgraph-user-search", debouncedQuery],
    queryFn: () => api(`/users/search?q=${encodeURIComponent(debouncedQuery)}`) as Promise<{ users: OrgUser[] }>,
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (pageData) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [pageData]);

  async function loadOlderMessages() {
    if (!selectedChat || !olderNextLink) return;
    setLoadingOlder(true);
    try {
      const page = await api(`/teams/${encodeId(selectedChat.id)}/page?nextLink=${encodeURIComponent(olderNextLink)}`) as ChatPage;
      setOlderMessages(prev => [...page.messages, ...prev]);
      setOlderNextLink(page.nextLink || null);
    } catch (e) {
      toast({ title: "Could not load older messages", variant: "destructive" });
    } finally { setLoadingOlder(false); }
  }

  async function sendMessage() {
    if (!selectedChat || !message.trim()) return;
    setSending(true);
    try {
      await api(`/teams/${encodeId(selectedChat.id)}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["msgraph-chat-page", selectedChat.id] });
    } catch (e) {
      toast({ title: "Failed to send", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  }

  async function startChat(person: OrgUser) {
    setStartingChat(person.id);
    try {
      const { chat_id } = await api("/teams/new-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_ms_id: person.id }),
      }) as { chat_id: string };
      setSearchQuery(""); setDebouncedQuery("");
      const newChat: ChatSummary = {
        id: chat_id, chatType: "oneOnOne", topic: "",
        withName: person.displayName, withEmail: person.mail,
        lastMessage: { id: "", chatId: chat_id, body: "", sentAt: "", senderName: "", senderMsId: "" },
      };
      setSelectedChat(newChat);
      queryClient.invalidateQueries({ queryKey: ["msgraph-teams"] });
    } catch (e) {
      toast({ title: "Could not start chat", description: (e as Error).message, variant: "destructive" });
    } finally { setStartingChat(null); }
  }

  const chats = chatsData?.chats ?? [];
  const currentMessages = [...olderMessages, ...(pageData?.messages ?? [])];
  const searchResults = searchData?.users ?? [];

  const newChatBtn = (
    <button onClick={() => { setSearchQuery(""); document.getElementById("teams-search")?.focus(); }}
            className="flex items-center gap-1 h-6 px-2 rounded-lg text-[11px] font-semibold"
            style={{ background: "var(--pg-accent)", color: "white" }}>
      <Plus className="w-3 h-3" /> New
    </button>
  );

  // ── Chat thread view ──
  if (selectedChat) return (
    <Panel logo="/teams-logo.svg" title={selectedChat.withName || selectedChat.topic || "Chat"}
           action={<button onClick={() => { setSelectedChat(null); setOlderMessages([]); setOlderNextLink(null); }}
                           className="flex items-center gap-1 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                     <ChevronLeft className="w-3 h-3" /> Chats
                   </button>}>
      <div className="flex flex-col h-full" style={{ height: 420 }}>
        {/* Load older button */}
        {olderNextLink && (
          <button onClick={loadOlderMessages} disabled={loadingOlder}
                  className="mx-auto my-2 flex items-center gap-1.5 h-6 px-3 rounded-full text-[11px]"
                  style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
            {loadingOlder ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUp className="w-3 h-3" />}
            Load older messages
          </button>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
          {pageLoading && currentMessages.length === 0
            ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
            : currentMessages.length === 0
              ? <EmptyState text="No messages yet. Say hello!" />
              : currentMessages.map(msg => {
                  const isMe = msg.senderName === user?.DisplayName;
                  const text = stripHtml(msg.body);
                  const isDeleted = text === "" && (msg.attachments ?? []).length === 0;
                  // Group reactions by type
                  const reactionMap: Record<string, { count: number; iMine: boolean }> = {};
                  (msg.reactions ?? []).forEach(r => {
                    if (!reactionMap[r.reactionType]) reactionMap[r.reactionType] = { count: 0, iMine: false };
                    reactionMap[r.reactionType].count++;
                    if (r.senderName === user?.DisplayName) reactionMap[r.reactionType].iMine = true;
                  });
                  const REACTION_EMOJIS: Record<string, string> = {
                    like: "👍", heart: "❤️", laugh: "😂", surprised: "😮", sad: "😢", angry: "😠",
                  };
                  return (
                    <div key={msg.id} className={`flex flex-col group ${isMe ? "items-end" : "items-start"}`}>
                      {!isMe && <span className="text-[10px] mb-0.5 ml-1" style={{ color: "var(--pg-text-3)" }}>{msg.senderName}</span>}

                      {/* Bubble + action row */}
                      <div className={`flex items-end gap-1.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                        {/* Message bubble */}
                        <div className="max-w-[72%] rounded-2xl text-[12px] leading-relaxed overflow-hidden"
                             style={{
                               background: isDeleted ? "transparent" : isMe ? "#5059C9" : "var(--pg-card)",
                               color: isDeleted ? "var(--pg-text-4)" : isMe ? "white" : "var(--pg-text-1)",
                               border: isDeleted ? "1px dashed var(--pg-card-border)" : isMe ? "none" : "1px solid var(--pg-card-border)",
                               borderBottomRightRadius: isMe ? 4 : undefined,
                               borderBottomLeftRadius: isMe ? undefined : 4,
                             }}>
                          {isDeleted
                            ? <p className="px-3 py-2 italic text-[11px]">This message was deleted</p>
                            : <>
                                {text && <p className="px-3 py-2 whitespace-pre-wrap">{text}</p>}
                                {/* File attachment cards */}
                                {(msg.attachments ?? []).filter(a => a.name && a.contentUrl).length > 0 && (
                                  <div className={`flex flex-wrap gap-2 px-2 py-2 ${text ? "border-t" : ""}`}
                                       style={{ borderColor: isMe ? "rgba(255,255,255,0.12)" : "var(--pg-row-border)" }}>
                                    {(msg.attachments ?? []).filter(a => a.name && a.contentUrl).map(att => (
                                      <FileAttachmentCard key={att.id} attachment={att} isMe={isMe} />
                                    ))}
                                  </div>
                                )}
                              </>
                          }
                        </div>

                        {/* Hover actions */}
                        {!isDeleted && (
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mb-1">
                            {/* Reaction picker */}
                            {["like","heart","laugh","surprised","sad","angry"].map(rt => (
                              <button key={rt} title={rt}
                                      onClick={() => api(`/teams/${encodeId(msg.chatId)}/messages/${encodeId(msg.id)}/${reactionMap[rt]?.iMine ? "unreact" : "react"}`, {
                                        method: "POST", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ reactionType: rt }),
                                      }).then(() => queryClient.invalidateQueries({ queryKey: ["msgraph-chat-page", selectedChat?.id] }))
                                        .catch(() => {})}
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] transition-transform hover:scale-125"
                                      style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                                {REACTION_EMOJIS[rt]}
                              </button>
                            ))}
                            {/* Delete (own messages only) */}
                            {isMe && (
                              <button title="Delete message"
                                      onClick={() => api(`/teams/${encodeId(msg.chatId)}/messages/${encodeId(msg.id)}`, { method: "DELETE" })
                                        .then(() => queryClient.invalidateQueries({ queryKey: ["msgraph-chat-page", selectedChat?.id] }))
                                        .catch(() => {})}
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] transition-transform hover:scale-110"
                                      style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "#ef4444" }}>
                                🗑
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Reaction counts below bubble */}
                      {Object.keys(reactionMap).length > 0 && (
                        <div className="flex items-center gap-1 mt-0.5 mx-1 flex-wrap">
                          {Object.entries(reactionMap).map(([rt, { count, iMine }]) => (
                            <button key={rt}
                                    onClick={() => api(`/teams/${encodeId(msg.chatId)}/messages/${encodeId(msg.id)}/${iMine ? "unreact" : "react"}`, {
                                      method: "POST", headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ reactionType: rt }),
                                    }).then(() => queryClient.invalidateQueries({ queryKey: ["msgraph-chat-page", selectedChat?.id] }))
                                      .catch(() => {})}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px]"
                                    style={{
                                      background: iMine ? "rgba(80,89,201,0.15)" : "var(--pg-muted-bg)",
                                      border: `1px solid ${iMine ? "#5059C9" : "var(--pg-card-border)"}`,
                                    }}>
                              <span>{REACTION_EMOJIS[rt]}</span>
                              <span style={{ color: "var(--pg-text-2)" }}>{count}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <span className="text-[9px] mt-0.5 mx-1" style={{ color: "var(--pg-text-4)" }}>
                        {relativeTime(msg.sentAt)}
                      </span>
                    </div>
                  );
                })
          }
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
          <input value={message} onChange={e => setMessage(e.target.value)}
                 onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                 placeholder={`Message ${selectedChat.withName || "this chat"}…`}
                 className="flex-1 px-3 py-2 text-[12px] rounded-xl outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <button onClick={sendMessage} disabled={sending || !message.trim()}
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "#5059C9", opacity: (sending || !message.trim()) ? 0.4 : 1 }}>
            {sending ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Send className="w-3.5 h-3.5 text-white" />}
          </button>
        </div>
      </div>
    </Panel>
  );

  // ── Chat list view ──
  return (
    <Panel logo="/teams-logo.svg" title="Teams Chat" loading={isLoading} action={newChatBtn}>
      {/* Search */}
      <div className="px-4 pt-3 pb-2" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />
          <input id="teams-search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                 placeholder="Search or start a new chat…"
                 className="w-full pl-8 pr-3 py-1.5 text-[12px] rounded-lg outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
        </div>
        {debouncedQuery.length >= 2 && (
          <div className="mt-1 rounded-lg overflow-hidden" style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
            {searchResults.length === 0
              ? <p className="px-3 py-2 text-[11px]" style={{ color: "var(--pg-text-3)" }}>No people found</p>
              : searchResults.map(person => (
                <div key={person.id} className="flex items-center justify-between px-3 py-2 gap-2"
                     style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{person.displayName}</p>
                    <p className="text-[10px] truncate" style={{ color: "var(--pg-text-3)" }}>{person.mail}</p>
                  </div>
                  <button onClick={() => startChat(person)} disabled={startingChat === person.id}
                          className="flex items-center gap-1 h-6 px-2.5 rounded-lg text-[11px] font-semibold shrink-0"
                          style={{ background: "#5059C9", color: "white", opacity: startingChat === person.id ? 0.6 : 1 }}>
                    {startingChat === person.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Chat
                  </button>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* Chat list */}
      {chats.length === 0 && !isLoading
        ? <EmptyState text="No chats yet. Search a colleague above." />
        : <>
          {chats.map(chat => (
            <div key={chat.id} className="px-4 py-3 cursor-pointer flex items-center gap-3 transition-colors"
                 style={{ borderBottom: "1px solid var(--pg-row-border)" }}
                 onClick={() => setSelectedChat(chat)}
                 onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                 onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[13px] font-bold text-white"
                   style={{ background: "#5059C9" }}>
                {(chat.withName || chat.topic || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>
                    {chat.withName || chat.topic || "Unknown"}
                  </span>
                  <span className="text-[10px] shrink-0" style={{ color: "var(--pg-text-3)" }}>
                    {relativeTime(chat.lastMessage?.sentAt)}
                  </span>
                </div>
                <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-2)" }}>
                  {stripHtml(chat.lastMessage?.body || "").slice(0, 60) || "No messages yet"}
                </p>
              </div>
            </div>
          ))}
          {chats.length >= chatLimit && (
            <button onClick={() => setChatLimit(l => l + 20)}
                    className="w-full py-3 text-[12px] font-medium transition-colors"
                    style={{ color: "var(--pg-text-3)", borderTop: "1px solid var(--pg-row-border)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              Load more chats
            </button>
          )}
        </>
      }
    </Panel>
  );
}

// ── Connect prompt ─────────────────────────────────────────────────────────────

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <Image src="/microsoft-logo.svg" alt="Microsoft 365" width={64} height={64} />
      <div className="text-center max-w-sm">
        <h2 className="text-[18px] font-bold mb-2" style={{ color: "var(--pg-text-1)" }}>Connect Microsoft 365</h2>
        <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
          Link your account to reply to emails, send Teams messages, and create calendar events.
        </p>
      </div>
      <button onClick={() => { window.location.href = `${BASE}/api/v1/msgraph/connect`; }}
              className="flex items-center gap-3 h-11 px-5 rounded-lg text-[13px] font-semibold hover:opacity-90 transition-opacity"
              style={{ background: "#fff", border: "1px solid #8c8c8c", color: "#5e5e5e", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
        <Image src="/microsoft-logo.svg" alt="" width={18} height={18} />
        Sign in with Microsoft
      </button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function MicrosoftPageInner() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [toastShown, setToastShown] = useState(false);

  useBrowserNotifications();

  const { data: statusData, isLoading: statusLoading } = useQuery<Status>({
    queryKey: ["msgraph-status"],
    queryFn: () => api("/status") as Promise<Status>,
  });

  const { data: unreadData } = useUnreadCount(statusData?.connected ?? false);

  const disconnectMutation = useMutation({
    mutationFn: () => api("/disconnect", { method: "POST" }),
    onSuccess: () => {
      ["msgraph-status","msgraph-mail","msgraph-calendar","msgraph-teams","msgraph-presence","msgraph-unread"]
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast({ title: "Disconnected" });
    },
    onError: () => toast({ title: "Error", description: "Could not disconnect.", variant: "destructive" }),
  });

  useEffect(() => {
    if (toastShown) return;
    if (searchParams.get("connected") === "1") { toast({ title: "Connected!", description: "Microsoft 365 is now linked." }); setToastShown(true); }
    else if (searchParams.get("error") === "auth_failed") { toast({ title: "Connection failed", variant: "destructive" }); setToastShown(true); }
  }, [searchParams, toast, toastShown]);

  if (statusLoading) return (
    <div className="flex h-[70vh] items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-4)" }} />
    </div>
  );

  if (!statusData?.connected) return <ConnectPrompt />;

  const unreadEmails = unreadData?.emails ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Image src="/microsoft-logo.svg" alt="Microsoft 365" width={28} height={28} />
            {unreadEmails > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                    style={{ background: "#ef4444" }}>
                {unreadEmails > 99 ? "99+" : unreadEmails}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>Microsoft 365</h1>
            <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              {statusData.microsoft_email}
              {unreadEmails > 0 && <span className="ml-2 font-medium" style={{ color: "#ef4444" }}>{unreadEmails} unread</span>}
            </p>
          </div>
        </div>
        <button onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium"
                style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
          {disconnectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />}
          Disconnect
        </button>
      </div>

      {/* Reconnect banner */}
      {statusData.needs_reconnect && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
             style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#ca8a04" }} />
          <p className="text-[12px] flex-1" style={{ color: "#92400e" }}>
            New permissions required to reply to emails and send Teams messages.
          </p>
          <button onClick={() => { window.location.href = `${BASE}/api/v1/msgraph/connect`; }}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold shrink-0"
                  style={{ background: "#ca8a04", color: "white" }}>
            <RefreshCw className="w-3 h-3" /> Reconnect
          </button>
        </div>
      )}

      {/* 2×2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MailPanel unreadCount={unreadEmails} />
        <CalendarPanel />
        <PresencePanel />
        <TeamsPanel />
      </div>
    </div>
  );
}

export default function MicrosoftPage() {
  return (
    <Suspense>
      <MicrosoftPageInner />
    </Suspense>
  );
}
