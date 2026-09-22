"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type RolePermission = {
  role_code: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_approve: boolean;
  can_export: boolean;
  updated_at: string;
};

type PermissionMatrix = Record<string, Record<string, RolePermission>>;

type PermissionKey = "can_view" | "can_create" | "can_approve" | "can_export";

type UpdatePayload = {
  role_code: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_approve: boolean;
  can_export: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLES: { code: string; label: string }[] = [
  { code: "HEAD_OF_OPERATIONS",        label: "Head of Operations" },
  { code: "TREASURY_OPS_FINANCE_MGR",  label: "Treasury Ops & Finance Mgr" },
  { code: "TL_FINANCIAL_REPORTING",    label: "TL Financial Reporting" },
  { code: "FINOPS_MANAGER",            label: "FinOps Manager" },
  { code: "FUND_TREASURY_OPERATIONS",  label: "Fund & Treasury Operations" },
  { code: "RECONCILIATION_OFFICER",    label: "Reconciliation Officer" },
  { code: "FINANCE_OFFICER",           label: "Finance Officer" },
  { code: "FINANCE_OPS_ASSOCIATE",     label: "Finance & Ops Associate" },
  { code: "FINANCE_OPS_INTERN",        label: "Finance & Ops Intern" },
  { code: "TREASURY_ANALYST",          label: "Treasury Analyst" },
  { code: "TREASURY_OFFICER",          label: "Treasury Officer" },
  { code: "OPERATIONS_EXECUTIVE",      label: "Operations Executive" },
  { code: "OPERATIONS_ASSOCIATE",      label: "Operations Associate" },
];

const MODULES: { key: string; label: string }[] = [
  { key: "journals",       label: "Journal Entries" },
  { key: "reports",        label: "Financial Reports" },
  { key: "budget",         label: "Budget" },
  { key: "fx_rates",       label: "FX Rates" },
  { key: "fixed_assets",   label: "Fixed Assets" },
  { key: "vendors",        label: "Vendors" },
  { key: "payables",       label: "Payables (AP)" },
  { key: "receivables",    label: "Receivables (AR)" },
  { key: "general_ledger", label: "General Ledger & Periods" },
];

const PERMISSION_COLS: { key: PermissionKey; label: string }[] = [
  { key: "can_view",    label: "View" },
  { key: "can_create",  label: "Create" },
  { key: "can_approve", label: "Approve" },
  { key: "can_export",  label: "Export" },
];

const LEGEND_ITEMS = [
  { label: "View",    desc: "Can see and read data" },
  { label: "Create",  desc: "Can create and edit records" },
  { label: "Approve", desc: "Can post journals, approve payables, close periods, depreciate assets" },
  { label: "Export",  desc: "Can download Excel/PDF exports" },
];

// ── API ────────────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(err.error?.message ?? "Request failed");
  }
  return res.json();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns a default zeroed-out permission row */
function defaultPerm(role_code: string, module: string): RolePermission {
  return {
    role_code,
    module,
    can_view: false,
    can_create: false,
    can_approve: false,
    can_export: false,
    updated_at: new Date().toISOString(),
  };
}

type AccessSummary = "Full access" | "View only" | "No access" | "Custom";

function getAccessSummary(
  matrix: PermissionMatrix,
  roleCode: string
): AccessSummary {
  const rolePerms = matrix[roleCode];
  if (!rolePerms) return "No access";

  const perms = MODULES.map(
    (m) => rolePerms[m.key] ?? defaultPerm(roleCode, m.key)
  );

  const allTrue = perms.every(
    (p) => p.can_view && p.can_create && p.can_approve && p.can_export
  );
  if (allTrue) return "Full access";

  const allFalse = perms.every(
    (p) => !p.can_view && !p.can_create && !p.can_approve && !p.can_export
  );
  if (allFalse) return "No access";

  const viewOnly = perms.every(
    (p) => p.can_view && !p.can_create && !p.can_approve && !p.can_export
  );
  if (viewOnly) return "View only";

  return "Custom";
}

