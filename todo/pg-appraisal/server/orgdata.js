"use strict";
const crypto = require("crypto");
const { db, audit } = require("./db");
const { hashCode } = require("./auth");
const D = require("./domain");

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z]+/g, ".").replace(/(^\.|\.$)/g, "");

// rows: [{ name, grade, role, title, company, reportsTo, hc? }]
// returns { users, issues } — pure, no DB writes
function buildDirectory(rows) {
  const issues = [];
  const people = rows.map((r) => ({
    name: (r.name || "").trim(), grade: (r.grade || "").trim(), role: (r.role || "").trim(),
    title: (r.title || r.role || "").trim(), companyCode: (r.company || "").trim().toUpperCase(),
    reportsTo: (r.reportsTo || "").trim(), email: (r.email || "").trim().toLowerCase(), hc: !!r.hc,
  }));

  // validate required fields
  people.forEach((p, i) => {
    if (!p.name) issues.push({ level: "error", row: i + 1, msg: "Missing employee name" });
    if (!p.role) issues.push({ level: "error", row: i + 1, msg: `Missing role for ${p.name || "row " + (i + 1)}` });
    if (!p.companyCode || !D.CO_NAME[p.companyCode]) issues.push({ level: "error", row: i + 1, msg: `Unknown company code "${p.companyCode}" for ${p.name}` });
    if (p.grade && !D.GRADE_TIER[p.grade]) issues.push({ level: "warn", row: i + 1, msg: `Grade "${p.grade}" not in the ladder for ${p.name} — defaulted to tier 3` });
  });

  // assign ids (dedupe on name)
  const seen = {}, nameToId = {};
  people.forEach((p) => {
    const base = slug(p.name); let id = base;
    if (seen[base]) id = base + "." + (p.companyCode || "x").toLowerCase().replace(/[^a-z]/g, "");
    seen[base] = true; p.id = id; if (!nameToId[p.name]) nameToId[p.name] = id;
  });

  // auto-create referenced managers that are absent from the sheet
  const present = new Set(people.map((p) => p.name));
  const referenced = new Set(people.map((p) => p.reportsTo).filter(Boolean));
  referenced.forEach((mn) => {
    if (!present.has(mn)) {
      const id = slug(mn);
      issues.push({ level: "warn", msg: `Manager "${mn}" is referenced but not in the sheet — created a placeholder; complete their profile in Admin.` });
      const ph = { name: mn, grade: "Group Executive", role: "Manager (placeholder)", title: "Manager (placeholder)", companyCode: "GROUP", reportsTo: "", hc: false, id, placeholder: true };
      people.push(ph); present.add(mn); nameToId[mn] = id;
    }
  });

  const managerNames = new Set(people.map((p) => p.reportsTo).filter(Boolean));
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const users = people.map((p) => {
    const isMgr = managerNames.has(p.name);
    const roleType = p.hc ? "hc" : (/human resources/i.test(p.role) && D.scopeOf(p.role) === "Head") ? "hc" : isMgr ? "manager" : "employee";
    const tier = D.GRADE_TIER[p.grade] || 3;
    const managerId = p.reportsTo ? (nameToId[p.reportsTo] || null) : null;
    if (p.reportsTo && !managerId) issues.push({ level: "error", msg: `Reporting line for ${p.name} → "${p.reportsTo}" could not be resolved` });
    if (managerId === p.id) issues.push({ level: "error", msg: `${p.name} is set to report to themselves` });
    let email = p.email;
    if (email && !EMAIL_RE.test(email)) { issues.push({ level: "error", msg: `Invalid email "${email}" for ${p.name}` }); }
    if (!email) { email = slug(p.name) + "@" + (D.CO_DOMAIN[p.companyCode] || "pagegroup.com"); if (!p.placeholder) issues.push({ level: "warn", msg: `No email supplied for ${p.name} — derived a placeholder "${email}"; set the real address before go-live.` }); }
    return {
      id: p.id, name: p.name, email,
      companyCode: p.companyCode, company: D.CO_NAME[p.companyCode] || p.companyCode, role: p.role, title: p.title,
      grade: p.grade || "Deputy Manager", tier, dept: D.deptOf(p.role), scope: D.scopeOf(p.role),
      level: D.levelOf(p.grade, p.role, isMgr), roleType, managerId, placeholder: !!p.placeholder,
    };
  });

  // cycle detection in the manager graph
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  users.forEach((u) => {
    let cur = u, hops = 0;
    while (cur && cur.managerId && hops < 100) { cur = byId[cur.managerId]; hops++; if (cur && cur.id === u.id) { issues.push({ level: "error", msg: `Reporting loop detected involving ${u.name}` }); break; } }
  });

  // duplicate emails (login key must be unique)
  const emails = {};
  users.forEach((u) => { emails[u.email] = (emails[u.email] || 0) + 1; });
  Object.entries(emails).forEach(([e, n]) => { if (n > 1) issues.push({ level: "error", msg: `Duplicate work email ${e} used by ${n} people — each login email must be unique.` }); });

  return { users, issues };
}

// write users to DB and (re)create appraisals for a cycle. Returns { codes } for non-hc/non-top appraisees.
function applyDirectory(users, cycleId, actorId) {
  const codes = {};
  const upsert = db.prepare(`INSERT INTO employees
    (id,name,email,company_code,company,role,title,grade,tier,dept,scope,level,role_type,manager_id,code_hash,active)
    VALUES(@id,@name,@email,@companyCode,@company,@role,@title,@grade,@tier,@dept,@scope,@level,@roleType,@managerId,@codeHash,1)
    ON CONFLICT(id) DO UPDATE SET name=@name,email=@email,company_code=@companyCode,company=@company,role=@role,title=@title,
      grade=@grade,tier=@tier,dept=@dept,scope=@scope,level=@level,role_type=@roleType,manager_id=@managerId,active=1`);
  const existing = db.prepare("SELECT id,code_hash FROM employees WHERE id=?");

  const tx = db.transaction(() => {
    for (const u of users) {
      let codeHash = null;
      const cur = existing.get(u.id);
      if (cur && cur.code_hash) codeHash = cur.code_hash;      // keep existing code
      else if (u.roleType !== "top") { const code = ("" + (100000 + crypto.randomInt(900000))).slice(0, 6); codes[u.email] = { name: u.name, code }; codeHash = hashCode(code); }
      upsert.run({ ...u, codeHash });
    }
    // create appraisals for appraisees (has a manager, not hc placeholder/top)
    const insA = db.prepare(`INSERT INTO appraisals(cycle_id,employee_id,manager_id,department,grade,level,status,updated_at)
      VALUES(?,?,?,?,?,?, 'not_started', ?)
      ON CONFLICT(cycle_id,employee_id) DO NOTHING`);
    for (const u of users) {
      if (u.roleType === "hc") continue;
      if (!u.managerId) continue;         // top of house — not appraised here
      if (u.placeholder) continue;
      insA.run(cycleId, u.id, u.managerId, u.dept, u.grade, u.level, new Date().toISOString());
    }
  });
  tx();
  audit(actorId, "orgdata.apply", `cycle:${cycleId}`, { employees: users.length, newCodes: Object.keys(codes).length });
  return { codes };
}

module.exports = { slug, buildDirectory, applyDirectory };
