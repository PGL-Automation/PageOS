"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Lock, Upload, FileText, File, Image as ImageIcon,
  Download, Eye, Shield, ShieldCheck, ShieldAlert,
  Loader2, X, FolderLock, StickyNote, Plus, Pencil,
  Trash2, Save, ChevronLeft, Bell, BellOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Nigeria timezone helpers (WAT = UTC+1, no DST) ────────────────────────────

const NIGERIA_TZ = "Africa/Lagos";

/** Parts of the current Nigeria time. */
function nowWAT() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NIGERIA_TZ, year: "numeric", month: "numeric",
    day: "numeric", hour: "numeric", minute: "numeric", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, parseInt(x.value, 10)]));
  return { year: p.year, month: p.month - 1, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute };
}

/** Convert a UTC ISO string → Nigeria {year,month(0-based),day,hour,minute}. */
function utcToWAT(utcIso: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NIGERIA_TZ, year: "numeric", month: "numeric",
    day: "numeric", hour: "numeric", minute: "numeric", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(utcIso)).map(x => [x.type, parseInt(x.value, 10)]));
  return { year: p.year, month: p.month - 1, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute };
}

/** Convert Nigeria date parts → UTC ISO string. */
function watToUtcIso(year: number, month: number, day: number, hour: number, minute: number): string {
  // WAT = UTC+1 — subtract 1 hour to get UTC
  return new Date(Date.UTC(year, month, day, hour - 1, minute)).toISOString();
}

/** Format a UTC ISO string for display in Nigeria time. */
function fmtWAT(utcIso: string) {
  const w = utcToWAT(utcIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${w.day} ${months[w.month]}, ${pad(w.hour)}:${pad(w.minute)}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type VaultDoc = {
  id: string; filename: string; mime_type: string;
  size_bytes: number; scan_status: string; created_at: string;
};

type VaultNote = {
  id: string; title: string; body: string;
  notify_at?: string; // ISO-8601 or undefined
  created_at: string; updated_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function notePreview(body: string, chars = 120) {
  const trimmed = body.trim();
  return trimmed.length <= chars ? trimmed : trimmed.slice(0, chars) + "…";
}

// ── File sub-components ────────────────────────────────────────────────────────

function ScanBadge({ status }: { status: string }) {
  if (status === "clean")
    return <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><ShieldCheck className="w-3 h-3" />Clean</span>;
  if (status === "infected")
    return <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600"><ShieldAlert className="w-3 h-3" />Infected</span>;
  return <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "var(--pg-text-4)" }}><Shield className="w-3 h-3" />Scanning…</span>;
}

function DocIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="w-5 h-5 text-orange-500" />;
  if (mimeType === "application/pdf") return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5" style={{ color: "var(--pg-text-3)" }} />;
}

