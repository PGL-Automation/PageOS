"use client";

import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ExternalLink } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { msApi, formatEventTime, CalendarEvent } from "../components";

function CalendarPageInner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    subject: "", date: "", startTime: "09:00", endTime: "10:00",
    location: "", isOnline: false, attendees: "", body: "",
  });
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["msgraph-calendar-full"],
    queryFn: () => msApi("/calendar") as Promise<{ events: CalendarEvent[] }>,
    staleTime: 60_000, refetchInterval: 300_000,
  });

  async function createEvent() {
    if (!form.subject || !form.date) return;
    setSaving(true);
    try {
      await msApi("/calendar/events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.subject, body: form.body,
          start: `${form.date}T${form.startTime}:00`,
          end: `${form.date}T${form.endTime}:00`,
          timeZone: "Africa/Lagos",
          location: form.location,
          isOnline: form.isOnline,
          attendees: form.attendees.split(",").map(s => s.trim()).filter(Boolean),
        }),
      });
      toast({ title: "Event created", description: form.subject });
      setForm({ subject: "", date: "", startTime: "09:00", endTime: "10:00", location: "", isOnline: false, attendees: "", body: "" });
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["msgraph-calendar-full"] });
    } catch (e) {
      toast({ title: "Failed to create event", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  const events = data?.events ?? [];

  // Group events by date
  const grouped: Record<string, CalendarEvent[]> = {};
  events.forEach(e => {
    const date = e.start ? new Date(e.start).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", weekday: "long", month: "long", day: "numeric" }) : "Unknown";
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(e);
  });

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Image src="/calendar-logo.svg" alt="Calendar" width={28} height={28} />
          <h1 className="text-[22px] font-bold" style={{ color: "var(--pg-text-1)" }}>Outlook Calendar</h1>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pg-text-4)" }} />}
        </div>
        <button onClick={() => setCreating(v => !v)}
                className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#0078d4,#106ebe)" }}>
          <Plus className="w-4 h-4" /> New Event
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl p-5 mb-6 space-y-3" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <h3 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>New Event</h3>
          <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                 placeholder="Event title *" className="w-full px-4 py-2.5 text-[13px] rounded-xl outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <div className="flex gap-3 flex-wrap">
            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                   className="flex-1 min-w-0 px-4 py-2.5 text-[13px] rounded-xl outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
            <input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                   className="w-28 px-3 py-2.5 text-[13px] rounded-xl outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
            <span className="self-center text-[13px]" style={{ color: "var(--pg-text-3)" }}>to</span>
            <input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
                   className="w-28 px-3 py-2.5 text-[13px] rounded-xl outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          </div>
          <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                 placeholder="Location (optional)" className="w-full px-4 py-2.5 text-[13px] rounded-xl outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <input value={form.attendees} onChange={e => setForm(p => ({ ...p, attendees: e.target.value }))}
                 placeholder="Invite people (email addresses, comma-separated)" className="w-full px-4 py-2.5 text-[13px] rounded-xl outline-none"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                    placeholder="Add a description or agenda (optional)" rows={3}
                    className="w-full px-4 py-2.5 text-[13px] rounded-xl outline-none resize-none"
                    style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: "var(--pg-text-2)" }}>
            <input type="checkbox" checked={form.isOnline} onChange={e => setForm(p => ({ ...p, isOnline: e.target.checked }))} className="w-4 h-4" />
            Make it a Teams meeting
          </label>
          <div className="flex gap-3">
            <button onClick={createEvent} disabled={saving || !form.subject || !form.date}
                    className="flex items-center gap-2 h-9 px-5 rounded-xl text-[13px] font-semibold text-white"
                    style={{ background: "#0078d4", opacity: (saving || !form.subject || !form.date) ? 0.6 : 1 }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create Event
            </button>
            <button onClick={() => setCreating(false)} className="h-9 px-4 rounded-xl text-[13px]"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Event list grouped by day */}
      {isLoading && events.length === 0
        ? <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
        : events.length === 0
          ? <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Image src="/calendar-logo.svg" alt="" width={48} height={48} style={{ opacity: 0.3 }} />
              <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No upcoming events in the next 7 days</p>
            </div>
          : Object.entries(grouped).map(([date, dayEvents]) => (
              <div key={date} className="mb-6">
                <p className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--pg-text-3)" }}>{date}</p>
                <div className="space-y-2">
                  {dayEvents.map(e => (
                    <div key={e.id} className="flex items-start gap-4 p-4 rounded-2xl"
                         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                      {/* Time column */}
                      <div className="shrink-0 text-right" style={{ minWidth: 60 }}>
                        <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
                          {new Date(e.start).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                          {new Date(e.end).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {/* Blue bar */}
                      <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: "#0078d4" }} />
                      {/* Event details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{e.subject}</p>
                        {e.location && <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-2)" }}>📍 {e.location}</p>}
                        {e.isOnlineMeeting && e.onlineMeetingUrl && (
                          <a href={e.onlineMeetingUrl} target="_blank" rel="noreferrer"
                             className="inline-flex items-center gap-1.5 mt-1.5 h-7 px-3 rounded-lg text-[12px] font-medium text-white"
                             style={{ background: "#5059C9" }}>
                            <ExternalLink className="w-3 h-3" /> Join Teams Meeting
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
      }
    </div>
  );
}

export default function CalendarPage() {
  return <Suspense><CalendarPageInner /></Suspense>;
}
