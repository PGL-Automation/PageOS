"use client";

// Shared types and utilities used by all Microsoft 365 sub-pages.

export type TeamsAttachment = { id: string; contentType: string; contentUrl: string; name: string };
export type TeamsReaction  = { reactionType: string; senderName: string; senderMsId: string };
export type TeamsMessage   = {
  id: string; chatId: string; body: string; sentAt: string;
  senderName: string; senderMsId: string;
  attachments?: TeamsAttachment[]; reactions?: TeamsReaction[];
};
export type ChatSummary = {
  id: string; chatType: string; topic: string;
  withName: string; withEmail: string; lastMessage: TeamsMessage;
};
export type ChatPage    = { messages: TeamsMessage[]; nextLink: string };
export type MailMessage = {
  id: string; subject: string; bodyPreview: string; conversationId?: string;
  receivedDateTime: string; isRead: boolean; senderName: string; senderEmail: string;
};
export type CalendarEvent = {
  id: string; subject: string; start: string; end: string;
  location: string; isOnlineMeeting: boolean; onlineMeetingUrl: string;
};
export type Presence   = { availability: string; activity: string };
export type OrgUser    = { id: string; displayName: string; mail: string };

export const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

export function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatEventTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos", weekday: "short", month: "short",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function presenceColor(a: string): string {
  switch (a) {
    case "Available":                  return "#22c55e";
    case "Busy": case "DoNotDisturb": return "#ef4444";
    case "Away": case "BeRightBack":  return "#eab308";
    default:                           return "#6b7280";
  }
}

export function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").trim();
}

export async function msApi(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/msgraph${path}`, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(err?.error?.message ?? "Request failed");
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : {};
}

export const REACTION_EMOJIS: Record<string, string> = {
  like: "👍", heart: "❤️", laugh: "😂", surprised: "😮", sad: "😢", angry: "😠",
};