function PreviewModal({ doc, onClose }: { doc: VaultDoc; onClose: () => void }) {
  const url = `${BASE}/api/v1/documents/${doc.id}/download`;
  const isImage = doc.mime_type.startsWith("image/");
  const isPdf   = doc.mime_type === "application/pdf";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
         onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", maxHeight: "90vh", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <DocIcon mimeType={doc.mime_type} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>{doc.filename}</p>
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                {formatBytes(doc.size_bytes)} · {fmtDate(doc.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white"
               style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
              <Download className="w-3.5 h-3.5" /> Download
            </a>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ color: "var(--pg-text-3)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-0">
          {isImage
            ? <img src={url} alt={doc.filename} className="max-w-full max-h-full object-contain rounded-lg" /> // eslint-disable-line @next/next/no-img-element
            : isPdf
            ? <iframe src={url} title={doc.filename} className="w-full rounded-lg" style={{ height: "65vh", border: "none" }} />
            : <div className="text-center py-12">
                <p className="text-[13px] mt-3" style={{ color: "var(--pg-text-2)" }}>Preview not available for this file type.</p>
                <a href={url} target="_blank" rel="noopener noreferrer"
                   className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                   style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              </div>
          }
        </div>
      </div>
    </div>
  );
}

// ── TimeSpinner ───────────────────────────────────────────────────────────────

function TimeSpinner({ value, min, max, step = 1, label, onChange }: {
  value: number; min: number; max: number; step?: number;
  label: string; onChange: (v: number) => void;
}) {
  const display = String(value).padStart(2, "0");
  const range   = max - min + 1;

  function inc() { onChange(min + (value - min + step) % range); }
  function dec() { onChange(min + ((value - min - step + range) % range)); }

  const btnStyle: React.CSSProperties = {
    width: 36, height: 30, borderRadius: 8, border: "none",
    background: "var(--pg-muted-bg)", cursor: "pointer",
    fontSize: 14, color: "var(--pg-text-2)", display: "flex",
    alignItems: "center", justifyContent: "center",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--pg-text-4)", letterSpacing: "0.06em" }}>{label}</p>
      <button style={btnStyle} onClick={inc}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fff3e0"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}>
        ▲
      </button>
      <div style={{
        width: 56, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 10, background: "var(--pg-muted-bg)",
        border: "1px solid var(--pg-card-border)",
        fontSize: 22, fontWeight: 800, color: "var(--pg-text-1)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {display}
      </div>
      <button style={btnStyle} onClick={dec}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fff3e0"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}>
        ▼
      </button>
    </div>
  );
}

// ── Date-Time Picker (fixed modal — avoids overflow-hidden clipping) ──────────

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function DateTimePicker({
  value, onConfirm, onClose,
}: {
  value: string;
  onConfirm: (v: string) => void;
  onClose: () => void;
}) {
  // Always work in Nigeria time (WAT = UTC+1, no DST).
  // If there's an existing value, convert the stored UTC ISO to WAT parts;
  // otherwise default to the current WAT time.
  const init = value ? utcToWAT(value) : nowWAT();

  const [yr,  setYr]  = useState(init.year);
  const [mo,  setMo]  = useState(init.month); // 0-based
  const [sel, setSel] = useState<Date | null>(
    value ? new Date(init.year, init.month, init.day) : null
  );
  const [hr,  setHr]  = useState(init.hour);   // 0-23 WAT
  const [min, setMin] = useState(init.minute); // 0-59

  const firstWeekday = new Date(yr, mo, 1).getDay();
  const totalDays    = new Date(yr, mo + 1, 0).getDate();

  // Pad to full 7-column rows
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  // "Today" in Nigeria time for calendar highlighting.
  const watNow  = nowWAT();
  const todayY  = watNow.year, todayM = watNow.month, todayD = watNow.day;

  function prev() { if (mo === 0) { setYr(y => y - 1); setMo(11); } else setMo(m => m - 1); }
  function next() { if (mo === 11) { setYr(y => y + 1); setMo(0); } else setMo(m => m + 1); }

  function confirm() {
    if (!sel) return;
    // sel was created from calendar yr/mo/day clicks (local Date), use those
    // year/month/day as Nigeria WAT, then convert to UTC ISO for the API.
    onConfirm(watToUtcIso(sel.getFullYear(), sel.getMonth(), sel.getDate(), hr, min));
  }

  // Compare calendar cells using plain year/month/day (no timezone risk).
  function sameDayYMD(ay: number, am: number, ad: number, by: number, bm: number, bd: number) {
    return ay === by && am === bm && ad === bd;
  }

  return (
    // Fixed overlay so it's never clipped by parent overflow-hidden
    <div className="fixed inset-0 z-[300] flex items-center justify-center"
         style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }}
         onClick={onClose}>
      <div style={{
             background: "var(--pg-card)",
             border: "1px solid var(--pg-card-border)",
             boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
             borderRadius: 20,
             width: 320,
             overflow: "hidden",
           }}
           onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--pg-row-border)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--pg-text-1)", marginBottom: 2 }}>
            Set Reminder
          </p>
          <p style={{ fontSize: 11, color: "var(--pg-text-3)" }}>
            Pick a date and time — you&apos;ll get a notification then.
          </p>
        </div>

        {/* ── Month navigator ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 4px" }}>
          <button onClick={prev} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", cursor: "pointer", fontSize: 16, color: "var(--pg-text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ‹
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pg-text-1)" }}>
            {MONTHS[mo]} {yr}
          </span>
          <button onClick={next} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", cursor: "pointer", fontSize: 16, color: "var(--pg-text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ›
          </button>
        </div>

        {/* ── Day-of-week row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "4px 16px 0", gap: 2 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--pg-text-3)", padding: "4px 0" }}>
              {d}
            </div>
          ))}
        </div>

        {/* ── Day cells ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "2px 16px 12px", gap: 2 }}>
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} style={{ height: 36 }} />;

            // Compare purely by year/month/day — no Date objects, no timezone risk.
            const isPast  = yr < todayY || (yr === todayY && mo < todayM) || (yr === todayY && mo === todayM && day < todayD);
            const isToday = sameDayYMD(yr, mo, day, todayY, todayM, todayD);
            const selWAT  = sel ? utcToWAT(sel.toISOString()) : null;
            const isSel   = selWAT ? sameDayYMD(yr, mo, day, selWAT.year, selWAT.month, selWAT.day) : false;

            return (
              <button
                key={idx}
                disabled={isPast}
                onClick={() => setSel(new Date(yr, mo, day))}
                style={{
                  height: 36,
                  borderRadius: 8,
                  border: isToday && !isSel ? "2px solid #FF6600" : "2px solid transparent",
                  background: isSel ? "#FF6600" : "transparent",
                  color: isSel ? "#fff" : isToday ? "#FF6600" : "var(--pg-text-1)",
                  fontWeight: isToday || isSel ? 700 : 400,
                  fontSize: 13,
                  cursor: isPast ? "not-allowed" : "pointer",
                  opacity: isPast ? 0.3 : 1,
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!isSel && !isPast) (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* ── Time spinner ── */}
        <div style={{ borderTop: "1px solid var(--pg-row-border)", padding: "12px 16px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pg-text-3)", marginBottom: 10, textAlign: "center" }}>Time</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            {/* Hour spinner */}
            <TimeSpinner
              value={hr} min={0} max={23}
              onChange={setHr}
              label="Hour"
            />
            <span style={{ fontSize: 24, fontWeight: 900, color: "var(--pg-text-2)", lineHeight: 1 }}>:</span>
            {/* Minute spinner — step 1 so every minute is reachable */}
            <TimeSpinner
              value={min} min={0} max={59} step={1}
              onChange={setMin}
              label="Min"
            />
          </div>
          {/* Quick-select presets */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {[["Morning","09:00",[9,0]],["Noon","12:00",[12,0]],["Afternoon","14:00",[14,0]],["Evening","18:00",[18,0]]] .map(([label, , hm]) => (
              <button
                key={label as string}
                onClick={() => { setHr((hm as number[])[0]); setMin((hm as number[])[1]); }}
                style={{
                  height: 26, padding: "0 10px", borderRadius: 20,
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  border: hr === (hm as number[])[0] && min === (hm as number[])[1]
                    ? "1px solid #FF6600" : "1px solid var(--pg-card-border)",
                  background: hr === (hm as number[])[0] && min === (hm as number[])[1]
                    ? "#fff3e0" : "var(--pg-muted-bg)",
                  color: hr === (hm as number[])[0] && min === (hm as number[])[1]
                    ? "#E05500" : "var(--pg-text-2)",
                }}
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>

        {/* ── Actions ── */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 16px 16px" }}>
          <button onClick={onClose}
                  style={{ height: 36, padding: "0 16px", borderRadius: 10, border: "1px solid var(--pg-card-border)", background: "transparent", color: "var(--pg-text-2)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={confirm} disabled={!sel}
                  style={{ height: 36, padding: "0 20px", borderRadius: 10, background: sel ? "linear-gradient(135deg,#FF6600,#E05500)" : "var(--pg-muted-bg)", color: sel ? "#fff" : "var(--pg-text-4)", fontSize: 13, fontWeight: 700, cursor: sel ? "pointer" : "not-allowed", boxShadow: sel ? "0 1px 8px rgba(255,102,0,0.3)" : "none", transition: "all 0.15s" }}>
            Set Reminder
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Note editor / viewer ───────────────────────────────────────────────────────

function NoteEditor({
  note,
  onClose,
  onSaved,
  onDeleted,
}: {
  note: VaultNote | null; // null = new note
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  // notifyAt stored as UTC ISO string (matches API format).
  // All display converts UTC → Nigeria WAT using fmtWAT().
  const [notifyAt, setNotifyAt] = useState(note?.notify_at ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const isDirty = title !== (note?.title ?? "") ||
    body !== (note?.body ?? "") ||
    notifyAt !== (note?.notify_at ?? "");

  async function save() {
    if (!title.trim() && !body.trim()) { onClose(); return; }
    setSaving(true);
    try {
      // notifyAt is already a UTC ISO string from DateTimePicker.confirm().
      const payload: Record<string, unknown> = {
        title: title.trim() || "Untitled",
        body,
        notify_at: notifyAt || null,
      };
      if (note) {
        await fetch(`${BASE}/api/v1/vault/notes/${note.id}`, {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${BASE}/api/v1/vault/notes`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      qc.invalidateQueries({ queryKey: ["vault-notes"] });
      toast({ title: note ? "Note saved" : "Note created" });
      onSaved();
    } catch {
      toast({ title: "Failed to save note", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote() {
    if (!note) return;
    setDeleting(true);
    try {
      await fetch(`${BASE}/api/v1/vault/notes/${note.id}`, { method: "DELETE", credentials: "include" });
      qc.invalidateQueries({ queryKey: ["vault-notes"] });
      toast({ title: "Note deleted" });
      onDeleted();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] px-4 pb-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", height: "88vh" }}>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 shrink-0"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <button onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: "var(--pg-text-3)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-[12px] font-medium flex-1 truncate" style={{ color: "var(--pg-text-3)" }}>
            {note ? "Edit Note" : "New Note"}
          </span>

          {note && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{ color: "#dc2626" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fef2f2"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
          {confirmDelete && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]" style={{ color: "#dc2626" }}>Are you sure?</span>
              <button onClick={deleteNote} disabled={deleting}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-white"
                      style={{ background: "#dc2626" }}>
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, delete"}
              </button>
              <button onClick={() => setConfirmDelete(false)}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-medium"
                      style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                Cancel
              </button>
            </div>
          )}

          {/* Reminder button */}
          <div className="relative">
            {notifyAt ? (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium"
                   style={{ background: "#fff3e0", border: "1px solid #FF6600", color: "#E05500" }}>
                <Bell className="w-3 h-3 shrink-0" />
                <button onClick={() => setShowPicker(true)} className="hover:underline">
                  {fmtWAT(notifyAt)}
                </button>
                <button onClick={() => { setNotifyAt(""); setShowPicker(false); }} className="ml-1 hover:opacity-70" title="Clear reminder">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-all"
                style={{ color: "var(--pg-text-3)", border: "1px solid var(--pg-card-border)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"; (e.currentTarget as HTMLElement).style.color = "#FF6600"; (e.currentTarget as HTMLElement).style.borderColor = "#FF6600"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--pg-text-3)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)"; }}>
                <Bell className="w-3 h-3" />
                Remind me
              </button>
            )}
            {showPicker && (
              <DateTimePicker
                value={notifyAt}
                onConfirm={val => { setNotifyAt(val); setShowPicker(false); }}
                onClose={() => setShowPicker(false)}
              />
            )}
          </div>

          <button onClick={save} disabled={saving || (!isDirty && !!note)}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {/* Title */}
        <input
          ref={titleRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Note title…"
          className="w-full px-5 pt-5 pb-2 text-[20px] font-bold outline-none bg-transparent"
          style={{ color: "var(--pg-text-1)" }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); } }}
        />

        {/* Metadata */}
        {note && (
          <p className="px-5 text-[11px] pb-2" style={{ color: "var(--pg-text-4)" }}>
            Created {fmtDate(note.created_at)}
            {note.updated_at !== note.created_at && ` · Updated ${fmtDate(note.updated_at)}`}
          </p>
        )}

        {/* Body */}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Start writing your note…"
          className="flex-1 w-full px-5 py-3 outline-none bg-transparent resize-none text-[14px] leading-relaxed"
          style={{ color: "var(--pg-text-1)" }}
        />
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = "files" | "notes";

export default function VaultPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("files");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<VaultDoc | null>(null);
  const [editingNote, setEditingNote] = useState<VaultNote | null | "new">(undefined as unknown as null);
  const [showEditor, setShowEditor] = useState(false);

  const { data: docs = [], isLoading: docsLoading } = useQuery<VaultDoc[]>({
    queryKey: ["vault-personal"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/documents?vault_type=personal`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as VaultDoc[];
    },
    enabled: Boolean(user),
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery<VaultNote[]>({
    queryKey: ["vault-notes"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/vault/notes`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as VaultNote[];
    },
    enabled: Boolean(user),
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 20 MB per file.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("vault_type", "personal");
      const res = await fetch(`${BASE}/api/v1/documents`, { method: "POST", credentials: "include", body: form });
      if (!res.ok) throw new Error("Upload failed");
      qc.invalidateQueries({ queryKey: ["vault-personal"] });
      toast({ title: "Saved to Vault", description: `${file.name} is now in your private vault.` });
    } catch {
      toast({ title: "Upload Failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openNewNote() {
    setEditingNote(null);
    setShowEditor(true);
    setTab("notes");
  }

  function openNote(note: VaultNote) {
    setEditingNote(note);
    setShowEditor(true);
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FolderLock className="w-5 h-5 text-orange-600" />
            <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>My Private Vault</h1>
          </div>
          <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
            Only you can see these files and notes. Nothing here is visible to HR, managers, or admins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openNewNote}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
            style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}>
            <StickyNote className="w-4 h-4" style={{ color: "#FF6600" }} />
            <span style={{ color: "var(--pg-text-1)" }}>New Note</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Uploading…" : "Upload File"}
          </button>
        </div>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile}
               accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.csv,.txt,.zip" />
      </div>

      {/* Privacy notice */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
           style={{ background: "rgba(255,102,0,0.06)", border: "1px solid rgba(255,102,0,0.15)" }}>
        <Lock className="w-4 h-4 text-orange-600 shrink-0" />
        <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
          <strong>Fully private.</strong> Files and notes are stored securely and accessible only to you.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        {(["files", "notes"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
                  className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-medium capitalize transition-all"
                  style={tab === t
                    ? { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "white" }
                    : { color: "var(--pg-text-2)" }}>
            {t === "files" ? <Upload className="w-3.5 h-3.5" /> : <StickyNote className="w-3.5 h-3.5" />}
            {t === "files" ? `Files${docs.length ? ` (${docs.length})` : ""}` : `Notes${notes.length ? ` (${notes.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* ── FILES TAB ── */}
      {tab === "files" && (
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {docsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--pg-muted-bg)" }}>
                <FolderLock className="w-7 h-7" style={{ color: "var(--pg-text-4)" }} />
              </div>
              <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--pg-text-2)" }}>No files yet</p>
              <p className="text-[12px] mb-4" style={{ color: "var(--pg-text-4)" }}>
                Upload personal documents, certificates, or anything you want to keep handy and private.
              </p>
              <button onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                      style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
                <Upload className="w-3.5 h-3.5" /> Upload First File
              </button>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3.5 px-5 py-3.5 group transition-colors"
                     onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                     onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--pg-muted-bg)" }}>
                    <DocIcon mimeType={doc.mime_type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{doc.filename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>{formatBytes(doc.size_bytes)}</span>
                      <span style={{ color: "var(--pg-text-4)" }}>·</span>
                      <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>{fmtDate(doc.created_at)}</span>
                      <span style={{ color: "var(--pg-text-4)" }}>·</span>
                      <ScanBadge status={doc.scan_status} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => setPreview(doc)} title="Preview"
                            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                            style={{ color: "var(--pg-text-3)" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <Eye className="w-4 h-4" />
                    </button>
                    <a href={`${BASE}/api/v1/documents/${doc.id}/download`}
                       target="_blank" rel="noopener noreferrer" title="Download"
                       className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                       style={{ color: "var(--pg-text-3)" }}
                       onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                       onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── NOTES TAB ── */}
      {tab === "notes" && (
        <div>
          {notesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6 rounded-2xl"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--pg-muted-bg)" }}>
                <StickyNote className="w-7 h-7" style={{ color: "var(--pg-text-4)" }} />
              </div>
              <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--pg-text-2)" }}>No notes yet</p>
              <p className="text-[12px] mb-4" style={{ color: "var(--pg-text-4)" }}>
                Jot down ideas, reminders, personal goals, or anything else you want to keep private.
              </p>
              <button onClick={openNewNote}
                      className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                      style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
                <Plus className="w-3.5 h-3.5" /> Write First Note
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* New note card */}
              <button
                onClick={openNewNote}
                className="rounded-2xl p-5 text-left border-2 border-dashed transition-all h-[140px] flex flex-col items-center justify-center gap-2"
                style={{ borderColor: "var(--pg-card-border)", color: "var(--pg-text-3)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#FF6600"; (e.currentTarget as HTMLElement).style.color = "#FF6600"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)"; (e.currentTarget as HTMLElement).style.color = "var(--pg-text-3)"; }}>
                <Plus className="w-6 h-6" />
                <span className="text-[12px] font-medium">New Note</span>
              </button>

              {notes.map(note => (
                <button key={note.id} onClick={() => openNote(note)}
                        className="rounded-2xl p-5 text-left transition-all h-[140px] flex flex-col gap-2 group"
                        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "var(--pg-card-shadow)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "var(--pg-card-shadow)"}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-semibold leading-tight truncate" style={{ color: "var(--pg-text-1)" }}>
                      {note.title || "Untitled"}
                    </p>
                    <Pencil className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#FF6600" }} />
                  </div>
                  <p className="text-[11px] leading-relaxed flex-1 overflow-hidden" style={{ color: "var(--pg-text-3)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                    {notePreview(note.body) || <span style={{ fontStyle: "italic" }}>Empty note</span>}
                  </p>
                  <div className="flex items-center justify-between mt-auto gap-2">
                    <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                      {fmtDate(note.updated_at)}
                    </p>
                    {note.notify_at && new Date(note.notify_at) > new Date() && (
                      <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                            style={{ background: "#fff3e0", color: "#E05500" }}>
                        <Bell className="w-2.5 h-2.5" />
                        {fmtWAT(note.notify_at)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}
      {showEditor && (
        <NoteEditor
          note={editingNote === "new" ? null : editingNote}
          onClose={() => setShowEditor(false)}
          onSaved={() => setShowEditor(false)}
          onDeleted={() => setShowEditor(false)}
        />
      )}
    </div>
  );
}
