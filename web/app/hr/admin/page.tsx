"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { DataTable, Column, BulkAction } from "@/components/ui/data-table";
import {
  Plus, Users, Check, X, Eye, EyeOff, Copy, CheckCircle2,
  Building2, Briefcase, Loader2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────────

// The org endpoints return lowercase JSON field names
type SubsidiaryOption = { id: string; code: string; name: string };

type Assignment = {
  position_code: string;
  position_title: string;
  subsidiary_id?: string;
  subsidiary_name?: string;
  is_primary: boolean;
};

type UserRow = {
  id: string; // = user_id, required by DataTable
  user_id: string;
  email: string;
  display_name: string;
  user_status: string;
  person_id?: string;
  assignments: Assignment[];
};

// ── Column definitions ─────────────────────────────────────────────────────────

const COLUMNS: Column<UserRow>[] = [
  {
    id: "display_name", header: "Name", accessor: "display_name", sortable: true,
    cell: (v, row) => (
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
             style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
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
        <div>
          <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "#eff6ff", color: "#2563eb" }}>
            {primary.position_title}
          </span>
        </div>
      );
    },
  },
  {
    id: "subsidiaries", header: "Subsidiary", accessor: r => r.assignments?.[0]?.subsidiary_name ?? "Group-level",
    sortable: true,
    cell: (_, row) => {
      const subs = [...new Set(row.assignments?.filter(a => a.subsidiary_name).map(a => a.subsidiary_name) ?? [])];
      if (subs.length === 0) {
        return <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#f5f3ff", color: "#7c3aed" }}>Group-wide</span>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {subs.map(s => (
            <span key={s} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>{s}</span>
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

// ── Types ──────────────────────────────────────────────────────────────────────

type Position = {
  id: string;
  code: string;
  title: string;
  subsidiary_id?: string;
  is_group_level: boolean;
};

function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function CreateUserPanel({ onClose, subsidiaries }: {
  onClose: () => void;
  subsidiaries: SubsidiaryOption[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [emailDomain, setEmailDomain] = useState("pagegroup.ng");
  const [positionCode, setPositionCode] = useState("");
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [password, setPassword]   = useState(generatePassword);
  const [showPass, setShowPass]   = useState(false);
  const [copied, setCopied]       = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  // Fetch positions when subsidiary selection changes.
  // "GROUP" = fetch with no subsidiary_id → returns all group-level positions.
  // A specific subsidiary ID → returns that sub's positions + group-level.
  const subValue = selectedSubs[0] ?? "";
  const isGroupSelected = subValue === "GROUP";

  const { data: availablePositions = [] } = useQuery<Position[]>({
    queryKey: ["positions", subValue],
    queryFn: async () => {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";
      const params = (!isGroupSelected && subValue) ? `?subsidiary_id=${subValue}` : "";
      const res = await fetch(`${baseUrl}/api/v1/org/positions${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json() as Position[];
      // When group-level is selected, only show group-level positions.
      // When a real subsidiary is selected, show that sub's positions + group-level.
      return isGroupSelected ? all.filter(p => p.is_group_level) : all;
    },
    enabled: Boolean(subValue),
  });

  // Split for the optgroup labels in the dropdown
  const subPositions   = availablePositions.filter(p => !p.is_group_level);
  const groupPositions = availablePositions.filter(p => p.is_group_level);

  // Position is group-level if the subsidiary selected is GROUP, or the specific position is flagged
  const selectedPosition = availablePositions.find(p => p.code === positionCode);
  const isGroupLevel = isGroupSelected || (selectedPosition?.is_group_level ?? false);

  const email = firstName && lastName
    ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${emailDomain}`
    : "";

  function copyPassword() {
    navigator.clipboard.writeText(password).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const subValue = selectedSubs[0] ?? "";
    if (!subValue) { setError("Please select a subsidiary."); return; }
    if (!positionCode) { setError("Please select a position."); return; }
    setSaving(true); setError("");

    // Group-level positions: send empty array so backend assigns to all subsidiaries
    const subsidiaryIds = isGroupLevel ? [] : [subValue];

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";
    try {
      const res = await fetch(`${baseUrl}/api/v1/admin/provision-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          password,
          position_code: positionCode,
          subsidiary_ids: subsidiaryIds,
          effective_from: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(err.message ?? "Provision failed");
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Onboard New User</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Creates account + org assignment in one step
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: "var(--pg-text-3)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>Personal Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>First Name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} required placeholder="Adebayo"
                       className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                       style={{ background:"var(--pg-input)",border:"1px solid var(--pg-input-border)",color:"var(--pg-text-1)" }} />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Last Name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} required placeholder="Johnson"
                       className="w-full h-10 px-3 rounded-xl text-[13px] outline-none"
                       style={{ background:"var(--pg-input)",border:"1px solid var(--pg-input-border)",color:"var(--pg-text-1)" }} />
              </div>
            </div>
          </div>

          {/* Email (auto-generated) */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Email <span style={{ color: "var(--pg-text-4)" }}>— auto-generated from name</span>
            </label>
            <div className="flex items-center gap-2">
              <input value={email} readOnly placeholder="firstname.lastname@..."
                     className="flex-1 h-10 px-3 rounded-xl text-[13px] outline-none font-mono"
                     style={{ background:"var(--pg-muted-bg)",border:"1px solid var(--pg-card-border)",color:"var(--pg-text-2)" }} />
              <span style={{ color: "var(--pg-text-4)" }}>@</span>
              <input value={emailDomain} onChange={e => setEmailDomain(e.target.value)}
                     className="w-36 h-10 px-3 rounded-xl text-[13px] outline-none"
                     style={{ background:"var(--pg-input)",border:"1px solid var(--pg-input-border)",color:"var(--pg-text-1)" }} />
            </div>
          </div>

          {/* Work details */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>Work Details</p>
            <div className="space-y-4">

              {/* Subsidiary — can select multiple for same role, or group-level */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
                    Subsidiary(ies)
                  </label>
                  <span className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
                    Select one or more · or choose Group-level
                  </span>
                </div>
                <div className="space-y-1.5 p-3 rounded-xl" style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)" }}>
                  {/* Group-level option */}
                  <label className="flex items-center gap-2.5 cursor-pointer py-1 border-b" style={{ borderColor: "var(--pg-card-border)" }}>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isGroupSelected ? "bg-violet-500 border-violet-500" : "border-slate-300 dark:border-slate-600"}`}
                         onClick={() => { setSelectedSubs(isGroupSelected ? [] : ["GROUP"]); setPositionCode(""); }}>
                      {isGroupSelected && <span className="text-white text-[8px]">✓</span>}
                    </div>
                    <div>
                      <span className="text-[12px] font-semibold" style={{ color: isGroupSelected ? "#7c3aed" : "var(--pg-text-1)" }}>Group-level</span>
                      <span className="text-[11px] ml-1.5" style={{ color: "var(--pg-text-3)" }}>Compliance, HR, IT — all subsidiaries</span>
                    </div>
                  </label>
                  {/* Individual subsidiaries */}
                  {subsidiaries.map(s => {
                    const checked = selectedSubs.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2.5 cursor-pointer py-1">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${checked ? "bg-blue-500 border-blue-500" : "border-slate-300 dark:border-slate-600"}`}
                             onClick={() => {
                               if (isGroupSelected) return;
                               setSelectedSubs(prev => checked ? prev.filter(x => x !== s.id) : [...prev, s.id]);
                               setPositionCode("");
                             }}>
                          {checked && <span className="text-white text-[8px]">✓</span>}
                        </div>
                        <span className="text-[12px]" style={{ color: checked ? "var(--pg-text-1)" : "var(--pg-text-2)", opacity: isGroupSelected ? 0.4 : 1 }}>{s.name}</span>
                      </label>
                    );
                  })}
                </div>
                {selectedSubs.length > 1 && !isGroupSelected && (
                  <p className="text-[11px] mt-1" style={{ color: "#2563eb" }}>
                    This person will hold the same role across {selectedSubs.length} subsidiaries.
                  </p>
                )}
              </div>

              {/* Position dropdown */}
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
                  Position
                  {subValue === "" && <span className="ml-1" style={{ color: "var(--pg-text-4)" }}>— select a subsidiary first</span>}
                </label>
                <select value={positionCode} onChange={e => setPositionCode(e.target.value)} required
                        disabled={subValue === ""}
                        className="w-full h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                        style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                  <option value="">Select position…</option>
                  {subPositions.length > 0 && <optgroup label="Subsidiary roles">{subPositions.map(p => <option key={p.id} value={p.code}>{p.title}</option>)}</optgroup>}
                  {groupPositions.length > 0 && <optgroup label="Group-level">{groupPositions.map(p => <option key={p.id} value={p.code}>{p.title}</option>)}</optgroup>}
                </select>
              </div>
            </div>
          </div>

          {/* Password */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--pg-text-3)" }}>Credentials</p>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>
              Temporary Password <span style={{ color:"var(--pg-text-4)" }}>— share securely with the user</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-10 px-3 rounded-xl font-mono text-[13px] flex items-center"
                   style={{ background:"var(--pg-muted-bg)",border:"1px solid var(--pg-card-border)",color:"var(--pg-text-1)" }}>
                {showPass ? password : "•".repeat(password.length)}
              </div>
              <button type="button" onClick={() => setShowPass(s => !s)}
                      className="w-9 h-10 flex items-center justify-center rounded-xl transition-colors"
                      style={{ border:"1px solid var(--pg-card-border)",color:"var(--pg-text-3)" }}>
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button type="button" onClick={copyPassword}
                      className="w-9 h-10 flex items-center justify-center rounded-xl transition-colors"
                      style={{ border:"1px solid var(--pg-card-border)",color: copied ? "#059669" : "var(--pg-text-3)" }}>
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                 style={{ background:"#fef2f2",border:"1px solid #fecaca" }}>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2" style={{ borderTop:"1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium transition-colors"
                    style={{ border:"1px solid var(--pg-card-border)",color:"var(--pg-text-2)" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background:"linear-gradient(135deg,#2563eb,#1d4ed8)",boxShadow:"0 1px 6px rgba(37,99,235,0.35)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HRAdminPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: rawUsers, isLoading } = useQuery({
    queryKey: ["org-users"],
    queryFn: async () => {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";
      const res = await fetch(`${baseUrl}/api/v1/org/users`, { credentials: "include" });
      if (!res.ok) return [] as UserRow[];
      const json = await res.json() as Array<{
        user_id: string; email: string; display_name: string; user_status: string;
        person_id?: string; assignments?: Assignment[];
      }>;
      return json.map(u => ({ ...u, id: u.user_id, assignments: u.assignments ?? [] })) as UserRow[];
    },
  });

  // The org endpoints return lowercase field names (id, name) — use that directly
  const { data: subsidiaries = [] } = useQuery({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";
      const res = await fetch(`${baseUrl}/api/v1/org/subsidiaries`, { credentials: "include" });
      if (!res.ok) return [] as SubsidiaryOption[];
      return res.json() as Promise<SubsidiaryOption[]>;
    },
  });

  const users = rawUsers ?? [];
  const assigned   = users.filter(u => u.assignments?.length > 0).length;
  const unassigned = users.filter(u => !u.assignments?.length).length;

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>User Management</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Page Group HR · {users.length} user{users.length !== 1 ? "s" : ""} in the system
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 6px rgba(37,99,235,0.35)" }}>
          <Plus className="w-3.5 h-3.5" /> Onboard User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users",    value: users.length,  color: "#2563eb", bg: "#eff6ff", icon: Users },
          { label: "Assigned",       value: assigned,      color: "#059669", bg: "#ecfdf5", icon: Briefcase },
          { label: "No Assignment",  value: unassigned,    color: "#d97706", bg: "#fffbeb", icon: Building2 },
        ].map(s => (
          <div key={s.label} className="rounded-2xl overflow-hidden" style={{ background:"var(--pg-card)",border:"1px solid var(--pg-card-border)" }}>
            <div className="h-[3px]" style={{ background:s.color }} />
            <div className="p-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:s.color }}>{s.label}</p>
                <p className="text-[22px] font-bold tabular leading-none mt-1.5" style={{ color:"var(--pg-text-1)" }}>{s.value}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:s.bg }}>
                <s.icon className="w-4 h-4" style={{ color:s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* User table */}
      <DataTable
        columns={COLUMNS}
        data={users}
        searchPlaceholder="Search by name or email…"
        searchKeys={["display_name", "email"]}
        onExport={() => {}}
        isLoading={isLoading}
        pageSize={20}
        emptyMessage="No users found. Click 'Onboard User' to get started."
      />

      {/* Create user panel */}
      {showCreate && (
        <CreateUserPanel onClose={() => setShowCreate(false)} subsidiaries={subsidiaries ?? []} />
      )}
    </div>
  );
}
