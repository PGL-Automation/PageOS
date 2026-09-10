"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Shield, Wallet, FileText, Briefcase, Award, Activity, FolderOpen,
  Upload, X, Edit2, Save, Loader2, ChevronDown, ChevronRight,
  Download, Trash2, Eye, Camera, User, ArrowLeft, Plus,
  Key, UserX, UserCheck, ArrowRightLeft, Calendar, Copy, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePosition, roleFamily } from "@/lib/position";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = {
  position_code: string;
  position_title: string;
  subsidiary_id?: string;
  subsidiary_name?: string;
  is_primary: boolean;
  effective_from: string;
  employment_type: string;
  grade_level_code?: string;
  grade_level_name?: string;
};

type PersonProfile = {
  user_id: string;
  person_id?: string;
  display_name: string;
  email: string;
  user_status: string;
  gender?: string;
  phone?: string;
  date_of_birth?: string;
  nationality?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
  home_organization?: string;
  assignments: Assignment[];
  photo_url?: string;
};

type EmployeeDocument = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  scan_status: string;
  created_at: string;
  uploaded_by: string;
  category?: string;
  vault_type?: string;
};

// ── Document category config ───────────────────────────────────────────────────

type DocCategoryKey =
  | "id_documents"
  | "bank_statements"
  | "tax_documents"
  | "employment_records"
  | "certificates"
  | "medical"
  | "other";

const DOC_CATEGORIES: {
  key: DocCategoryKey;
  label: string;
  color: string;
  bg: string;
  Icon: React.ElementType;
}[] = [
  { key: "id_documents",      label: "ID Documents",       color: "#1d4ed8", bg: "#dbeafe", Icon: Shield },
  { key: "bank_statements",   label: "Bank Statements",    color: "#059669", bg: "#d1fae5", Icon: Wallet },
  { key: "tax_documents",     label: "Tax Documents",      color: "#d97706", bg: "#fef3c7", Icon: FileText },
  { key: "employment_records",label: "Employment Records", color: "#FF6600", bg: "#fff0e0", Icon: Briefcase },
  { key: "certificates",      label: "Certificates",       color: "#7c3aed", bg: "#ede9fe", Icon: Award },
  { key: "medical",           label: "Medical",            color: "#dc2626", bg: "#fee2e2", Icon: Activity },
  { key: "other",             label: "Other",              color: "#475569", bg: "#f1f5f9", Icon: FolderOpen },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB");
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({
  name,
  photoUrl,
  size = 64,
}: {
  name: string;
  photoUrl?: string;
  size?: number;
}) {
  const fontSize = Math.round(size * 0.28);
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{
        width: size,
        height: size,
        fontSize,
        background: "linear-gradient(135deg,#FF6600,#E05500)",
      }}
    >
      {initials(name)}
    </div>
  );
}

// ── Scan badge ─────────────────────────────────────────────────────────────────

function ScanBadge({ status }: { status: string }) {
  if (status === "clean")
    return (
      <span className="text-[10px] font-semibold text-emerald-600">
        Clean
      </span>
    );
  if (status === "infected")
    return (
      <span className="text-[10px] font-semibold text-red-600">
        Infected
      </span>
    );
  return (
    <span
      className="text-[10px] font-semibold"
      style={{ color: "var(--pg-text-4)" }}
    >
      Scanning…
    </span>
  );
}

// ── Field (label + value display or editable input) ───────────────────────────

function Field({
  label,
  value,
  editing,
  inputKey,
  form,
  onChange,
  type = "text",
  options,
}: {
  label: string;
  value?: string;
  editing: boolean;
  inputKey: string;
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
  type?: string;
  options?: { value: string; label: string }[];
}) {
  const current = form[inputKey] ?? value ?? "";

  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: "var(--pg-text-3)" }}
      >
        {label}
      </span>
      {editing ? (
        options ? (
          <select
            value={current}
            onChange={(e) => onChange(inputKey, e.target.value)}
            className="h-9 px-3 rounded-xl text-[13px] outline-none appearance-none"
            style={{
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-1)",
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={current}
            onChange={(e) => onChange(inputKey, e.target.value)}
            className="h-9 px-3 rounded-xl text-[13px] outline-none"
            style={{
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-1)",
            }}
          />
        )
      ) : (
        <span
          className="text-[13px]"
          style={{ color: current ? "var(--pg-text-1)" : "var(--pg-text-4)" }}
        >
          {current || "—"}
        </span>
      )}
    </div>
  );
}

// ── Document preview modal ─────────────────────────────────────────────────────

