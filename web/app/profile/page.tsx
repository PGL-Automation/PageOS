"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Edit2, Save, X, Upload, Download, Trash2, Eye, Camera, Loader2,
  Shield, Wallet, FileText, Briefcase, Award, Activity, FolderOpen,
  ChevronDown, ChevronRight, User, Mail, Building2,
  CheckCircle2,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Document categories ────────────────────────────────────────────────────────

const DOC_CATEGORIES = [
  { key: "id_documents",       label: "ID Documents",       icon: Shield,    color: "#1d4ed8" },
  { key: "bank_statements",    label: "Bank Statements",    icon: Wallet,    color: "#059669" },
  { key: "tax_documents",      label: "Tax Documents",      icon: FileText,  color: "#d97706" },
  { key: "employment_records", label: "Employment Records", icon: Briefcase, color: "#FF6600" },
  { key: "certificates",       label: "Certificates",       icon: Award,     color: "#7c3aed" },
  { key: "medical",            label: "Medical",            icon: Activity,  color: "#dc2626" },
  { key: "other",              label: "Other",              icon: FolderOpen,color: "#475569" },
];

type Doc = {
  id: string; filename: string; mime_type: string; size_bytes: number;
  created_at: string; category?: string;
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── DocCategory component ──────────────────────────────────────────────────────

function DocCategory({
  cat, docs, onDelete,
}: {
  cat: typeof DOC_CATEGORIES[number];
  docs: Doc[];
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(docs.length > 0);
  const Icon = cat.icon;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pg-card-border)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
        style={{ background: "var(--pg-card)" }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${cat.color}06`}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-card)"}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cat.color}18` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: cat.color }} />
        </div>
        <span className="text-[13px] font-semibold flex-1 text-left" style={{ color: "var(--pg-text-1)" }}>{cat.label}</span>
        {docs.length > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${cat.color}18`, color: cat.color }}>
            {docs.length}
          </span>
        )}
        {open ? <ChevronDown className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} /> : <ChevronRight className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />}
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--pg-card-border)" }}>
          {docs.length === 0 ? (
            <p className="px-4 py-4 text-[12px] text-center" style={{ color: "var(--pg-text-4)" }}>
              No {cat.label.toLowerCase()} uploaded yet.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[13px]"
                       style={{ background: doc.mime_type?.startsWith("image/") ? "#dbeafe" : "#f1f5f9" }}>
                    {doc.mime_type?.startsWith("image/") ? "🖼" : doc.mime_type === "application/pdf" ? "📄" : "📎"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{doc.filename}</p>
                    <p className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>{fmtSize(doc.size_bytes)} · {fmtDate(doc.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={`${BASE}/api/v1/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer"
                       title="Open / Download"
                       className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                       onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                       onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <Eye className="w-3.5 h-3.5" style={{ color: "var(--pg-text-3)" }} />
                    </a>
                    <a href={`${BASE}/api/v1/documents/${doc.id}/download`} download={doc.filename}
                       title="Download"
                       className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                       onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                       onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <Download className="w-3.5 h-3.5" style={{ color: "var(--pg-text-3)" }} />
                    </a>
                    <button onClick={() => onDelete(doc.id)} title="Delete"
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fee2e2"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <Trash2 className="w-3.5 h-3.5" style={{ color: "#dc2626" }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, subsidiary } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const [tab, setTab]             = useState<"profile" | "documents">("profile");
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedCat, setSelectedCat] = useState("other");
  const [displayName, setDisplayName] = useState(user?.DisplayName ?? "");

  useEffect(() => { setDisplayName(user?.DisplayName ?? ""); }, [user?.DisplayName]);

  const initials = (user?.DisplayName ?? "?")
    .split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  // ── Fetch personal documents ──────────────────────────────────────────────

  const { data: docs = [], isLoading: docsLoading } = useQuery<Doc[]>({
    queryKey: ["my-personal-docs"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/documents?vault_type=personal`, { credentials: "include" });
      if (!res.ok) return [];
      return (await res.json()) ?? [];
    },
  });

  const docsByCategory = DOC_CATEGORIES.reduce<Record<string, Doc[]>>((acc, cat) => {
    acc[cat.key] = docs.filter(d => (d.category ?? "other") === cat.key);
    return acc;
  }, {});

  const totalDocs = docs.length;

  // ── Actions ───────────────────────────────────────────────────────────────

  async function uploadDoc(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 20 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new globalThis.FormData();
      fd.append("file", file);
      fd.append("vault_type", "personal");
      fd.append("category", selectedCat);
      const res = await fetch(`${BASE}/api/v1/documents/`, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      qc.invalidateQueries({ queryKey: ["my-personal-docs"] });
      toast({ title: "Document uploaded", description: `${file.name} saved to ${DOC_CATEGORIES.find(c => c.key === selectedCat)?.label ?? selectedCat}.` });
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function deleteDoc(id: string) {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    try {
      const res = await fetch(`${BASE}/api/v1/documents/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      qc.invalidateQueries({ queryKey: ["my-personal-docs"] });
      toast({ title: "Document deleted" });
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function saveProfile() {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/v1/identity/me`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      if (!res.ok) throw new Error("Update failed — contact HR to update profile details.");
      toast({ title: "Profile updated", description: "Your display name has been saved." });
      setEditing(false);
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[860px] mx-auto space-y-5">

      {/* Profile header card */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>

        <div className="px-6 pt-5 pb-5">
          <div className="flex items-center gap-4 mb-4">
            {/* Avatar with photo-change hover */}
            <div className="relative group cursor-pointer" onClick={() => photoRef.current?.click()}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-[20px] font-bold text-white"
                   style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 2px 12px rgba(255,102,0,0.3)" }}>
                {initials}
              </div>
              <div className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                   style={{ background: "rgba(0,0,0,0.5)" }}>
                <Camera className="w-5 h-5 text-white" />
              </div>
            </div>
            <input ref={photoRef} type="file" accept="image/*" className="hidden"
                   onChange={e => { const f = e.target.files?.[0]; if (f) { setSelectedCat("profile_photo"); uploadDoc(f); } }} />

            {/* Name + role */}
            <div className="flex-1 mb-2 min-w-0">
              {editing ? (
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="h-9 px-3 rounded-xl text-[16px] font-bold outline-none w-full max-w-xs"
                  style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
                  autoFocus
                />
              ) : (
                <h1 className="text-[18px] font-bold truncate" style={{ color: "var(--pg-text-1)" }}>{user?.DisplayName ?? "—"}</h1>
              )}
              <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                {subsidiary?.Name ?? "Page Group"}
              </p>
            </div>

            {/* Edit / Save */}
            <div className="mb-2 flex items-center gap-2 shrink-0">
              {editing ? (
                <>
                  <button onClick={saveProfile} disabled={saving}
                          className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white disabled:opacity-60"
                          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                  </button>
                  <button onClick={() => { setEditing(false); setDisplayName(user?.DisplayName ?? ""); }}
                          className="flex items-center gap-1 h-8 px-3 rounded-xl text-[12px] font-semibold"
                          style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setEditing(true)}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold"
                        style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>
          </div>

          {/* Info pills */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Mail,      label: "Email",      value: user?.Email ?? "—" },
              { icon: Building2, label: "Subsidiary", value: subsidiary?.Name ?? "—" },
              { icon: User,      label: "Account",    value: "Active" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                   style={{ background: "var(--pg-muted-bg)" }}>
                <Icon className="w-4 h-4 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>{label}</p>
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--pg-muted-bg)" }}>
        {(["profile", "documents"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
                  className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold capitalize transition-all"
                  style={{
                    background: tab === t ? "var(--pg-card)" : "transparent",
                    color: tab === t ? "var(--pg-text-1)" : "var(--pg-text-3)",
                    boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  }}>
            {t === "documents" && totalDocs > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "#FF660015", color: "#FF6600" }}>{totalDocs}</span>
            )}
            {t === "profile" ? "Profile" : "My Documents"}
          </button>
        ))}
      </div>

      {/* ── Profile tab ── */}
      {tab === "profile" && (
        <div className="rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Personal Information</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Edit your display name above. Contact HR to update role, email or subsidiary.
            </p>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "Display Name",  value: user?.DisplayName,   icon: User,      editable: true },
              { label: "Email Address", value: user?.Email,          icon: Mail,      editable: false },
              { label: "Subsidiary",    value: subsidiary?.Name,     icon: Building2, editable: false },
            ].map(({ label, value, icon: Icon, editable }) => (
              <div key={label}>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
                       style={{ color: "var(--pg-text-3)" }}>{label}</label>
                {editing && editable ? (
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                         className="w-full h-9 px-3 rounded-xl text-[13px] outline-none"
                         style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                       style={{ background: "var(--pg-muted-bg)" }}>
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                    <p className="text-[13px]" style={{ color: "var(--pg-text-1)" }}>{value ?? "—"}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {editing && (
            <div className="px-5 pb-5">
              <button onClick={saveProfile} disabled={saving}
                      className="flex items-center gap-2 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                      style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save changes
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Documents tab ── */}
      {tab === "documents" && (
        <div className="space-y-4">
          {/* Upload card */}
          <div className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Upload a Document</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Choose a category then drop or click to upload. Max 20 MB.</p>
            </div>
            <div className="p-5 space-y-3">
              {/* Category selector */}
              <div className="flex flex-wrap gap-2">
                {DOC_CATEGORIES.map(cat => {
                  const CatIcon = cat.icon;
                  const active = selectedCat === cat.key;
                  return (
                    <button key={cat.key} onClick={() => setSelectedCat(cat.key)}
                            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-all"
                            style={{
                              background: active ? cat.color : "var(--pg-muted-bg)",
                              color: active ? "#fff" : "var(--pg-text-2)",
                              border: `1px solid ${active ? cat.color : "var(--pg-card-border)"}`,
                            }}>
                      <CatIcon className="w-3 h-3" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              {/* Drop zone */}
              <label htmlFor="profile-doc-upload"
                     className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl cursor-pointer transition-all"
                     style={{ border: "2px dashed var(--pg-card-border)", background: "var(--pg-muted-bg)" }}
                     onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "#FF6600"}
                     onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)"}
                     onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "#FF6600"; }}
                     onDragLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)"}
                     onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)"; const f = e.dataTransfer.files[0]; if (f) uploadDoc(f); }}>
                {uploading
                  ? <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#FF6600" }} />
                  : <Upload className="w-6 h-6" style={{ color: "var(--pg-text-3)" }} />}
                <span className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
                  {uploading ? "Uploading…" : <>Drop file here or <span style={{ color: "#FF6600", fontWeight: 600 }}>click to browse</span></>}
                </span>
                <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                  Uploading to: <strong>{DOC_CATEGORIES.find(c => c.key === selectedCat)?.label}</strong>
                </span>
              </label>
              <input id="profile-doc-upload" type="file" className="hidden" ref={fileInputRef}
                     onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(f); if (e.target) e.target.value = ""; }} />
            </div>
          </div>

          {/* Documents by category */}
          {docsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
            </div>
          ) : (
            <div className="space-y-2">
              {DOC_CATEGORIES.map(cat => (
                <DocCategory key={cat.key} cat={cat} docs={docsByCategory[cat.key] ?? []} onDelete={deleteDoc} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
