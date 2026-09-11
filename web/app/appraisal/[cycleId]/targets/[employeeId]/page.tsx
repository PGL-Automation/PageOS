"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  StickyNote,
} from "lucide-react";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

const PERSPECTIVES = [
  "Financial",
  "Client / Customer",
  "Internal Business Process",
  "Learning & Growth",
] as const;

type Perspective = (typeof PERSPECTIVES)[number];

const PERSPECTIVE_COLORS: Record<Perspective, string> = {
  Financial: "#1d4ed8",
  "Client / Customer": "#059669",
  "Internal Business Process": "#7c3aed",
  "Learning & Growth": "#d97706",
};

type KPI = {
  id: string; // local uuid for react key
  perspective: Perspective;
  seq: number;
  objective: string;
  measure: string;
  weight: number | string;
  target: string;
  source: "standard" | "custom";
};

type EmployeeInfo = {
  name: string;
  role: string;
  grade: string;
  department: string;
};

function genId() {
  return Math.random().toString(36).slice(2);
}

function SourceBadge({ source }: { source: KPI["source"] }) {
  const isCustom = source === "custom";
  return (
    <span
      className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0"
      style={{
        background: isCustom
          ? "rgba(255,102,0,0.12)"
          : "var(--pg-muted-bg)",
        color: isCustom ? "#FF6600" : "var(--pg-text-3)",
      }}
    >
      {isCustom ? "Custom" : "Standard"}
    </span>
  );
}