function DocPreviewModal({
  doc,
  downloadUrl,
  onClose,
}: {
  doc: EmployeeDocument;
  downloadUrl: string;
  onClose: () => void;
}) {
  const isImage = doc.mime_type.startsWith("image/");
  const isPdf = doc.mime_type === "application/pdf";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          maxHeight: "90vh",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ borderBottom: "1px solid var(--pg-row-border)" }}
        >
          <div className="min-w-0">
            <p
              className="text-[13px] font-semibold truncate"
              style={{ color: "var(--pg-text-1)" }}
            >
              {doc.filename}
            </p>
            <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              <span>{formatBytes(doc.size_bytes)}</span>
              <span>·</span>
              <span>{fmtDate(doc.created_at)}</span>
              <span>·</span>
              <ScanBadge status={doc.scan_status} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl"
              style={{ color: "var(--pg-text-3)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-0">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={downloadUrl}
              alt={doc.filename}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          ) : isPdf ? (
            <iframe
              src={downloadUrl}
              title={doc.filename}
              className="w-full rounded-lg"
              style={{ height: "65vh", border: "none" }}
            />
          ) : (
            <div className="text-center py-12">
              <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--pg-text-3)" }} />
              <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
                Preview not available for this file type.
              </p>
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
              >
                <Download className="w-3.5 h-3.5" /> Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Document category section ──────────────────────────────────────────────────

function DocCategorySection({
  catKey,
  docs,
  isHR,
  onPreview,
  onDelete,
}: {
  catKey: DocCategoryKey;
  docs: EmployeeDocument[];
  isHR: boolean;
  onPreview: (doc: EmployeeDocument) => void;
  onDelete: (doc: EmployeeDocument) => void;
}) {
  const [open, setOpen] = useState(true);
  const cfg = DOC_CATEGORIES.find((c) => c.key === catKey) ?? DOC_CATEGORIES[DOC_CATEGORIES.length - 1];
  const { Icon } = cfg;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}
    >
      <button
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ borderBottom: open ? "1px solid var(--pg-row-border)" : "none" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: cfg.bg }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
          </div>
          <span
            className="text-[13px] font-semibold"
            style={{ color: "var(--pg-text-1)" }}
          >
            {cfg.label}
          </span>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: cfg.bg, color: cfg.color }}
          >
            {docs.length}
          </span>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
        ) : (
          <ChevronRight className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
        )}
      </button>

      {open && (
        <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-4 py-2.5 group transition-colors"
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "")
              }
            >
              <FileText
                className="w-4 h-4 shrink-0"
                style={{ color: cfg.color }}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-[12px] font-medium truncate"
                  style={{ color: "var(--pg-text-1)" }}
                >
                  {doc.filename}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--pg-text-4)" }}
                  >
                    {formatBytes(doc.size_bytes)}
                  </span>
                  <span style={{ color: "var(--pg-text-4)" }}>·</span>
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--pg-text-4)" }}
                  >
                    {fmtDate(doc.created_at)}
                  </span>
                  <ScanBadge status={doc.scan_status} />
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onPreview(doc)}
                  title="Preview"
                  className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: "var(--pg-text-3)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "var(--pg-muted-bg)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "")
                  }
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <a
                  href={`${BASE}/api/v1/documents/${doc.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Download"
                  className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: "var(--pg-text-3)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "var(--pg-muted-bg)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "")
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
                {isHR && (
                  <button
                    onClick={() => onDelete(doc)}
                    title="Delete"
                    className="w-7 h-7 flex items-center justify-center rounded-lg"
                    style={{ color: "#dc2626" }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "#fee2e2")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "")
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function EmployeeProfilePage() {
  const params = useParams();
  const userId = params?.userId as string;
  const { user } = useAuth();
  const { toast } = useToast();
  const { primaryCode } = usePosition();

  const isOwnProfile = user?.ID === userId;
  const isHR = roleFamily(primaryCode) === "hr" || roleFamily(primaryCode) === "md";

  // ── HR Action state ────────────────────────────────────────────────────────
  const [resetting, setResetting]   = useState(false);
  const [tempPwd, setTempPwd]       = useState<string | null>(null);
  const [pwdCopied, setPwdCopied]   = useState(false);
  const [toggling, setToggling]     = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [positions, setPositions]   = useState<{ id: string; code: string; title: string }[]>([]);
  const [subsidiaries, setSubsidiaries] = useState<{ id: string; name: string }[]>([]);
  const [xferForm, setXferForm]     = useState({
    new_position_code: "",
    new_subsidiary_ids: [] as string[],
    effective_from: new Date().toISOString().slice(0, 10),
    end_current: true,
  });

  // ── State ──────────────────────────────────────────────────────────────────

  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"profile" | "documents">("profile");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  // Documents state
  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<DocCategoryKey>("other");
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── Fetch profile ──────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      // Try HR employee endpoint first
      let res = await fetch(`${BASE}/api/v1/hr/employees/${userId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        // Fallback: org users endpoint
        res = await fetch(`${BASE}/api/v1/org/users`, { credentials: "include" });
        if (res.ok) {
          const all = (await res.json()) as PersonProfile[];
          const found = all?.find(
            (u) => u.user_id === userId
          );
          if (found) {
            setProfile(found);
            setForm(profileToForm(found));
          }
          return;
        }
      } else {
        const data = (await res.json()) as PersonProfile;
        setProfile(data);
        setForm(profileToForm(data));
      }
    } catch {
      toast({
        title: "Failed to load profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  // ── HR Admin actions ───────────────────────────────────────────────────────

  async function resetPassword() {
    if (!confirm(`Reset ${profile?.display_name ?? "this user"}'s password? A temporary password will be generated.`)) return;
    setResetting(true);
    try {
      const res = await fetch(`${BASE}/api/v1/admin/users/${userId}/reset-password`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reset password");
      const { temporary_password } = await res.json() as { temporary_password: string };
      setTempPwd(temporary_password);
      toast({ title: "Password reset", description: "Share the temporary password with the employee securely." });
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  async function toggleActive() {
    const isActive = profile?.user_status === "active";
    const action   = isActive ? "deactivate" : "reactivate";
    if (!confirm(`${isActive ? "Deactivate" : "Reactivate"} ${profile?.display_name ?? "this user"}?`)) return;
    setToggling(true);
    try {
      const res = await fetch(`${BASE}/api/v1/admin/users/${userId}/${action}`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to ${action} user`);
      toast({ title: isActive ? "Account deactivated" : "Account reactivated" });
      fetchProfile();
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setToggling(false);
    }
  }

  async function loadTransferOptions() {
    const [posRes, subRes] = await Promise.all([
      fetch(`${BASE}/api/v1/org/positions`, { credentials: "include" }),
      fetch(`${BASE}/api/v1/org/subsidiaries`, { credentials: "include" }),
    ]);
    if (posRes.ok) setPositions(await posRes.json());
    if (subRes.ok) setSubsidiaries((await subRes.json()).map((s: { ID: string; Name: string }) => ({ id: s.ID, name: s.Name })));
  }

  async function submitTransfer() {
    if (!xferForm.new_position_code) {
      toast({ title: "Select a position first", variant: "destructive" }); return;
    }
    if (!profile?.person_id) {
      toast({ title: "Person ID missing — cannot transfer", variant: "destructive" }); return;
    }
    setTransferring(true);
    try {
      const body = {
        person_id: profile.person_id,
        new_position_code: xferForm.new_position_code,
        new_subsidiary_ids: xferForm.new_subsidiary_ids.length > 0 ? xferForm.new_subsidiary_ids : undefined,
        effective_from: xferForm.effective_from,
        end_current: xferForm.end_current,
      };
      const res = await fetch(`${BASE}/api/v1/admin/users/${userId}/transfer`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.error?.message ?? "Transfer failed");
      }
      toast({ title: "Employee transferred", description: `Moved to ${positions.find(p => p.code === xferForm.new_position_code)?.title ?? "new position"}.` });
      setShowTransfer(false);
      fetchProfile();
    } catch (e) {
      toast({ title: "Transfer failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  }

  function profileToForm(p: PersonProfile): Record<string, string> {
    return {
      display_name: p.display_name ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      date_of_birth: p.date_of_birth ?? "",
      gender: p.gender ?? "",
      nationality: p.nationality ?? "",
      address: p.address ?? "",
      emergency_contact_name: p.emergency_contact_name ?? "",
      emergency_contact_relationship: p.emergency_contact_relationship ?? "",
      emergency_contact_phone: p.emergency_contact_phone ?? "",
    };
  }

  // ── Fetch documents ────────────────────────────────────────────────────────

  const fetchDocs = useCallback(async (personId?: string) => {
    if (!personId && !userId) return;
    setDocsLoading(true);
    try {
      const id = personId ?? userId;
      const res = await fetch(
        `${BASE}/api/v1/documents?for_employee_id=${id}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = (await res.json()) as EmployeeDocument[];
        setDocs(data ?? []);
      }
    } catch {
      /* silently ignore */
    } finally {
      setDocsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile) fetchDocs(profile.person_id ?? profile.user_id);
  }, [profile, fetchDocs]);

  // ── Form helpers ───────────────────────────────────────────────────────────

  function handleFormChange(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function cancelEdit() {
    if (profile) setForm(profileToForm(profile));
    setEditing(false);
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    try {
      const personId = profile.person_id ?? userId;
      const res = await fetch(
        `${BASE}/api/v1/org/persons/${personId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Save failed" }));
        throw new Error(err.message ?? "Save failed");
      }
      const updated = { ...profile, ...form } as PersonProfile;
      setProfile(updated);
      setEditing(false);
      toast({ title: "Profile updated" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // ── Photo upload ───────────────────────────────────────────────────────────

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("vault_type", "profile");
      formData.append("category", "profile_photo");
      formData.append("for_employee_id", profile.person_id ?? userId);
      const res = await fetch(`${BASE}/api/v1/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Photo upload failed");
      const doc = (await res.json()) as EmployeeDocument;
      const photoUrl = `${BASE}/api/v1/documents/${doc.id}/download`;
      setProfile((p) => p ? { ...p, photo_url: photoUrl } : p);
      fetchDocs(profile.person_id ?? userId);
      toast({ title: "Photo updated" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  // ── Document upload ────────────────────────────────────────────────────────

  async function uploadFile(file: File) {
    if (!profile) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum size is 20 MB.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("vault_type", "profile");
      formData.append("category", uploadCategory);
      formData.append("for_employee_id", profile.person_id ?? userId);
      const res = await fetch(`${BASE}/api/v1/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message ?? "Upload failed");
      }
      await fetchDocs(profile.person_id ?? userId);
      toast({
        title: "Document uploaded",
        description: `${file.name} added to profile.`,
      });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() {
    setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  // ── Document delete ────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!deleteTarget || !profile) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `${BASE}/api/v1/documents/${deleteTarget.id}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error("Delete failed");
      setDocs((d) => d.filter((doc) => doc.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({
        title: "Document removed",
        description: `${deleteTarget.filename} deleted.`,
      });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  // ── Grouped docs ───────────────────────────────────────────────────────────

  const docsByCategory = DOC_CATEGORIES.map((cat) => ({
    ...cat,
    docs: docs.filter(
      (d) => (d.category ?? "other") === cat.key && d.category !== "profile_photo"
    ),
  })).filter((cat) => cat.docs.length > 0);

  const primaryAssignment = profile?.assignments?.find((a) => a.is_primary) ?? profile?.assignments?.[0];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2
          className="w-6 h-6 animate-spin"
          style={{ color: "#FF6600" }}
        />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <User
          className="w-10 h-10"
          style={{ color: "var(--pg-text-4)" }}
        />
        <p
          className="text-[14px]"
          style={{ color: "var(--pg-text-2)" }}
        >
          Employee profile not found.
        </p>
        <Link
          href="/hr/records"
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Records
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-5 pb-10">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/hr/records"
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-medium transition-colors"
            style={{
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-2)",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--pg-row-hover)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--pg-muted-bg)")
            }
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Records
          </Link>
          <div>
            <h1
              className="text-[18px] font-bold leading-tight"
              style={{ color: "var(--pg-text-1)" }}
            >
              {profile.display_name}
            </h1>
            {primaryAssignment && (
              <p
                className="text-[12px]"
                style={{ color: "var(--pg-text-3)" }}
              >
                {primaryAssignment.position_title}
                {primaryAssignment.subsidiary_name && ` · ${primaryAssignment.subsidiary_name}`}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Documents tab pill (HR only) */}
          {isHR && (
            <button
              onClick={() =>
                setActiveTab((t) => (t === "documents" ? "profile" : "documents"))
              }
              className="h-9 px-4 rounded-xl text-[13px] font-semibold transition-all"
              style={
                activeTab === "documents"
                  ? {
                      background: "linear-gradient(135deg,#FF6600,#E05500)",
                      color: "white",
                    }
                  : {
                      background: "var(--pg-muted-bg)",
                      border: "1px solid var(--pg-card-border)",
                      color: "var(--pg-text-2)",
                    }
              }
            >
              Documents {docs.length > 0 && `(${docs.length})`}
            </button>
          )}

          {/* Edit / Save / Cancel */}
          {(isHR || isOwnProfile) &&
            (editing ? (
              <>
                <button
                  onClick={cancelEdit}
                  className="h-9 px-4 rounded-xl text-[13px] font-semibold"
                  style={{
                    background: "var(--pg-muted-bg)",
                    border: "1px solid var(--pg-card-border)",
                    color: "var(--pg-text-2)",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
                style={{
                  background: "var(--pg-muted-bg)",
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-2)",
                }}
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
            ))}
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div
        className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
      >
        {(["profile", "documents"] as const).map((tab) => {
          if (tab === "documents" && !isHR && !isOwnProfile) return null;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="h-7 px-4 rounded-lg text-[12px] font-medium capitalize transition-all"
              style={
                activeTab === tab
                  ? {
                      background: "linear-gradient(135deg,#FF6600,#E05500)",
                      color: "white",
                    }
                  : { color: "var(--pg-text-2)" }
              }
            >
              {tab === "documents" && docs.length > 0
                ? `Documents (${docs.length})`
                : tab === "documents"
                ? "Documents"
                : "Profile"}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PROFILE TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "profile" && (
        <div className="space-y-5">
          {/* Profile card */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div className="h-[3px]" style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }} />
            <div className="p-6">
              <div className="flex items-start gap-5">
                {/* Avatar */}
                <div className="relative shrink-0">
                  <Avatar
                    name={profile.display_name}
                    photoUrl={profile.photo_url}
                    size={72}
                  />
                  {isOwnProfile && (
                    <>
                      <button
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoUploading}
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-md transition-opacity"
                        style={{ background: "#FF6600" }}
                        title="Change photo"
                      >
                        {photoUploading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Camera className="w-3 h-3" />
                        )}
                      </button>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoChange}
                      />
                    </>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2
                        className="text-[18px] font-bold leading-tight"
                        style={{ color: "var(--pg-text-1)" }}
                      >
                        {profile.display_name}
                      </h2>
                      {primaryAssignment && (
                        <>
                          <p
                            className="text-[13px] font-medium mt-0.5"
                            style={{ color: "var(--pg-text-2)" }}
                          >
                            {primaryAssignment.position_title}
                          </p>
                          {primaryAssignment.grade_level_name && (
                            <span
                              className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                              style={{
                                background: "var(--pg-muted-bg)",
                                color: "var(--pg-text-2)",
                                border: "1px solid var(--pg-card-border)",
                              }}
                            >
                              {primaryAssignment.grade_level_name}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <span
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                      style={{
                        background:
                          profile.user_status === "active" ? "#d1fae5" : "#fee2e2",
                        color:
                          profile.user_status === "active" ? "#065f46" : "#991b1b",
                      }}
                    >
                      {profile.user_status}
                    </span>
                  </div>

                  {/* Quick info row */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
                    {primaryAssignment?.subsidiary_name && (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          Company
                        </span>
                        <span
                          className="text-[12px]"
                          style={{ color: "var(--pg-text-2)" }}
                        >
                          {primaryAssignment.subsidiary_name}
                        </span>
                      </div>
                    )}
                    {profile.home_organization && (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          Dept
                        </span>
                        <span
                          className="text-[12px]"
                          style={{ color: "var(--pg-text-2)" }}
                        >
                          {profile.home_organization}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--pg-text-3)" }}
                      >
                        Email
                      </span>
                      <a
                        href={`mailto:${profile.email}`}
                        className="text-[12px] hover:underline"
                        style={{ color: "#FF6600" }}
                      >
                        {profile.email}
                      </a>
                    </div>
                    {profile.phone && (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          Phone
                        </span>
                        <span
                          className="text-[12px]"
                          style={{ color: "var(--pg-text-2)" }}
                        >
                          {profile.phone}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Fields grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Personal info */}
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{
                background: "var(--pg-card)",
                border: "1px solid var(--pg-card-border)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}
            >
              <div>
                <div className="h-[3px] rounded-full mb-4" style={{ background: "#1d4ed8" }} />
                <p
                  className="text-[10px] font-bold uppercase tracking-wider mb-3"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  Personal Information
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Full Name"
                  value={profile.display_name}
                  editing={editing}
                  inputKey="display_name"
                  form={form}
                  onChange={handleFormChange}
                />
                <Field
                  label="Date of Birth"
                  value={profile.date_of_birth}
                  editing={editing}
                  inputKey="date_of_birth"
                  form={form}
                  onChange={handleFormChange}
                  type="date"
                />
                <Field
                  label="Gender"
                  value={profile.gender}
                  editing={editing}
                  inputKey="gender"
                  form={form}
                  onChange={handleFormChange}
                  options={[
                    { value: "", label: "Not set" },
                    { value: "M", label: "Male" },
                    { value: "F", label: "Female" },
                    { value: "other", label: "Other" },
                  ]}
                />
                <Field
                  label="Nationality"
                  value={profile.nationality}
                  editing={editing}
                  inputKey="nationality"
                  form={form}
                  onChange={handleFormChange}
                />
                <Field
                  label="Phone"
                  value={profile.phone}
                  editing={editing}
                  inputKey="phone"
                  form={form}
                  onChange={handleFormChange}
                  type="tel"
                />
              </div>
              <Field
                label="Address"
                value={profile.address}
                editing={editing}
                inputKey="address"
                form={form}
                onChange={handleFormChange}
              />
            </div>

            {/* Professional info */}
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{
                background: "var(--pg-card)",
                border: "1px solid var(--pg-card-border)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}
            >
              <div>
                <div className="h-[3px] rounded-full mb-4" style={{ background: "#7c3aed" }} />
                <p
                  className="text-[10px] font-bold uppercase tracking-wider mb-3"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  Professional Details
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Title / Role"
                  value={primaryAssignment?.position_title}
                  editing={false}
                  inputKey="position_title"
                  form={form}
                  onChange={handleFormChange}
                />
                <Field
                  label="Grade"
                  value={primaryAssignment?.grade_level_name ?? primaryAssignment?.grade_level_code}
                  editing={false}
                  inputKey="grade"
                  form={form}
                  onChange={handleFormChange}
                />
                <Field
                  label="Department / Org"
                  value={profile.home_organization}
                  editing={false}
                  inputKey="home_organization"
                  form={form}
                  onChange={handleFormChange}
                />
                <Field
                  label="Company"
                  value={primaryAssignment?.subsidiary_name}
                  editing={false}
                  inputKey="subsidiary"
                  form={form}
                  onChange={handleFormChange}
                />
                <Field
                  label="Work Email"
                  value={profile.email}
                  editing={editing}
                  inputKey="email"
                  form={form}
                  onChange={handleFormChange}
                  type="email"
                />
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    Employment Type
                  </span>
                  <span
                    className="text-[13px] capitalize"
                    style={{ color: "var(--pg-text-1)" }}
                  >
                    {primaryAssignment?.employment_type || "—"}
                  </span>
                </div>

                {/* Resumption Date */}
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    Resumption Date
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: "#059669" }} />
                    <span className="text-[13px]" style={{ color: "var(--pg-text-1)" }}>
                      {primaryAssignment?.effective_from
                        ? new Date(primaryAssignment.effective_from).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* All assignments */}
              {(profile.assignments?.length ?? 0) > 1 && (
                <div className="mt-2 pt-3" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider mb-2"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    All Assignments
                  </p>
                  <div className="space-y-1.5">
                    {profile.assignments.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 px-3 py-2 rounded-xl"
                        style={{ background: "var(--pg-muted-bg)" }}
                      >
                        <Briefcase
                          className="w-3.5 h-3.5 shrink-0 mt-0.5"
                          style={{ color: "#FF6600" }}
                        />
                        <div>
                          <p
                            className="text-[12px] font-medium"
                            style={{ color: "var(--pg-text-1)" }}
                          >
                            {a.position_title}
                          </p>
                          <p
                            className="text-[11px]"
                            style={{ color: "var(--pg-text-3)" }}
                          >
                            {a.subsidiary_name ?? "Group-level"}
                            {a.is_primary && " · Primary"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Emergency contact */}
            <div
              className="rounded-2xl p-5 space-y-4 md:col-span-2"
              style={{
                background: "var(--pg-card)",
                border: "1px solid var(--pg-card-border)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}
            >
              <div>
                <div className="h-[3px] rounded-full mb-4" style={{ background: "#dc2626" }} />
                <p
                  className="text-[10px] font-bold uppercase tracking-wider mb-3"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  Emergency Contact
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field
                  label="Name"
                  value={profile.emergency_contact_name}
                  editing={editing}
                  inputKey="emergency_contact_name"
                  form={form}
                  onChange={handleFormChange}
                />
                <Field
                  label="Relationship"
                  value={profile.emergency_contact_relationship}
                  editing={editing}
                  inputKey="emergency_contact_relationship"
                  form={form}
                  onChange={handleFormChange}
                />
                <Field
                  label="Phone"
                  value={profile.emergency_contact_phone}
                  editing={editing}
                  inputKey="emergency_contact_phone"
                  form={form}
                  onChange={handleFormChange}
                  type="tel"
                />
              </div>
            </div>
          </div>

            {/* ── HR Admin Actions (HR only) ─────────────────────────────── */}
            {isHR && (
              <div
                className="rounded-2xl p-5 space-y-4 md:col-span-2"
                style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
              >
                <div>
                  <div className="h-[3px] rounded-full mb-4" style={{ background: "#7c3aed" }} />
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pg-text-3)" }}>
                    HR Administration
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>
                    These actions are only visible to HR managers.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {/* Reset Password */}
                  <button
                    onClick={resetPassword}
                    disabled={resetting}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-60"
                    style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#dbeafe"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#eff6ff"}
                  >
                    {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                    Reset Password
                  </button>

                  {/* Deactivate / Reactivate */}
                  {profile?.user_status === "active" ? (
                    <button
                      onClick={toggleActive}
                      disabled={toggling}
                      className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-60"
                      style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fee2e2"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#fef2f2"}
                    >
                      {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                      Deactivate Account
                    </button>
                  ) : (
                    <button
                      onClick={toggleActive}
                      disabled={toggling}
                      className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-60"
                      style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#d1fae5"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#ecfdf5"}
                    >
                      {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                      Reactivate Account
                    </button>
                  )}

                  {/* Transfer / Move Department */}
                  <button
                    onClick={() => { setShowTransfer(true); loadTransferOptions(); }}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-all"
                    style={{ background: "#fff7f0", color: "#FF6600", border: "1px solid #fed7aa" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fff0e0"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#fff7f0"}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Transfer / Move
                  </button>
                </div>

                {/* Temporary password display */}
                {tempPwd && (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
                    <Key className="w-4 h-4 shrink-0" style={{ color: "#d97706" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold" style={{ color: "#92400e" }}>Temporary password — share securely with the employee</p>
                      <p className="text-[15px] font-mono font-bold tracking-wider mt-1" style={{ color: "#d97706" }}>{tempPwd}</p>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(tempPwd); setPwdCopied(true); setTimeout(() => setPwdCopied(false), 2000); }}
                      className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold"
                      style={{ background: "#d97706", color: "#fff" }}
                    >
                      {pwdCopied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {pwdCopied ? "Copied" : "Copy"}
                    </button>
                    <button onClick={() => setTempPwd(null)} style={{ color: "var(--pg-text-3)" }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Save button at bottom (when editing) */}
          {editing && (
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelEdit}
                className="h-9 px-4 rounded-xl text-[13px] font-semibold"
                style={{
                  background: "var(--pg-muted-bg)",
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-2)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DOCUMENTS TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "documents" && (isHR || isOwnProfile) && (
        <div className="space-y-5">
          {/* Upload area */}
          <div
            className="rounded-2xl p-5"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div className="h-[3px] rounded-full mb-5" style={{ background: "#FF6600" }} />
            <p
              className="text-[10px] font-bold uppercase tracking-wider mb-4"
              style={{ color: "var(--pg-text-3)" }}
            >
              Upload Document
            </p>

            {/* Category selector */}
            <div className="mb-4">
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--pg-text-4)" }}
              >
                Document Type
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DOC_CATEGORIES.map((cat) => {
                  const { Icon } = cat;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => setUploadCategory(cat.key)}
                      className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-all"
                      style={
                        uploadCategory === cat.key
                          ? {
                              background: cat.bg,
                              color: cat.color,
                              borderColor: cat.color,
                            }
                          : {
                              background: "transparent",
                              color: "var(--pg-text-3)",
                              borderColor: "var(--pg-card-border)",
                            }
                      }
                    >
                      <Icon className="w-3 h-3" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drag-and-drop zone */}
            <div
              ref={dragRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className="relative flex flex-col items-center justify-center gap-2 py-8 rounded-2xl cursor-pointer transition-all"
              style={{
                border: `2px dashed ${dragOver ? "#FF6600" : "var(--pg-card-border)"}`,
                background: dragOver ? "#fff7f0" : "var(--pg-muted-bg)",
              }}
            >
              {uploading ? (
                <>
                  <Loader2
                    className="w-6 h-6 animate-spin"
                    style={{ color: "#FF6600" }}
                  />
                  <p
                    className="text-[12px] font-medium"
                    style={{ color: "var(--pg-text-2)" }}
                  >
                    Uploading…
                  </p>
                </>
              ) : (
                <>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "#fff0e0" }}
                  >
                    <Upload className="w-5 h-5" style={{ color: "#FF6600" }} />
                  </div>
                  <div className="text-center">
                    <p
                      className="text-[13px] font-medium"
                      style={{ color: "var(--pg-text-1)" }}
                    >
                      Drop a file here or{" "}
                      <span style={{ color: "#FF6600" }}>click to browse</span>
                    </p>
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "var(--pg-text-4)" }}
                    >
                      PDF, Word, Excel, images — up to 20 MB
                    </p>
                  </div>
                  {uploadCategory !== "other" && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          DOC_CATEGORIES.find((c) => c.key === uploadCategory)?.bg,
                        color:
                          DOC_CATEGORIES.find((c) => c.key === uploadCategory)?.color,
                      }}
                    >
                      Will be saved as:{" "}
                      {DOC_CATEGORIES.find((c) => c.key === uploadCategory)?.label}
                    </span>
                  )}
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.csv,.txt"
              onChange={handleFileChange}
            />

            {/* Upload button */}
            <div className="flex justify-end mt-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                {uploading ? "Uploading…" : "Upload Document"}
              </button>
            </div>
          </div>

          {/* Documents grouped by category */}
          {docsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2
                className="w-5 h-5 animate-spin"
                style={{ color: "var(--pg-text-4)" }}
              />
            </div>
          ) : docsByCategory.length === 0 ? (
            <div
              className="py-10 text-center rounded-2xl"
              style={{
                background: "var(--pg-card)",
                border: "1px dashed var(--pg-card-border)",
              }}
            >
              <FolderOpen
                className="w-8 h-8 mx-auto mb-2"
                style={{ color: "var(--pg-text-4)" }}
              />
              <p
                className="text-[13px]"
                style={{ color: "var(--pg-text-3)" }}
              >
                No documents uploaded yet.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 text-[12px] font-medium"
                style={{ color: "#FF6600" }}
              >
                Upload the first document →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {docsByCategory.map((cat) => (
                <DocCategorySection
                  key={cat.key}
                  catKey={cat.key}
                  docs={cat.docs}
                  isHR={isHR}
                  onPreview={setPreviewDoc}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Document preview modal ──────────────────────────────────────────── */}
      {previewDoc && (
        <DocPreviewModal
          doc={previewDoc}
          downloadUrl={`${BASE}/api/v1/documents/${previewDoc.id}/download`}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* ── Delete confirmation modal ───────────────────────────────────────── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "#fee2e2" }}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p
                  className="text-[14px] font-bold"
                  style={{ color: "var(--pg-text-1)" }}
                >
                  Remove document?
                </p>
                <p
                  className="text-[12px] mt-1 leading-relaxed"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  <span
                    className="font-semibold"
                    style={{ color: "var(--pg-text-2)" }}
                  >
                    {deleteTarget.filename}
                  </span>{" "}
                  will be permanently deleted and cannot be recovered.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="h-8 px-4 rounded-xl text-[12px] font-medium"
                style={{
                  border: "1px solid var(--pg-card-border)",
                  color: "var(--pg-text-2)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="h-8 px-4 rounded-xl text-[12px] font-semibold text-white flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: "#dc2626" }}
              >
                {deleting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                {deleting ? "Removing…" : "Remove permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfer Modal ────────────────────────────────────────────────── */}
      {showTransfer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowTransfer(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="h-[3px]" style={{ background: "#FF6600" }} />
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <div>
                <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Transfer / Move Employee</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Move {profile?.display_name} to a different position or department</p>
              </div>
              <button onClick={() => setShowTransfer(false)} style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>New Position *</label>
                <select
                  value={xferForm.new_position_code}
                  onChange={e => setXferForm(f => ({ ...f, new_position_code: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl text-[13px] outline-none"
                  style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
                >
                  <option value="">Select position…</option>
                  {positions.map(p => (
                    <option key={p.id} value={p.code}>{p.title} ({p.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Subsidiary</label>
                <select
                  value={xferForm.new_subsidiary_ids[0] ?? ""}
                  onChange={e => setXferForm(f => ({ ...f, new_subsidiary_ids: e.target.value ? [e.target.value] : [] }))}
                  className="w-full h-9 px-3 rounded-xl text-[13px] outline-none"
                  style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
                >
                  <option value="">Keep current subsidiary</option>
                  {subsidiaries.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Effective From</label>
                <input
                  type="date" value={xferForm.effective_from}
                  onChange={e => setXferForm(f => ({ ...f, effective_from: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl text-[13px] outline-none"
                  style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={xferForm.end_current}
                  onChange={e => setXferForm(f => ({ ...f, end_current: e.target.checked }))} />
                <span className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>End current assignment(s) on effective date</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <button onClick={() => setShowTransfer(false)}
                className="h-9 px-4 rounded-xl text-[13px] font-semibold"
                style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                Cancel
              </button>
              <button onClick={submitTransfer} disabled={transferring || !xferForm.new_position_code}
                className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
                {transferring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                {transferring ? "Transferring…" : "Confirm Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
