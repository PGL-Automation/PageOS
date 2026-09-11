"use strict";
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { parse } = require("csv-parse/sync");

const { db, getSetting, setSetting, audit } = require("./db");
const A = require("./auth");
const D = require("./domain");
const OD = require("./orgdata");
const SC = require("./scorecards");
const M = require("./mailer");

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(A.attachUser);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ---------- helpers ----------
const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, company: u.company, companyCode: u.company_code, role: u.role, title: u.title, grade: u.grade, level: u.level, dept: u.dept, roleType: u.role_type, managerId: u.manager_id });
function currentCycle() { const id = getSetting("current_cycle_id"); return id ? db.prepare("SELECT * FROM cycles WHERE id=?").get(id) : null; }
const empById = (id) => db.prepare("SELECT * FROM employees WHERE id=?").get(id);

function validateRatings(ks, obj) {
  if (!obj || typeof obj !== "object") return {};
  const allowed = new Set(ks.map((k) => k.id));
  const out = {};
  for (const [k, v] of Object.entries(obj)) { const n = Number(v); if (allowed.has(k) && Number.isInteger(n) && n >= 1 && n <= 5) out[k] = n; }
  return out;
}
// the scorecard that applies to a given appraisal: per-individual (H2) if set, else the department standard
function ksFor(a) { const emp = empById(a.employee_id) || {}; return SC.scorecardListFor(a.cycle_id, a.employee_id, a.department, emp.role, a.grade); }
function serializeAppraisal(a, viewer) {
  const emp = empById(a.employee_id);
  const self = JSON.parse(a.self_json || "{}"), agreed = JSON.parse(a.agreed_json || "{}");
  const stage = { not_started: 0, self_in_progress: 0, submitted_to_manager: 1, manager_in_progress: 1, submitted_to_hc: 2, finalized: 3 }[a.status];
  const canEditSelf = viewer.id === a.employee_id && ["not_started", "self_in_progress"].includes(a.status);
  const canEditManager = viewer.id === a.manager_id && ["submitted_to_manager", "manager_in_progress"].includes(a.status);
  const canFinalize = viewer.role_type === "hc" && a.status === "submitted_to_hc";
  const ks = ksFor(a);
  const selfScore = D.overall(ks, self), agreedScore = D.overall(ks, agreed);
  const pw = {}; D.PORDER.forEach((p) => (pw[p] = 0)); ks.forEach((k) => (pw[k.p] = (pw[k.p] || 0) + k.w));
  return {
    id: a.id, employeeId: a.employee_id, employeeName: emp ? emp.name : a.employee_id, role: emp ? emp.role : "",
    company: emp ? emp.company : "", department: a.department, grade: a.grade, level: a.level, levelLabel: D.LVL[a.level],
    managerId: a.manager_id, managerName: (empById(a.manager_id) || {}).name || null, status: a.status, stage,
    period: (currentCycle() || {}).period || "",
    scorecard: ks,
    perspectiveWeights: pw,
    self, agreed, selfScore, agreedScore,
    band: D.band(agreedScore || selfScore),
    employeeComments: a.employee_comments, managerComments: a.manager_comments, developmentPlan: a.development_plan, hcComments: a.hc_comments,
    canEditSelf, canEditManager, canFinalize,
  };
}
function loadAuthorizedAppraisal(id, viewer) {
  const a = db.prepare("SELECT * FROM appraisals WHERE id=?").get(id);
  if (!a) return { err: 404 };
  const allowed = viewer.id === a.employee_id || viewer.id === a.manager_id || viewer.role_type === "hc";
  if (!allowed) return { err: 403 };
  return { a };
}

// ---------- one-time email codes (OTP) ----------
function issueOtp(email) {
  const code = ("" + (100000 + crypto.randomInt(900000))).slice(0, 6);
  const now = new Date(), exp = new Date(now.getTime() + 20 * 60 * 1000);
  db.prepare("INSERT INTO otps(email,code_hash,expires_at,used,created_at) VALUES(?,?,?,0,?)").run(email, A.hashCode(code), exp.toISOString(), now.toISOString());
  return code;
}
function consumeOtp(email, code) {
  const rows = db.prepare("SELECT * FROM otps WHERE email=? AND used=0 AND expires_at > ? ORDER BY id DESC LIMIT 5").all(email, new Date().toISOString());
  for (const r of rows) { if (A.verifyCode(code, r.code_hash)) { db.prepare("UPDATE otps SET used=1 WHERE id=?").run(r.id); return true; } }
  return false;
}

