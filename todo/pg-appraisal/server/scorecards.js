"use strict";
const { db } = require("./db");
const D = require("./domain");

db.exec(`
CREATE TABLE IF NOT EXISTS kpis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department TEXT NOT NULL,
  perspective TEXT NOT NULL,
  seq INTEGER NOT NULL,
  objective TEXT NOT NULL,
  measure TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS kpi_targets (
  department TEXT NOT NULL,
  kpi_key TEXT NOT NULL,          -- perspective#seq (stable id within a department)
  role TEXT NOT NULL,
  grade TEXT NOT NULL,
  target TEXT DEFAULT '',
  PRIMARY KEY (department, kpi_key, role, grade)
);
CREATE INDEX IF NOT EXISTS idx_kpis_dept ON kpis(department);
`);

// Seed the editable KPI table once, from the built-in library in domain.js
function ensureSeeded() {
  if (db.prepare("SELECT COUNT(*) c FROM kpis").get().c > 0) return;
  const ins = db.prepare("INSERT INTO kpis(department,perspective,seq,objective,measure,weight) VALUES(?,?,?,?,?,?)");
  db.transaction(() => {
    for (const dept of Object.keys(D.DEPTS))
      for (const p of D.PORDER)
        (D.DEPTS[dept][p] || []).forEach((k, i) => ins.run(dept, p, i, k[0], k[1], k[2]));
  })();
}
ensureSeeded();

const kid = (p, seq) => `${p}#${seq}`;

function kpis(dept) {
  const rows = db.prepare("SELECT * FROM kpis WHERE department=?").all(dept);
  const byP = {}; rows.forEach((r) => (byP[r.perspective] = byP[r.perspective] || []).push(r));
  const out = [];
  D.PORDER.forEach((p) => (byP[p] || []).sort((a, b) => a.seq - b.seq).forEach((r) =>
    out.push({ id: kid(p, r.seq), p, seq: r.seq, obj: r.objective, meas: r.measure, w: r.weight })));
  return out;
}
const pWeight = (dept, p) => db.prepare("SELECT COALESCE(SUM(weight),0) s FROM kpis WHERE department=? AND perspective=?").get(dept, p).s;
const deptTotal = (dept) => db.prepare("SELECT COALESCE(SUM(weight),0) s FROM kpis WHERE department=?").get(dept).s;
const departments = () => db.prepare("SELECT DISTINCT department FROM kpis ORDER BY department").all().map((r) => r.department);

function targetsFor(dept, role, grade) {
  const m = {};
  db.prepare("SELECT kpi_key,target FROM kpi_targets WHERE department=? AND role=? AND grade=?").all(dept, role, grade)
    .forEach((r) => (m[r.kpi_key] = r.target));
  return m;
}
// role×grade combinations present in a department (for the targets editor)
const roleGrades = (dept) => db.prepare("SELECT DISTINCT role,grade FROM employees WHERE dept=? AND role_type<>'hc' ORDER BY role,grade").all(dept);

// full replacement of a department's KPI structure (text + weight); seq preserved by caller
function saveKpis(dept, items) {
  db.transaction(() => {
    db.prepare("DELETE FROM kpis WHERE department=?").run(dept);
    const ins = db.prepare("INSERT INTO kpis(department,perspective,seq,objective,measure,weight) VALUES(?,?,?,?,?,?)");
    items.forEach((it) => ins.run(dept, it.perspective, Number(it.seq), String(it.objective || "").slice(0, 300), String(it.measure || "").slice(0, 300), Math.max(0, Math.min(100, Math.round(Number(it.weight) || 0)))));
  })();
}
function setTargets(dept, role, grade, targets) {
  db.transaction(() => {
    const up = db.prepare("INSERT INTO kpi_targets(department,kpi_key,role,grade,target) VALUES(?,?,?,?,?) ON CONFLICT(department,kpi_key,role,grade) DO UPDATE SET target=excluded.target");
    Object.entries(targets || {}).forEach(([k, v]) => up.run(dept, k, role, grade, String(v == null ? "" : v).slice(0, 120)));
  })();
}

