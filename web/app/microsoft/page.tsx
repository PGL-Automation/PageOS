"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wifi, Loader2, Link2, Link2Off, ExternalLink,
  Send, X, Plus, ChevronDown, ChevronUp, AlertTriangle, RefreshCw,
} from "lucide-react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type Status = { connected: boolean; microsoft_email: string; needs_reconnect: boolean };

type MailMessage = {
  id: string; subject: string; bodyPreview: string;
  receivedDateTime: string; isRead: boolean;
  senderName: string; senderEmail: string;
};

type CalendarEvent = {
  id: string; subject: string; start: string; end: string;
  location: string; isOnlineMeeting: boolean; onlineMeetingUrl: string;
};

type TeamsMessage = {
  id: string; chatId: string; body: string; sentAt: string; senderName: string;
};

type Presence = { availability: string; activity: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
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
    timeZone: "Africa/Lagos", weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function presenceColor(a: string): string {
  switch (a) {
    case "Available":                return "#22c55e";
    case "Busy": case "DoNotDisturb": return "#ef4444";
    case "Away": case "BeRightBack":  return "#eab308";
    default:                          return "#6b7280";
  }
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/msgraph${path}`, {
    credentials: "include", ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(err?.error?.message ?? "Request failed");
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : {};
}

// ── Panel shell ────────────────────────────────────────────────────────────────

function Panel({ logo, title, action, children, loading }: {
  logo: string; title: string; action?: React.ReactNode;
  children: React.ReactNode; loading?: boolean;
}) {
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5"
           style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <Image src={logo} alt={title} width={18} height={18} />
        <span className="text-[13px] font-bold flex-1" style={{ color: "var(--pg-text-1)" }}>{title}</span>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--pg-text-4)" }} />}
        {action}
      </div>
      <div className="flex-1 overflow-y-auto max-h-[420px]">
        {children}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-center py-8 text-[12px]" style={{ color: "var(--pg-text-3)" }}>{text}</p>;
}

// ── Mail panel ─────────────────────────────────────────────────────────────────

function MailPanel() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [replyMode, setReplyMode] = useState<"reply" | "replyAll" | null>(null);
  const [replyText, setReplyText] = useState("");
  const [composing, setComposing] = useState(false);
  const [compose, setCompose] = useState({ to: "", subject: "", body: "" });
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["msgraph-mail"],
    queryFn: () => api("/mail") as Promise<{ messages: MailMessage[] }>,
    staleTime: 60_000, refetchInterval: 120_000,
  });

  const { data: bodyData, isLoading: bodyLoading } = useQuery({
    queryKey: ["msgraph-mail-body", expanded],
    queryFn: () => api(`/mail/${expanded}`) as Promise<{ body: string }>,
    enabled: !!expanded,
    staleTime: 300_000,
  });

  async function sendReply(messageId: string) {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const endpoint = replyMode === "replyAll"
        ? `/mail/${messageId}/reply-all`
        : `/mail/${messageId}/reply`;
      await api(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(compose),
      });
      toast({ title: "Email sent" });
      setCompose({ to: "", subject: "", body: "" }); setComposing(false);
    } catch (e) {
      toast({ title: "Failed to send", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  }

  const messages = data?.messages ?? [];
  const composeBtn = (
    <button onClick={() => setComposing(v => !v)}
            className="flex items-center gap-1 h-6 px-2 rounded-lg text-[11px] font-semibold"
            style={{ background: "var(--pg-accent)", color: "white" }}>
      <Plus className="w-3 h-3" /> Compose
    </button>
  );

  return (
    <Panel logo="/outlook-logo.svg" title="Outlook Mail" loading={isLoading} action={composeBtn}>
      {/* Compose form */}
      {composing && (
        <div className="p-4 space-y-2" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <input value={compose.to} onChange={e => setCompose(p => ({ ...p, to: e.target.value }))}
                 placeholder="To (email)" className="w-full px-3 py-1.5 text-[12px] rounded-lg outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <input value={compose.subject} onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))}
                 placeholder="Subject" className="w-full px-3 py-1.5 text-[12px] rounded-lg outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <textarea value={compose.body} onChange={e => setCompose(p => ({ ...p, body: e.target.value }))}
                    placeholder="Message…" rows={4}
                    className="w-full px-3 py-1.5 text-[12px] rounded-lg outline-none resize-none"
                    style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <div className="flex gap-2">
            <button onClick={sendCompose} disabled={sending}
                    className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold text-white"
                    style={{ background: "#0078d4", opacity: sending ? 0.6 : 1 }}>
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send
            </button>
            <button onClick={() => setComposing(false)} className="h-7 px-3 rounded-lg text-[12px]"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {messages.length === 0 && !isLoading
        ? <EmptyState text="No messages" />
        : messages.map(m => (
          <div key={m.id}>
            {/* Email row */}
            <div className="px-5 py-3 cursor-pointer transition-colors"
                 style={{ borderBottom: "1px solid var(--pg-row-border)" }}
                 onClick={() => { setExpanded(expanded === m.id ? null : m.id); setReplyMode(null); setReplyText(""); }}
                 onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                 onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[12px] truncate max-w-[180px] ${!m.isRead ? "font-bold" : "font-medium"}`}
                      style={{ color: "var(--pg-text-1)" }}>
                  {m.senderName || m.senderEmail}
                </span>
                <span className="text-[10px] shrink-0 flex items-center gap-1" style={{ color: "var(--pg-text-3)" }}>
                  {relativeTime(m.receivedDateTime)}
                  {expanded === m.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </span>
              </div>
              <p className={`text-[11px] truncate mt-0.5 ${!m.isRead ? "font-semibold" : ""}`}
                 style={{ color: "var(--pg-text-2)" }}>{m.subject}</p>
              {expanded !== m.id && (
                <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                  {m.bodyPreview?.slice(0, 80)}
                </p>
              )}
            </div>

            {/* Expanded email body + reply */}
            {expanded === m.id && (
              <div className="px-5 py-4 space-y-3" style={{ background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)" }}>
                {bodyLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pg-text-4)" }} />
                  : <div className="text-[12px] max-h-40 overflow-y-auto" style={{ color: "var(--pg-text-2)" }}
                         dangerouslySetInnerHTML={{ __html: bodyData?.body ?? m.bodyPreview ?? "" }} />
                }
                {/* Action buttons */}
                {!replyMode && (
                  <div className="flex gap-2">
                    <button onClick={() => setReplyMode("reply")}
                            className="h-6 px-3 rounded-lg text-[11px] font-medium"
                            style={{ background: "#0078d4", color: "white" }}>Reply</button>
                    <button onClick={() => setReplyMode("replyAll")}
                            className="h-6 px-3 rounded-lg text-[11px] font-medium"
                            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Reply All</button>
                  </div>
                )}
                {/* Reply form */}
                {replyMode && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--pg-text-3)" }}>
                      {replyMode === "replyAll" ? "Reply All" : "Reply"}
                    </p>
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                              placeholder="Write your reply…" rows={3}
                              className="w-full px-3 py-2 text-[12px] rounded-lg outline-none resize-none"
                              style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
                    <div className="flex gap-2">
                      <button onClick={() => sendReply(m.id)} disabled={sending || !replyText.trim()}
                              className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold text-white"
                              style={{ background: "#0078d4", opacity: (sending || !replyText.trim()) ? 0.6 : 1 }}>
                        {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send
                      </button>
                      <button onClick={() => { setReplyMode(null); setReplyText(""); }}
                              className="h-7 px-3 rounded-lg text-[12px]"
                              style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.subject,
          body: "",
          start: `${form.date}T${form.startTime}:00`,
          end: `${form.date}T${form.endTime}:00`,
          timeZone: "Africa/Lagos",
          location: form.location,
          isOnline: form.isOnline,
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
  const newEventBtn = (
    <button onClick={() => setCreating(v => !v)}
            className="flex items-center gap-1 h-6 px-2 rounded-lg text-[11px] font-semibold"
            style={{ background: "var(--pg-accent)", color: "white" }}>
      <Plus className="w-3 h-3" /> New Event
    </button>
  );

  return (
    <Panel logo="/calendar-logo.svg" title="Outlook Calendar" loading={isLoading} action={newEventBtn}>
      {/* Create event form */}
      {creating && (
        <div className="p-4 space-y-2" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                 placeholder="Event title" className="w-full px-3 py-1.5 text-[12px] rounded-lg outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <div className="flex gap-2">
            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                   className="flex-1 px-3 py-1.5 text-[12px] rounded-lg outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
            <input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                   className="w-24 px-3 py-1.5 text-[12px] rounded-lg outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
            <span className="text-[12px] self-center" style={{ color: "var(--pg-text-3)" }}>–</span>
            <input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
                   className="w-24 px-3 py-1.5 text-[12px] rounded-lg outline-none"
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
                <a href={e.onlineMeetingUrl} target="_blank" rel="noreferrer" title="Join Teams meeting" className="shrink-0">
                  <ExternalLink className="w-3 h-3" style={{ color: "var(--pg-accent)" }} />
                </a>
              )}
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-2)" }}>{formatEventTime(e.start)}</p>
            {e.location && <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-3)" }}>{e.location}</p>}
          </div>
        ))}
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
          <div className="w-5 h-5 rounded-full" style={{ background: presenceColor(data.availability) }} />
          <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>{data.availability}</p>
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
  const [expandedChat, setExpandedChat] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const { data: chatsData, isLoading } = useQuery({
    queryKey: ["msgraph-teams"],
    queryFn: () => api("/teams") as Promise<{ chats: TeamsMessage[] }>,
    staleTime: 60_000, refetchInterval: 120_000,
  });

  const { data: messagesData, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ["msgraph-chat-messages", expandedChat],
    queryFn: () => api(`/teams/${expandedChat}/messages`) as Promise<{ messages: TeamsMessage[] }>,
    enabled: !!expandedChat,
    staleTime: 30_000,
  });

  async function sendMessage() {
    if (!expandedChat || !message.trim()) return;
    setSending(true);
    try {
      await api(`/teams/${expandedChat}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });
      setMessage("");
      refetchMessages();
    } catch (e) {
      toast({ title: "Failed to send", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  }

  const chats = chatsData?.chats ?? [];
  const messages = messagesData?.messages ?? [];

  // Strip HTML tags from Teams message body
  function stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  }

  return (
    <Panel logo="/teams-logo.svg" title="Teams Chat" loading={isLoading}>
      {chats.length === 0 && !isLoading
        ? <EmptyState text="No recent chats" />
        : chats.map(chat => (
          <div key={chat.id}>
            {/* Chat row */}
            <div className="px-5 py-3 cursor-pointer transition-colors"
                 style={{ borderBottom: "1px solid var(--pg-row-border)" }}
                 onClick={() => setExpandedChat(expandedChat === chat.chatId ? null : chat.chatId)}
                 onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                 onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>
                  {chat.senderName || "Unknown"}
                </span>
                <span className="text-[10px] shrink-0 flex items-center gap-1" style={{ color: "var(--pg-text-3)" }}>
                  {relativeTime(chat.sentAt)}
                  {expandedChat === chat.chatId ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </span>
              </div>
              {expandedChat !== chat.chatId && (
                <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-2)" }}>
                  {stripHtml(chat.body).slice(0, 80)}
                </p>
              )}
            </div>

            {/* Expanded chat thread */}
            {expandedChat === chat.chatId && (
              <div className="flex flex-col" style={{ background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)" }}>
                {/* Messages */}
                <div className="px-4 py-3 space-y-2 max-h-52 overflow-y-auto">
                  {messagesLoading
                    ? <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
                    : messages.length === 0
                      ? <EmptyState text="No messages" />
                      : messages.map(msg => {
                          const isMe = msg.senderName === user?.DisplayName;
                          return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                              <span className="text-[10px] mb-0.5" style={{ color: "var(--pg-text-3)" }}>
                                {isMe ? "You" : msg.senderName}
                              </span>
                              <div className="max-w-[80%] px-3 py-2 rounded-xl text-[12px]"
                                   style={{
                                     background: isMe ? "#0078d4" : "var(--pg-card)",
                                     color: isMe ? "white" : "var(--pg-text-1)",
                                     border: isMe ? "none" : "1px solid var(--pg-card-border)",
                                   }}>
                                {stripHtml(msg.body)}
                              </div>
                            </div>
                          );
                        })
                  }
                </div>
                {/* Message input */}
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                  <input value={message} onChange={e => setMessage(e.target.value)}
                         onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                         placeholder="Type a message…" className="flex-1 px-3 py-1.5 text-[12px] rounded-lg outline-none"
                         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
                  <button onClick={sendMessage} disabled={sending || !message.trim()}
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: "#5059C9", opacity: (sending || !message.trim()) ? 0.5 : 1 }}>
                    {sending ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Send className="w-3.5 h-3.5 text-white" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
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
          Link your Microsoft account to view and reply to Outlook mail, send Teams messages,
          and create calendar events — all without leaving PageOS.
        </p>
      </div>
      <button onClick={() => { window.location.href = `${BASE}/api/v1/msgraph/connect`; }}
              className="flex items-center gap-3 h-11 px-5 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90"
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

  const { data: statusData, isLoading: statusLoading } = useQuery<Status>({
    queryKey: ["msgraph-status"],
    queryFn: () => api("/status") as Promise<Status>,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api("/disconnect", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["msgraph-status"] });
      ["msgraph-mail", "msgraph-calendar", "msgraph-teams", "msgraph-presence"].forEach(k =>
        queryClient.invalidateQueries({ queryKey: [k] })
      );
      toast({ title: "Disconnected", description: "Your Microsoft account has been unlinked." });
    },
    onError: () => toast({ title: "Error", description: "Could not disconnect.", variant: "destructive" }),
  });

  useEffect(() => {
    if (toastShown) return;
    const p = searchParams.get("connected");
    const e = searchParams.get("error");
    if (p === "1") { toast({ title: "Connected!", description: "Your Microsoft account is now linked." }); setToastShown(true); }
    else if (e === "auth_failed") { toast({ title: "Connection failed", description: "Microsoft sign-in was not completed.", variant: "destructive" }); setToastShown(true); }
  }, [searchParams, toast, toastShown]);

  if (statusLoading) {
    return <div className="flex h-[70vh] items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>;
  }

  if (!statusData?.connected) return <ConnectPrompt />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/microsoft-logo.svg" alt="Microsoft 365" width={28} height={28} />
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>Microsoft 365</h1>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Connected as <span className="font-medium" style={{ color: "var(--pg-text-2)" }}>{statusData.microsoft_email}</span>
            </p>
          </div>
        </div>
        <button onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors"
                style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
          {disconnectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />}
          Disconnect
        </button>
      </div>

      {/* Reconnect banner if write scopes are missing */}
      {statusData.needs_reconnect && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
             style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#ca8a04" }} />
          <p className="text-[12px] flex-1" style={{ color: "#92400e" }}>
            New permissions are required to reply to emails and send Teams messages.
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
        <MailPanel />
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
