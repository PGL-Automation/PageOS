"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  ShieldCheck,
  Loader2,
  X,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────────

type ResolvedCapability = {
  code: string;
  name: string;
  description: string;
  domain: string;
  sort_order: number;
  granted: boolean;
  source: "role_default" | "individual_grant" | "individual_revoke";
};

// StaffMember comes from GET /org/staff — open to all authenticated users.
type StaffMember = {
  person_id: string;
  full_name: string;
  email: string;
};

// ── API base ───────────────────────────────────────────────────────────────────

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081"}/api/v1`;

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(err.error?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// All known domains — backend enforces who can actually grant/revoke.
const ALL_DOMAINS = [
  { id: "finance",        label: "Finance" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "portfolio",      label: "Portfolio" },
];

function hasAnyCapabilityInDomain(caps: ResolvedCapability[], domain: string): boolean {
  return caps.some((c) => c.domain === domain && c.granted);
}

// ── Source badge ───────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: ResolvedCapability["source"] }) {
  const styles: Record<ResolvedCapability["source"], { label: string; bg: string; color: string }> = {
    role_default:     { label: "Role default",  bg: "var(--pg-muted-bg)", color: "var(--pg-text-3)" },
    individual_grant: { label: "Granted",        bg: "#d1fae5",            color: "#065f46"           },
    individual_revoke:{ label: "Revoked",        bg: "#fee2e2",            color: "#991b1b"           },
  };
  const s = styles[source];
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ── Capability row ─────────────────────────────────────────────────────────────

function CapabilityRow({
  cap,
  isChanging,
  onToggle,
  onReset,
}: {
  cap: ResolvedCapability;
  isChanging: boolean;
  onToggle: (cap: ResolvedCapability, next: boolean) => void;
  onReset: (cap: ResolvedCapability) => void;
}) {
  const isRoleDefault = cap.source === "role_default";
  const hasOverride = !isRoleDefault;

  // Determine what checking/unchecking does
  // granted=true, source=role_default → unchecking calls /revoke
  // granted=false, source=role_default → checking calls /grant
  // granted=true, source=individual_grant → unchecking removes the grant (revoke)
  // granted=false, source=individual_revoke → checking removes the revoke (grant)

  return (
    <div
      className={cn(
        "flex items-start gap-4 px-6 py-3.5 transition-colors group",
        isChanging && "opacity-60 pointer-events-none"
      )}
      style={{ borderBottom: "1px solid var(--pg-row-border)" }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "")
      }
    >
      {/* Checkbox / spinner */}
      <div className="flex items-center justify-center w-5 h-5 mt-0.5 shrink-0">
        {isChanging ? (
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pg-text-4)" }} />
        ) : (
          <input
            type="checkbox"
            checked={cap.granted}
            onChange={(e) => onToggle(cap, e.target.checked)}
            className={cn(
              "w-4 h-4 rounded cursor-pointer accent-orange-500",
              isRoleDefault && "opacity-60"
            )}
          />
        )}
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] font-medium leading-tight"
          style={{ color: "var(--pg-text-1)" }}
        >
          {cap.name}
        </p>
        {cap.description && (
          <p
            className="text-[11px] mt-0.5 leading-relaxed"
            style={{ color: "var(--pg-text-3)" }}
          >
            {cap.description}
          </p>
        )}
      </div>

      {/* Source badge + reset button */}
      <div className="flex items-center gap-2 shrink-0">
        <SourceBadge source={cap.source} />
        {hasOverride && (
          <button
            title="Reset to role default"
            onClick={() => onReset(cap)}
            className={cn(
              "w-6 h-6 rounded-lg flex items-center justify-center transition-all",
              "opacity-0 group-hover:opacity-100 hover:opacity-100",
              "focus:opacity-100"
            )}
            style={{
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
            }}
          >
            <RotateCcw className="w-3 h-3" style={{ color: "var(--pg-text-3)" }} />
          </button>
        )}
        {!hasOverride && <div className="w-6 h-6" />}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PermissionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Track which capability codes are currently mutating
  const [changing, setChanging] = useState<Set<string>>(new Set());

  // Auto-select first domain
  const effectiveDomain = selectedDomain ?? ALL_DOMAINS[0].id;

  // ── Fetch all staff — open to any authenticated user ─────────────────────────

  const { data: staff = [], isLoading: staffLoading } = useQuery<StaffMember[]>({
    queryKey: ["org-staff"],
    queryFn: () => apiFetch<StaffMember[]>("/org/staff?family=finance"),
    staleTime: 2 * 60 * 1000,
  });

  // ── Fetch capabilities for selected domain (all users have the same cap list) ─
  // We actually fetch per-person caps when a person is selected.
  // We also fetch domain capabilities list to know the full set of caps in domain.

  const { data: domainCaps = [], isLoading: domainCapsLoading } = useQuery<ResolvedCapability[]>({
    queryKey: ["capabilities-domain", effectiveDomain],
    queryFn: () =>
      apiFetch<ResolvedCapability[]>(`/org/capabilities?domain=${encodeURIComponent(effectiveDomain!)}`),
    enabled: effectiveDomain !== null,
    staleTime: 5 * 60 * 1000,
  });

  // ── Fetch per-user domain access summaries (to show green/grey dots) ─────────
  // We fetch caps for ALL active users in batch by running individual queries
  // lazily. Instead of that, we rely on the person's own cap list once selected,
  // and for the sidebar dots we just check the selected person's caps.
  // For the dots we use a lightweight approach: fetch caps for each visible person.
  // To avoid N+1 requests, we prefetch only the first 50 visible users.

  // ── Fetch person capabilities (right panel) ──────────────────────────────────

  const { data: personCaps, isLoading: personCapsLoading } = useQuery<ResolvedCapability[]>({
    queryKey: ["capabilities-person", selectedPersonId],
    queryFn: () =>
      apiFetch<ResolvedCapability[]>(`/org/capabilities/person/${selectedPersonId}`),
    enabled: selectedPersonId !== null,
    staleTime: 0, // always fresh when switching people
  });

  // ── Filtered domain caps for selected person ─────────────────────────────────

  const personDomainCaps = useMemo(() => {
    if (!personCaps || !effectiveDomain) return [];
    return personCaps
      .filter((c) => c.domain === effectiveDomain)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [personCaps, effectiveDomain]);

  // ── Filtered + sorted staff list for sidebar ─────────────────────────────────

  const filteredStaff = useMemo(() => {
    const q = search.toLowerCase().trim();
    return staff
      .filter((s) => {
        if (!s.person_id) return false;
        if (!q) return true;
        return (
          s.full_name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q)
        );
      });
  }, [staff, search]);

  // ── Selected person ───────────────────────────────────────────────────────────

  const selectedPerson = staff.find((s) => s.person_id === selectedPersonId) ?? null;

  // ── Mutations ─────────────────────────────────────────────────────────────────

  function markChanging(code: string, active: boolean) {
    setChanging((prev) => {
      const next = new Set(prev);
      active ? next.add(code) : next.delete(code);
      return next;
    });
  }

  const grantMutation = useMutation({
    mutationFn: ({ personId, code }: { personId: string; code: string }) =>
      apiFetch(`/org/capabilities/person/${personId}/grant`, {
        method: "POST",
        body: JSON.stringify({ capability_code: code }),
      }),
    onSuccess: (_data, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ["capabilities-person", personId] });
    },
    onError: (err, { code }) => {
      markChanging(code, false);
      toast({
        title: "Failed to grant capability",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ personId, code }: { personId: string; code: string }) =>
      apiFetch(`/org/capabilities/person/${personId}/revoke`, {
        method: "POST",
        body: JSON.stringify({ capability_code: code }),
      }),
    onSuccess: (_data, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ["capabilities-person", personId] });
    },
    onError: (err, { code }) => {
      markChanging(code, false);
      toast({
        title: "Failed to revoke capability",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: ({ personId, code }: { personId: string; code: string }) =>
      apiFetch(`/org/capabilities/person/${personId}/reset`, {
        method: "POST",
        body: JSON.stringify({ capability_code: code }),
      }),
    onSuccess: (_data, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ["capabilities-person", personId] });
      toast({ title: "Reset to role default" });
    },
    onError: (err, { code }) => {
      markChanging(code, false);
      toast({
        title: "Failed to reset capability",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  function handleToggle(cap: ResolvedCapability, next: boolean) {
    if (!selectedPersonId) return;
    markChanging(cap.code, true);

    const mutation = next ? grantMutation : revokeMutation;
    mutation.mutate(
      { personId: selectedPersonId, code: cap.code },
      { onSettled: () => markChanging(cap.code, false) }
    );
  }

  function handleReset(cap: ResolvedCapability) {
    if (!selectedPersonId) return;
    markChanging(cap.code, true);
    resetMutation.mutate(
      { personId: selectedPersonId, code: cap.code },
      { onSettled: () => markChanging(cap.code, false) }
    );
  }

  // ── Domain label helper ───────────────────────────────────────────────────────

  function domainLabel(d: string): string {
    return d.charAt(0).toUpperCase() + d.slice(1).replace(/_/g, " ");
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-56px)] space-y-4">
      {/* Page header */}
      <div className="flex items-start justify-between shrink-0">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Permissions
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Manage individual capability overrides for staff across your domains.
          </p>
        </div>

        {/* Domain tabs */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}
        >
          {ALL_DOMAINS.map(({ id, label }) => {
            const isActive = effectiveDomain === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setSelectedDomain(id);
                  setSelectedPersonId(null);
                }}
                className="h-7 px-3 rounded-lg text-[12px] font-semibold transition-all"
                style={
                  isActive
                    ? {
                        background: "linear-gradient(135deg,#FF6600,#E05500)",
                        color: "#fff",
                        boxShadow: "0 1px 4px rgba(255,102,0,0.35)",
                      }
                    : { color: "var(--pg-text-2)" }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
        <div
          className="shrink-0 w-[260px] flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
          }}
        >
          {/* Search */}
          <div className="px-3 py-3 shrink-0" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                style={{ color: "var(--pg-text-4)" }}
              />
              <input
                type="text"
                placeholder="Search staff…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-lg text-[12px] outline-none"
                style={{
                  background: "var(--pg-input)",
                  border: "1px solid var(--pg-input-border)",
                  color: "var(--pg-text-1)",
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="w-3 h-3" style={{ color: "var(--pg-text-4)" }} />
                </button>
              )}
            </div>
          </div>

          {/* Staff list */}
          <div className="flex-1 overflow-y-auto">
            {staffLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pg-text-4)" }} />
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                  {search ? "No staff match your search." : "No staff found."}
                </p>
              </div>
            ) : (
              filteredStaff.map((person) => {
                const isSelected = selectedPersonId === person.person_id;

                // We use a simple heuristic for the dot:
                // if this person is selected and we have their caps, use those.
                // otherwise show neutral dot (we don't load caps for all users).
                const showGreenDot =
                  isSelected &&
                  personCaps !== undefined &&
                  effectiveDomain !== null &&
                  hasAnyCapabilityInDomain(personCaps, effectiveDomain);

                const showDot = isSelected && personCaps !== undefined;

                return (
                  <button
                    key={person.person_id}
                    onClick={() => setSelectedPersonId(person.person_id ?? null)}
                    className="w-full text-left px-4 py-3 transition-all"
                    style={{
                      borderBottom: "1px solid var(--pg-row-border)",
                      background: isSelected
                        ? "linear-gradient(135deg,rgba(255,102,0,0.07),rgba(224,85,0,0.03))"
                        : "transparent",
                      borderLeft: isSelected ? "2px solid #FF6600" : "2px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected)
                        (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected)
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {/* Avatar initial */}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                        style={{
                          background: isSelected ? "rgba(255,102,0,0.15)" : "var(--pg-muted-bg)",
                          color: isSelected ? "#FF6600" : "var(--pg-text-3)",
                        }}
                      >
                        {person.full_name.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p
                            className="text-[12px] font-semibold truncate"
                            style={{ color: isSelected ? "#FF6600" : "var(--pg-text-1)" }}
                          >
                            {person.full_name}
                          </p>
                          {/* Access dot */}
                          {showDot && (
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: showGreenDot ? "#10b981" : "#d1d5db" }}
                              title={showGreenDot ? "Has access in this domain" : "No access in this domain"}
                            />
                          )}
                        </div>
                        <p
                          className="text-[10px] truncate"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          {person.email}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer count */}
          <div
            className="px-4 py-2.5 shrink-0"
            style={{
              borderTop: "1px solid var(--pg-row-border)",
              background: "var(--pg-muted-bg)",
            }}
          >
            <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
              {filteredStaff.length} staff member{filteredStaff.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {!selectedPersonId ? (
            /* Empty state */
            <div
              className="flex-1 rounded-2xl flex items-center justify-center"
              style={{ border: "2px dashed var(--pg-card-border)", background: "var(--pg-card)" }}
            >
              <div className="text-center">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: "var(--pg-muted-bg)" }}
                >
                  <ShieldCheck className="w-5 h-5" style={{ color: "var(--pg-text-4)" }} />
                </div>
                <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
                  Select a staff member
                </p>
                <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                  Choose someone from the left to manage their{" "}
                  {effectiveDomain ? domainLabel(effectiveDomain) : ""} permissions.
                </p>
              </div>
            </div>
          ) : (
            <div
              className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden"
              style={{
                background: "var(--pg-card)",
                border: "1px solid var(--pg-card-border)",
              }}
            >
              {/* Right panel header */}
              <div
                className="flex items-center justify-between px-6 py-4 shrink-0"
                style={{ borderBottom: "1px solid var(--pg-row-border)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-[14px] font-bold shrink-0"
                    style={{ background: "rgba(255,102,0,0.12)", color: "#FF6600" }}
                  >
                    {selectedPerson?.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p
                      className="text-[14px] font-bold"
                      style={{ color: "var(--pg-text-1)" }}
                    >
                      {selectedPerson?.full_name}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                      {selectedPerson?.email ?? ""}
                      {effectiveDomain && (
                        <span
                          className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(255,102,0,0.1)", color: "#FF6600" }}
                        >
                          {domainLabel(effectiveDomain)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Autosave note */}
                <p className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>
                  All changes save immediately
                </p>
              </div>

              {/* Column headers */}
              <div
                className="grid items-center px-6 py-2"
                style={{
                  gridTemplateColumns: "20px 1fr 140px 32px",
                  borderBottom: "1px solid var(--pg-row-border)",
                  background: "var(--pg-muted-bg)",
                }}
              >
                <span />
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  Capability
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  Source
                </span>
                <span />
              </div>

              {/* Capability rows */}
              <div className="flex-1 overflow-y-auto">
                {personCapsLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2
                      className="w-5 h-5 animate-spin"
                      style={{ color: "var(--pg-text-4)" }}
                    />
                  </div>
                ) : personDomainCaps.length === 0 && !domainCapsLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <ShieldCheck className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
                    <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
                      No capabilities in this domain.
                    </p>
                  </div>
                ) : (
                  personDomainCaps.map((cap) => (
                    <CapabilityRow
                      key={cap.code}
                      cap={cap}
                      isChanging={changing.has(cap.code)}
                      onToggle={handleToggle}
                      onReset={handleReset}
                    />
                  ))
                )}
              </div>

              {/* Legend footer */}
              <div
                className="shrink-0 px-6 py-3 flex items-center gap-6 flex-wrap"
                style={{
                  borderTop: "1px solid var(--pg-row-border)",
                  background: "var(--pg-muted-bg)",
                }}
              >
                {[
                  { src: "role_default" as const,     label: "Role default — no override" },
                  { src: "individual_grant" as const,  label: "Explicitly granted to this person" },
                  { src: "individual_revoke" as const, label: "Explicitly revoked for this person" },
                ].map(({ src, label }) => (
                  <div key={src} className="flex items-center gap-2">
                    <SourceBadge source={src} />
                    <span className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>
                      {label}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2 ml-auto">
                  <RotateCcw className="w-3 h-3" style={{ color: "var(--pg-text-4)" }} />
                  <span className="text-[10px]" style={{ color: "var(--pg-text-3)" }}>
                    Reset to role default
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
