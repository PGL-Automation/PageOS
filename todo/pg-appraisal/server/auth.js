"use strict";
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db, audit } = require("./db");

const SESSION_HOURS = 12;
const COOKIE = "pg_sid";

const hashCode = (code) => bcrypt.hashSync(String(code), 10);
const verifyCode = (code, hash) => { try { return bcrypt.compareSync(String(code), hash || ""); } catch { return false; } };

function createSession(employeeId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_HOURS * 3600 * 1000);
  db.prepare("INSERT INTO sessions(token,employee_id,created_at,expires_at) VALUES(?,?,?,?)")
    .run(token, employeeId, now.toISOString(), exp.toISOString());
  return { token, expires: exp };
}
function destroySession(token) { if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(token); }
function cleanupSessions() { db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString()); }

function userFromRequest(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  const s = db.prepare("SELECT * FROM sessions WHERE token=?").get(token);
  if (!s) return null;
  if (new Date(s.expires_at) < new Date()) { destroySession(token); return null; }
  const u = db.prepare("SELECT * FROM employees WHERE id=? AND active=1").get(s.employee_id);
  return u || null;
}

// attach req.user if a valid session exists
function attachUser(req, _res, next) { req.user = userFromRequest(req); next(); }

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role_type)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_HOURS * 3600 * 1000,
  path: "/",
});

module.exports = { COOKIE, hashCode, verifyCode, createSession, destroySession, cleanupSessions, attachUser, requireAuth, requireRole, cookieOpts, SESSION_HOURS, audit };