const SUMMARY_STYLES: Record<AccessSummary, { bg: string; color: string }> = {
  "Full access": { bg: "#d1fae5", color: "#065f46" },
  "View only":   { bg: "#dbeafe", color: "#1e40af" },
  "Custom":      { bg: "#fef3c7", color: "#92400e" },
  "No access":   { bg: "#f3f4f6", color: "#6b7280" },
};

// ── Toggle Switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  loading,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center w-10 h-5">
        <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-all duration-200 focus:outline-none disabled:opacity-40",
      )}
      style={{
        background: checked
          ? "linear-gradient(135deg,#FF6600,#E05500)"
          : "var(--pg-input-border)",
      }}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PermissionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedRole, setSelectedRole] = useState<string>(ROLES[0].code);
  // Track which (role, module, permKey) cells are currently saving
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // ── Fetch matrix ──────────────────────────────────────────────────────────

  const { data: matrix = {}, isLoading } = useQuery<PermissionMatrix>({
    queryKey: ["finance-permissions"],
    queryFn: () => apiFetch("/permissions"),
    refetchInterval: 60_000,
  });

  // ── Mutation ──────────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: (payload: UpdatePayload) =>
      apiFetch("/permissions", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onMutate: async (payload: UpdatePayload) => {
      await queryClient.cancelQueries({ queryKey: ["finance-permissions"] });
      const previous = queryClient.getQueryData<PermissionMatrix>(["finance-permissions"]);

      // Optimistic update
      queryClient.setQueryData<PermissionMatrix>(["finance-permissions"], (old = {}) => {
        const next = { ...old };
        next[payload.role_code] = { ...(next[payload.role_code] ?? {}) };
        next[payload.role_code][payload.module] = {
          ...((next[payload.role_code][payload.module]) ?? defaultPerm(payload.role_code, payload.module)),
          ...payload,
          updated_at: new Date().toISOString(),
        };
        return next;
      });

      return { previous };
    },
    onSuccess: (_data, payload) => {
      toast({
        title: "Permission updated",
        description: `${ROLES.find((r) => r.code === payload.role_code)?.label ?? payload.role_code} — ${MODULES.find((m) => m.key === payload.module)?.label ?? payload.module}`,
      });
    },
    onError: (err, _payload, ctx) => {
      // Roll back
      if (ctx?.previous) {
        queryClient.setQueryData(["finance-permissions"], ctx.previous);
      }
      toast({
        title: "Failed to update permission",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-permissions"] });
    },
  });

  // ── Toggle handler ────────────────────────────────────────────────────────

  function handleToggle(
    roleCode: string,
    moduleKey: string,
    permKey: PermissionKey,
    newValue: boolean
  ) {
    const cellId = `${roleCode}:${moduleKey}:${permKey}`;
    setSaving((prev) => new Set(prev).add(cellId));

    const current =
      matrix[roleCode]?.[moduleKey] ?? defaultPerm(roleCode, moduleKey);

    const payload: UpdatePayload = {
      role_code: roleCode,
      module: moduleKey,
      can_view:    permKey === "can_view"    ? newValue : current.can_view,
      can_create:  permKey === "can_create"  ? newValue : current.can_create,
      can_approve: permKey === "can_approve" ? newValue : current.can_approve,
      can_export:  permKey === "can_export"  ? newValue : current.can_export,
    };

    updateMutation.mutate(payload, {
      onSettled: () => {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(cellId);
          return next;
        });
      },
    });
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const selectedRoleLabel =
    ROLES.find((r) => r.code === selectedRole)?.label ?? selectedRole;

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* Page header */}
      <div>
        <h1
          className="text-[18px] font-bold"
          style={{ color: "var(--pg-text-1)" }}
        >
          Finance Permissions
        </h1>
        <p
          className="text-[12px] mt-0.5"
          style={{ color: "var(--pg-text-3)" }}
        >
          Configure what each role can access within the accounting module.
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-4 items-start">
        {/* ── LEFT PANEL: role list ── */}
        <div
          className="shrink-0 w-[240px] rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
          }}
        >
          <div
            className="px-4 py-3"
            style={{ borderBottom: "1px solid var(--pg-row-border)" }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--pg-text-3)" }}
            >
              Roles
            </p>
          </div>

          <div className="overflow-y-auto max-h-[calc(100vh-260px)]">
            {ROLES.map((role) => {
              const isActive = selectedRole === role.code;
              const summary = getAccessSummary(matrix, role.code);
              const summaryStyle = SUMMARY_STYLES[summary];

              return (
                <button
                  key={role.code}
                  onClick={() => setSelectedRole(role.code)}
                  className="w-full text-left px-4 py-3 transition-colors"
                  style={{
                    borderBottom: "1px solid var(--pg-row-border)",
                    background: isActive
                      ? "linear-gradient(135deg,rgba(255,102,0,0.08),rgba(224,85,0,0.04))"
                      : "transparent",
                    borderLeft: isActive
                      ? "2px solid #FF6600"
                      : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--pg-row-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background =
                        "transparent";
                  }}
                >
                  <p
                    className="text-[12px] font-semibold leading-tight"
                    style={{
                      color: isActive ? "#FF6600" : "var(--pg-text-1)",
                    }}
                  >
                    {role.label}
                  </p>
                  {!isLoading && (
                    <span
                      className="inline-block mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={summaryStyle}
                    >
                      {summary}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT PANEL: permission matrix ── */}
        <div className="flex-1 min-w-0">
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
            }}
          >
            {/* Panel header */}
            <div
              className="flex items-center gap-3 px-6 py-4"
              style={{ borderBottom: "1px solid var(--pg-row-border)" }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "#fff3ed" }}
              >
                <ShieldCheck className="w-4 h-4" style={{ color: "#FF6600" }} />
              </div>
              <div>
                <p
                  className="text-[14px] font-bold"
                  style={{ color: "var(--pg-text-1)" }}
                >
                  {selectedRoleLabel}
                </p>
                <p
                  className="text-[11px]"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  {selectedRole}
                </p>
              </div>
            </div>

            {/* Column headers */}
            <div
              className="grid items-center px-6 py-2.5"
              style={{
                gridTemplateColumns: "1fr 120px 120px 120px 120px",
                borderBottom: "1px solid var(--pg-row-border)",
                background: "var(--pg-muted-bg)",
              }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: "var(--pg-text-3)" }}
              >
                Module
              </span>
              {PERMISSION_COLS.map((col) => (
                <span
                  key={col.key}
                  className="text-[10px] font-bold uppercase tracking-wider text-center"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  {col.label}
                </span>
              ))}
            </div>

            {/* Module rows */}
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2
                  className="w-5 h-5 animate-spin"
                  style={{ color: "var(--pg-text-4)" }}
                />
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {MODULES.map((mod) => {
                  const perm =
                    matrix[selectedRole]?.[mod.key] ??
                    defaultPerm(selectedRole, mod.key);

                  return (
                    <div
                      key={mod.key}
                      className="grid items-center px-6 py-3.5 transition-colors"
                      style={{
                        gridTemplateColumns: "1fr 120px 120px 120px 120px",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLElement).style.background =
                          "var(--pg-row-hover)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLElement).style.background = "")
                      }
                    >
                      {/* Module name */}
                      <p
                        className="text-[13px] font-medium"
                        style={{ color: "var(--pg-text-1)" }}
                      >
                        {mod.label}
                      </p>

                      {/* Permission toggles */}
                      {PERMISSION_COLS.map((col) => {
                        const cellId = `${selectedRole}:${mod.key}:${col.key}`;
                        const isSaving = saving.has(cellId);

                        return (
                          <div
                            key={col.key}
                            className="flex items-center justify-center"
                          >
                            <ToggleSwitch
                              checked={perm[col.key]}
                              loading={isSaving}
                              onChange={(next) =>
                                handleToggle(
                                  selectedRole,
                                  mod.key,
                                  col.key,
                                  next
                                )
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Legend ── */}
          <div
            className="mt-4 rounded-2xl px-6 py-4"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
            }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-wider mb-3"
              style={{ color: "var(--pg-text-3)" }}
            >
              Legend
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              {LEGEND_ITEMS.map((item) => (
                <div key={item.label} className="flex items-start gap-2">
                  <span
                    className="shrink-0 mt-0.5 text-[11px] font-bold w-[60px]"
                    style={{ color: "#FF6600" }}
                  >
                    {item.label}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