app.get("/api/config", (_req, res) => res.json({ emailEnabled: M.isConfigured(), loginMode: (process.env.LOGIN_MODE || "both").toLowerCase() }));

// ---------- auth routes ----------
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.post("/api/login", loginLimiter, (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const code = String((req.body || {}).code || "").trim();
  const u = db.prepare("SELECT * FROM employees WHERE lower(email)=? AND active=1").get(email);
  const mode = (process.env.LOGIN_MODE || "both").toLowerCase();       // both | otp | code
  const bgEmail = (process.env.BREAKGLASS_EMAIL || "").toLowerCase(), bgCode = process.env.BREAKGLASS_CODE || "";
  let ok = false;
  if (u && bgEmail && bgCode && email === bgEmail && code === bgCode) ok = true;   // emergency access
  if (!ok && u && mode !== "otp") ok = A.verifyCode(code, u.code_hash);            // standing code (disabled in otp-only)
  if (!ok && u) ok = consumeOtp(email, code);                                      // emailed one-time code
  if (!u || !ok) { audit(u ? u.id : null, "login.fail", email, null); return res.status(401).json({ error: "Invalid email or code" }); }
  A.cleanupSessions();
  const { token } = A.createSession(u.id);
  res.cookie(A.COOKIE, token, A.cookieOpts());
  audit(u.id, "login.ok", u.id, null);
  res.json({ user: publicUser(u), cycle: currentCycle() });
});

// email a one-time sign-in code to a work address (generic response — no account enumeration)
app.post("/api/request-code", loginLimiter, (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const u = db.prepare("SELECT * FROM employees WHERE lower(email)=? AND active=1").get(email);
  if (u && M.isConfigured()) {
    const code = issueOtp(email);
    M.sendCode(u.email, u.name, code, { otp: true }).then(() => audit(u.id, "otp.sent", email, null)).catch((e) => console.error("otp send failed:", e.message));
  }
  res.json({ ok: true, delivery: M.isConfigured() ? "email" : "disabled" });   // respond immediately; email sends in the background
});
app.post("/api/logout", (req, res) => { A.destroySession(req.cookies[A.COOKIE]); res.clearCookie(A.COOKIE, { path: "/" }); res.json({ ok: true }); });
app.get("/api/me", A.requireAuth, (req, res) => res.json({ user: publicUser(req.user), cycle: currentCycle() }));

// ---------- employee: own appraisal ----------
app.get("/api/my/appraisal", A.requireAuth, (req, res) => {
  const c = currentCycle(); if (!c) return res.json({ appraisal: null, cycleOpen: false });
  const a = db.prepare("SELECT * FROM appraisals WHERE cycle_id=? AND employee_id=?").get(c.id, req.user.id);
  if (!a) return res.json({ appraisal: null, cycleOpen: c.status === "open" });
  audit(req.user.id, "appraisal.view", `appraisal:${a.id}`, "own");
  res.json({ appraisal: serializeAppraisal(a, req.user), cycleOpen: c.status === "open" });
});

// ---------- get one appraisal (authorized) ----------
app.get("/api/appraisals/:id", A.requireAuth, (req, res) => {
  const r = loadAuthorizedAppraisal(Number(req.params.id), req.user);
  if (r.err) return res.status(r.err).json({ error: r.err === 404 ? "Not found" : "Forbidden" });
  audit(req.user.id, "appraisal.view", `appraisal:${r.a.id}`, req.user.id === r.a.employee_id ? "own" : req.user.role_type);
  res.json({ appraisal: serializeAppraisal(r.a, req.user) });
});

