"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail, Calendar, MessageSquare, Wifi, WifiOff,
  Loader2, Link2, Link2Off, ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type Status = { connected: boolean; microsoft_email: string };

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
    timeZone: "Africa/Lagos",
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function presenceColor(availability: string): string {
  switch (availability) {
    case "Available":                        return "#22c55e";
    case "Busy": case "DoNotDisturb":        return "#ef4444";
    case "Away": case "BeRightBack":         return "#eab308";
    default:                                 return "#6b7280";
  }
}

// ── Panel shell ────────────────────────────────────────────────────────────────

function Panel({ icon: Icon, title, children, loading }: {
  icon: React.ElementType; title: string; children: React.ReactNode; loading?: boolean;
}) {
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5"
           style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <Icon className="w-4 h-4" style={{ color: "var(--pg-accent)" }} />
        <span className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>{title}</span>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" style={{ color: "var(--pg-text-4)" }} />}
      </div>
      <div className="flex-1 overflow-y-auto max-h-72">
        {children}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-center py-8 text-[12px]" style={{ color: "var(--pg-text-3)" }}>{text}</p>
  );
}

// ── Mail panel ─────────────────────────────────────────────────────────────────

function MailPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["msgraph-mail"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/msgraph/mail`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json() as Promise<{ messages: MailMessage[] }>;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const messages = data?.messages ?? [];

  return (
    <Panel icon={Mail} title="Outlook Mail" loading={isLoading}>
      {messages.length === 0 && !isLoading
        ? <EmptyState text="No messages" />
        : messages.map(m => (
          <div key={m.id} className="px-5 py-3 transition-colors"
               style={{ borderBottom: "1px solid var(--pg-row-border)" }}
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
        ))}
    </Panel>
  );
}

// ── Calendar panel ─────────────────────────────────────────────────────────────

function CalendarPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["msgraph-calendar"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/msgraph/calendar`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json() as Promise<{ events: CalendarEvent[] }>;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const events = data?.events ?? [];

  return (
    <Panel icon={Calendar} title="Outlook Calendar" loading={isLoading}>
      {events.length === 0 && !isLoading
        ? <EmptyState text="No upcoming events" />
        : events.map(e => (
          <div key={e.id} className="px-5 py-3 transition-colors"
               style={{ borderBottom: "1px solid var(--pg-row-border)" }}
               onMouseEnter={el => (el.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
               onMouseLeave={el => (el.currentTarget as HTMLElement).style.background = ""}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>
                {e.subject}
              </p>
              {e.isOnlineMeeting && e.onlineMeetingUrl && (
                <a href={e.onlineMeetingUrl} target="_blank" rel="noreferrer"
                   className="shrink-0" title="Join Teams meeting">
                  <ExternalLink className="w-3 h-3" style={{ color: "var(--pg-accent)" }} />
                </a>
              )}
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-2)" }}>
              {formatEventTime(e.start)}
            </p>
            {e.location && (
              <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-3)" }}>{e.location}</p>
            )}
          </div>
        ))}
    </Panel>
  );
}

// ── Presence panel ─────────────────────────────────────────────────────────────

function PresencePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["msgraph-presence"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/msgraph/presence`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json() as Promise<Presence>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return (
    <Panel icon={Wifi} title="Teams Presence" loading={isLoading}>
      {data ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-5 h-5 rounded-full" style={{ background: presenceColor(data.availability) }} />
          <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            {data.availability}
          </p>
          <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>{data.activity}</p>
        </div>
      ) : !isLoading ? (
        <EmptyState text="Presence unavailable" />
      ) : null}
    </Panel>
  );
}

// ── Teams Chat panel ───────────────────────────────────────────────────────────

function TeamsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["msgraph-teams"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/msgraph/teams`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json() as Promise<{ chats: TeamsMessage[] }>;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const chats = data?.chats ?? [];

  return (
    <Panel icon={MessageSquare} title="Teams Chat" loading={isLoading}>
      {chats.length === 0 && !isLoading
        ? <EmptyState text="No recent chats" />
        : chats.map(c => (
          <div key={c.id} className="px-5 py-3 transition-colors"
               style={{ borderBottom: "1px solid var(--pg-row-border)" }}
               onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
               onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>
                {c.senderName || "Unknown"}
              </span>
              <span className="text-[10px] shrink-0" style={{ color: "var(--pg-text-3)" }}>
                {relativeTime(c.sentAt)}
              </span>
            </div>
            <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-2)" }}>
              {c.body?.replace(/<[^>]*>/g, "").slice(0, 80)}
            </p>
          </div>
        ))}
    </Panel>
  );
}

// ── Connect prompt ─────────────────────────────────────────────────────────────

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
           style={{ background: "linear-gradient(135deg,#0078d4,#106ebe)" }}>
        <Mail className="w-8 h-8 text-white" />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-[18px] font-bold mb-2" style={{ color: "var(--pg-text-1)" }}>
          Connect Microsoft 365
        </h2>
        <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
          Link your Microsoft account to see Outlook mail, calendar events, Teams messages,
          and your presence status — all in one place.
        </p>
      </div>
      <button
        onClick={() => { window.location.href = `${BASE}/api/v1/msgraph/connect`; }}
        className="flex items-center gap-2 h-11 px-6 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(135deg,#0078d4,#106ebe)" }}>
        <Link2 className="w-4 h-4" />
        Connect Microsoft Account
      </button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MicrosoftPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [toastShown, setToastShown] = useState(false);

  const { data: statusData, isLoading: statusLoading } = useQuery<Status>({
    queryKey: ["msgraph-status"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/msgraph/status`, { credentials: "include" });
      if (!res.ok) return { connected: false, microsoft_email: "" };
      return res.json();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/msgraph/disconnect`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error("Disconnect failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["msgraph-status"] });
      queryClient.invalidateQueries({ queryKey: ["msgraph-mail"] });
      queryClient.invalidateQueries({ queryKey: ["msgraph-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["msgraph-teams"] });
      queryClient.invalidateQueries({ queryKey: ["msgraph-presence"] });
      toast({ title: "Disconnected", description: "Your Microsoft account has been unlinked." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not disconnect. Please try again.", variant: "destructive" });
    },
  });

  // Show toast based on redirect params from the OAuth callback.
  useEffect(() => {
    if (toastShown) return;
    if (searchParams.get("connected") === "1") {
      toast({ title: "Connected!", description: "Your Microsoft account is now linked." });
      setToastShown(true);
    } else if (searchParams.get("error") === "auth_failed") {
      toast({ title: "Connection failed", description: "Microsoft sign-in was not completed.", variant: "destructive" });
      setToastShown(true);
    }
  }, [searchParams, toast, toastShown]);

  if (statusLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  if (!statusData?.connected) {
    return <ConnectPrompt />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>Microsoft 365</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Connected as <span className="font-medium" style={{ color: "var(--pg-text-2)" }}>
              {statusData.microsoft_email}
            </span>
          </p>
        </div>
        <button
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors"
          style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
          {disconnectMutation.isPending
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Link2Off className="w-3 h-3" />}
          Disconnect
        </button>
      </div>

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
