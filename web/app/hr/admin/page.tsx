"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DataTable, Column } from "@/components/ui/data-table";
import {
  Plus, Users, Check, X, Eye, EyeOff, Copy, CheckCircle2,
  Building2, Briefcase, Loader2, AlertCircle, ChevronRight,
  Pencil, GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type SubsidiaryOption = { id: string; code: string; name: string };

type Assignment = {
  position_code: string;
  position_title: string;
  subsidiary_id?: string;
  subsidiary_name?: string;
  is_primary: boolean;
};

type UserRow = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  user_status: string;
  person_id?: string;
  assignments: Assignment[];
};

type PositionOption = {
  id: string;
  code: string;
  title: string;
  subsidiary_id?: string;
  is_group_level: boolean;
  reports_to_title?: string;
  reports_to_position_id?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function codeFromTitle(title: string): string {
  return title.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// ── User table columns ─────────────────────────────────────────────────────────

const USER_COLUMNS: Column<UserRow>[] = [
  {
    id: "display_name", header: "Name", accessor: "display_name", sortable: true,
    cell: (v, row) => (
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
             style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
          {String(v).split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
        </div>
        <div>
          <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{String(v)}</p>
          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{row.email}</p>
        </div>
      </div>
    ),
  },
  {
    id: "position", header: "Position", accessor: r => r.assignments?.[0]?.position_title ?? "—",
    sortable: true,
    cell: (_, row) => {
      const primary = row.assignments?.find(a => a.is_primary) ?? row.assignments?.[0];
      if (!primary) return <span style={{ color: "var(--pg-text-4)" }}>No assignment</span>;
      return (
        <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "#fff7f0", color: "#FF6600" }}>
          {primary.position_title}
        </span>
      );
    },
  },
  {
    id: "subsidiaries", header: "Subsidiary", accessor: r => r.assignments?.[0]?.subsidiary_name ?? "Group-level",
    sortable: true,
    cell: (_, row) => {
      const subs = [...new Set(row.assignments?.filter(a => a.subsidiary_name).map(a => a.subsidiary_name) ?? [])];
      if (subs.length === 0)
        return <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#f5f3ff", color: "#7c3aed" }}>Group-wide</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {subs.map(s => (
            <span key={s} className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>{s}</span>
          ))}
        </div>
      );
    },
  },
  {
    id: "org_status", header: "Org Status", accessor: r => r.assignments?.length > 0 ? "assigned" : "unassigned",
    sortable: true,
    cell: (v) => (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: v === "assigned" ? "#d1fae5" : "#fef3c7", color: v === "assigned" ? "#065f46" : "#92400e" }}>
        {v === "assigned" ? "Assigned" : "No assignment"}
      </span>
    ),
  },
  {
    id: "user_status", header: "Account", accessor: "user_status", sortable: true,
    cell: (v) => (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: v === "active" ? "#d1fae5" : "#fee2e2", color: v === "active" ? "#065f46" : "#991b1b" }}>
        {String(v)}
      </span>
    ),
  },
];

// ── Create / Edit Position Modal ───────────────────────────────────────────────