// ---------- workflow actions (single, authorized, server-side state machine) ----------
const setStmt = db.prepare(`UPDATE appraisals SET self_json=?,agreed_json=?,employee_comments=?,manager_comments=?,development_plan=?,hc_comments=?,status=?,updated_at=? WHERE id=?`);
app.post("/api/appraisals/:id/action", A.requireAuth, (req, res) => {
  const r = loadAuthorizedAppraisal(Number(req.params.id), req.user);
  if (r.err) return res.status(r.err).json({ error: r.err === 404 ? "Not found" : "Forbidden" });
  const a = r.a, u = req.user, body = req.body || {}, action = body.action;
  const c = currentCycle();
  if (!c || c.status !== "open") return res.status(409).json({ error: "The review cycle is not open" });
  if ((c.phase || "appraisal") !== "appraisal") return res.status(409).json({ error: "The cycle is in target-setting, not appraisal" });
  const ks = ksFor(a);

  let self = JSON.parse(a.self_json || "{}"), agreed = JSON.parse(a.agreed_json || "{}");
  let empC = a.employee_comments, mgrC = a.manager_comments, dev = a.development_plan, hcC = a.hc_comments, status = a.status;
  const isSelfStage = ["not_started", "self_in_progress"].includes(a.status);
  const isMgrStage = ["submitted_to_manager", "manager_in_progress"].includes(a.status);
  const owns = u.id === a.employee_id, manages = u.id === a.manager_id, isHC = u.role_type === "hc";

  const deny = () => res.status(403).json({ error: "Not permitted at this stage" });
  switch (action) {
    case "save-self":
      if (!(owns && isSelfStage)) return deny();
      self = validateRatings(ks, body.self); if (typeof body.employeeComments === "string") empC = body.employeeComments.slice(0, 4000);
      if (typeof body.developmentPlan === "string") dev = body.developmentPlan.slice(0, 4000);
      if (Object.keys(self).length) status = "self_in_progress";
      break;
    case "submit-self":
      if (!(owns && isSelfStage)) return deny();
      self = validateRatings(ks, body.self);
      if (typeof body.employeeComments === "string") empC = body.employeeComments.slice(0, 4000);
      if (typeof body.developmentPlan === "string") dev = body.developmentPlan.slice(0, 4000);
      if (!D.allRated(ks, self)) return res.status(400).json({ error: "Rate every objective before submitting" });
      status = "submitted_to_manager";
      break;
    case "save-manager":
      if (!(manages && isMgrStage)) return deny();
      agreed = validateRatings(ks, body.agreed);
      if (typeof body.managerComments === "string") mgrC = body.managerComments.slice(0, 4000);
      if (typeof body.developmentPlan === "string") dev = body.developmentPlan.slice(0, 4000);
      if (Object.keys(agreed).length) status = "manager_in_progress";
      break;
    case "submit-manager":
      if (!(manages && isMgrStage)) return deny();
      agreed = validateRatings(ks, body.agreed);
      if (typeof body.managerComments === "string") mgrC = body.managerComments.slice(0, 4000);
      if (typeof body.developmentPlan === "string") dev = body.developmentPlan.slice(0, 4000);
      if (!D.allRated(ks, agreed)) return res.status(400).json({ error: "Set an agreed rating for every objective" });
      status = "submitted_to_hc";
      break;
    case "return-to-employee":
      if (!(manages && isMgrStage)) return deny();
      status = "self_in_progress";
      break;
    case "finalize":
      if (!(isHC && a.status === "submitted_to_hc")) return deny();
      if (typeof body.hcComments === "string") hcC = body.hcComments.slice(0, 4000);
      status = "finalized";
      break;
    case "return-to-manager":
      if (!(isHC && a.status === "submitted_to_hc")) return deny();
      status = "manager_in_progress";
      break;
    default:
      return res.status(400).json({ error: "Unknown action" });
  }
  setStmt.run(JSON.stringify(self), JSON.stringify(agreed), empC, mgrC, dev, hcC, status, new Date().toISOString(), a.id);
  audit(u.id, "appraisal." + action, `appraisal:${a.id}`, { status });
  const updated = db.prepare("SELECT * FROM appraisals WHERE id=?").get(a.id);
  res.json({ appraisal: serializeAppraisal(updated, u) });
});

