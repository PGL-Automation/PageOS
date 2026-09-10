"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

const GRADES = [
  "Analyst",
  "Associate",
  "Senior Executive Associate",
  "Assistant Manager",
  "Manager",
  "Senior Manager",
  "Assistant Vice President",
  "Vice President",
  "Senior Vice President",
  "Group Executive",
];

interface KPI {
  id: string; // local uuid for tracking
  perspective: Perspective;
  seq: number;
  objective: string;
  measure: string;
  weight: number;
}

interface TargetRow {
  kpiId?: string;
  objective: string;
  target: string;
}

interface CycleInfo {
  id: string;
  name: string;
  status: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function buildDefaultKPI(perspective: Perspective, seq: number): KPI {
  return { id: uid(), perspective, seq, objective: "", measure: "", weight: 0 };
}

export default function KPIConfigPage() {
  const params = useParams();
  const router = useRouter();
  const cycleId = params?.cycleId as string;

  // Cycle info
  const [cycle, setCycle] = useState<CycleInfo | null>(null);

  // Department state
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [addingDept, setAddingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");

  // KPI state keyed by department
  const [kpiMap, setKpiMap] = useState<Record<string, KPI[]>>({});

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Targets section
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [targetGrade, setTargetGrade] = useState(GRADES[0]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [targetSuccess, setTargetSuccess] = useState(false);

  const newDeptRef = useRef<HTMLInputElement>(null);

  // Fetch cycle info
  useEffect(() => {
    if (!cycleId) return;
    fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}`)
      .then((r) => r.json())
      .then((d) => setCycle(d))
      .catch(() => {});
  }, [cycleId]);

  // Fetch departments
  useEffect(() => {
    if (!cycleId) return;
    fetch(`${BASE}/api/v1/appraisal/cycles/${cycleId}/kpi-departments`)
      .then((r) => r.json())
      .then((data: string[] | { department: string }[]) => {
        const list = Array.isArray(data)
          ? data.map((d) => (typeof d === "string" ? d : d.department))
          : [];
        setDepartments(list);
        if (list.length > 0 && !selectedDept) {
          setSelectedDept(list[0]);
        }
      })
      .catch(() => {});
  }, [cycleId]);

  // Fetch KPIs for selected department
  useEffect(() => {
    if (!cycleId || !selectedDept) return;
    if (kpiMap[selectedDept]) return; // already loaded
    fetch(
      `${BASE}/api/v1/appraisal/cycles/${cycleId}/kpis?dept=${encodeURIComponent(selectedDept)}`
    )
      .then((r) => r.json())
      .then((data: Omit<KPI, "id">[]) => {
        const withIds: KPI[] = Array.isArray(data)
          ? data.map((k) => ({ ...k, id: uid() }))
          : [];
        setKpiMap((prev) => ({ ...prev, [selectedDept]: withIds }));
      })
      .catch(() => {
        setKpiMap((prev) => ({ ...prev, [selectedDept]: [] }));
      });
  }, [cycleId, selectedDept]);

  const currentKPIs: KPI[] = kpiMap[selectedDept] ?? [];

  const setCurrentKPIs = useCallback(
    (updater: (prev: KPI[]) => KPI[]) => {
      setKpiMap((prev) => ({
        ...prev,
        [selectedDept]: updater(prev[selectedDept] ?? []),
      }));
    },
    [selectedDept]
  );

  function addKPI(perspective: Perspective) {
    const seqInPerspective = currentKPIs.filter(
      (k) => k.perspective === perspective
    ).length;
    setCurrentKPIs((prev) => [
      ...prev,
      buildDefaultKPI(perspective, seqInPerspective + 1),
    ]);
  }

  function updateKPI(id: string, field: keyof KPI, value: string | number) {
    setCurrentKPIs((prev) =>
      prev.map((k) => (k.id === id ? { ...k, [field]: value } : k))
    );
  }

  function deleteKPI(id: string) {
    setCurrentKPIs((prev) => prev.filter((k) => k.id !== id));
  }

  const totalWeight = currentKPIs.reduce((s, k) => s + Number(k.weight), 0);

  function perspectiveWeight(p: Perspective) {
    return currentKPIs
      .filter((k) => k.perspective === p)
      .reduce((s, k) => s + Number(k.weight), 0);
  }

  async function saveKPIs() {
    if (!selectedDept) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const body = {
        department: selectedDept,
        kpis: currentKPIs.map((k, i) => ({
          perspective: k.perspective,
          seq: i + 1,
          objective: k.objective,
          measure: k.measure,
          weight: Number(k.weight),
        })),
      };
      const r = await fetch(
        `${BASE}/api/v1/appraisal/cycles/${cycleId}/kpis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleAddDept() {
    const name = newDeptName.trim();
    if (!name) return;
    if (!departments.includes(name)) {
      setDepartments((prev) => [...prev, name]);
      setKpiMap((prev) => ({ ...prev, [name]: [] }));
    }
    setSelectedDept(name);
    setNewDeptName("");
    setAddingDept(false);
  }

  // Targets fetch
  useEffect(() => {
    if (!targetsOpen || !selectedDept || !targetRole || !targetGrade || !cycleId)
      return;
    fetch(
      `${BASE}/api/v1/appraisal/cycles/${cycleId}/kpi-targets?dept=${encodeURIComponent(
        selectedDept
      )}&role=${encodeURIComponent(targetRole)}&grade=${encodeURIComponent(
        targetGrade
      )}`
    )
      .then((r) => r.json())
      .then((data: TargetRow[]) => {
        if (Array.isArray(data)) {
          setTargets(data);
        } else {
          // Build from current KPIs if no saved targets
          setTargets(
            currentKPIs.map((k) => ({ objective: k.objective, target: "" }))
          );
        }
      })
      .catch(() => {
        setTargets(
          currentKPIs.map((k) => ({ objective: k.objective, target: "" }))
        );
      });
  }, [targetsOpen, selectedDept, targetRole, targetGrade, cycleId]);

  async function saveTargets() {
    setTargetSaving(true);
    setTargetError(null);
    setTargetSuccess(false);
    try {
      const r = await fetch(
        `${BASE}/api/v1/appraisal/cycles/${cycleId}/kpi-targets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            department: selectedDept,
            role: targetRole,
            grade: targetGrade,
            targets,
          }),
        }
      );
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      setTargetSuccess(true);
      setTimeout(() => setTargetSuccess(false), 3000);
    } catch (e: unknown) {
      setTargetError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setTargetSaving(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--pg-bg)",
        color: "var(--pg-text-1)",
        fontFamily: "inherit",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 28px 16px",
          borderBottom: "1px solid var(--pg-card-border)",
          background: "var(--pg-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => router.push("/appraisal/dashboard")}
            style={{
              height: 36,
              paddingLeft: 14,
              paddingRight: 14,
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              background: "var(--pg-muted-bg)",
              color: "var(--pg-text-2)",
              border: "1px solid var(--pg-card-border)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ← Back
          </button>
          <div>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                margin: 0,
                color: "var(--pg-text-1)",
              }}
            >
              KPI Configuration
            </h1>
            {cycle && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--pg-text-3)",
                  margin: "2px 0 0",
                }}
              >
                {cycle.name}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              color: "var(--pg-text-3)",
              fontStyle: "italic",
            }}
          >
            KPI weights must total exactly 100%
          </span>
          {saveError && (
            <span style={{ fontSize: 12, color: "#dc2626" }}>{saveError}</span>
          )}
          {saveSuccess && (
            <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>
              Saved!
            </span>
          )}
          <button
            onClick={saveKPIs}
            disabled={saving || !selectedDept}
            style={{
              height: 36,
              paddingLeft: 16,
              paddingRight: 16,
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: saving
                ? "#aaa"
                : "linear-gradient(135deg,#FF6600,#E05500)",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save KPIs"}
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1100 }}>
        {/* DEPARTMENT SELECTOR */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 28,
          }}
        >
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              style={{
                height: 34,
                paddingLeft: 16,
                paddingRight: 16,
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                border:
                  selectedDept === dept
                    ? "1.5px solid #FF6600"
                    : "1.5px solid var(--pg-card-border)",
                background:
                  selectedDept === dept ? "#FF660015" : "var(--pg-muted-bg)",
                color:
                  selectedDept === dept ? "#FF6600" : "var(--pg-text-2)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {dept}
            </button>
          ))}

          {addingDept ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                ref={newDeptRef}
                autoFocus
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddDept();
                  if (e.key === "Escape") {
                    setAddingDept(false);
                    setNewDeptName("");
                  }
                }}
                placeholder="Department name"
                style={{
                  height: 34,
                  paddingLeft: 12,
                  paddingRight: 12,
                  borderRadius: 12,
                  fontSize: 13,
                  outline: "none",
                  background: "var(--pg-muted-bg)",
                  border: "1px solid #FF6600",
                  color: "var(--pg-text-1)",
                  width: 180,
                }}
              />
              <button
                onClick={handleAddDept}
                style={{
                  height: 34,
                  paddingLeft: 14,
                  paddingRight: 14,
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  background: "linear-gradient(135deg,#FF6600,#E05500)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAddingDept(false);
                  setNewDeptName("");
                }}
                style={{
                  height: 34,
                  paddingLeft: 14,
                  paddingRight: 14,
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  background: "var(--pg-muted-bg)",
                  color: "var(--pg-text-2)",
                  border: "1px solid var(--pg-card-border)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingDept(true)}
              style={{
                height: 34,
                paddingLeft: 14,
                paddingRight: 14,
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                border: "1.5px dashed var(--pg-card-border)",
                background: "transparent",
                color: "var(--pg-text-3)",
                cursor: "pointer",
              }}
            >
              + Add Department
            </button>
          )}
        </div>

        {!selectedDept && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "var(--pg-text-3)",
              fontSize: 14,
            }}
          >
            Select or add a department to configure KPIs.
          </div>
        )}

        {selectedDept && (
          <>
            {/* PERSPECTIVE SECTIONS */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {PERSPECTIVES.map((perspective) => {
                const color = PERSPECTIVE_COLORS[perspective];
                const rows = currentKPIs.filter(
                  (k) => k.perspective === perspective
                );
                const pWeight = perspectiveWeight(perspective);

                return (
                  <div
                    key={perspective}
                    style={{
                      background: "var(--pg-card)",
                      borderRadius: 16,
                      border: "1px solid var(--pg-card-border)",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Accent bar */}
                    <div style={{ height: 3, background: color }} />

                    {/* Section header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 18px 12px",
                        borderBottom:
                          rows.length > 0
                            ? "1px solid var(--pg-row-border, var(--pg-card-border))"
                            : "none",
                      }}
                    >
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 10 }}
                      >
                        <div
                          style={{
                            width: 4,
                            height: 18,
                            borderRadius: 2,
                            background: color,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "var(--pg-text-1)",
                          }}
                        >
                          {perspective}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color,
                            background: `${color}18`,
                            padding: "2px 8px",
                            borderRadius: 6,
                          }}
                        >
                          {pWeight}%
                        </span>
                      </div>
                      <button
                        onClick={() => addKPI(perspective)}
                        style={{
                          height: 30,
                          paddingLeft: 12,
                          paddingRight: 12,
                          borderRadius: 10,
                          fontSize: 12,
                          fontWeight: 600,
                          color,
                          background: `${color}12`,
                          border: `1px solid ${color}40`,
                          cursor: "pointer",
                        }}
                      >
                        + Add KPI
                      </button>
                    </div>

                    {/* KPI Table */}
                    {rows.length > 0 && (
                      <div style={{ overflowX: "auto" }}>
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 13,
                          }}
                        >
                          <thead>
                            <tr
                              style={{
                                background: "var(--pg-muted-bg)",
                              }}
                            >
                              <th
                                style={{
                                  padding: "8px 14px",
                                  textAlign: "left",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "var(--pg-text-3)",
                                  width: "40%",
                                }}
                              >
                                Objective
                              </th>
                              <th
                                style={{
                                  padding: "8px 14px",
                                  textAlign: "left",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "var(--pg-text-3)",
                                  width: "40%",
                                }}
                              >
                                Measure
                              </th>
                              <th
                                style={{
                                  padding: "8px 14px",
                                  textAlign: "right",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "var(--pg-text-3)",
                                  width: 100,
                                }}
                              >
                                Weight (%)
                              </th>
                              <th
                                style={{
                                  padding: "8px 14px",
                                  textAlign: "center",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "var(--pg-text-3)",
                                  width: 60,
                                }}
                              >
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((kpi, idx) => (
                              <KPIRow
                                key={kpi.id}
                                kpi={kpi}
                                isLast={idx === rows.length - 1}
                                onUpdate={updateKPI}
                                onDelete={deleteKPI}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {rows.length === 0 && (
                      <div
                        style={{
                          padding: "18px 18px",
                          color: "var(--pg-text-4, var(--pg-text-3))",
                          fontSize: 13,
                          fontStyle: "italic",
                        }}
                      >
                        No KPIs yet. Click "+ Add KPI" to get started.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* WEIGHT SUMMARY BAR */}
            <WeightSummaryBar
              total={totalWeight}
              kpis={currentKPIs}
            />

            {/* TARGETS SECTION */}
            <div
              style={{
                marginTop: 24,
                background: "var(--pg-card)",
                borderRadius: 16,
                border: "1px solid var(--pg-card-border)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setTargetsOpen((o) => !o)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--pg-text-1)",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  KPI Targets by Role & Grade
                </span>
                <span style={{ fontSize: 18, color: "var(--pg-text-3)" }}>
                  {targetsOpen ? "▲" : "▼"}
                </span>
              </button>

              {targetsOpen && (
                <div
                  style={{
                    borderTop: "1px solid var(--pg-card-border)",
                    padding: 18,
                  }}
                >
                  {/* Role / Grade selector */}
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-end",
                      marginBottom: 18,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--pg-text-3)",
                          marginBottom: 5,
                        }}
                      >
                        Role
                      </label>
                      <input
                        value={targetRole}
                        onChange={(e) => setTargetRole(e.target.value)}
                        placeholder="e.g. Business Analyst"
                        style={{
                          height: 36,
                          paddingLeft: 12,
                          paddingRight: 12,
                          borderRadius: 12,
                          fontSize: 13,
                          outline: "none",
                          background: "var(--pg-muted-bg)",
                          border: "1px solid var(--pg-card-border)",
                          color: "var(--pg-text-1)",
                          width: 220,
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--pg-text-3)",
                          marginBottom: 5,
                        }}
                      >
                        Grade
                      </label>
                      <select
                        value={targetGrade}
                        onChange={(e) => setTargetGrade(e.target.value)}
                        style={{
                          height: 36,
                          paddingLeft: 12,
                          paddingRight: 12,
                          borderRadius: 12,
                          fontSize: 13,
                          outline: "none",
                          background: "var(--pg-muted-bg)",
                          border: "1px solid var(--pg-card-border)",
                          color: "var(--pg-text-1)",
                          minWidth: 200,
                          cursor: "pointer",
                        }}
                      >
                        {GRADES.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        setTargets([]);
                        // trigger re-fetch by toggling
                        setTargetsOpen(false);
                        setTimeout(() => setTargetsOpen(true), 50);
                      }}
                      style={{
                        height: 36,
                        paddingLeft: 16,
                        paddingRight: 16,
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 600,
                        background: "var(--pg-muted-bg)",
                        color: "var(--pg-text-2)",
                        border: "1px solid var(--pg-card-border)",
                        cursor: "pointer",
                      }}
                    >
                      Load
                    </button>
                  </div>

                  {/* Targets table */}
                  {targets.length > 0 ? (
                    <>
                      <div style={{ overflowX: "auto", marginBottom: 14 }}>
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 13,
                          }}
                        >
                          <thead>
                            <tr style={{ background: "var(--pg-muted-bg)" }}>
                              <th
                                style={{
                                  padding: "8px 14px",
                                  textAlign: "left",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "var(--pg-text-3)",
                                  width: "50%",
                                }}
                              >
                                Objective
                              </th>
                              <th
                                style={{
                                  padding: "8px 14px",
                                  textAlign: "left",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "var(--pg-text-3)",
                                }}
                              >
                                Target
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {targets.map((t, i) => (
                              <TargetRowComp
                                key={i}
                                row={t}
                                isLast={i === targets.length - 1}
                                onChange={(val) =>
                                  setTargets((prev) =>
                                    prev.map((r, idx) =>
                                      idx === i ? { ...r, target: val } : r
                                    )
                                  )
                                }
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <button
                          onClick={saveTargets}
                          disabled={targetSaving}
                          style={{
                            height: 36,
                            paddingLeft: 16,
                            paddingRight: 16,
                            borderRadius: 12,
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#fff",
                            background: targetSaving
                              ? "#aaa"
                              : "linear-gradient(135deg,#FF6600,#E05500)",
                            border: "none",
                            cursor: targetSaving ? "not-allowed" : "pointer",
                          }}
                        >
                          {targetSaving ? "Saving…" : "Save Targets"}
                        </button>
                        {targetError && (
                          <span style={{ fontSize: 12, color: "#dc2626" }}>
                            {targetError}
                          </span>
                        )}
                        {targetSuccess && (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#059669",
                              fontWeight: 600,
                            }}
                          >
                            Targets saved!
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        color: "var(--pg-text-3)",
                        fontSize: 13,
                        fontStyle: "italic",
                      }}
                    >
                      Enter a role and grade above, then click Load to view or
                      edit targets.
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── KPI Row ────────────────────────────────────────────────────────────── */

function KPIRow({
  kpi,
  isLast,
  onUpdate,
  onDelete,
}: {
  kpi: KPI;
  isLast: boolean;
  onUpdate: (id: string, field: keyof KPI, value: string | number) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--pg-row-hover)" : "transparent",
        borderBottom: isLast
          ? "none"
          : "1px solid var(--pg-row-border, var(--pg-card-border))",
        transition: "background 0.1s",
      }}
    >
      <td style={{ padding: "8px 14px" }}>
        <input
          value={kpi.objective}
          onChange={(e) => onUpdate(kpi.id, "objective", e.target.value)}
          placeholder="e.g. Increase revenue growth"
          style={{
            width: "100%",
            height: 32,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 8,
            fontSize: 13,
            outline: "none",
            background: "var(--pg-muted-bg)",
            border: "1px solid var(--pg-card-border)",
            color: "var(--pg-text-1)",
            boxSizing: "border-box",
          }}
        />
      </td>
      <td style={{ padding: "8px 14px" }}>
        <input
          value={kpi.measure}
          onChange={(e) => onUpdate(kpi.id, "measure", e.target.value)}
          placeholder="e.g. % growth YoY"
          style={{
            width: "100%",
            height: 32,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 8,
            fontSize: 13,
            outline: "none",
            background: "var(--pg-muted-bg)",
            border: "1px solid var(--pg-card-border)",
            color: "var(--pg-text-1)",
            boxSizing: "border-box",
          }}
        />
      </td>
      <td style={{ padding: "8px 14px", textAlign: "right" }}>
        <input
          type="number"
          min={0}
          max={100}
          value={kpi.weight}
          onChange={(e) =>
            onUpdate(kpi.id, "weight", parseFloat(e.target.value) || 0)
          }
          style={{
            width: 70,
            height: 32,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 8,
            fontSize: 13,
            outline: "none",
            background: "var(--pg-muted-bg)",
            border: "1px solid var(--pg-card-border)",
            color: "var(--pg-text-1)",
            textAlign: "right",
          }}
        />
      </td>
      <td style={{ padding: "8px 14px", textAlign: "center" }}>
        <button
          onClick={() => onDelete(kpi.id)}
          title="Delete KPI"
          style={{
            height: 28,
            width: 28,
            borderRadius: 8,
            border: "1px solid #dc262640",
            background: "#dc262610",
            color: "#dc2626",
            cursor: "pointer",
            fontSize: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

/* ─── Target Row ─────────────────────────────────────────────────────────── */

function TargetRowComp({
  row,
  isLast,
  onChange,
}: {
  row: TargetRow;
  isLast: boolean;
  onChange: (val: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--pg-row-hover)" : "transparent",
        borderBottom: isLast
          ? "none"
          : "1px solid var(--pg-row-border, var(--pg-card-border))",
        transition: "background 0.1s",
      }}
    >
      <td
        style={{
          padding: "10px 14px",
          color: "var(--pg-text-1)",
          fontSize: 13,
        }}
      >
        {row.objective || (
          <span style={{ color: "var(--pg-text-3)", fontStyle: "italic" }}>
            (no objective)
          </span>
        )}
      </td>
      <td style={{ padding: "8px 14px" }}>
        <input
          value={row.target}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter target value…"
          style={{
            width: "100%",
            height: 32,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 8,
            fontSize: 13,
            outline: "none",
            background: "var(--pg-muted-bg)",
            border: "1px solid var(--pg-card-border)",
            color: "var(--pg-text-1)",
            boxSizing: "border-box",
          }}
        />
      </td>
    </tr>
  );
}

/* ─── Weight Summary Bar ─────────────────────────────────────────────────── */

function WeightSummaryBar({
  total,
  kpis,
}: {
  total: number;
  kpis: KPI[];
}) {
  const isValid = Math.round(total) === 100;

  function pw(p: Perspective) {
    return kpis
      .filter((k) => k.perspective === p)
      .reduce((s, k) => s + Number(k.weight), 0);
  }

  const shortLabel: Record<Perspective, string> = {
    Financial: "Financial",
    "Client / Customer": "Client",
    "Internal Business Process": "Internal",
    "Learning & Growth": "L&G",
  };

  return (
    <div
      style={{
        marginTop: 20,
        padding: "14px 18px",
        borderRadius: 14,
        border: `1.5px solid ${isValid ? "#05966940" : "#dc262640"}`,
        background: isValid ? "#05966908" : "#dc262608",
        display: "flex",
        alignItems: "center",
        gap: 18,
        flexWrap: "wrap",
      }}
    >
      {/* Total */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--pg-text-3)",
          }}
        >
          Total Weight
        </span>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1,
            color: isValid ? "#059669" : "#dc2626",
          }}
        >
          {total}%
        </span>
        {!isValid && (
          <span
            style={{ fontSize: 11, color: "#dc2626", fontStyle: "italic" }}
          >
            (must equal 100%)
          </span>
        )}
        {isValid && (
          <span style={{ fontSize: 11, color: "#059669" }}>
            Weights balanced
          </span>
        )}
      </div>

      <div
        style={{
          width: 1,
          height: 28,
          background: "var(--pg-card-border)",
        }}
      />

      {/* Per-perspective breakdown */}
      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {PERSPECTIVES.map((p, i) => (
          <React.Fragment key={p}>
            {i > 0 && (
              <span style={{ color: "var(--pg-text-4, var(--pg-text-3))" }}>
                |
              </span>
            )}
            <span style={{ fontSize: 13, color: "var(--pg-text-2)" }}>
              <span
                style={{
                  fontWeight: 700,
                  color: PERSPECTIVE_COLORS[p],
                }}
              >
                {shortLabel[p]}
              </span>
              : {pw(p)}%
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
