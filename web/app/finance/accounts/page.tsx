"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, ChevronRight, ChevronDown, Edit2, Power,
  AlertCircle, X, Check, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Account = {
  code: string; name: string; account_type: string; account_group: string;
  parent_code?: string; normal_balance: string;
  is_header: boolean; is_active: boolean; description: string;
};

const TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ASSET:     { label: "Asset",     color: "#FF6600", bg: "#fff7f0" },
  LIABILITY: { label: "Liability", color: "#dc2626", bg: "#fef2f2" },
  EQUITY:    { label: "Equity",    color: "#7c3aed", bg: "#f5f3ff" },
  REVENUE:   { label: "Revenue",   color: "#059669", bg: "#ecfdf5" },
  EXPENSE:   { label: "Expense",   color: "#d97706", bg: "#fffbeb" },
};

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(e.error?.message ?? "Request failed");
  }
  return res.json();
}

// ── Add / Edit Account Modal ───────────────────────────────────────────────────

function AccountModal({ editing, onClose }: { editing?: Account; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [code, setCode]       = useState(editing?.code ?? "");
  const [name, setName]       = useState(editing?.name ?? "");
  const [type, setType]       = useState(editing?.account_type ?? "ASSET");
  const [group, setGroup]     = useState(editing?.account_group ?? "");
  const [parent, setParent]   = useState(editing?.parent_code ?? "");
  const [isHeader, setHeader] = useState(editing?.is_header ?? false);
  const [desc, setDesc]       = useState(editing?.description ?? "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const body = { code, name, account_type: type, account_group: group,
        parent_code: parent || null, is_header: isHeader, description: desc };
      if (editing) {
        await apiFetch(`/accounts/${editing.code}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "Account updated" });
      } else {
        await apiFetch("/accounts", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Account created", description: code });
      }
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  const GROUPS: Record<string, string[]> = {
    ASSET:     ["Current Assets", "Investment Assets", "Non-Current Assets"],
    LIABILITY: ["Current Liabilities", "Non-Current Liabilities"],
    EQUITY:    ["Equity"],
    REVENUE:   ["Fee Income", "Investment Income", "Other Income"],
    EXPENSE:   ["Staff Costs", "Occupancy", "Technology", "Marketing",
                "Professional Fees", "Travel and Transport", "Depreciation",
                "Finance Costs", "Investment Costs", "General & Admin"],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
         onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            {editing ? "Edit Account" : "New Account"}
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Code *</label>
              <input value={code} onChange={e => setCode(e.target.value)} disabled={!!editing} required
                     placeholder="e.g. 1101"
                     className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none disabled:opacity-60"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Type *</label>
              <select value={type} onChange={e => setType(e.target.value)} disabled={!!editing} required
                      className="w-full h-9 px-3 rounded-lg text-[13px] outline-none appearance-none disabled:opacity-60"
                      style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                {TYPE_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required placeholder="Account name"
                   className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                   style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Group</label>
              <select value={group} onChange={e => setGroup(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg text-[13px] outline-none appearance-none"
                      style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                <option value="">Select group…</option>
                {(GROUPS[type] ?? []).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Parent Code</label>
              <input value={parent} onChange={e => setParent(e.target.value)} placeholder="e.g. 1100"
                     className="w-full h-9 px-3 rounded-lg text-[13px] font-mono outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <div className={cn("w-4 h-4 rounded border flex items-center justify-center transition-all",
                               isHeader ? "bg-orange-500 border-orange-500" : "border-slate-300")}
                 onClick={() => setHeader(v => !v)}>
              {isHeader && <Check className="w-2.5 h-2.5 text-white" />}
            </div>
            <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
              Header account <span style={{ color: "var(--pg-text-4)" }}>— grouping only, not directly posted to</span>
            </span>
          </label>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--pg-text-3)" }}>Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional notes"
                   className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
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
                    style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing ? "Save Changes" : "Create Account")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ChartOfAccountsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch]       = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing]     = useState<Account | undefined>();
  const [showCreate, setShowCreate] = useState(false);

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ["accounts", showInactive],
    queryFn: async () => {
      const raw = await apiFetch(`/accounts?active=${!showInactive}`);
      return Array.isArray(raw) ? (raw as Account[]) : [];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (code: string) => apiFetch(`/accounts/${code}/toggle`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accounts"] }); },
    onError: (err) => toast({ title: "Failed", description: (err as Error).message, variant: "destructive" }),
  });

  function toggleGroup(g: string) {
    setCollapsed(s => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }

  const filtered = accounts.filter(a =>
    !search || a.code.includes(search) ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.account_group.toLowerCase().includes(search.toLowerCase())
  );

  // Group by type → group → rows
  const grouped = TYPE_ORDER.map(type => ({
    type,
    cfg: TYPE_LABELS[type],
    groups: [...new Set(filtered.filter(a => a.account_type === type).map(a => a.account_group))].map(grp => ({
      name: grp,
      accounts: filtered.filter(a => a.account_type === type && a.account_group === grp),
    })).filter(g => g.accounts.length > 0),
  })).filter(t => t.groups.length > 0);

  const total = accounts.length;
  const active = accounts.filter(a => a.is_active).length;

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Chart of Accounts</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {total} accounts · {active} active
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}>
          <Plus className="w-3.5 h-3.5" /> New Account
        </button>
      </div>

      {/* Type summary pills */}
      <div className="flex gap-2 flex-wrap">
        {TYPE_ORDER.map(t => {
          const cfg = TYPE_LABELS[t];
          const count = accounts.filter(a => a.account_type === t && a.is_active).length;
          return (
            <span key={t} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold"
                  style={{ background: cfg.bg, color: cfg.color }}>
              {cfg.label} <span className="opacity-70">{count}</span>
            </span>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl flex-1 max-w-sm"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Search by code, name or group…"
                 className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-[12px]" style={{ color: "var(--pg-text-2)" }}>
          <div className={cn("w-4 h-4 rounded border flex items-center justify-center transition-all",
                             showInactive ? "bg-orange-500 border-orange-500" : "border-slate-300 dark:border-slate-600")}
               onClick={() => setShowInactive(v => !v)}>
            {showInactive && <Check className="w-2.5 h-2.5 text-white" />}
          </div>
          Show inactive
        </label>
      </div>

      {/* Account tree */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ type, cfg, groups }) => (
            <div key={type} className="rounded-2xl overflow-hidden"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              {/* Type header */}
              <div className="flex items-center gap-3 px-5 py-3.5"
                   style={{ background: cfg.bg, borderBottom: "1px solid var(--pg-row-border)" }}>
                <span className="text-[13px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.5)", color: cfg.color }}>
                  {accounts.filter(a => a.account_type === type && a.is_active).length} accounts
                </span>
              </div>

              {groups.map(grp => {
                const gKey = `${type}-${grp.name}`;
                const isCollapsed = collapsed.has(gKey);
                return (
                  <div key={grp.name}>
                    {/* Group sub-header */}
                    <button onClick={() => toggleGroup(gKey)}
                            className="w-full flex items-center gap-2 px-5 py-2.5 transition-colors"
                            style={{ borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}>
                      {isCollapsed
                        ? <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />
                        : <ChevronDown  className="w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />}
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>{grp.name}</span>
                      <span className="ml-auto text-[10px]" style={{ color: "var(--pg-text-4)" }}>{grp.accounts.length}</span>
                    </button>

                    {!isCollapsed && (
                      <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                        {grp.accounts.map(a => (
                          <div key={a.code}
                               className={cn("flex items-center gap-3 px-5 py-2.5 transition-colors",
                                            !a.is_active && "opacity-50")}
                               style={{ paddingLeft: a.parent_code ? "3.5rem" : undefined }}
                               onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                               onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                            {/* Code */}
                            <code className="text-[12px] font-mono w-14 shrink-0" style={{ color: "var(--pg-text-3)" }}>{a.code}</code>

                            {/* Name */}
                            <p className={cn("flex-1 text-[13px]", a.is_header && "font-semibold")}
                               style={{ color: "var(--pg-text-1)" }}>{a.name}</p>

                            {/* Normal balance */}
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: a.normal_balance === "DR" ? "#fff7f0" : "#fef2f2",
                                           color: a.normal_balance === "DR" ? "#FF6600" : "#dc2626" }}>
                              {a.normal_balance}
                            </span>

                            {a.is_header && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                                    style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-4)" }}>Header</span>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100"
                                 style={{ opacity: undefined }}
                                 onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                                 onMouseLeave={e => e.currentTarget.style.opacity = "0"}>
                              <button onClick={() => setEditing(a)} title="Edit"
                                      className="w-7 h-7 flex items-center justify-center rounded-lg"
                                      style={{ color: "var(--pg-text-3)" }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => toggleMutation.mutate(a.code)}
                                      title={a.is_active ? "Deactivate" : "Activate"}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg"
                                      style={{ color: a.is_active ? "#d97706" : "#059669" }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {(showCreate || editing) && (
        <AccountModal editing={editing} onClose={() => { setEditing(undefined); setShowCreate(false); }} />
      )}
    </div>
  );
}