// ---------- manager: team ----------
app.get("/api/team", A.requireRole("manager", "hc"), (req, res) => {
  const c = currentCycle(); if (!c) return res.json({ reports: [], own: null });
  const rows = db.prepare("SELECT * FROM appraisals WHERE cycle_id=? AND manager_id=?").all(c.id, req.user.id);
  const own = db.prepare("SELECT * FROM appraisals WHERE cycle_id=? AND employee_id=?").get(c.id, req.user.id);
  res.json({ reports: rows.map((a) => summary(a)), own: own ? summary(own) : null });
});
function summary(a) {
  const emp = empById(a.employee_id);
  const ks = ksFor(a);
  const self = D.overall(ks, JSON.parse(a.self_json || "{}"));
  const agreed = D.overall(ks, JSON.parse(a.agreed_json || "{}"));
  return { id: a.id, employeeId: a.employee_id, name: emp ? emp.name : a.employee_id, role: emp ? emp.role : "", company: emp ? emp.company : "", department: a.department, grade: a.grade, level: a.level, levelLabel: D.LVL[a.level], status: a.status, selfScore: self, agreedScore: agreed, band: D.band(agreed || self) };
}

// ---------- HC: console ----------
app.get("/api/hc/appraisals", A.requireRole("hc"), (req, res) => {
  const c = currentCycle(); if (!c) return res.json({ rows: [] });
  const rows = db.prepare("SELECT * FROM appraisals WHERE cycle_id=?").all(c.id).map(summary);
  res.json({ rows });
});
app.get("/api/hc/export.csv", A.requireRole("hc"), (req, res) => {
  const c = currentCycle(); if (!c) return res.status(404).send("No open cycle");
  const rows = db.prepare("SELECT * FROM appraisals WHERE cycle_id=?").all(c.id);
  const head = ["Employee", "Company", "Department", "Role", "Grade", "Level", "Appraiser", "Status", "Self", "Agreed", "Band", "Percent"];
  const lines = [head].concat(rows.map((a) => { const s = summary(a); return [s.name, s.company, s.department, s.role, s.grade, s.levelLabel, (empById(a.manager_id) || {}).name || "", s.status, s.selfScore || "", s.agreedScore || "", s.band, (s.agreedScore || s.selfScore) ? Math.round(((s.agreedScore || s.selfScore) / 5) * 100) + "%" : ""]; }));
  const csv = lines.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
  audit(req.user.id, "hc.export", `cycle:${c.id}`, { rows: rows.length });
  res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", 'attachment; filename="appraisals.csv"'); res.send(csv);
});
app.get("/api/hc/audit", A.requireRole("hc"), (req, res) => res.json({ events: db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 500").all() }));

// ---------- HC: cycle ----------
app.post("/api/hc/cycle", A.requireRole("hc"), (req, res) => {
  const name = String((req.body || {}).name || "Review").slice(0, 80), period = String((req.body || {}).period || "").slice(0, 120);
  const phase = ((req.body || {}).phase === "target") ? "target" : "appraisal";
  const info = db.prepare("INSERT INTO cycles(name,period,status,phase,created_at) VALUES(?,?, 'draft', ?, ?)").run(name, period, phase, new Date().toISOString());
  setSetting("current_cycle_id", info.lastInsertRowid);
  audit(req.user.id, "cycle.create", `cycle:${info.lastInsertRowid}`, { name, period, phase });
  res.json({ cycleId: info.lastInsertRowid });
});
app.post("/api/hc/cycle/phase", A.requireRole("hc"), (req, res) => {
  const c = currentCycle(); if (!c) return res.status(404).json({ error: "No cycle" });
  const phase = ((req.body || {}).phase === "target") ? "target" : "appraisal";
  db.prepare("UPDATE cycles SET phase=? WHERE id=?").run(phase, c.id);
  audit(req.user.id, "cycle.phase", `cycle:${c.id}`, { phase });
  res.json({ ok: true, phase });
});
app.post("/api/hc/cycle/generate-appraisals", A.requireRole("hc"), (req, res) => {
  const c = currentCycle(); if (!c) return res.status(404).json({ error: "No cycle" });
  const emps = db.prepare("SELECT * FROM employees WHERE active=1 AND role_type<>'hc' AND manager_id IS NOT NULL").all();
  const ins = db.prepare("INSERT INTO appraisals(cycle_id,employee_id,manager_id,department,grade,level,status,updated_at) VALUES(?,?,?,?,?,?, 'not_started', ?) ON CONFLICT(cycle_id,employee_id) DO NOTHING");
  let created = 0;
  db.transaction(() => { for (const e of emps) { const r = ins.run(c.id, e.id, e.manager_id, e.dept, e.grade, e.level, new Date().toISOString()); if (r.changes) created++; } })();
  audit(req.user.id, "cycle.generate_appraisals", `cycle:${c.id}`, { created, total: emps.length });
  res.json({ created, existing: emps.length - created, total: emps.length });
});
app.post("/api/hc/cycle/open", A.requireRole("hc"), (req, res) => { const c = currentCycle(); if (!c) return res.status(404).json({ error: "No cycle" }); db.prepare("UPDATE cycles SET status='open' WHERE id=?").run(c.id); audit(req.user.id, "cycle.open", `cycle:${c.id}`); res.json({ ok: true }); });
app.post("/api/hc/cycle/close", A.requireRole("hc"), (req, res) => { const c = currentCycle(); if (!c) return res.status(404).json({ error: "No cycle" }); db.prepare("UPDATE cycles SET status='closed' WHERE id=?").run(c.id); audit(req.user.id, "cycle.close", `cycle:${c.id}`); res.json({ ok: true }); });

// ---------- HC: org-data import (validate = dry run; apply = load) ----------
const XLSX = require("xlsx");
function rowsFromUpload(file) {
  const nm = (file.originalname || "").toLowerCase(), mt = file.mimetype || "";
  const isExcel = nm.endsWith(".xlsx") || nm.endsWith(".xls") || mt.includes("spreadsheet") || mt.includes("ms-excel");
  let recs;
  if (isExcel) {
    const wb = XLSX.read(file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: false });
    // find the header row (the first row that names an employee/name column)
    let h = 0;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
      const cells = grid[i].map((c) => String(c).toLowerCase().replace(/[^a-z]/g, ""));
      if (cells.some((c) => c === "employeename" || c === "name")) { h = i; break; }
    }
    const headers = grid[h].map((c) => String(c));
    recs = grid.slice(h + 1).map((row) => { const o = {}; headers.forEach((hd, j) => { if (hd) o[hd] = row[j] == null ? "" : row[j]; }); return o; });
  } else {
    recs = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  }
  const pick = (o, names) => { for (const n of names) { for (const k of Object.keys(o)) if (String(k).toLowerCase().replace(/[^a-z]/g, "") === n) return String(o[k]).trim(); } return ""; };
  return recs.map((o) => ({
    name: pick(o, ["employeename", "name"]), grade: pick(o, ["gradelevel", "grade"]),
    role: pick(o, ["role"]), title: pick(o, ["jobtitle", "title"]),
    reportsTo: pick(o, ["reportsto", "linemanager", "manager"]), company: pick(o, ["company", "subsidiary"]),
    email: pick(o, ["email", "workemail", "emailaddress"]),
  })).filter((r) => r.name);
}
app.post("/api/hc/orgdata/validate", A.requireRole("hc"), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  let rows; try { rows = rowsFromUpload(req.file); } catch (e) { return res.status(400).json({ error: "Could not read the file: " + e.message }); }
  const { users, issues } = OD.buildDirectory(rows);
  res.json({ count: users.length, errors: issues.filter((i) => i.level === "error"), warnings: issues.filter((i) => i.level === "warn"), preview: users.slice(0, 5).map((u) => ({ name: u.name, company: u.company, dept: u.dept, grade: u.grade, roleType: u.roleType, manager: u.managerId })) });
});
app.post("/api/hc/orgdata/apply", A.requireRole("hc"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  let rows; try { rows = rowsFromUpload(req.file); } catch (e) { return res.status(400).json({ error: "Could not read the file: " + e.message }); }
  const { users, issues } = OD.buildDirectory(rows);
  if (issues.some((i) => i.level === "error")) return res.status(400).json({ error: "Fix errors before applying", errors: issues.filter((i) => i.level === "error") });
  let c = currentCycle();
  if (!c) { const info = db.prepare("INSERT INTO cycles(name,period,status,created_at) VALUES('Review','', 'draft', ?)").run(new Date().toISOString()); setSetting("current_cycle_id", info.lastInsertRowid); c = currentCycle(); }
  const { codes } = OD.applyDirectory(users, c.id, req.user.id);
  let emailed = 0;
  if (M.isConfigured()) { for (const [em, v] of Object.entries(codes)) { if (await M.sendCode(em, v.name, v.code)) emailed++; } }
  res.json({ applied: users.length, newCodes: Object.keys(codes).length, emailed, emailEnabled: M.isConfigured(), codes });
});