module.exports = { ensureSeeded, kpis, pWeight, deptTotal, departments, targetsFor, roleGrades, saveKpis, setTargets, kid };

// ---------- H2: per-individual scorecards (targets set by line managers) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS ind_scorecard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL,
  employee_id TEXT NOT NULL,
  perspective TEXT NOT NULL,
  seq INTEGER NOT NULL,
  objective TEXT NOT NULL,
  measure TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  target TEXT DEFAULT '',
  source TEXT DEFAULT 'standard'
);
CREATE INDEX IF NOT EXISTS idx_ind_ce ON ind_scorecard(cycle_id, employee_id);
`);

function hasIndividual(cycleId, empId) { return db.prepare("SELECT COUNT(*) c FROM ind_scorecard WHERE cycle_id=? AND employee_id=?").get(cycleId, empId).c > 0; }
function getIndividual(cycleId, empId) {
  const rows = db.prepare("SELECT * FROM ind_scorecard WHERE cycle_id=? AND employee_id=?").all(cycleId, empId);
  const byP = {}; rows.forEach((r) => (byP[r.perspective] = byP[r.perspective] || []).push(r));
  const out = [];
  D.PORDER.forEach((p) => (byP[p] || []).sort((a, b) => a.seq - b.seq).forEach((r) => out.push({ id: kid(p, r.seq), p, seq: r.seq, obj: r.objective, meas: r.measure, w: r.weight, target: r.target || "", source: r.source || "standard" })));
  return out;
}
function seedIndividualFromDept(cycleId, empId, dept, role, grade) {
  if (hasIndividual(cycleId, empId)) return;
  const base = kpis(dept), tg = targetsFor(dept, role, grade);
  const ins = db.prepare("INSERT INTO ind_scorecard(cycle_id,employee_id,perspective,seq,objective,measure,weight,target,source) VALUES(?,?,?,?,?,?,?,?, 'standard')");
  db.transaction(() => { base.forEach((k) => ins.run(cycleId, empId, k.p, k.seq, k.obj, k.meas, k.w, tg[k.id] || "")); })();
}
function saveIndividual(cycleId, empId, items) {
  const counts = {};
  db.transaction(() => {
    db.prepare("DELETE FROM ind_scorecard WHERE cycle_id=? AND employee_id=?").run(cycleId, empId);
    const ins = db.prepare("INSERT INTO ind_scorecard(cycle_id,employee_id,perspective,seq,objective,measure,weight,target,source) VALUES(?,?,?,?,?,?,?,?,?)");
    items.forEach((it) => {
      const p = it.perspective; counts[p] = counts[p] == null ? 0 : counts[p] + 1;
      ins.run(cycleId, empId, p, counts[p], String(it.objective || "").slice(0, 300), String(it.measure || "").slice(0, 300), Math.max(0, Math.min(100, Math.round(Number(it.weight) || 0))), String(it.target == null ? "" : it.target).slice(0, 120), it.source === "individual" ? "individual" : "standard");
    });
  })();
}
// unified scorecard for scoring/serialization: individual if set, else the department standard (with role×grade targets)
function scorecardListFor(cycleId, empId, dept, role, grade) {
  if (cycleId && empId && hasIndividual(cycleId, empId)) return getIndividual(cycleId, empId);
  const tg = targetsFor(dept, role, grade);
  return kpis(dept).map((k) => ({ ...k, target: tg[k.id] || "", source: "standard" }));
}

module.exports.hasIndividual = hasIndividual;
module.exports.getIndividual = getIndividual;
module.exports.seedIndividualFromDept = seedIndividualFromDept;
module.exports.saveIndividual = saveIndividual;
module.exports.scorecardListFor = scorecardListFor;
