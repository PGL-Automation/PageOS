"use strict";
// Config-gated mailer. Inert (returns false) unless SMTP_* env vars are set,
// so the system falls back to the printed code sheet when email isn't configured.
let transport = null, configured = false;
try {
  const nodemailer = require("nodemailer");
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (SMTP_HOST && SMTP_PORT) {
    transport = nodemailer.createTransport({
      host: SMTP_HOST, port: Number(SMTP_PORT), secure: String(SMTP_SECURE) === "true",
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    configured = true;
  }
} catch (e) { configured = false; }

const isConfigured = () => configured;
const appUrl = () => process.env.APP_URL || "your Page Group Performance URL";
const from = () => process.env.SMTP_FROM || "Page Group Performance <no-reply@pagegroup.com>";

async function sendCode(to, name, code, opts = {}) {
  if (!configured) return false;
  const otp = !!opts.otp;
  const subject = otp ? "Your Page Group sign-in code" : "Your Page Group Performance access code";
  const body = `Hello ${name || ""},\n\n` +
    `Your ${otp ? "one-time sign-in code" : "access code"} is:  ${code}\n\n` +
    (otp ? "It expires in 20 minutes and can be used once." : "Keep this code private; it is your login to the appraisal system.") +
    `\n\nSign in at ${appUrl()} using your work email and this code.\n\n— Human Capital, Page Group`;
  try { await transport.sendMail({ from: from(), to, subject, text: body }); return true; }
  catch (e) { console.error("mail send failed:", e.message); return false; }
}

module.exports = { isConfigured, sendCode };