// ---------- HC: employee administration (login email, reporting line, code) ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function recomputeRoleTypes() {
  const emps = db.prepare("SELECT id, role_type FROM employees").all();
  const mgrIds = new Set(db.prepare("SELECT DISTINCT manager_id AS m FROM employees WHERE manager_id IS NOT NULL").all().map((r) => r.m));
  const upd = db.prepare("UPDATE employees SET role_type=? WHERE id=?");
  db.transaction(() => { for (const e of emps) { if (e.role_type === "hc") continue; const want = mgrIds.has(e.id) ? "manager" : "employee"; if (want !== e.role_type) upd.run(want, e.id); } })();
}
function wouldLoop(empId, managerId) {
  let cur = managerId, hops = 0;
  while (cur && hops < 200) { if (cur === empId) return true; const m = db.prepare("SELECT manager_id FROM employees WHERE id=?").get(cur); cur = m ? m.manager_id : null; hops++; }
  return false;
}
const empPublic = (u) => ({ id: u.id, name: u.name, email: u.email, company: u.company, companyCode: u.company_code, role: u.role, title: u.title, grade: u.grade, dept: u.dept, level: u.level, levelLabel: D.LVL[u.level], roleType: u.role_type, managerId: u.manager_id, managerName: (empById(u.manager_id) || {}).name || null, active: u.active });

