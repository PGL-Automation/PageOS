"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  Users, UserPlus, UserCheck, UserX, ArrowRight,
  Building2, CheckSquare, Clock, Brain, FileText,
} from "lucide-react";

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function HRDashboard() {
  const { user } = useAuth();
  const router = useRouter();

  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

  const { data: rawUsers = [] } = useQuery({
    queryKey: ["org-users"],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/v1/org/users`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<Array<{
        user_id: string; email: string; display_name: string; user_status: string;
        assignments?: Array<{ position_title: string; subsidiary_name: string; effective_from: string }>;
      }>>;
    },
  });

  const total      = rawUsers.length;
  const active     = rawUsers.filter(u => u.user_status === "active").length;
  const inactive   = rawUsers.filter(u => u.user_status === "inactive").length;
  const noAssign   = rawUsers.filter(u => !u.assignments?.length).length;

  // Recent hires — users whose earliest assignment started in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);
  const recent = rawUsers.filter(u => {
    const eff = u.assignments?.[0]?.effective_from;
    return eff && new Date(eff) >= thirtyDaysAgo;
  }).slice(0, 5);

  const firstName = user?.DisplayName?.split(" ")[0] ?? "there";

  const STATS = [
    { label: "Total Employees", value: total,    icon: Users,      color: "#2563eb", bg: "#eff6ff" },
    { label: "Active",          value: active,   icon: UserCheck,  color: "#059669", bg: "#ecfdf5" },
    { label: "Inactive",        value: inactive, icon: UserX,      color: "#dc2626", bg: "#fef2f2" },
    { label: "No Assignment",   value: noAssign, icon: Clock,      color: "#d97706", bg: "#fffbeb" },
  ];

  const QUICK_ACTIONS = [
    { label: "Onboard New User",     icon: UserPlus,    href: "/hr/admin",   color: "#2563eb", bg: "#eff6ff" },
    { label: "Employee Directory",   icon: Users,       href: "/hr/records", color: "#7c3aed", bg: "#f5f3ff" },
    { label: "View Approvals",       icon: CheckSquare, href: "/approval",   color: "#059669", bg: "#ecfdf5" },
    { label: "Ask AI",               icon: Brain,       href: "/ai",         color: "#0891b2", bg: "#ecfeff" },
  ];

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
          {getGreeting()}, {firstName}.
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · Page Group HR
        </p>
      </div>

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
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>Recent Additions</h2>
              <Link href="/hr/records" className="text-[11px] font-medium text-blue-600 hover:underline flex items-center gap-0.5">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-2">
                <Users className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
                <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No new employees added in the last 30 days.</p>
                <Link href="/hr/admin"
                      className="mt-1 text-[12px] font-semibold text-blue-600 hover:underline">
                  Onboard the first employee →
                </Link>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {recent.map(u => {
                  const asgn = u.assignments?.[0];
                  return (
                    <div key={u.user_id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                           style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
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
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>All Employees</h2>
          <Link href="/hr/records" className="text-[11px] font-medium text-blue-600 hover:underline">View full directory →</Link>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
          {rawUsers.slice(0, 8).map(u => {
            const asgn = u.assignments?.find(a => a.position_title) ?? u.assignments?.[0];
            return (
              <div key={u.user_id} className="flex items-center gap-3 px-5 py-3 transition-colors"
                   style={{}}
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                     style={{ background: u.user_status === "active" ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "#94a3b8" }}>
                  {u.display_name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-3 gap-2">
                  <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{u.display_name}</p>
                  <p className="text-[12px] truncate" style={{ color: "var(--pg-text-2)" }}>{asgn?.position_title ?? "—"}</p>
                  <p className="text-[12px] truncate" style={{ color: "var(--pg-text-3)" }}>{asgn?.subsidiary_name ?? "No assignment"}</p>
                </div>
              </div>
            );
          })}
          {rawUsers.length > 8 && (
            <div className="px-5 py-3">
              <Link href="/hr/records" className="text-[12px] font-medium text-blue-600 hover:underline">
                +{rawUsers.length - 8} more employees — view full directory
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
