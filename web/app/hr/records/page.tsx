"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import {
  Search, UserPlus, RefreshCw, UserX, UserCheck,
  ChevronRight, X, Check, AlertCircle, Copy, CheckCircle2,
  ArrowRight, Building2, Briefcase, FolderPlus,
  Upload, FileText, File, Image, Download, Shield, ShieldCheck,
  ShieldAlert, Loader2, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { usePosition } from "@/lib/position";

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = {
  position_code: string; position_title: string;
  subsidiary_id?: string; subsidiary_name?: string;
  is_primary: boolean; effective_from: string;
};

type Employee = {
  user_id: string; email: string; display_name: string;
  user_status: "active" | "inactive"; person_id?: string;
  assignments: Assignment[];
};

type SubsidiaryOption = { id: string; code: string; name: string };
type Position = { id: string; code: string; title: string; subsidiary_id?: string; is_group_level: boolean; reports_to_title?: string };

// ── Document types ─────────────────────────────────────────────────────────────

type EmployeeDocument = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  scan_status: string;
  created_at: string;
  uploaded_by: string;
  category?: string;
};

// ── Document viewer ────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ScanBadge({ status }: { status: string }) {
  if (status === "clean")
    return <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><ShieldCheck className="w-3 h-3" />Clean</span>;
  if (status === "infected")
    return <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600"><ShieldAlert className="w-3 h-3" />Infected</span>;
  return <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "var(--pg-text-4)" }}><Shield className="w-3 h-3" />Scanning…</span>;
}

function DocIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />;
}