app.get("/api/hc/employees", A.requireRole("hc"), (req, res) => {
  const emps = db.prepare("SELECT * FROM employees ORDER BY company, name").all();
  res.json({ employees: emps.map(empPublic), options: emps.map((e) => ({ id: e.id, name: e.name, company: e.company })) });
});

app.post("/api/hc/employee/:id", A.requireRole("hc"), (req, res) => {
  const emp = empById(req.params.id);
  if (!emp) return res.status(404).json({ error: "Not found" });
  const b = req.body || {};
  let email = emp.email;
  if (b.email !== undefined) {
    email = String(b.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Invalid email format" });
    if (db.prepare("SELECT id FROM employees WHERE lower(email)=? AND id<>?").get(email, emp.id)) return res.status(400).json({ error: "That email is already used by another employee" });
  }
  let mgr = b.managerId === undefined ? emp.manager_id : (b.managerId || null);
  if (mgr) {
    if (mgr === emp.id) return res.status(400).json({ error: "An employee cannot report to themselves" });
    if (!empById(mgr)) return res.status(400).json({ error: "Selected manager does not exist" });
    if (wouldLoop(emp.id, mgr)) return res.status(400).json({ error: "That reporting line creates a loop" });
  }
  const role = b.role !== undefined ? String(b.role).trim() : emp.role;
  const title = b.title !== undefined ? String(b.title).trim() : emp.title;
  const grade = b.grade !== undefined ? String(b.grade).trim() : emp.grade;
  const active = b.active !== undefined ? (b.active ? 1 : 0) : emp.active;
  const tier = D.GRADE_TIER[grade] || 3, dept = D.deptOf(role), scope = D.scopeOf(role);
  const isMgr = !!db.prepare("SELECT 1 FROM employees WHERE manager_id=? LIMIT 1").get(emp.id);
  const level = D.levelOf(grade, role, isMgr);
  db.prepare("UPDATE employees SET email=?,manager_id=?,role=?,title=?,grade=?,tier=?,dept=?,scope=?,level=?,active=? WHERE id=?")
    .run(email, mgr, role, title, grade, tier, dept, scope, level, active, emp.id);
  const c = currentCycle();
  if (c) {
    const ap = db.prepare("SELECT status FROM appraisals WHERE cycle_id=? AND employee_id=?").get(c.id, emp.id);
    if (ap && ap.status === "not_started") db.prepare("UPDATE appraisals SET manager_id=?,department=?,grade=?,level=? WHERE cycle_id=? AND employee_id=?").run(mgr, dept, grade, level, c.id, emp.id);
    else if (ap) db.prepare("UPDATE appraisals SET manager_id=? WHERE cycle_id=? AND employee_id=?").run(mgr, c.id, emp.id);
  }
  recomputeRoleTypes();
  audit(req.user.id, "employee.update", `employee:${emp.id}`, { email: email !== emp.email ? email : undefined, managerId: mgr !== emp.manager_id ? mgr : undefined });
  res.json({ employee: empPublic(empById(emp.id)) });
});

app.post("/api/hc/employee/:id/reissue-code", A.requireRole("hc"), async (req, res) => {
  const emp = empById(req.params.id);
  if (!emp) return res.status(404).json({ error: "Not found" });
  const code = ("" + (100000 + crypto.randomInt(900000))).slice(0, 6);
  db.prepare("UPDATE employees SET code_hash=? WHERE id=?").run(A.hashCode(code), emp.id);
  db.prepare("DELETE FROM sessions WHERE employee_id=?").run(emp.id);
  let emailed = false;
  if (M.isConfigured()) emailed = await M.sendCode(emp.email, emp.name, code);
  audit(req.user.id, "employee.reissue_code", `employee:${emp.id}`, { emailed });
  res.json({ email: emp.email, code, emailed });
});

// ---------- HC: scorecards & targets ----------
const cycleOpen = () => { const c = currentCycle(); return !!(c && c.status === "open"); };

app.get("/api/hc/scorecards", A.requireRole("hc"), (req, res) => {
  const locked = cycleOpen();
  const rows = SC.departments().map((dept) => ({
    department: dept, total: SC.deptTotal(dept),
    perspectives: Object.fromEntries(D.PORDER.map((p) => [p, SC.pWeight(dept, p)])),
  }));
  res.json({ locked, departments: rows });
});

app.get("/api/hc/scorecard/:dept", A.requireRole("hc"), (req, res) => {
  const dept = req.params.dept;
  res.json({ department: dept, locked: cycleOpen(), total: SC.deptTotal(dept), kpis: SC.kpis(dept), roleGrades: SC.roleGrades(dept) });
});

app.post("/api/hc/scorecard/:dept/kpis", A.requireRole("hc"), (req, res) => {
  if (cycleOpen()) return res.status(409).json({ error: "Cycle is open — objectives and weights are locked. Close the cycle to edit them (targets can still be edited)." });
  const dept = req.params.dept;
  const items = ((req.body || {}).kpis || []).filter((k) => k && k.perspective && D.PORDER.includes(k.perspective));
  if (!items.length) return res.status(400).json({ error: "No KPIs supplied" });
  const total = items.reduce((s, k) => s + (Math.round(Number(k.weight) || 0)), 0);
  if (total !== 100) return res.status(400).json({ error: `Weights must total 100% (currently ${total}%)` });
  SC.saveKpis(dept, items);
  audit(req.user.id, "scorecard.save", `dept:${dept}`, { total });
  res.json({ ok: true, kpis: SC.kpis(dept), total: SC.deptTotal(dept) });
});

app.get("/api/hc/scorecard/:dept/targets", A.requireRole("hc"), (req, res) => {
  const { role, grade } = req.query;
  if (!role || !grade) return res.status(400).json({ error: "role and grade required" });
  res.json({ targets: SC.targetsFor(req.params.dept, String(role), String(grade)) });
});

app.post("/api/hc/scorecard/:dept/targets", A.requireRole("hc"), (req, res) => {
  const b = req.body || {};
  if (!b.role || !b.grade) return res.status(400).json({ error: "role and grade required" });
  SC.setTargets(req.params.dept, String(b.role), String(b.grade), b.targets || {});
  audit(req.user.id, "scorecard.targets", `dept:${req.params.dept}`, { role: b.role, grade: b.grade });
  res.json({ ok: true, targets: SC.targetsFor(req.params.dept, String(b.role), String(b.grade)) });
});

// ---------- H2: line-manager target-setting ----------
function targetPhaseOpen() { const c = currentCycle(); return !!(c && c.status === "open" && (c.phase || "appraisal") === "target"); }
function authTargets(req, empId) { const emp = empById(empId); if (!emp) return { err: 404 }; if (req.user.role_type === "hc" || emp.manager_id === req.user.id) return { emp }; return { err: 403 }; }

app.get("/api/my/target-team", A.requireRole("manager", "hc"), (req, res) => {
  const c = currentCycle(); if (!c) return res.json({ reports: [], phase: null, open: false });
  const reports = db.prepare("SELECT * FROM employees WHERE manager_id=? AND active=1 AND role_type<>'hc'").all(req.user.id);
  res.json({ phase: c.phase || "appraisal", open: targetPhaseOpen(), period: c.period, reports: reports.map((e) => ({ id: e.id, name: e.name, role: e.role, grade: e.grade, dept: e.dept, company: e.company, targetsSet: SC.hasIndividual(c.id, e.id) })) });
});

app.get("/api/targets/:empId", A.requireAuth, (req, res) => {
  const c = currentCycle(); if (!c) return res.status(409).json({ error: "No cycle" });
  const g = authTargets(req, req.params.empId); if (g.err) return res.status(g.err).json({ error: g.err === 404 ? "Not found" : "Forbidden" });
  const emp = g.emp;
  SC.seedIndividualFromDept(c.id, emp.id, emp.dept, emp.role, emp.grade);
  res.json({ employee: { id: emp.id, name: emp.name, role: emp.role, grade: emp.grade, dept: emp.dept, company: emp.company }, cycle: { name: c.name, period: c.period, phase: c.phase || "appraisal", status: c.status }, kpis: SC.getIndividual(c.id, emp.id), perspectives: D.PORDER, locked: !targetPhaseOpen() });
});

app.post("/api/targets/:empId", A.requireAuth, (req, res) => {
  const c = currentCycle(); if (!c) return res.status(409).json({ error: "No cycle" });
  if (!targetPhaseOpen()) return res.status(409).json({ error: "Target-setting isn't open" });
  const g = authTargets(req, req.params.empId); if (g.err) return res.status(g.err).json({ error: g.err === 404 ? "Not found" : "Forbidden" });
  const items = ((req.body || {}).kpis || []).filter((k) => k && D.PORDER.includes(k.perspective) && String(k.objective || "").trim());
  if (!items.length) return res.status(400).json({ error: "Add at least one objective" });
  const total = items.reduce((s, k) => s + (Math.round(Number(k.weight) || 0)), 0);
  if (total !== 100) return res.status(400).json({ error: `Weights must total 100% (currently ${total}%)` });
  SC.saveIndividual(c.id, g.emp.id, items);
  audit(req.user.id, "targets.save", `employee:${g.emp.id}`, { total, count: items.length });
  res.json({ ok: true, kpis: SC.getIndividual(c.id, g.emp.id) });
});

app.get("/api/hc/targets-progress", A.requireRole("hc"), (req, res) => {
  const c = currentCycle(); if (!c) return res.json({ rows: [], set: 0, total: 0 });
  const emps = db.prepare("SELECT * FROM employees WHERE active=1 AND role_type<>'hc' AND manager_id IS NOT NULL").all();
  const rows = emps.map((e) => ({ name: e.name, dept: e.dept, manager: (empById(e.manager_id) || {}).name || "", set: SC.hasIndividual(c.id, e.id) }));
  res.json({ phase: c.phase || "appraisal", set: rows.filter((r) => r.set).length, total: rows.length, rows });
});

// ---------- static SPA (no-cache so new deploys are always picked up) ----------
const WEB = path.join(__dirname, "..", "web");
const noCache = (res) => res.setHeader("Cache-Control", "no-cache");
app.use(express.static(path.join(WEB, "dist"), { setHeaders: noCache }));
app.use(express.static(WEB, { setHeaders: noCache }));
app.get(/^(?!\/api).*/, (_req, res) => { res.setHeader("Cache-Control", "no-cache"); res.sendFile(path.join(WEB, "index.html")); });

module.exports = app;
