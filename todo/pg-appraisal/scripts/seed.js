"use strict";
// Usage: node scripts/seed.js [roster.csv] [--period "H1 2026 ..."]
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { db, setSetting, getSetting, audit } = require("../server/db");
const OD = require("../server/orgdata");

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--")) || path.join(__dirname, "..", "roster.sample.csv");
const period = (args.find((a) => a.startsWith("--period=")) || "--period=H1 2026  ·  1 Jan – 30 Jun 2026").split("=").slice(1).join("=");

const raw = fs.readFileSync(csvPath);
const recs = parse(raw, { columns: true, skip_empty_lines: true, trim: true, bom: true });
const pick = (o, names) => { for (const n of names) for (const k of Object.keys(o)) if (k.toLowerCase().replace(/[^a-z]/g, "") === n) return o[k]; return ""; };
const rows = recs.map((o) => ({
  name: pick(o, ["employeename", "name"]), grade: pick(o, ["gradelevel", "grade"]),
  role: pick(o, ["role"]), title: pick(o, ["jobtitle", "title"]),
  reportsTo: pick(o, ["reportsto", "linemanager", "manager"]), company: pick(o, ["company", "subsidiary"]),
  email: pick(o, ["email", "workemail", "emailaddress"]),
})).filter((r) => r.name);

// participants referenced as managers but not in the appraisee list
rows.push({ name: "Adewale Bamiro", grade: "Senior Executive Consultant", role: "Head, Human Resources", title: "Head, Human Resources", reportsTo: "Remi Ogunsipe", company: "SHARED SERVICE", email: "adewale.bamiro@pagegroup.com", hc: true });
rows.push({ name: "Remi Ogunsipe", grade: "Group Executive", role: "Group Chief Executive", title: "Group Chief Executive", reportsTo: "", company: "SHARED SERVICE", email: "remi.ogunsipe@pagegroup.com" });

const { users, issues } = OD.buildDirectory(rows);
const errors = issues.filter((i) => i.level === "error");
if (errors.length) { console.error("VALIDATION ERRORS — not seeding:"); errors.forEach((e) => console.error("  -", e.msg)); process.exit(1); }
issues.filter((i) => i.level === "warn").forEach((w) => console.warn("warn:", w.msg));

// fresh cycle
const info = db.prepare("INSERT INTO cycles(name,period,status,created_at) VALUES(?,?, 'open', ?)").run("H1 2026", period, new Date().toISOString());
setSetting("current_cycle_id", info.lastInsertRowid);
const { codes } = OD.applyDirectory(users, info.lastInsertRowid, "seed");

// write code sheet (HC distributes these; NOT committed — see .gitignore)
const sheetPath = path.join(__dirname, "..", "data", "CODESHEET.txt");
const lines = ["PAGE GROUP APPRAISAL — ACCESS CODE SHEET (CONFIDENTIAL)", "Distribute each code privately to the named person. Do not commit this file.", ""];
Object.entries(codes).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([email, v]) => lines.push(`${v.name.padEnd(28)} ${email.padEnd(40)} ${v.code}`));
fs.writeFileSync(sheetPath, lines.join("\n"));

const counts = db.prepare("SELECT role_type, COUNT(*) n FROM employees GROUP BY role_type").all();
const nApp = db.prepare("SELECT COUNT(*) n FROM appraisals").get().n;
console.log(`Seeded cycle #${info.lastInsertRowid} (open).`);
console.log("Employees:", counts.map((c) => `${c.role_type}=${c.n}`).join(", "));
console.log("Appraisals created:", nApp);
console.log("Access codes written to:", sheetPath, `(${Object.keys(codes).length} codes)`);