export default function IndividualTargetsPage() {
  const { cycleId, employeeId } = useParams<{
    cycleId: string;
    employeeId: string;
  }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Employee info from search params (passed from the targets list page)
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo>({
    name: searchParams.get("name") ?? "Employee",
    role: searchParams.get("role") ?? "",
    grade: searchParams.get("grade") ?? "",
    department: searchParams.get("dept") ?? "",
  });

  // Keep a ref so fetchScorecard can always read the latest employeeInfo without
  // needing it as a useCallback dependency (prevents stale-closure loop).
  const employeeInfoRef = useRef(employeeInfo);
  useEffect(() => { employeeInfoRef.current = employeeInfo; }, [employeeInfo]);

  const [kpis, setKpis] = useState<KPI[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  // Dismiss toast after 3s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (type: "success" | "error", msg: string) =>
    setToast({ type, msg });

  // ── Fetch scorecard ──────────────────────────────────────────────────────
  // Uses employeeInfoRef so the callback is stable across renders and never
  // creates a stale-closure loop from reading + writing employeeInfo state.
  const fetchScorecard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const info = employeeInfoRef.current;
      const params = new URLSearchParams();
      if (info.department) params.set("dept", info.department);
      if (info.role) params.set("role", info.role);
      if (info.grade) params.set("grade", info.grade);

      const res = await fetch(
        `${BASE}/api/v1/appraisal/cycles/${cycleId}/individual-scorecard/${employeeId}?${params.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load scorecard");
      const data = await res.json();

      // data.kpis: [{perspective, seq, objective, measure, weight, target, source}]
      const loaded: KPI[] = (data.kpis ?? []).map((k: Omit<KPI, "id">) => ({
        ...k,
        id: genId(),
        weight: k.weight ?? 0,
      }));
      setKpis(loaded);

      if (data.notes) setNotes(data.notes);

      // Update employee info if API returns it
      if (data.employee) {
        setEmployeeInfo((prev) => ({ ...prev, ...data.employee }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [cycleId, employeeId]); // employeeInfo read via ref — no stale closure

  useEffect(() => {
    fetchScorecard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  async function saveTargets() {
    setSaving(true);
    try {
      const payload = {
        kpis: kpis.map((k, i) => ({
          perspective: k.perspective,
          seq: i + 1,
          objective: k.objective.trim(),
          measure: k.measure.trim(),
          weight: parseFloat(String(k.weight)) || 0,
          target: k.target.trim(),
          source: k.source,
        })),
        notes,
      };

      const res = await fetch(
        `${BASE}/api/v1/appraisal/cycles/${cycleId}/individual-scorecard/${employeeId}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Failed to save targets");
      }
      showToast("success", "Targets saved successfully.");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Reset to department standard ─────────────────────────────────────────
  async function resetToStandard() {
    if (
      !confirm(
        "Reset to department standard KPIs? Any custom changes will be lost."
      )
    )
      return;
    setResetting(true);
    try {
      // Delete current scorecard
      await fetch(
        `${BASE}/api/v1/appraisal/cycles/${cycleId}/individual-scorecard/${employeeId}`,
        { method: "DELETE", credentials: "include" }
      );
      // Re-fetch (will seed from dept standard)
      await fetchScorecard();
      setNotes("");
      showToast("success", "Reset to department standard.");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setResetting(false);
    }
  }

  // ── KPI mutation helpers ─────────────────────────────────────────────────
  function addKpi(perspective: Perspective) {
    const perspKpis = kpis.filter((k) => k.perspective === perspective);
    const newKpi: KPI = {
      id: genId(),
      perspective,
      seq: perspKpis.length + 1,
      objective: "",
      measure: "",
      weight: 0,
      target: "",
      source: "custom",
    };
    setKpis((prev) => [...prev, newKpi]);
  }

  function removeKpi(id: string) {
    setKpis((prev) => prev.filter((k) => k.id !== id));
  }

  function updateKpi<F extends keyof KPI>(id: string, field: F, value: KPI[F]) {
    setKpis((prev) =>
      prev.map((k) => {
        if (k.id !== id) return k;
        const updated = { ...k, [field]: value };
        // Mark as custom once edited
        if (field !== "source" && k.source === "standard") {
          updated.source = "custom";
        }
        return updated;
      })
    );
  }

  // ── Weight calculations ──────────────────────────────────────────────────
  const totalWeight = kpis.reduce(
    (sum, k) => sum + (parseFloat(String(k.weight)) || 0),
    0
  );
  const weightOk = Math.abs(totalWeight - 100) < 0.01;

  function perspWeight(p: Perspective) {
    return kpis
      .filter((k) => k.perspective === p)
      .reduce((sum, k) => sum + (parseFloat(String(k.weight)) || 0), 0);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2
          className="w-5 h-5 animate-spin"
          style={{ color: "var(--pg-text-4)" }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[900px] mx-auto space-y-4 pt-8">
        <Link
          href={`/appraisal/${cycleId}/targets`}
          className="flex items-center gap-1.5 text-[13px]"
          style={{ color: "var(--pg-text-3)" }}
        >
          <ChevronLeft className="w-4 h-4" /> Back to Targets
        </Link>
        <div
          className="flex items-center gap-3 px-5 py-4 rounded-2xl"
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
          }}
        >
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-[13px] font-medium text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1040px] mx-auto space-y-5 pb-10">
      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-white text-[13px] font-semibold"
          style={{
            background:
              toast.type === "success"
                ? "linear-gradient(135deg,#059669,#047857)"
                : "linear-gradient(135deg,#dc2626,#b91c1c)",
          }}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div>
        <Link
          href={`/appraisal/${cycleId}/targets`}
          className="flex items-center gap-1.5 text-[12px] mb-3"
          style={{ color: "var(--pg-text-3)" }}
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Targets
        </Link>

        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          <div className="h-[3px]" style={{ background: "#FF6600" }} />
          <div className="px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1
                  className="text-[20px] font-bold"
                  style={{ color: "var(--pg-text-1)" }}
                >
                  Targets for {employeeInfo.name}
                </h1>
                <span
                  className="inline-flex items-center h-6 px-3 rounded-full text-[11px] font-bold uppercase tracking-wide"
                  style={{
                    background: "rgba(255,102,0,0.12)",
                    color: "#FF6600",
                  }}
                >
                  Target Setting Phase
                </span>
              </div>
              <div
                className="flex items-center gap-3 mt-1.5 flex-wrap text-[12px]"
                style={{ color: "var(--pg-text-3)" }}
              >
                {employeeInfo.role && (
                  <span className="font-medium">{employeeInfo.role}</span>
                )}
                {employeeInfo.grade && (
                  <>
                    <span style={{ color: "var(--pg-text-4)" }}>·</span>
                    <span>Grade {employeeInfo.grade}</span>
                  </>
                )}
                {employeeInfo.department && (
                  <>
                    <span style={{ color: "var(--pg-text-4)" }}>·</span>
                    <span>{employeeInfo.department}</span>
                  </>
                )}
              </div>
            </div>

            {/* Weight indicator */}
            <div className="text-right">
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: "var(--pg-text-3)" }}
              >
                Total Weight
              </p>
              <p
                className="text-[28px] font-bold leading-none mt-0.5"
                style={{ color: weightOk ? "#059669" : "#dc2626" }}
              >
                {totalWeight.toFixed(0)}%
              </p>
              <p
                className="text-[11px] mt-0.5"
                style={{ color: weightOk ? "#059669" : "#dc2626" }}
              >
                {weightOk ? "Balanced" : totalWeight > 100 ? "Over 100%" : "Under 100%"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Weight summary bar ── */}
      <div
        className="rounded-2xl px-5 py-4"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <p
          className="text-[10px] font-bold uppercase tracking-wider mb-3"
          style={{ color: "var(--pg-text-3)" }}
        >
          Weight Distribution by Perspective
        </p>
        <div className="space-y-2.5">
          {PERSPECTIVES.map((p) => {
            const pw = perspWeight(p);
            return (
              <div key={p} className="flex items-center gap-3">
                <span
                  className="text-[11px] font-semibold w-44 shrink-0"
                  style={{ color: "var(--pg-text-2)" }}
                >
                  {p}
                </span>
                <div
                  className="flex-1 h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--pg-muted-bg)" }}
                >
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(pw, 100)}%`,
                      background: PERSPECTIVE_COLORS[p],
                    }}
                  />
                </div>
                <span
                  className="text-[11px] font-bold w-10 text-right shrink-0"
                  style={{ color: PERSPECTIVE_COLORS[p] }}
                >
                  {pw.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>

        {/* Overall progress bar */}
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--pg-text-3)" }}
            >
              Overall
            </span>
            <span
              className="text-[11px] font-bold"
              style={{ color: weightOk ? "#059669" : "#dc2626" }}
            >
              {totalWeight.toFixed(1)} / 100%
            </span>
          </div>
          <div
            className="h-2.5 rounded-full overflow-hidden"
            style={{ background: "var(--pg-muted-bg)" }}
          >
            <div
              className="h-2.5 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(totalWeight, 100)}%`,
                background: weightOk
                  ? "#059669"
                  : totalWeight > 100
                  ? "#dc2626"
                  : "linear-gradient(90deg,#FF6600,#E05500)",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── BSC Scorecard sections ── */}
      {PERSPECTIVES.map((perspective) => {
        const perspKpis = kpis.filter((k) => k.perspective === perspective);
        const color = PERSPECTIVE_COLORS[perspective];
        const pw = perspWeight(perspective);

        return (
          <div
            key={perspective}
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            {/* Accent bar */}
            <div className="h-[3px]" style={{ background: color }} />

            {/* Section header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--pg-row-border)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-1 h-8 rounded-full"
                  style={{ background: color }}
                />
                <div>
                  <h2
                    className="text-[14px] font-bold"
                    style={{ color: "var(--pg-text-1)" }}
                  >
                    {perspective}
                  </h2>
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    {perspKpis.length} KPI{perspKpis.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="text-[12px] font-bold"
                  style={{ color }}
                >
                  {pw.toFixed(0)}% weight
                </span>
                <button
                  type="button"
                  onClick={() => addKpi(perspective)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold"
                  style={{
                    background: `${color}18`,
                    color,
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add KPI
                </button>
              </div>
            </div>

            {/* KPI table */}
            {perspKpis.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p
                  className="text-[12px]"
                  style={{ color: "var(--pg-text-4)" }}
                >
                  No KPIs yet. Click &ldquo;Add KPI&rdquo; to add one.
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {/* Column headers */}
                <div
                  className="grid gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    color: "var(--pg-text-3)",
                    background: "var(--pg-muted-bg)",
                    gridTemplateColumns: "1fr 1fr 80px 1fr 80px 32px",
                  }}
                >
                  <span>Objective</span>
                  <span>Measure / KPI</span>
                  <span>Weight %</span>
                  <span>Target</span>
                  <span>Source</span>
                  <span />
                </div>

                {perspKpis.map((kpi) => (
                  <KpiRow
                    key={kpi.id}
                    kpi={kpi}
                    onUpdate={updateKpi}
                    onRemove={removeKpi}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Manager Notes ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div className="h-[3px]" style={{ background: "#475569" }} />
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <StickyNote className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
            <p
              className="text-[13px] font-semibold"
              style={{ color: "var(--pg-text-1)" }}
            >
              Manager Notes
            </p>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add notes about this employee's targets, context, or special considerations…"
            className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none"
            style={{
              background: "var(--pg-muted-bg)",
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-1)",
            }}
          />
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div
        className="flex items-center justify-between gap-3 pt-2 flex-wrap"
        style={{ borderTop: "1px solid var(--pg-row-border)" }}
      >
        <Link
          href={`/appraisal/${cycleId}/targets`}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
          style={{
            background: "var(--pg-muted-bg)",
            color: "var(--pg-text-2)",
          }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </Link>

        <div className="flex items-center gap-2.5 flex-wrap">
          {!weightOk && (
            <span
              className="text-[12px] font-medium"
              style={{ color: "#dc2626" }}
            >
              Weights must total 100% (currently {totalWeight.toFixed(1)}%)
            </span>
          )}

          <button
            type="button"
            onClick={resetToStandard}
            disabled={resetting || saving}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-50"
            style={{
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
            }}
          >
            {resetting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            Reset to Dept Standard
          </button>

          <button
            type="button"
            onClick={saveTargets}
            disabled={saving || resetting || !weightOk || kpis.length === 0}
            className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg,#FF6600,#E05500)",
            }}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Targets
          </button>
        </div>
      </div>
    </div>
  );
}

// ── KPI Row component ────────────────────────────────────────────────────────

function KpiRow({
  kpi,
  onUpdate,
  onRemove,
}: {
  kpi: KPI;
  onUpdate: <F extends keyof KPI>(id: string, field: F, value: KPI[F]) => void;
  onRemove: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="grid gap-3 px-5 py-3.5 items-start transition-colors"
      style={{
        gridTemplateColumns: "1fr 1fr 80px 1fr 80px 32px",
        background: hovered ? "var(--pg-row-hover)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Objective */}
      <input
        type="text"
        value={kpi.objective}
        onChange={(e) => onUpdate(kpi.id, "objective", e.target.value)}
        placeholder="e.g. Increase revenue"
        className="h-9 px-3 rounded-xl text-[13px] outline-none w-full"
        style={{
          background: "var(--pg-muted-bg)",
          border: "1px solid var(--pg-card-border)",
          color: "var(--pg-text-1)",
        }}
      />

      {/* Measure */}
      <input
        type="text"
        value={kpi.measure}
        onChange={(e) => onUpdate(kpi.id, "measure", e.target.value)}
        placeholder="e.g. Monthly revenue (₦)"
        className="h-9 px-3 rounded-xl text-[13px] outline-none w-full"
        style={{
          background: "var(--pg-muted-bg)",
          border: "1px solid var(--pg-card-border)",
          color: "var(--pg-text-1)",
        }}
      />

      {/* Weight */}
      <input
        type="number"
        value={kpi.weight}
        onChange={(e) => onUpdate(kpi.id, "weight", e.target.value as unknown as number)}
        placeholder="0"
        min={0}
        max={100}
        step={1}
        className="h-9 px-3 rounded-xl text-[13px] outline-none w-full"
        style={{
          background: "var(--pg-muted-bg)",
          border: "1px solid var(--pg-card-border)",
          color: "var(--pg-text-1)",
        }}
      />

      {/* Target */}
      <input
        type="text"
        value={kpi.target}
        onChange={(e) => onUpdate(kpi.id, "target", e.target.value)}
        placeholder="e.g. ₦50M / month"
        className="h-9 px-3 rounded-xl text-[13px] outline-none w-full"
        style={{
          background: "var(--pg-muted-bg)",
          border: "1px solid var(--pg-card-border)",
          color: "var(--pg-text-1)",
        }}
      />

      {/* Source badge */}
      <div className="flex items-center h-9">
        <SourceBadge source={kpi.source} />
      </div>

      {/* Delete */}
      <div className="flex items-center justify-center h-9">
        <button
          type="button"
          onClick={() => onRemove(kpi.id)}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50"
          title="Remove KPI"
        >
          <Trash2
            className="w-3.5 h-3.5"
            style={{ color: "#dc2626" }}
          />
        </button>
      </div>
    </div>
  );
}
