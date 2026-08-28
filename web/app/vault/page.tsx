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

// ── Date-Time Picker ──────────────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const DAY_NAMES   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function DateTimePicker({
  value, onConfirm, onClose,
}: {
  value: string;           // YYYY-MM-DDTHH:mm or ""
  onConfirm: (v: string) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const initDate = value ? new Date(value) : now;

  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth()); // 0-based
  const [selDate,   setSelDate]   = useState<Date | null>(value ? initDate : null);
  const [hour,      setHour]      = useState(initDate.getHours().toString().padStart(2, "0"));
  const [minute,    setMinute]    = useState(initDate.getMinutes().toString().padStart(2, "0"));

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function selectDay(day: number) {
    setSelDate(new Date(viewYear, viewMonth, day));
  }
  function confirm() {
    if (!selDate) return;
    const h = Math.min(23, Math.max(0, parseInt(hour) || 0));
    const m = Math.min(59, Math.max(0, parseInt(minute) || 0));
    const result = new Date(selDate.getFullYear(), selDate.getMonth(), selDate.getDate(), h, m);
    onConfirm(result.toISOString().slice(0, 16));
  }

  const todayStr  = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const selStr    = selDate ? `${selDate.getFullYear()}-${selDate.getMonth()}-${selDate.getDate()}` : "";

  return (
    <div className="absolute top-full left-0 mt-1 z-[200] rounded-2xl overflow-hidden"
         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 16px 40px rgba(0,0,0,0.2)", width: 280 }}>

      {/* Month nav */}
      <div className="flex items-center justify-between px-4 py-3"
           style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <button onClick={prevMonth}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: "var(--pg-text-2)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
          ‹
        </button>
        <span className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: "var(--pg-text-2)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 px-3 pt-2">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] font-bold py-1"
               style={{ color: "var(--pg-text-3)" }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 px-3 pb-2 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const cellStr = `${viewYear}-${viewMonth}-${day}`;
          const isToday = cellStr === todayStr;
          const isSel   = cellStr === selStr;
          const isPast  = new Date(viewYear, viewMonth, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
          return (
            <button
              key={i}
              onClick={() => !isPast && selectDay(day)}
              disabled={isPast}
              className="h-8 w-full rounded-lg text-[12px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: isSel ? "#FF6600" : "transparent",
                color: isSel ? "#fff" : isToday ? "#FF6600" : "var(--pg-text-1)",
                fontWeight: isToday || isSel ? 700 : 400,
                border: isToday && !isSel ? "1px solid #FF6600" : "1px solid transparent",
              }}
              onMouseEnter={e => { if (!isSel && !isPast) (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"; }}
              onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Time inputs */}
      <div className="flex items-center justify-center gap-2 px-4 py-3"
           style={{ borderTop: "1px solid var(--pg-row-border)" }}>
        <span className="text-[11px] font-semibold" style={{ color: "var(--pg-text-3)" }}>Time</span>
        <input
          type="number" min={0} max={23} value={hour}
          onChange={e => setHour(e.target.value.padStart(2, "0"))}
          className="w-12 h-8 text-center text-[14px] font-semibold rounded-lg outline-none"
          style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
        />
        <span className="text-[16px] font-bold" style={{ color: "var(--pg-text-2)" }}>:</span>
        <input
          type="number" min={0} max={59} value={minute}
          onChange={e => setMinute(e.target.value.padStart(2, "0"))}
          className="w-12 h-8 text-center text-[14px] font-semibold rounded-lg outline-none"
          style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 px-4 pb-4">
        <button onClick={onClose}
                className="h-8 px-3 rounded-xl text-[12px] font-medium transition-colors"
                style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
          Cancel
        </button>
        <button onClick={confirm} disabled={!selDate}
                className="h-8 px-4 rounded-xl text-[12px] font-semibold text-white disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
          Set Reminder
        </button>
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
  // notifyAt stored as local datetime-local string (YYYY-MM-DDTHH:mm)
  const [notifyAt, setNotifyAt] = useState(
    note?.notify_at ? new Date(note.notify_at).toISOString().slice(0, 16) : ""
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const existingNotifyAt = note?.notify_at
    ? new Date(note.notify_at).toISOString().slice(0, 16)
    : "";
  const isDirty = title !== (note?.title ?? "") ||
    body !== (note?.body ?? "") ||
    notifyAt !== existingNotifyAt;

  async function save() {
    if (!title.trim() && !body.trim()) { onClose(); return; }
    setSaving(true);
    try {
      // Convert local datetime-local string to UTC ISO-8601 for the API
      let notifyAtISO: string | null = null;
      if (notifyAt) {
        const d = new Date(notifyAt);
        if (!isNaN(d.getTime())) notifyAtISO = d.toISOString();
      }
      const payload: Record<string, unknown> = {
        title: title.trim() || "Untitled",
        body,
        notify_at: notifyAtISO,
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
                  {new Date(notifyAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
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
                        {new Date(note.notify_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
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