function DocumentPreviewModal({ doc, downloadUrl, onClose }: {
  doc: EmployeeDocument;
  downloadUrl: string;
  onClose: () => void;
}) {
  const isImage = doc.mime_type.startsWith("image/");
  const isPdf   = doc.mime_type === "application/pdf";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
         onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", maxHeight: "90vh", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <DocIcon mimeType={doc.mime_type} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>{doc.filename}</p>
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                {formatBytes(doc.size_bytes)} · {new Date(doc.created_at).toLocaleDateString("en-GB")} · <ScanBadge status={doc.scan_status} />
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white"
               style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              <Download className="w-3.5 h-3.5" /> Download
            </a>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ color: "var(--pg-text-3)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-0">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={downloadUrl} alt={doc.filename}
                 className="max-w-full max-h-full object-contain rounded-lg" />
          ) : isPdf ? (
            <iframe src={downloadUrl} title={doc.filename}
                    className="w-full rounded-lg" style={{ height: "65vh", border: "none" }} />
          ) : (
            <div className="text-center py-12">
              <DocIcon mimeType={doc.mime_type} />
              <p className="text-[13px] mt-3" style={{ color: "var(--pg-text-2)" }}>Preview not available for this file type.</p>
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer"
                 className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                 style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                <Download className="w-3.5 h-3.5" /> Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Employee Documents section ─────────────────────────────────────────────────

const CATEGORIES = [
  { key: "medical",    label: "Medical",    color: "#dc2626", bg: "#fee2e2" },
  { key: "education",  label: "Education",  color: "#2563eb", bg: "#dbeafe" },
  { key: "employment", label: "Employment", color: "#059669", bg: "#d1fae5" },
  { key: "referral",   label: "Referral",   color: "#d97706", bg: "#fef3c7" },
  { key: "compliance", label: "Compliance", color: "#7c3aed", bg: "#ede9fe" },
  { key: "other",      label: "Other",      color: "#64748b", bg: "#f1f5f9" },
] as const;

type CategoryKey = typeof CATEGORIES[number]["key"];

function CategoryBadge({ cat }: { cat: string }) {
  const cfg = CATEGORIES.find(c => c.key === cat) ?? CATEGORIES[CATEGORIES.length - 1];
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
          style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function EmployeeDocuments({ employee }: { employee: Employee }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>("other");
  const [filterCat, setFilterCat] = useState<CategoryKey | "all">("all");
  const [previewDoc, setPreviewDoc] = useState<{ doc: EmployeeDocument; url: string } | null>(null);

  const { data: docs = [], isLoading: loadingDocs } = useQuery<EmployeeDocument[]>({
    queryKey: ["employee-docs", employee.user_id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/documents?for_employee_id=${employee.user_id}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as EmployeeDocument[];
    },
    enabled: Boolean(employee.user_id),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 20 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("vault_type", "hr_employee");
      form.append("for_employee_id", employee.user_id);
      form.append("category", selectedCategory);
      const res = await fetch(`${BASE}/api/v1/documents`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message ?? "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["employee-docs", employee.user_id] });
      toast({ title: "Document Uploaded", description: `${file.name} saved to ${employee.display_name}'s profile.` });
    } catch (err) {
      toast({ title: "Upload Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filteredDocs = filterCat === "all" ? docs : docs.filter(d => (d as any).category === filterCat);

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--pg-text-3)" }}>
          Documents {docs.length > 0 && `(${docs.length})`}
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 h-6 px-2.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange}
               accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.csv,.txt" />
      </div>

      {/* Category selector for upload */}
      <div className="mb-3">
        <p className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-4)" }}>Upload as:</p>
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(cat => (
            <button key={cat.key}
                    onClick={() => setSelectedCategory(cat.key)}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all"
                    style={selectedCategory === cat.key
                      ? { background: cat.bg, color: cat.color, borderColor: cat.color }
                      : { background: "transparent", color: "var(--pg-text-3)", borderColor: "var(--pg-card-border)" }}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter by category */}
      {docs.length > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setFilterCat("all")}
                    className="text-[10px] px-2 py-0.5 rounded-full border transition-all"
                    style={filterCat === "all"
                      ? { background: "var(--pg-text-1)", color: "var(--pg-card)", borderColor: "var(--pg-text-1)" }
                      : { color: "var(--pg-text-3)", borderColor: "var(--pg-card-border)" }}>
              All
            </button>
            {CATEGORIES.filter(c => docs.some(d => (d as any).category === c.key)).map(cat => (
              <button key={cat.key} onClick={() => setFilterCat(cat.key)}
                      className="text-[10px] px-2 py-0.5 rounded-full border transition-all"
                      style={filterCat === cat.key
                        ? { background: cat.bg, color: cat.color, borderColor: cat.color }
                        : { color: "var(--pg-text-3)", borderColor: "var(--pg-card-border)" }}>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Document list */}
      {loadingDocs ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pg-text-4)" }} />
        </div>
      ) : docs.length === 0 ? (
        <div className="py-4 text-center rounded-xl" style={{ background: "var(--pg-muted-bg)", border: "1px dashed var(--pg-card-border)" }}>
          <p className="text-[12px]" style={{ color: "var(--pg-text-4)" }}>No documents yet</p>
          <button onClick={() => fileInputRef.current?.click()}
                  className="mt-1.5 text-[11px] font-medium text-blue-600 hover:underline">
            Upload first document →
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredDocs.map(doc => (
            <div key={doc.id}
                 className="flex items-center gap-2 px-3 py-2 rounded-xl group"
                 style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
              <DocIcon mimeType={doc.mime_type} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{doc.filename}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {(doc as any).category && <CategoryBadge cat={(doc as any).category} />}
                  <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>{formatBytes(doc.size_bytes)}</span>
                  <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>·</span>
                  <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>{new Date(doc.created_at).toLocaleDateString("en-GB")}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setPreviewDoc({ doc, url: `${BASE}/api/v1/documents/${doc.id}/download` })}
                        title="Preview"
                        className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
                        style={{ color: "var(--pg-text-3)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-card)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <a href={`${BASE}/api/v1/documents/${doc.id}/download`}
                   target="_blank" rel="noopener noreferrer" title="Download"
                   className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
                   style={{ color: "var(--pg-text-3)" }}
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-card)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
          {filteredDocs.length === 0 && filterCat !== "all" && (
            <p className="text-[11px] text-center py-2" style={{ color: "var(--pg-text-4)" }}>No {filterCat} documents yet.</p>
          )}
        </div>
      )}

      {previewDoc && (
        <DocumentPreviewModal
          doc={previewDoc.doc}
          downloadUrl={previewDoc.url}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";
async function adminPost(path: string, body?: object) {
  const res = await fetch(`${BASE}/api/v1/admin${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message ?? "Request failed");
  }
  return res.json();
}

// ── Add-to-department dialog ──────────────────────────────────────────────────

type Department = { id: string; subsidiary_id: string; code: string; name: string };

function AddToDepartmentDialog({
  employee, subsidiaries, onClose,
}: { employee: Employee; subsidiaries: SubsidiaryOption[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSub, setSelectedSub]     = useState("");
  const [departmentId, setDepartmentId]   = useState("");
  const [positionCode, setPositionCode]   = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState("");

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments", selectedSub],
    queryFn: async () => {
      const params = selectedSub ? `?subsidiary_id=${selectedSub}` : "";
      const res = await fetch(`${BASE}/api/v1/org/departments${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as Department[];
    },
    enabled: Boolean(selectedSub),
  });

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["positions-for-dept", selectedSub],
    queryFn: async () => {
      const params = selectedSub ? `?subsidiary_id=${selectedSub}` : "";
      const res = await fetch(`${BASE}/api/v1/org/positions${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as Position[];
    },
    enabled: Boolean(selectedSub),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSub) { setError("Select a subsidiary."); return; }
    if (!positionCode) { setError("Select a position."); return; }
    setSaving(true); setError("");
    try {
      // Find position_id from code
      const pos = positions.find(p => p.code === positionCode);
      if (!pos) throw new Error("Position not found");

      const body: Record<string, unknown> = {
        person_id:     employee.person_id,
        position_id:   pos.id,
        subsidiary_id: selectedSub,
        effective_from: effectiveFrom,
        is_primary:    false,
      };
      if (departmentId) body.department_id = departmentId;

      const res = await fetch(`${BASE}/api/v1/org/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message ?? "Failed to create assignment");
      }
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      toast({ title: "Assignment Added", description: `${employee.display_name} has been added to the selected department.` });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Add to Department</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{employee.display_name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Subsidiary */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Subsidiary</label>
            <select value={selectedSub} onChange={e => { setSelectedSub(e.target.value); setDepartmentId(""); setPositionCode(""); }} required
                    className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
              <option value="">Select subsidiary…</option>
              {subsidiaries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Department (optional) */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Department <span style={{ color: "var(--pg-text-4)" }}>— optional</span>
            </label>
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
                    disabled={!selectedSub}
                    className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)", opacity: !selectedSub ? 0.5 : 1 }}>
              <option value="">No specific department</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Position */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Position {!selectedSub && <span style={{ color: "var(--pg-text-4)" }}>— select subsidiary first</span>}
            </label>
            <select value={positionCode} onChange={e => setPositionCode(e.target.value)} required
                    disabled={!selectedSub}
                    className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)", opacity: !selectedSub ? 0.5 : 1 }}>
              <option value="">Select position…</option>
              {positions.map(p => <option key={p.id} value={p.code}>{p.title}</option>)}
            </select>
            {positionCode && (() => { const pos = positions.find(p => p.code === positionCode); return pos?.reports_to_title ? (
              <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                Reports to: <span className="font-semibold" style={{ color: "var(--pg-text-2)" }}>{pos.reports_to_title}</span>
              </p>
            ) : null; })()}
          </div>

          {/* Effective date */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Effective Date</label>
            <input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)}
                   className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                   style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {saving ? "Adding…" : "Add Assignment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Transfer dialog ────────────────────────────────────────────────────────────

function TransferDialog({
  employee, subsidiaries, onClose,
}: { employee: Employee; subsidiaries: SubsidiaryOption[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [positionCode, setPositionCode]   = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [endCurrent, setEndCurrent]       = useState(true);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState("");

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["positions", selectedSubs[0] ?? ""],
    queryFn: async () => {
      const params = selectedSubs[0] ? `?subsidiary_id=${selectedSubs[0]}` : "";
      const res = await fetch(`${BASE}/api/v1/org/positions${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as Position[];
    },
    enabled: selectedSubs.length > 0,
  });

  function toggleSub(id: string) {
    setSelectedSubs(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
    setPositionCode("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedSubs.length === 0) { setError("Select at least one subsidiary."); return; }
    if (!positionCode) { setError("Select a position."); return; }
    setSaving(true); setError("");
    try {
      await adminPost(`/users/${employee.user_id}/transfer`, {
        new_position_code: positionCode,
        new_subsidiary_ids: selectedSubs,
        effective_from: effectiveFrom,
        end_current: endCurrent,
      });
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      toast({ title: "Transfer Complete", description: `${employee.display_name} has been transferred.` });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const currentRole = employee.assignments?.find(a => a.is_primary);
  const subPositions  = positions.filter(p => !p.is_group_level);
  const groupPositions = positions.filter(p => p.is_group_level);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Transfer Employee</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{employee.display_name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">
          {/* Current assignment */}
          {currentRole && (
            <div className="px-4 py-3 rounded-xl" style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>Current Role</p>
              <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>
                {currentRole.position_title} · {currentRole.subsidiary_name ?? "Group-level"}
              </p>
            </div>
          )}

          {/* New subsidiaries (multi-select checkboxes) */}
          <div>
            <p className="text-[12px] font-medium mb-2" style={{ color: "var(--pg-text-2)" }}>
              New Subsidiary(ies) <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>— can select more than one</span>
            </p>
            <div className="space-y-2 p-3 rounded-xl" style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)" }}>
              {subsidiaries.map(s => (
                <label key={s.id} className="flex items-center gap-2.5 cursor-pointer py-0.5">
                  <div className={cn("w-4 h-4 rounded flex items-center justify-center border transition-all",
                                     selectedSubs.includes(s.id) ? "border-blue-500 bg-blue-500" : "border-slate-300 dark:border-slate-600")}
                       onClick={() => toggleSub(s.id)}>
                    {selectedSubs.includes(s.id) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="text-[13px]" style={{ color: "var(--pg-text-1)" }}>{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Position dropdown */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              New Position {selectedSubs.length === 0 && <span style={{ color: "var(--pg-text-4)" }}>— select subsidiary first</span>}
            </label>
            <select value={positionCode} onChange={e => setPositionCode(e.target.value)} required
                    disabled={selectedSubs.length === 0}
                    className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
              <option value="">Select position…</option>
              {subPositions.length > 0 && <optgroup label="Subsidiary roles">{subPositions.map(p => <option key={p.id} value={p.code}>{p.title}</option>)}</optgroup>}
              {groupPositions.length > 0 && <optgroup label="Group-level">{groupPositions.map(p => <option key={p.id} value={p.code}>{p.title}</option>)}</optgroup>}
            </select>
            {positionCode && (() => { const pos = positions.find(p => p.code === positionCode); return pos?.reports_to_title ? (
              <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                Reports to: <span className="font-semibold" style={{ color: "var(--pg-text-2)" }}>{pos.reports_to_title}</span>
              </p>
            ) : null; })()}
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Effective Date</label>
              <input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)}
                     className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <div className={cn("w-4 h-4 rounded border transition-all flex items-center justify-center",
                                   endCurrent ? "bg-blue-500 border-blue-500" : "border-slate-300 dark:border-slate-600")}
                     onClick={() => setEndCurrent(v => !v)}>
                  {endCurrent && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>End current assignment(s)</span>
              </label>
            </div>
          </div>

          {error && <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-red-600">{error}</p>
          </div>}

          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {saving ? "Transferring…" : "Confirm Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reset password dialog ──────────────────────────────────────────────────────

function ResetPasswordDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function doReset() {
    setLoading(true);
    try {
      const { temporary_password } = await adminPost(`/users/${employee.user_id}/reset-password`);
      setNewPassword(temporary_password);
      toast({ title: "Password Reset", description: "Copy the temporary password and send it to the employee." });
    } catch (err) {
      toast({ title: "Reset Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function copyPwd() {
    navigator.clipboard.writeText(newPassword).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Reset Password</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
            Resetting password for <strong>{employee.display_name}</strong> ({employee.email}).<br />
            A new temporary password will be generated for you to share securely.
          </p>
          {!newPassword ? (
            <button onClick={doReset} disabled={loading}
                    className="w-full h-10 rounded-xl text-[13px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {loading ? "Generating…" : "Generate New Password"}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-emerald-600">✓ Password reset. Copy and send securely:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-10 px-3 rounded-xl font-mono text-[13px] flex items-center"
                     style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}>
                  {newPassword}
                </div>
                <button onClick={copyPwd}
                        className="w-10 h-10 flex items-center justify-center rounded-xl transition-colors"
                        style={{ border: "1px solid var(--pg-card-border)", color: copied ? "#059669" : "var(--pg-text-3)" }}>
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <button onClick={onClose} className="w-full h-9 rounded-xl text-[13px] font-medium" style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HRRecordsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { subsidiary } = useAuth();
  const { activePosition } = usePosition();
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState<"all"|"active"|"inactive"|"unassigned">("all");
  const [subFilter, setSubFilter]   = useState("all");
  const [selected, setSelected]     = useState<Employee | null>(null);

  // Sync subsidiary filter to active position context (same logic as HR dashboard)
  useEffect(() => {
    if (!activePosition) return;
    if (activePosition.subsidiary_id) {
      setSubFilter(activePosition.subsidiary_id);
    } else if (!activePosition.subsidiary_id && subsidiary?.ID) {
      setSubFilter("all");
    }
  }, [activePosition?.id, subsidiary?.ID]);
  const [transferEmp, setTransfer]  = useState<Employee | null>(null);
  const [resetEmp, setResetEmp]     = useState<Employee | null>(null);
  const [addDeptEmp, setAddDept]    = useState<Employee | null>(null);

  const { data: rawUsers = [], isLoading } = useQuery({
    queryKey: ["org-users"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/users`, { credentials: "include" });
      if (!res.ok) return [] as Employee[];
      const json = ((await res.json()) ?? []) as Array<{ user_id: string; email: string; display_name: string; user_status: string; person_id?: string; assignments?: Assignment[] }>;
      return json.map(u => ({ ...u, assignments: u.assignments ?? [] })) as Employee[];
    },
  });

  const { data: subsidiaries = [] } = useQuery<SubsidiaryOption[]>({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/subsidiaries`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as SubsidiaryOption[];
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (emp: Employee) => adminPost(`/users/${emp.user_id}/${emp.user_status === "active" ? "deactivate" : "reactivate"}`),
    onSuccess: (_, emp) => {
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      toast({ title: emp.user_status === "active" ? "User Deactivated" : "User Reactivated" });
      setSelected(null);
    },
    onError: (err) => toast({ title: "Failed", description: (err as Error).message, variant: "destructive" }),
  });

  const filtered = rawUsers.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      || u.assignments?.some(a => a.position_title?.toLowerCase().includes(q) || a.subsidiary_name?.toLowerCase().includes(q));
    const matchFilter = filter === "all"
      || (filter === "active"     && u.user_status === "active")
      || (filter === "inactive"   && u.user_status === "inactive")
      || (filter === "unassigned" && !u.assignments?.length);
    const matchSub = subFilter === "all" || u.assignments?.some(a => a.subsidiary_id === subFilter);
    return matchSearch && matchFilter && matchSub;
  });

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Employee Directory</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Page Group · {rawUsers.length} people</p>
        </div>
        <Link href="/hr/admin"
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 6px rgba(37,99,235,0.35)" }}>
          <UserPlus className="w-3.5 h-3.5" /> Onboard User
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl flex-1 max-w-xs"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, role…"
                 className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {(["all","active","inactive","unassigned"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
                    className={cn("h-7 px-3 rounded-lg text-[11px] font-medium capitalize transition-all", filter !== f && "")}
                    style={filter === f ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "white" } : { color: "var(--pg-text-2)" }}>
              {f}
            </button>
          ))}
        </div>
        {subsidiaries.length > 0 && (
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <button onClick={() => setSubFilter("all")}
                    className="h-7 px-3 rounded-lg text-[11px] font-medium transition-all"
                    style={subFilter === "all" ? { background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "white" } : { color: "var(--pg-text-2)" }}>
              All
            </button>
            {subsidiaries.map(s => (
              <button key={s.id} onClick={() => setSubFilter(s.id)}
                      className="h-7 px-3 rounded-lg text-[11px] font-medium transition-all"
                      style={subFilter === s.id ? { background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "white" } : { color: "var(--pg-text-2)" }}>
                {s.name.replace("Page ", "")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main: list + detail panel */}
      <div className={cn("grid gap-5", selected ? "xl:grid-cols-3" : "grid-cols-1")}>

        {/* Employee list */}
        <div className={selected ? "xl:col-span-2" : ""}>
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            {/* Table header */}
            <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
                 style={{ gridTemplateColumns: "2.5fr 1.5fr 1.5fr 80px 100px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
              <span>Employee</span>
              <span>Position</span>
              <span>Subsidiary</span>
              <span>Status</span>
              <span />
            </div>

            {isLoading ? (
              <div className="py-12 flex justify-center">
                <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--pg-text-4)", borderTopColor: "#2563eb" }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No employees match your search.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {filtered.map(emp => {
                  const primary = emp.assignments?.find(a => a.is_primary) ?? emp.assignments?.[0];
                  const subs = [...new Set(emp.assignments?.filter(a => a.subsidiary_name).map(a => a.subsidiary_name) ?? [])];
                  const isSelected = selected?.user_id === emp.user_id;
                  return (
                    <div key={emp.user_id}
                         className="grid items-center gap-2 px-5 py-3 cursor-pointer transition-colors"
                         style={{ gridTemplateColumns: "2.5fr 1.5fr 1.5fr 80px 100px", background: isSelected ? "rgba(37,99,235,0.05)" : undefined }}
                         onClick={() => setSelected(isSelected ? null : emp)}
                         onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                         onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = ""; }}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                             style={{ background: emp.user_status === "active" ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "#94a3b8" }}>
                          {initials(emp.display_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{emp.display_name}</p>
                          <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>{emp.email}</p>
                        </div>
                      </div>
                      <p className="text-[12px] truncate" style={{ color: "var(--pg-text-2)" }}>{primary?.position_title ?? "—"}</p>
                      <div className="flex flex-wrap gap-1">
                        {subs.length === 0 ? (
                          <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>No assignment</span>
                        ) : subs.map(s => (
                          <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>{s?.split(" ")[1] ?? s}</span>
                        ))}
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                            style={{ background: emp.user_status === "active" ? "#d1fae5" : "#fee2e2", color: emp.user_status === "active" ? "#065f46" : "#991b1b" }}>
                        {emp.user_status}
                      </span>
                      <ChevronRight className="w-4 h-4 justify-self-end" style={{ color: "var(--pg-text-4)" }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Employee Details</h3>
              <button onClick={() => setSelected(null)} className="w-6 h-6 flex items-center justify-center rounded" style={{ color: "var(--pg-text-3)" }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {/* Avatar + name */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-bold text-white"
                     style={{ background: selected.user_status === "active" ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "#94a3b8" }}>
                  {initials(selected.display_name)}
                </div>
                <div>
                  <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>{selected.display_name}</p>
                  <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>{selected.email}</p>
                </div>
              </div>

              {/* Assignments */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--pg-text-3)" }}>Current Roles</p>
                {selected.assignments.length === 0 ? (
                  <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>No org assignment yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.assignments.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--pg-muted-bg)" }}>
                        <Briefcase className="w-3.5 h-3.5 shrink-0" style={{ color: "#2563eb" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{a.position_title}</p>
                          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{a.subsidiary_name ?? "Group-level"} {a.is_primary && "· Primary"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Documents */}
              <div className="pt-1" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                <EmployeeDocuments employee={selected} />
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                <button onClick={() => { setAddDept(selected); setSelected(null); }}
                        className="w-full flex items-center gap-2 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors"
                        style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <FolderPlus className="w-3.5 h-3.5 text-violet-600" /> Add to Department
                </button>
                <button onClick={() => { setTransfer(selected); setSelected(null); }}
                        className="w-full flex items-center gap-2 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors"
                        style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <ArrowRight className="w-3.5 h-3.5 text-blue-600" /> Transfer / Change Role
                </button>
                <button onClick={() => { setResetEmp(selected); setSelected(null); }}
                        className="w-full flex items-center gap-2 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors"
                        style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" /> Reset Password
                </button>
                <button onClick={() => deactivateMutation.mutate(selected)}
                        disabled={deactivateMutation.isPending}
                        className="w-full flex items-center gap-2 h-9 px-3 rounded-xl text-[12px] font-medium transition-colors"
                        style={{ border: `1px solid ${selected.user_status === "active" ? "#fca5a5" : "#a7f3d0"}`, color: selected.user_status === "active" ? "#dc2626" : "#059669" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = selected.user_status === "active" ? "#fef2f2" : "#ecfdf5"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  {selected.user_status === "active" ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                  {selected.user_status === "active" ? "Deactivate Account" : "Reactivate Account"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {addDeptEmp  && <AddToDepartmentDialog employee={addDeptEmp} subsidiaries={subsidiaries} onClose={() => setAddDept(null)} />}
      {transferEmp && <TransferDialog employee={transferEmp} subsidiaries={subsidiaries} onClose={() => setTransfer(null)} />}
      {resetEmp    && <ResetPasswordDialog employee={resetEmp} onClose={() => setResetEmp(null)} />}
    </div>
  );
}