function PositionModal({
  onClose, subsidiaries, existing,
}: {
  onClose: () => void;
  subsidiaries: SubsidiaryOption[];
  existing?: PositionOption; // present = edit mode
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(existing);

  const [subID, setSubID]         = useState(existing?.subsidiary_id ?? "");
  const [title, setTitle]         = useState(existing?.title ?? "");
  const [code, setCode]           = useState(existing?.code ?? "");
  const [reportsTo, setReportsTo] = useState(existing?.reports_to_position_id ?? "");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  // Auto-generate code from title when creating
  function handleTitleChange(v: string) {
    setTitle(v);
    if (!isEdit) setCode(codeFromTitle(v));
  }

  const { data: candidatePositions = [] } = useQuery<PositionOption[]>({
    queryKey: ["positions", subID],
    queryFn: async () => {
      const params = subID ? `?subsidiary_id=${subID}` : "";
      const res = await fetch(`${BASE}/api/v1/org/positions${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as PositionOption[];
    },
    enabled: Boolean(subID),
  });

  // Exclude the position being edited from the "reports to" dropdown
  const reportsToOptions = candidatePositions.filter(p => p.id !== existing?.id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (!isEdit && !code.trim()) { setError("Code is required."); return; }
    setSaving(true); setError("");

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        reports_to_position_id: reportsTo || null,
      };

      let res: Response;
      if (isEdit) {
        res = await fetch(`${BASE}/api/v1/org/positions/${existing!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
      } else {
        body.code = code.trim();
        if (subID) body.subsidiary_id = subID;
        res = await fetch(`${BASE}/api/v1/org/positions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error((err as { message?: string }).message ?? "Save failed");
      }

      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["org-chart"] });
      toast({ title: isEdit ? "Position updated" : "Position created", description: title });
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
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              {isEdit ? "Edit Position" : "New Position"}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              {isEdit ? "Update title or reporting line" : "Add a role to the org chart"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
                  style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">

          {/* Subsidiary (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Subsidiary</label>
              <select value={subID} onChange={e => { setSubID(e.target.value); setReportsTo(""); }}
                      className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                      style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                <option value="">Group-level (no subsidiary)</option>
                {subsidiaries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Title</label>
            <input value={title} onChange={e => handleTitleChange(e.target.value)} required
                   placeholder="e.g. Head of Operations"
                   className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                   style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>

          {/* Code (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                Code <span style={{ color: "var(--pg-text-4)" }}>— auto-generated, must be unique within subsidiary</span>
              </label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required
                     placeholder="HEAD_OF_OPERATIONS"
                     className="w-full h-10 px-3 rounded-xl text-[13px] font-mono outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          )}

          {/* Reports To */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Reports To <span style={{ color: "var(--pg-text-4)" }}>— leave blank for top of hierarchy</span>
            </label>
            <select value={reportsTo} onChange={e => setReportsTo(e.target.value)}
                    disabled={!isEdit && !subID}
                    className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)", opacity: (!isEdit && !subID) ? 0.5 : 1 }}>
              <option value="">— Top of hierarchy</option>
              {reportsToOptions.filter(p => !p.is_group_level).length > 0 && (
                <optgroup label="Subsidiary roles">
                  {reportsToOptions.filter(p => !p.is_group_level).map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </optgroup>
              )}
              {reportsToOptions.filter(p => p.is_group_level).length > 0 && (
                <optgroup label="Group-level">
                  {reportsToOptions.filter(p => p.is_group_level).map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                 style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? "Save Changes" : "Create Position"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Positions Tab ──────────────────────────────────────────────────────────────

function PositionsTab({ subsidiaries }: { subsidiaries: SubsidiaryOption[] }) {
  const [selectedSub, setSelectedSub] = useState("");
  const [showCreate, setShowCreate]   = useState(false);
  const [editing, setEditing]         = useState<PositionOption | undefined>();

  const { data: positions = [], isLoading } = useQuery<PositionOption[]>({
    queryKey: ["positions", selectedSub],
    queryFn: async () => {
      const params = selectedSub ? `?subsidiary_id=${selectedSub}` : "";
      const res = await fetch(`${BASE}/api/v1/org/positions${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const all = ((await res.json()) ?? []) as PositionOption[];
      return selectedSub ? all.filter(p => !p.is_group_level) : all.filter(p => p.is_group_level);
    },
  });

  const totalPositions = positions.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <select value={selectedSub} onChange={e => setSelectedSub(e.target.value)}
                className="h-9 px-3 rounded-xl text-[12px] font-medium outline-none appearance-none"
                style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}>
          <option value="">Group-level positions</option>
          {subsidiaries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex items-center gap-3">
          <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
            {totalPositions} position{totalPositions !== 1 ? "s" : ""}
          </span>
          <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}>
            <Plus className="w-3.5 h-3.5" /> New Position
          </button>
        </div>
      </div>

      {/* Positions list */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        {/* Header row */}
        <div className="grid grid-cols-[2fr_1.5fr_1.5fr_auto] gap-4 px-5 py-3"
             style={{ borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}>
          {["Title", "Code", "Reports To", ""].map(h => (
            <p key={h} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>{h}</p>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
          </div>
        ) : positions.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2">
            <GitBranch className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No positions yet. Click "New Position" to add one.</p>
          </div>
        ) : (
          positions.map((pos, i) => (
            <div key={pos.id}
                 className="grid grid-cols-[2fr_1.5fr_1.5fr_auto] gap-4 px-5 py-3 items-center"
                 style={{ borderBottom: i < positions.length - 1 ? "1px solid var(--pg-row-border)" : "none" }}>
              <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{pos.title}</p>
              <p className="text-[11px] font-mono px-2 py-0.5 rounded w-fit"
                 style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>{pos.code}</p>
              <div className="flex items-center gap-1.5">
                {pos.reports_to_title ? (
                  <>
                    <ChevronRight className="w-3 h-3 shrink-0" style={{ color: "var(--pg-text-4)" }} />
                    <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{pos.reports_to_title}</span>
                  </>
                ) : (
                  <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>Top of hierarchy</span>
                )}
              </div>
              <button onClick={() => setEditing(pos)}
                      className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors"
                      style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-3)" }}>
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <PositionModal onClose={() => setShowCreate(false)} subsidiaries={subsidiaries} />
      )}
      {editing && (
        <PositionModal onClose={() => setEditing(undefined)} subsidiaries={subsidiaries} existing={editing} />
      )}
    </div>
  );
}

// ── Create User Panel ──────────────────────────────────────────────────────────

function CreateUserPanel({ onClose, subsidiaries, allUsers }: {
  onClose: () => void;
  subsidiaries: SubsidiaryOption[];
  allUsers: UserRow[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstName, setFirstName]     = useState("");
  const [lastName, setLastName]       = useState("");
  const [emailDomain, setEmailDomain] = useState("pagegroup.ng");
  const [positionCode, setPositionCode] = useState("");
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [managerPersonID, setManagerPersonID] = useState("");
  const [password, setPassword]       = useState(generatePassword);
  const [showPass, setShowPass]       = useState(false);
  const [copied, setCopied]           = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  const subValue = selectedSubs[0] ?? "";
  const isGroupSelected = subValue === "GROUP";

  const { data: availablePositions = [] } = useQuery<PositionOption[]>({
    queryKey: ["positions", subValue],
    queryFn: async () => {
      const params = (!isGroupSelected && subValue) ? `?subsidiary_id=${subValue}` : "";
      const res = await fetch(`${BASE}/api/v1/org/positions${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const all = ((await res.json()) ?? []) as PositionOption[];
      return isGroupSelected ? all.filter(p => p.is_group_level) : all;
    },
    enabled: Boolean(subValue),
  });

  const subPositions   = availablePositions.filter(p => !p.is_group_level);
  const groupPositions = availablePositions.filter(p => p.is_group_level);
  const selectedPosition = availablePositions.find(p => p.code === positionCode);
  const isGroupLevel = isGroupSelected || (selectedPosition?.is_group_level ?? false);

  // People in the selected subsidiary for manager override picker
  const managersInSub = allUsers.filter(u =>
    u.person_id &&
    u.assignments?.some(a => !subValue || a.subsidiary_id === subValue)
  );

  const email = firstName && lastName
    ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${emailDomain}`
    : "";

  function copyPassword() {
    navigator.clipboard.writeText(password).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sv = selectedSubs[0] ?? "";
    if (!sv) { setError("Please select a subsidiary."); return; }
    if (!positionCode) { setError("Please select a position."); return; }
    setSaving(true); setError("");

    const subsidiaryIds = isGroupLevel ? [] : [sv];

    try {
      const body: Record<string, unknown> = {
        first_name: firstName, last_name: lastName, email, password,
        position_code: positionCode, subsidiary_ids: subsidiaryIds,
        effective_from: new Date().toISOString().slice(0, 10),
      };
      if (managerPersonID) body.manager_override_person_id = managerPersonID;

      const res = await fetch(`${BASE}/api/v1/admin/provision-user`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error((err as { message?: string }).message ?? "Provision failed");
      }
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      toast({ title: "User Created", description: `${firstName} ${lastName} has been onboarded.` });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Onboard New User</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>Creates account + org assignment in one step</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5 overflow-y-auto">
          {/* Name */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>Personal Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>First Name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} required placeholder="Adebayo"
                       className="w-full h-10 px-3 rounded-xl text-[13px] outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Last Name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} required placeholder="Johnson"
                       className="w-full h-10 px-3 rounded-xl text-[13px] outline-none" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Email <span style={{ color: "var(--pg-text-4)" }}>— auto-generated from name</span>
            </label>
            <div className="flex items-center gap-2">
              <input value={email} readOnly placeholder="firstname.lastname@..."
                     className="flex-1 h-10 px-3 rounded-xl text-[13px] outline-none font-mono"
                     style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }} />
              <span style={{ color: "var(--pg-text-4)" }}>@</span>
              <input value={emailDomain} onChange={e => setEmailDomain(e.target.value)}
                     className="w-36 h-10 px-3 rounded-xl text-[13px] outline-none" style={inputStyle} />
            </div>
          </div>

          {/* Work Details */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>Work Details</p>
            <div className="space-y-4">

              {/* Subsidiary */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>Subsidiary(ies)</label>
                  <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>Select one or more · or choose Group-level</span>
                </div>
                <div className="space-y-1.5 p-3 rounded-xl" style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)" }}>
                  <label className="flex items-center gap-2.5 cursor-pointer py-1 border-b" style={{ borderColor: "var(--pg-card-border)" }}>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isGroupSelected ? "bg-violet-500 border-violet-500" : "border-slate-300 dark:border-slate-600"}`}
                         onClick={() => { setSelectedSubs(isGroupSelected ? [] : ["GROUP"]); setPositionCode(""); setManagerPersonID(""); }}>
                      {isGroupSelected && <span className="text-white text-[8px]">✓</span>}
                    </div>
                    <div>
                      <span className="text-[12px] font-semibold" style={{ color: isGroupSelected ? "#7c3aed" : "var(--pg-text-1)" }}>Group-level</span>
                      <span className="text-[11px] ml-1.5" style={{ color: "var(--pg-text-3)" }}>Compliance, HR, IT — all subsidiaries</span>
                    </div>
                  </label>
                  {subsidiaries.map(s => {
                    const checked = selectedSubs.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2.5 cursor-pointer py-1">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${checked ? "bg-orange-500 border-orange-500" : "border-slate-300 dark:border-slate-600"}`}
                             onClick={() => {
                               if (isGroupSelected) return;
                               setSelectedSubs(prev => checked ? prev.filter(x => x !== s.id) : [...prev, s.id]);
                               setPositionCode(""); setManagerPersonID("");
                             }}>
                          {checked && <span className="text-white text-[8px]">✓</span>}
                        </div>
                        <span className="text-[12px]" style={{ color: checked ? "var(--pg-text-1)" : "var(--pg-text-2)", opacity: isGroupSelected ? 0.4 : 1 }}>{s.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Position */}
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                  Position
                  {subValue === "" && <span className="ml-1" style={{ color: "var(--pg-text-4)" }}>— select a subsidiary first</span>}
                </label>
                <select value={positionCode} onChange={e => { setPositionCode(e.target.value); setManagerPersonID(""); }}
                        required disabled={subValue === ""} className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none" style={inputStyle}>
                  <option value="">Select position…</option>
                  {subPositions.length > 0 && <optgroup label="Subsidiary roles">{subPositions.map(p => <option key={p.id} value={p.code}>{p.title}</option>)}</optgroup>}
                  {groupPositions.length > 0 && <optgroup label="Group-level">{groupPositions.map(p => <option key={p.id} value={p.code}>{p.title}</option>)}</optgroup>}
                </select>
                {selectedPosition?.reports_to_title && (
                  <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: "var(--pg-text-3)" }}>
                    Default reports to: <span className="font-semibold" style={{ color: "var(--pg-text-2)" }}>{selectedPosition.reports_to_title}</span>
                  </p>
                )}
              </div>

              {/* Manager Override */}
              {positionCode && (
                <div>
                  <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                    Direct Line Manager <span style={{ color: "var(--pg-text-4)" }}>— optional, overrides hierarchy</span>
                  </label>
                  <select value={managerPersonID} onChange={e => setManagerPersonID(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none" style={inputStyle}>
                    <option value="">— Use default hierarchy</option>
                    {managersInSub.filter(u => u.person_id).map(u => (
                      <option key={u.person_id} value={u.person_id!}>{u.display_name} ({u.assignments?.[0]?.position_title ?? "unassigned"})</option>
                    ))}
                  </select>
                  {managerPersonID && (
                    <p className="text-[11px] mt-1 text-amber-600">
                      Override active — this person will report directly to the selected manager.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Password */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>Credentials</p>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Temporary Password <span style={{ color: "var(--pg-text-4)" }}>— share securely with the user</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-10 px-3 rounded-xl font-mono text-[13px] flex items-center"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}>
                {showPass ? password : "•".repeat(password.length)}
              </div>
              <button type="button" onClick={() => setShowPass(s => !s)}
                      className="w-9 h-10 flex items-center justify-center rounded-xl"
                      style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-3)" }}>
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button type="button" onClick={copyPassword}
                      className="w-9 h-10 flex items-center justify-center rounded-xl"
                      style={{ border: "1px solid var(--pg-card-border)", color: copied ? "#059669" : "var(--pg-text-3)" }}>
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                 style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
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
                    style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = "users" | "positions";

export default function HRAdminPage() {
  const [tab, setTab]           = useState<Tab>("users");
  const [showCreate, setShowCreate] = useState(false);
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("create") === "1") setShowCreate(true);
  }, [searchParams]);

  const { data: rawUsers, isLoading: usersLoading } = useQuery({
    queryKey: ["org-users"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/users`, { credentials: "include" });
      if (!res.ok) return [] as UserRow[];
      const json = ((await res.json()) ?? []) as Array<{
        user_id: string; email: string; display_name: string; user_status: string;
        person_id?: string; assignments?: Assignment[];
      }>;
      return json.map(u => ({ ...u, id: u.user_id, assignments: u.assignments ?? [] })) as UserRow[];
    },
  });

  const { data: subsidiaries = [] } = useQuery({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/subsidiaries`, { credentials: "include" });
      if (!res.ok) return [] as SubsidiaryOption[];
      return ((await res.json()) ?? []) as SubsidiaryOption[];
    },
  });

  const users     = rawUsers ?? [];
  const assigned  = users.filter(u => u.assignments?.length > 0).length;
  const unassigned = users.filter(u => !u.assignments?.length).length;

  const TAB_STYLE = (active: boolean) => ({
    background: active ? "var(--pg-card)" : "transparent",
    color: active ? "var(--pg-text-1)" : "var(--pg-text-3)",
    border: active ? "1px solid var(--pg-card-border)" : "1px solid transparent",
  });

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>HR Administration</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Page Group · {users.length} user{users.length !== 1 ? "s" : ""} · manage people and roles
          </p>
        </div>
        {tab === "users" && (
          <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}>
            <Plus className="w-3.5 h-3.5" /> Onboard User
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users",   value: users.length,  color: "#FF6600", bg: "#fff7f0", icon: Users },
          { label: "Assigned",      value: assigned,      color: "#059669", bg: "#ecfdf5", icon: Briefcase },
          { label: "No Assignment", value: unassigned,    color: "#d97706", bg: "#fffbeb", icon: Building2 },
        ].map(s => (
          <div key={s.label} className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="h-[3px]" style={{ background: s.color }} />
            <div className="p-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
                <p className="text-[22px] font-bold tabular leading-none mt-1.5" style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
           style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
        {(["users", "positions"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
                  className="h-8 px-4 rounded-lg text-[13px] font-medium transition-all capitalize"
                  style={TAB_STYLE(tab === t)}>
            {t === "users" ? "Users" : "Positions & Roles"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "users" ? (
        <DataTable
          columns={USER_COLUMNS}
          data={users}
          searchPlaceholder="Search by name or email…"
          searchKeys={["display_name", "email"]}
          onExport={() => {}}
          isLoading={usersLoading}
          pageSize={20}
          emptyMessage="No users found. Click 'Onboard User' to get started."
        />
      ) : (
        <PositionsTab subsidiaries={subsidiaries} />
      )}

      {showCreate && (
        <CreateUserPanel
          onClose={() => setShowCreate(false)}
          subsidiaries={subsidiaries ?? []}
          allUsers={users}
        />
      )}
    </div>
  );
}
