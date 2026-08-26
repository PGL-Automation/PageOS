"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  CheckSquare,
  BarChart2,
  Phone,
  Mail,
  MessageCircle,
  Building2,
  Plus,
  ArrowRight,
  CalendarDays,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ─── Types ───────────────────────────────────────────────────────────────────

type Interaction = {
  id: string;
  contact_id: string;
  contact_name: string;
  type: string;
  direction: string;
  subject: string;
  notes: string;
  outcome: string;
  duration_mins?: number;
  interaction_date: string;
  next_action: string;
  next_action_date?: string;
  created_by_name: string;
};

type Task = {
  id: string;
  contact_id?: string;
  contact_name?: string;
  assigned_name: string;
  title: string;
  task_type: string;
  priority: string;
  status: string;
  due_date?: string;
  created_by_name: string;
};

type DashboardStats = {
  total_contacts: number;
  new_this_month: number;
  pipeline_value: number;
  weighted_pipeline: number;
  tasks_due_today: number;
  tasks_overdue: number;
  interactions_today: number;
  conversion_rate: number;
  stage_breakdown: { stage: string; count: number }[];
  recent_interactions: Interaction[];
  my_open_tasks: Task[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNaira(value: number): string {
  if (value >= 1_000_000_000) return `₦${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₦${(value / 1_000).toFixed(1)}K`;
  return `₦${value.toFixed(0)}`;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatDueDate(dateStr?: string): string {
  if (!dateStr) return "No due date";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const INTERACTION_ICONS: Record<string, React.ReactNode> = {
  call: <Phone size={14} />,
  meeting: <Users size={14} />,
  email: <Mail size={14} />,
  whatsapp: <MessageCircle size={14} />,
  site_visit: <Building2 size={14} />,
  video_call: <Users size={14} />,
  other: <MessageCircle size={14} />,
};

const STAGE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  new: { bg: "#f1f5f9", text: "#475569", bar: "#94a3b8" },
  contacted: { bg: "#eff6ff", text: "#1d4ed8", bar: "#3b82f6" },
  qualified: { bg: "#f5f3ff", text: "#6d28d9", bar: "#7c3aed" },
  proposal_sent: { bg: "#fffbeb", text: "#b45309", bar: "#f59e0b" },
  negotiation: { bg: "#fff7ed", text: "#c2410c", bar: "#f97316" },
  converted: { bg: "#f0fdf4", text: "#15803d", bar: "#22c55e" },
  lost: { bg: "#fef2f2", text: "#b91c1c", bar: "#ef4444" },
  dormant: { bg: "#f8fafc", text: "#64748b", bar: "#cbd5e1" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#94a3b8",
  medium: "#3b82f6",
  high: "#f59e0b",
  vip: "#a855f7",
};

const OUTCOME_COLORS: Record<string, string> = {
  positive: "#22c55e",
  neutral: "#94a3b8",
  negative: "#ef4444",
  no_contact: "#f59e0b",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "var(--pg-card-shadow)",
        borderRadius: "16px",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ height: 14, width: 80, borderRadius: 8, background: "var(--pg-skeleton)" }} />
      <div style={{ height: 32, width: 120, borderRadius: 8, background: "var(--pg-skeleton)" }} />
      <div style={{ height: 12, width: 60, borderRadius: 6, background: "var(--pg-skeleton)" }} />
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  badge?: { text: string; color: string };
}) {
  return (
    <div
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "var(--pg-card-shadow)",
        borderRadius: "16px",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "10px",
            background: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: iconColor,
          }}
        >
          <Icon size={18} />
        </div>
        {badge && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 20,
              background: badge.color,
              color: "#fff",
            }}
          >
            {badge.text}
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "var(--pg-text-1)", lineHeight: 1.2 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: "var(--pg-text-3)", marginTop: 2 }}>{label}</div>
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--pg-text-3)" }}>{sub}</div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CRMDashboardPage() {
  const { user } = useAuth();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ["crm", "dashboard"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/crm/dashboard`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load CRM dashboard");
      return res.json();
    },
    staleTime: 60_000,
  });

  const greeting = () => {
    if (!now) return "Good morning";
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const displayName = user?.DisplayName ?? "there";

  const totalContacts = data?.total_contacts ?? 0;
  const newThisMonth = data?.new_this_month ?? 0;
  const pipelineValue = data?.pipeline_value ?? 0;
  const tasksDueToday = data?.tasks_due_today ?? 0;
  const conversionRate = data?.conversion_rate ?? 0;
  const stageBreakdown = Array.isArray(data?.stage_breakdown) ? data!.stage_breakdown : [];
  const recentInteractions = Array.isArray(data?.recent_interactions)
    ? data!.recent_interactions.slice(0, 5)
    : [];
  const myOpenTasks = Array.isArray(data?.my_open_tasks) ? data!.my_open_tasks.slice(0, 5) : [];

  const maxStageCount = stageBreakdown.length > 0 ? Math.max(...stageBreakdown.map((s) => s.count)) : 1;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pg-text-1)", margin: 0 }}>
              {greeting()}, {displayName}
            </h1>
            <p style={{ fontSize: 13, color: "var(--pg-text-3)", marginTop: 4 }}>
              {now
                ? now.toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : ""}
            </p>
          </div>
          <Link
            href="/crm/contacts"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              padding: "0 16px",
              borderRadius: 10,
              background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 1px 8px rgba(124,58,237,0.35)",
            }}
          >
            <Plus size={15} />
            New Contact
          </Link>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Total Contacts"
              value={totalContacts.toLocaleString()}
              sub={`+${newThisMonth} this month`}
              icon={Users}
              iconColor="#7c3aed"
              iconBg="#f5f3ff"
            />
            <StatCard
              label="Pipeline Value"
              value={formatNaira(pipelineValue)}
              sub={`Weighted: ${formatNaira(data?.weighted_pipeline ?? 0)}`}
              icon={TrendingUp}
              iconColor="#0891b2"
              iconBg="#ecfeff"
            />
            <StatCard
              label="Tasks Due Today"
              value={tasksDueToday.toLocaleString()}
              sub={`${data?.tasks_overdue ?? 0} overdue`}
              icon={CheckSquare}
              iconColor="#ea580c"
              iconBg="#fff7ed"
              badge={
                tasksDueToday > 0
                  ? { text: `${tasksDueToday} due`, color: "#ef4444" }
                  : undefined
              }
            />
            <StatCard
              label="Conversion Rate"
              value={`${conversionRate.toFixed(1)}%`}
              sub={`${data?.interactions_today ?? 0} interactions today`}
              icon={BarChart2}
              iconColor="#16a34a"
              iconBg="#f0fdf4"
            />
          </>
        )}
      </div>

      {/* ── Main Body ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Recent Interactions */}
          <div
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "var(--pg-card-shadow)",
              borderRadius: "16px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--pg-row-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--pg-text-1)" }}>
                Recent Interactions
              </div>
              <Link
                href="/crm/contacts"
                style={{
                  fontSize: 12,
                  color: "#7c3aed",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {isLoading ? (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    style={{ height: 56, borderRadius: 10, background: "var(--pg-skeleton)" }}
                  />
                ))}
              </div>
            ) : recentInteractions.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--pg-text-3)",
                  fontSize: 13,
                }}
              >
                No interactions yet.
              </div>
            ) : (
              <div>
                {recentInteractions.map((item, idx) => {
                  const icon = INTERACTION_ICONS[item.type] ?? <MessageCircle size={14} />;
                  const outcomeColor = OUTCOME_COLORS[item.outcome] ?? "#94a3b8";
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: "14px 20px",
                        borderBottom:
                          idx < recentInteractions.length - 1
                            ? "1px solid var(--pg-row-border)"
                            : "none",
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "var(--pg-muted-bg)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--pg-text-2)",
                          flexShrink: 0,
                        }}
                      >
                        {icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--pg-text-1)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.contact_name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--pg-text-3)", flexShrink: 0 }}>
                            {formatRelativeDate(item.interaction_date)}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--pg-text-2)",
                            marginTop: 1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.subject || item.notes || "No subject"}
                        </div>
                        {item.outcome && (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              marginTop: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              color: outcomeColor,
                            }}
                          >
                            <div
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: outcomeColor,
                              }}
                            />
                            {item.outcome.replace("_", " ")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stage Breakdown */}
          <div
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "var(--pg-card-shadow)",
              borderRadius: "16px",
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--pg-text-1)",
                marginBottom: 16,
              }}
            >
              Pipeline Stage Breakdown
            </div>

            {isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    style={{ height: 28, borderRadius: 8, background: "var(--pg-skeleton)" }}
                  />
                ))}
              </div>
            ) : stageBreakdown.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--pg-text-3)" }}>No data yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {stageBreakdown.map((s) => {
                  const colors = STAGE_COLORS[s.stage] ?? STAGE_COLORS.new;
                  const pct = maxStageCount > 0 ? (s.count / maxStageCount) * 100 : 0;
                  return (
                    <div key={s.stage} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 88,
                          fontSize: 11,
                          fontWeight: 600,
                          color: colors.text,
                          textTransform: "capitalize",
                          flexShrink: 0,
                        }}
                      >
                        {s.stage.replace("_", " ")}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          borderRadius: 4,
                          background: "var(--pg-muted-bg)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            borderRadius: 4,
                            background: colors.bar,
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          width: 28,
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--pg-text-2)",
                          textAlign: "right",
                          flexShrink: 0,
                        }}
                      >
                        {s.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column — My Open Tasks */}
        <div
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "var(--pg-card-shadow)",
            borderRadius: "16px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--pg-row-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--pg-text-1)" }}>
              My Open Tasks
            </div>
            <Link
              href="/crm/tasks"
              style={{
                fontSize: 12,
                color: "#7c3aed",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          <div style={{ flex: 1 }}>
            {isLoading ? (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    style={{ height: 52, borderRadius: 10, background: "var(--pg-skeleton)" }}
                  />
                ))}
              </div>
            ) : myOpenTasks.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--pg-text-3)",
                  fontSize: 13,
                }}
              >
                No open tasks. You&apos;re all caught up!
              </div>
            ) : (
              <div>
                {myOpenTasks.map((task, idx) => {
                  const priorityColor = PRIORITY_COLORS[task.priority] ?? "#94a3b8";
                  const dueLabel = formatDueDate(task.due_date);
                  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                  return (
                    <div
                      key={task.id}
                      style={{
                        padding: "12px 20px",
                        borderBottom:
                          idx < myOpenTasks.length - 1 ? "1px solid var(--pg-row-border)" : "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: priorityColor,
                              marginTop: 5,
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--pg-text-1)",
                                lineHeight: 1.3,
                              }}
                            >
                              {task.title}
                            </div>
                            {task.contact_name && (
                              <div style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 2 }}>
                                {task.contact_name}
                              </div>
                            )}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: isOverdue ? "#ef4444" : "var(--pg-text-3)",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                            flexShrink: 0,
                          }}
                        >
                          {isOverdue && <AlertCircle size={11} />}
                          <CalendarDays size={11} />
                          {dueLabel}
                        </div>
                      </div>
                      <div style={{ marginTop: 6, marginLeft: 16 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 10,
                            background: priorityColor + "20",
                            color: priorityColor,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {task.priority}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "var(--pg-card-shadow)",
          borderRadius: "16px",
          padding: "16px 20px",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pg-text-3)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Quick Actions
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            {
              href: "/crm/contacts",
              label: "New Contact",
              icon: Users,
              color: "#7c3aed",
              bg: "#f5f3ff",
            },
            {
              href: "/crm/contacts",
              label: "Log Interaction",
              icon: MessageCircle,
              color: "#0891b2",
              bg: "#ecfeff",
            },
            {
              href: "/crm/tasks",
              label: "New Task",
              icon: CheckSquare,
              color: "#ea580c",
              bg: "#fff7ed",
            },
            {
              href: "/crm/pipeline",
              label: "View Pipeline",
              icon: TrendingUp,
              color: "#16a34a",
              bg: "#f0fdf4",
            },
          ].map(({ href, label, icon: Icon, color, bg }) => (
            <Link
              key={label}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 10,
                background: bg,
                color,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                border: "1px solid " + color + "30",
                transition: "opacity 0.15s",
              }}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
