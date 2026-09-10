"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Download,
  ChevronDown,
  ChevronRight,
  Loader2,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Target,
} from "lucide-react";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ─── Types ────────────────────────────────────────────────────────────────────

type Cycle = {
  id: string;
  title: string;
  description?: string;
  status: string;
  phase?: string;
};

type BSCSubmission = {
  id: string;
  cycle_id: string;
  employee_id: string;
  employee_name: string;
  department?: string;
  grade?: string;
  level?: string;
  line_manager?: string;
  status: string;
  self_score?: number;
  manager_score?: number;
  agreed_score?: number;
  performance_band?: string;
};

type TargetProgress = {
  employee_id: string;
  employee_name: string;
  department?: string;
  manager?: string;
  targets_set: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Not Started", color: "#6b7280", bg: "#f3f4f6" },
  self_draft: { label: "In Progress", color: "#d97706", bg: "#fef3c7" },
  self_submitted: { label: "With Manager", color: "#1d4ed8", bg: "#dbeafe" },
  manager_scoring: { label: "With Manager", color: "#1d4ed8", bg: "#dbeafe" },
  submitted_to_hc: { label: "With HC", color: "#7c3aed", bg: "#ede9fe" },
  finalized: { label: "Finalised", color: "#059669", bg: "#d1fae5" },
};

const BAND_META: Record<string, { label: string; color: string; bg: string }> = {
  outstanding: { label: "Outstanding", color: "#059669", bg: "#d1fae5" },
  exceeds_expectations: { label: "Exceeds Expectations", color: "#1d4ed8", bg: "#dbeafe" },
  meets_expectations: { label: "Meets Expectations", color: "#d97706", bg: "#fef3c7" },
  needs_improvement: { label: "Needs Improvement", color: "#dc2626", bg: "#fee2e2" },
  unsatisfactory: { label: "Unsatisfactory", color: "#b91c1c", bg: "#fce7f3" },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, color: "#6b7280", bg: "#f3f4f6" };
}

function bandMeta(band?: string) {
  if (!band) return null;
  return BAND_META[band.toLowerCase().replace(/ /g, "_")] ?? { label: band, color: "#6b7280", bg: "#f3f4f6" };
}

function MetricCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number | string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--pg-card)",
        border: "1px solid var(--pg-card-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div className="h-[3px]" style={{ background: accent }} />
      <div className="p-4 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent}18` }}
        >
          <span style={{ color: accent }}>{icon}</span>
        </div>
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "var(--pg-text-3)" }}
          >
            {label}
          </p>
          <p className="text-[22px] font-bold leading-none mt-0.5" style={{ color: "var(--pg-text-1)" }}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CycleSubmissionsPage() {
  const { cycleId } = useParams<{ cycleId: string }>();

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [submissions, setSubmissions] = useState<BSCSubmission[]>([]);
  const [targetsProgress, setTargetsProgress] = useState<TargetProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [filterDept, setFilterDept] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [searchName, setSearchName] = useState("");

  // Row hover
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  useEffect(() => {
    if (!cycleId) return;
    setLoading(true);

    Promise.all([
      fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}`, { credentials: "include" }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/bsc-submissions`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : { submissions: [] })),
    ])
      .then(([cycleData, subData]) => {
        setCycle(cycleData);
        setSubmissions(subData?.submissions ?? []);
      })
      .finally(() => setLoading(false));
  }, [cycleId]);

  async function loadTargets() {
    if (targetsProgress.length > 0) {
      setTargetsOpen((o) => !o);
      return;
    }
    setTargetsOpen(true);
    setTargetsLoading(true);
    try {
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/targets-progress`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setTargetsProgress(data?.targets_progress ?? data ?? []);
      }
    } finally {
      setTargetsLoading(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/export.csv`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `appraisal-${cycleId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — could show a toast here
    } finally {
      setExporting(false);
    }
  }

  // ── Derived filter options ─────────────────────────────────────────────────
  const departments = useMemo(
    () => [...new Set(submissions.map((s) => s.department).filter(Boolean))] as string[],
    [submissions]
  );
  const grades = useMemo(
    () => [...new Set(submissions.map((s) => s.grade).filter(Boolean))] as string[],
    [submissions]
  );

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      if (filterDept && s.department !== filterDept) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      if (filterGrade && s.grade !== filterGrade) return false;
      if (searchName && !s.employee_name.toLowerCase().includes(searchName.toLowerCase())) return false;
      return true;
    });
  }, [submissions, filterDept, filterStatus, filterGrade, searchName]);

  // ── Summary counts ─────────────────────────────────────────────────────────
  const totalCount = submissions.length;
  const finalizedCount = submissions.filter((s) => s.status === "finalized").length;
  const withHcCount = submissions.filter((s) => s.status === "submitted_to_hc").length;
  const pendingCount = submissions.filter(
    (s) => s.status === "pending" || s.status === "self_draft"
  ).length;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 pb-10">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/appraisal/dashboard"
            className="flex items-center gap-1.5 text-[12px] mb-2"
            style={{ color: "var(--pg-text-3)" }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Appraisal Results —{" "}
            <span style={{ color: "#FF6600" }}>{cycle?.title ?? cycleId}</span>
          </h1>
          {cycle?.status && (
            <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Cycle status:{" "}
              <span className="font-semibold capitalize" style={{ color: "var(--pg-text-2)" }}>
                {cycle.status}
              </span>
              {cycle.phase && (
                <>
                  {" "}
                  · Phase:{" "}
                  <span className="font-semibold capitalize" style={{ color: "var(--pg-text-2)" }}>
                    {cycle.phase}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <button
          onClick={exportCsv}
          disabled={exporting}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white shrink-0 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Export CSV
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Submissions"
          value={totalCount}
          accent="#FF6600"
          icon={<Users className="w-4 h-4" />}
        />
        <MetricCard
          label="Finalised"
          value={finalizedCount}
          accent="#059669"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <MetricCard
          label="With HC"
          value={withHcCount}
          accent="#d97706"
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricCard
          label="Pending"
          value={pendingCount}
          accent="#6b7280"
          icon={<AlertCircle className="w-4 h-4" />}
        />
      </div>

      {/* ── Filter Bar ── */}
      <div
        className="flex flex-wrap gap-2 p-3 rounded-2xl"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: "var(--pg-text-4)" }}
          />
          <input
            type="text"
            placeholder="Search by name…"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="h-9 pl-8 pr-3 rounded-xl text-[13px] outline-none w-48"
            style={{
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-1)",
            }}
          />
        </div>

        {/* Department */}
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="h-9 px-3 rounded-xl text-[13px] outline-none cursor-pointer"
          style={{
            background: "var(--pg-muted-bg)",
            border: "1px solid var(--pg-card-border)",
            color: "var(--pg-text-2)",
          }}
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* Status */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 px-3 rounded-xl text-[13px] outline-none cursor-pointer"
          style={{
            background: "var(--pg-muted-bg)",
            border: "1px solid var(--pg-card-border)",
            color: "var(--pg-text-2)",
          }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Not Started</option>
          <option value="self_draft">In Progress</option>
          <option value="self_submitted">With Manager</option>
          <option value="manager_scoring">Manager Scoring</option>
          <option value="submitted_to_hc">With HC</option>
          <option value="finalized">Finalised</option>
        </select>

        {/* Grade */}
        <select
          value={filterGrade}
          onChange={(e) => setFilterGrade(e.target.value)}
          className="h-9 px-3 rounded-xl text-[13px] outline-none cursor-pointer"
          style={{
            background: "var(--pg-muted-bg)",
            border: "1px solid var(--pg-card-border)",
            color: "var(--pg-text-2)",
          }}
        >
          <option value="">All Grades</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        {(filterDept || filterStatus || filterGrade || searchName) && (
          <button
            onClick={() => {
              setFilterDept("");
              setFilterStatus("");
              setFilterGrade("");
              setSearchName("");
            }}
            className="h-9 px-3 rounded-xl text-[13px] font-semibold"
            style={{
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-3)",
              border: "1px solid var(--pg-card-border)",
            }}
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto self-center text-[12px]" style={{ color: "var(--pg-text-3)" }}>
          {filtered.length} of {totalCount} employees
        </span>
      </div>

      {/* ── Submissions Table ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div className="h-[3px]" style={{ background: "linear-gradient(90deg,#FF6600,#7c3aed)" }} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                {[
                  "Employee",
                  "Department",
                  "Grade",
                  "Level",
                  "Line Manager",
                  "Status",
                  "Self Score",
                  "Agreed Score",
                  "Band",
                  "Actions",
                ].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-12 text-center text-[13px]"
                    style={{ color: "var(--pg-text-4)" }}
                  >
                    No submissions found
                  </td>
                </tr>
              ) : (
                filtered.map((sub) => {
                  const sm = statusMeta(sub.status);
                  const bm = bandMeta(sub.performance_band);
                  const isHovered = hoveredRow === sub.id;
                  return (
                    <tr
                      key={sub.id}
                      style={{
                        borderBottom: "1px solid var(--pg-row-border)",
                        background: isHovered ? "var(--pg-row-hover)" : "transparent",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={() => setHoveredRow(sub.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      {/* Employee */}
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                          {sub.employee_name}
                        </p>
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3">
                        <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                          {sub.department ?? "—"}
                        </p>
                      </td>

                      {/* Grade */}
                      <td className="px-4 py-3">
                        <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                          {sub.grade ?? "—"}
                        </p>
                      </td>

                      {/* Level */}
                      <td className="px-4 py-3">
                        <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                          {sub.level ?? "—"}
                        </p>
                      </td>

                      {/* Line Manager */}
                      <td className="px-4 py-3">
                        <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                          {sub.line_manager ?? "—"}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                          style={{ background: sm.bg, color: sm.color }}
                        >
                          {sm.label}
                        </span>
                      </td>

                      {/* Self Score */}
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                          {sub.self_score != null ? `${sub.self_score.toFixed(1)}%` : "—"}
                        </p>
                      </td>

                      {/* Agreed Score */}
                      <td className="px-4 py-3">
                        <p
                          className="text-[13px] font-semibold"
                          style={{
                            color:
                              sub.agreed_score != null
                                ? "#059669"
                                : sub.manager_score != null
                                ? "#1d4ed8"
                                : "var(--pg-text-4)",
                          }}
                        >
                          {sub.agreed_score != null
                            ? `${sub.agreed_score.toFixed(1)}%`
                            : sub.manager_score != null
                            ? `${sub.manager_score.toFixed(1)}%`
                            : "—"}
                        </p>
                      </td>

                      {/* Band */}
                      <td className="px-4 py-3">
                        {bm ? (
                          <span
                            className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                            style={{ background: bm.bg, color: bm.color }}
                          >
                            {bm.label}
                          </span>
                        ) : (
                          <span className="text-[12px]" style={{ color: "var(--pg-text-4)" }}>
                            —
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <Link
                          href={`/appraisal/submissions/${sub.id}/hc`}
                          className="flex items-center gap-1 h-8 px-3 rounded-xl text-[12px] font-semibold whitespace-nowrap"
                          style={{
                            background: "var(--pg-muted-bg)",
                            color: "var(--pg-text-2)",
                            border: "1px solid var(--pg-card-border)",
                          }}
                        >
                          View <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Targets Progress (collapsible) ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <button
          onClick={loadTargets}
          className="w-full flex items-center justify-between px-5 py-4"
        >
          <div className="flex items-center gap-2.5">
            <Target className="w-4 h-4" style={{ color: "#7c3aed" }} />
            <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              Targets Progress
            </p>
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: "#ede9fe", color: "#7c3aed" }}
            >
              Who has targets set?
            </span>
          </div>
          {targetsOpen ? (
            <ChevronDown className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          ) : (
            <ChevronRight className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          )}
        </button>

        {targetsOpen && (
          <div style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            {targetsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pg-text-4)" }} />
              </div>
            ) : targetsProgress.length === 0 ? (
              <p
                className="px-5 py-8 text-center text-[13px]"
                style={{ color: "var(--pg-text-4)" }}
              >
                No targets data available
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                      {["Employee", "Department", "Manager", "Targets Set?"].map((col) => (
                        <th
                          key={col}
                          className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {targetsProgress.map((tp, idx) => (
                      <tr
                        key={tp.employee_id ?? idx}
                        style={{ borderBottom: "1px solid var(--pg-row-border)" }}
                      >
                        <td className="px-5 py-3">
                          <p
                            className="text-[13px] font-medium"
                            style={{ color: "var(--pg-text-1)" }}
                          >
                            {tp.employee_name}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                            {tp.department ?? "—"}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                            {tp.manager ?? "—"}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          {tp.targets_set ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                              style={{ background: "#d1fae5", color: "#059669" }}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Set
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                              style={{ background: "#fee2e2", color: "#dc2626" }}
                            >
                              <AlertCircle className="w-3 h-3" />
                              Not Set
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
