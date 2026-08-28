"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { usePosition } from "@/lib/position";
import {
  Users, UserPlus, UserCheck, UserX, ArrowRight,
  CheckSquare, Clock, Brain, Building2, AlertTriangle,
  CalendarDays, Check, X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

type UserRow = {
  user_id: string; email: string; display_name: string; user_status: string;
  assignments?: Array<{
    position_title: string; subsidiary_name: string; subsidiary_id?: string; effective_from: string;
  }>;
};

type PendingGradeRow = {
  assignment_id: string;
  person_id: string;
  display_name: string;
  email: string;
  subsidiary_name: string;
  position_title: string;
  grade_level_code: string;
  grade_level_name: string;
};

type GradeLevel = { code: string; display_name: string };

// ── Pending Grade Confirmation Card ───────────────────────────────────────────

function PendingGradeCard() {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null); // person_id
  const [newGrade, setNewGrade] = useState<Record<string, string>>({});

  const { data: pending = [] } = useQuery<PendingGradeRow[]>({
    queryKey: ["pending-grades"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/admin/pending-grades`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as PendingGradeRow[];
    },
  });

  const { data: gradeLevels = [] } = useQuery<GradeLevel[]>({
    queryKey: ["grade-levels"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/grade-levels`, { credentials: "include" });
      if (!res.ok) {
        // Fallback static list until the endpoint is wired
        return [
          { code: "ANALYST", display_name: "Analyst" },
          { code: "ASSOCIATE", display_name: "Associate" },
          { code: "EXECUTIVE_ASSOCIATE", display_name: "Executive Associate" },
          { code: "SENIOR_EXEC_ASSOCIATE", display_name: "Senior Executive Associate" },
          { code: "ASSISTANT_MANAGER", display_name: "Assistant Manager" },
          { code: "DEPUTY_MANAGER", display_name: "Deputy Manager" },
          { code: "MANAGER", display_name: "Manager" },
          { code: "SENIOR_MANAGER", display_name: "Senior Manager" },
          { code: "AVP", display_name: "Assistant Vice President" },
          { code: "VP", display_name: "Vice President" },
          { code: "SVP", display_name: "Senior Vice President" },
        ];
      }
      return ((await res.json()) ?? []) as GradeLevel[];
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ userId, gradeCode }: { userId: string; gradeCode: string }) => {
      const res = await fetch(`${BASE}/api/v1/admin/users/${userId}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ grade_level_code: gradeCode }),
      });
      if (!res.ok) throw new Error("Failed to update grade");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-grades"] });
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      setConfirming(null);
    },
  });

  if (pending.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid #fcd34d" }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ borderBottom: "1px solid var(--pg-row-border)", background: "#fffbeb" }}>
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Pending Grade Confirmation
            <span className="ml-2 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#d97706" }}>
              {pending.length}
            </span>
          </h2>
          <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
            These employees have transitional grade designations that require confirmation.
          </p>
        </div>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
        {pending.map(row => (
          <div key={row.person_id} className="px-5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>{row.display_name}</p>
                <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                  {row.position_title} · {row.subsidiary_name}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                  Current grade: <span className="font-semibold" style={{ color: "var(--pg-text-2)" }}>{row.grade_level_name || row.grade_level_code}</span>
                </p>
              </div>
              {confirming === row.person_id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={newGrade[row.person_id] ?? row.grade_level_code}
                    onChange={e => setNewGrade(g => ({ ...g, [row.person_id]: e.target.value }))}
                    className="h-8 px-2 rounded-lg text-[12px] outline-none"
                    style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                    {gradeLevels.map(g => (
                      <option key={g.code} value={g.code}>{g.display_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => confirmMutation.mutate({ userId: row.person_id, gradeCode: newGrade[row.person_id] ?? row.grade_level_code })}
                    disabled={confirmMutation.isPending}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-white"
                    style={{ background: "#059669" }}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-3)" }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setConfirming(row.person_id); setNewGrade(g => ({ ...g, [row.person_id]: row.grade_level_code })); }}
                  className="shrink-0 h-7 px-3 rounded-lg text-[11px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#d97706,#b45309)" }}>
                  Confirm Grade
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Subsidiary = { id: string; code: string; name: string };

export default function HRDashboard() {
  const { user, subsidiary } = useAuth();
  const { activePosition } = usePosition();
  const [selectedSubId, setSelectedSubId] = useState<string>("all");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);

  // Sync to the active subsidiary context:
  // - Group-level positions (subsidiary_id is null) → show all
  // - Subsidiary-specific positions → default to active subsidiary
  useEffect(() => {
    if (!activePosition) return;
    if (!activePosition.subsidiary_id && subsidiary?.ID) {
      // Group-level position but sidebar has an active subsidiary scoped — stay "all"
      setSelectedSubId("all");
    } else if (activePosition.subsidiary_id) {
      setSelectedSubId(activePosition.subsidiary_id);
    } else if (subsidiary?.ID) {
      setSelectedSubId(subsidiary.ID);
    }
  }, [activePosition?.id, subsidiary?.ID]);

  const { data: rawUsers = [] } = useQuery<UserRow[]>({
    queryKey: ["org-users"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/users`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as UserRow[];
    },
  });

  const { data: subsidiaries = [] } = useQuery<Subsidiary[]>({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/subsidiaries`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as Subsidiary[];
    },
  });

  // Filter employees by selected subsidiary (or show all)
  const employees = selectedSubId === "all"
    ? rawUsers
    : rawUsers.filter(u => u.assignments?.some(a => a.subsidiary_id === selectedSubId));

  const total    = employees.length;
  const active   = employees.filter(u => u.user_status === "active").length;
  const inactive = employees.filter(u => u.user_status === "inactive").length;
  const noAssign = employees.filter(u => !u.assignments?.length).length;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);
  const recent = employees.filter(u => {
    const eff = u.assignments?.[0]?.effective_from;
    return eff && new Date(eff) >= thirtyDaysAgo;
  }).slice(0, 5);

  const firstName = user?.DisplayName?.split(" ")[0] ?? "there";

  const STATS = [
    { label: "Total Employees", value: total,    icon: Users,      color: "#FF6600", bg: "#fff7f0" },
    { label: "Active",          value: active,   icon: UserCheck,  color: "#059669", bg: "#ecfdf5" },
    { label: "Inactive",        value: inactive, icon: UserX,      color: "#dc2626", bg: "#fef2f2" },
    { label: "No Assignment",   value: noAssign, icon: Clock,      color: "#d97706", bg: "#fffbeb" },
  ];

  const QUICK_ACTIONS = [
    { label: "Onboard New User",     icon: UserPlus,     href: "/hr/admin",   color: "#FF6600", bg: "#fff7f0" },
    { label: "Employee Directory",   icon: Users,        href: "/hr/records", color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Leave Management",     icon: CalendarDays, href: "/hr/leave",   color: "#059669", bg: "#ecfdf5" },
    { label: "View Approvals",       icon: CheckSquare,  href: "/approval",   color: "#d97706", bg: "#fffbeb" },
  ];

  // Per-subsidiary breakdown (shown when "All" selected)
  const subBreakdown = selectedSubId === "all" ? subsidiaries.map(s => {
    const inSub = rawUsers.filter(u => u.assignments?.some(a => a.subsidiary_id === s.id));
    return { id: s.id, name: s.name, count: inSub.length, active: inSub.filter(u => u.user_status === "active").length };
  }).filter(s => s.count > 0) : [];

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
            {now ? getGreeting() : "Welcome"}, {firstName}.
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {now ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""} · Page Group HR
          </p>
        </div>

        {/* Subsidiary switcher */}
        {subsidiaries.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setSelectedSubId("all")}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px] font-semibold transition-all"
              style={selectedSubId === "all"
                ? { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "white" }
                : { background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              <Building2 className="w-3 h-3" /> All
            </button>
            {subsidiaries.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSubId(s.id)}
                className="h-8 px-3 rounded-xl text-[11px] font-semibold transition-all"
                style={selectedSubId === s.id
                  ? { background: "linear-gradient(135deg,#FF6600,#E05500)", color: "white" }
                  : { background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                {s.name.replace("Page ", "")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pending grade review — shown only when there are flagged employees */}
      <PendingGradeCard />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATS.map(s => (
          <div key={s.label} className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>
            <div className="h-[3px]" style={{ background: s.color }} />
            <div className="p-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
                <p className="text-[26px] font-bold tabular leading-none mt-1.5" style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Subsidiary breakdown — only when All selected */}
      {subBreakdown.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {subBreakdown.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedSubId(s.id)}
              className="text-left p-3 rounded-xl transition-all"
              style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-card)"}>
              <p className="text-[11px] font-semibold truncate" style={{ color: "var(--pg-text-2)" }}>{s.name.replace("Page ", "")}</p>
              <p className="text-[18px] font-bold mt-0.5" style={{ color: "var(--pg-text-1)" }}>{s.count}</p>
              <p className="text-[10px]" style={{ color: "#059669" }}>{s.active} active</p>
            </button>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5">
        {/* Quick actions */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--pg-text-3)" }}>Quick Actions</p>
          {QUICK_ACTIONS.map(a => (
            <Link key={a.label} href={a.href}
                  className="flex items-center gap-3 p-3.5 rounded-xl transition-all group"
                  style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-card)"}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: a.bg }}>
                <a.icon className="w-4 h-4" style={{ color: a.color }} />
              </div>
              <span className="text-[13px] font-medium flex-1" style={{ color: "var(--pg-text-1)" }}>{a.label}</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--pg-text-3)" }} />
            </Link>
          ))}
        </div>

        {/* Recent additions */}
        <div className="md:col-span-2">
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                Recent Additions {selectedSubId !== "all" && <span className="text-[11px] font-normal" style={{ color: "var(--pg-text-3)" }}>— filtered</span>}
              </h2>
              <Link href="/hr/records" className="text-[11px] font-medium text-orange-600 hover:underline flex items-center gap-0.5">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-2">
                <Users className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
                <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No new employees added in the last 30 days.</p>
                <Link href="/hr/admin" className="mt-1 text-[12px] font-semibold text-orange-600 hover:underline">
                  Onboard the first employee →
                </Link>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {recent.map(u => {
                  const asgn = selectedSubId === "all"
                    ? u.assignments?.[0]
                    : u.assignments?.find(a => a.subsidiary_id === selectedSubId) ?? u.assignments?.[0];
                  return (
                    <div key={u.user_id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                           style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
                        {u.display_name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{u.display_name}</p>
                        <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>
                          {asgn ? `${asgn.position_title} · ${asgn.subsidiary_name}` : u.email}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: u.user_status === "active" ? "#d1fae5" : "#fee2e2", color: u.user_status === "active" ? "#065f46" : "#991b1b" }}>
                        {u.user_status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* All employees summary */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            All Employees
            {selectedSubId !== "all" && (
              <span className="ml-2 text-[11px] font-normal px-2 py-0.5 rounded-full"
                    style={{ background: "#fff7f0", color: "#FF6600" }}>
                {subsidiaries.find(s => s.id === selectedSubId)?.name}
              </span>
            )}
          </h2>
          <Link href="/hr/records" className="text-[11px] font-medium text-orange-600 hover:underline">View full directory →</Link>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
          {employees.slice(0, 8).map(u => {
            const asgn = selectedSubId === "all"
              ? (u.assignments?.find(a => a.position_title) ?? u.assignments?.[0])
              : (u.assignments?.find(a => a.subsidiary_id === selectedSubId) ?? u.assignments?.[0]);
            // Show all subsidiaries when viewing "all", otherwise show just the relevant one
            const subNames = selectedSubId === "all"
              ? [...new Set(u.assignments?.filter(a => a.subsidiary_name).map(a => a.subsidiary_name) ?? [])]
              : [];
            return (
              <div key={u.user_id} className="flex items-center gap-3 px-5 py-3 transition-colors"
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                     style={{ background: u.user_status === "active" ? "linear-gradient(135deg,#FF6600,#E05500)" : "#94a3b8" }}>
                  {u.display_name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-3 gap-2 items-center">
                  <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{u.display_name}</p>
                  <p className="text-[12px] truncate" style={{ color: "var(--pg-text-2)" }}>{asgn?.position_title ?? "—"}</p>
                  <div className="flex flex-wrap gap-1">
                    {subNames.length > 0
                      ? subNames.map(s => (
                          <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}>
                            {s?.split(" ")[1] ?? s}
                          </span>
                        ))
                      : <p className="text-[12px] truncate" style={{ color: "var(--pg-text-3)" }}>{asgn?.subsidiary_name ?? "No assignment"}</p>
                    }
                  </div>
                </div>
              </div>
            );
          })}
          {employees.length > 8 && (
            <div className="px-5 py-3">
              <Link href="/hr/records" className="text-[12px] font-medium text-orange-600 hover:underline">
                +{employees.length - 8} more employees — view full directory
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
