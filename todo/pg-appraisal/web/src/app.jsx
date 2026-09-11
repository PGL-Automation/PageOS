import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

const C = { navy: "#15243B", blue: "#F86000", blueDk: "#C94F00", bg: "#F6F7F9", line: "#E6E8EC", soft: "#FDECE0", slate: "#5A6472", ink: "#1F2933", good: "#0E8073", warn: "#A9690C", bad: "#B23A48", proc: "#8A5A2B", orange: "#F86000" };
const PORDER = ["Financial", "Client / Customer", "Internal Business Process", "Learning & Growth"];
const PC = { "Financial": "#1E5B97", "Client / Customer": "#0E8073", "Internal Business Process": "#574FB0", "Learning & Growth": "#A9690C" };
const STATUS = { not_started: ["Not started", C.slate], self_in_progress: ["Self-assessment in progress", C.warn], submitted_to_manager: ["With line manager", C.blue], manager_in_progress: ["Line-manager review", C.blue], submitted_to_hc: ["With Human Capital", C.proc], finalized: ["Finalised", C.good] };
const RAIL = ["Self-assessment", "Line manager", "Human Capital", "Complete"];
const ratingColor = (n) => ["#B23A48", "#C8702A", "#1E5B97", "#0E8073", "#0B6E4F"][n - 1] || C.slate;

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: "include", headers: opts.body ? { "Content-Type": "application/json" } : {}, ...opts });
  if (res.status === 204) return {};
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}
const initials = (n) => String(n || "").trim().split(/\s+/).map((s) => s[0] || "").slice(0, 2).join("").toUpperCase() || "?";

function Avatar({ name, c = C.navy, size = 36 }) { return <div style={{ width: size, height: size, borderRadius: 999, background: c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: size * 0.38, flex: "0 0 auto" }}>{initials(name)}</div>; }
function Badge({ s }) { const [l, c] = STATUS[s] || ["", C.slate]; return <span style={{ color: c, background: c + "1A", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{l}</span>; }
function Pill({ children }) { return <span style={{ fontSize: 11, fontWeight: 700, color: C.navy, background: "#EEF2F8", border: "1px solid " + C.line, borderRadius: 6, padding: "2px 6px" }}>{children}</span>; }
function Btn({ children, onClick, kind = "primary", disabled }) { const st = kind === "primary" ? { background: C.blue, color: "#fff", border: "none" } : kind === "ghost" ? { background: "#fff", color: C.navy, border: "1px solid " + C.line } : { background: "#fff", color: C.bad, border: "1px solid #E7C4C9" }; return <button onClick={onClick} disabled={disabled} style={{ ...st, borderRadius: 8, padding: "9px 14px", fontSize: 14, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1 }}>{children}</button>; }
function Card({ children, style }) { return <div style={{ background: "#fff", border: "1px solid " + C.line, borderRadius: 14, ...style }}>{children}</div>; }
function Rating({ value, onChange, disabled }) {
  return <div style={{ display: "flex", gap: 4 }}>{[1, 2, 3, 4, 5].map((n) => { const on = value === n; return <button key={n} disabled={disabled} onClick={() => onChange(n)} style={{ width: 30, height: 30, borderRadius: 6, fontWeight: 700, fontSize: 14, cursor: disabled ? "default" : "pointer", background: on ? ratingColor(n) : "#fff", color: on ? "#fff" : "#9AA8BC", border: "1px solid " + (on ? ratingColor(n) : C.line), opacity: disabled && !on ? 0.5 : 1 }}>{n}</button>; })}</div>;
}
function Rail({ status }) {
  const active = { not_started: 0, self_in_progress: 0, submitted_to_manager: 1, manager_in_progress: 1, submitted_to_hc: 2, finalized: 3 }[status];
  return <div style={{ display: "flex", alignItems: "center", width: "100%" }}>{RAIL.map((label, i) => { const done = i < active, here = i === active, col = done || here ? C.blue : "#C3CEDD"; return <React.Fragment key={label}><div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 74 }}><div style={{ width: 28, height: 28, borderRadius: 999, border: "2px solid " + col, background: done ? C.blue : "#fff", color: done ? "#fff" : col, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>{done ? "✓" : i + 1}</div><span style={{ marginTop: 5, fontSize: 11, fontWeight: here ? 700 : 500, color: here || done ? C.navy : C.slate, textAlign: "center" }}>{label}</span></div>{i < 3 && <div style={{ flex: 1, height: 2, margin: "0 4px 18px", background: i < active ? C.blue : "#D7DFEA" }} />}</React.Fragment>; })}</div>;
}
const wrap = { maxWidth: 960, margin: "0 auto", padding: "24px 20px" };

/* ---------------- Login ---------------- */
function Login({ onIn }) {
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(""); const [emailEnabled, setEmailEnabled] = useState(false); const [loginMode, setLoginMode] = useState("both");
  useEffect(() => { api("/api/config").then((r) => { setEmailEnabled(!!r.emailEnabled); setLoginMode(r.loginMode || "both"); }).catch(() => {}); }, []);
  const otpOnly = loginMode === "otp";
  async function submit() { setErr(""); setNotice(""); setBusy(true); try { const r = await api("/api/login", { method: "POST", body: JSON.stringify({ email, code }) }); onIn(r); } catch (e) { setErr(e.message); } finally { setBusy(false); } }
  async function requestCode() { setErr(""); setNotice(""); if (!email) { setErr("Enter your work email first."); return; } try { const r = await api("/api/request-code", { method: "POST", body: JSON.stringify({ email }) }); setNotice(r.delivery === "email" ? "If that email is registered, a one-time sign-in code is on its way (expires in 20 minutes)." : "Email delivery isn't set up yet — ask Human Capital for your access code."); } catch (e) { setErr(e.message); } }
  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <div style={{ width: 380, background: "linear-gradient(160deg, #F86000 0%, #C94F00 100%)", color: "#fff", padding: 40, display: "flex", flexDirection: "column", justifyContent: "space-between" }} className="hide-sm">
        <div>
          <img src="/logo.png" alt="Page" style={{ height: 46, filter: "brightness(0) invert(1)" }} />
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 10, fontWeight: 600, letterSpacing: 0.4 }}>PERFORMANCE</div>
          <h1 style={{ marginTop: 42, fontSize: 30, lineHeight: 1.15 }}>Your appraisal.<br />Yours alone.</h1>
          <p style={{ color: "rgba(255,255,255,0.9)", fontSize: 14, lineHeight: 1.5 }}>{otpOnly ? "Enter your work email and we'll send a one-time sign-in code. Access is enforced on the server — you only ever see your own appraisal." : "Sign in with your work email and access code. Access is enforced on the server — you only ever see your own appraisal."}</p>
        </div>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Standalone · secured</div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <img src="/logo.png" alt="Page" style={{ height: 34, marginBottom: 14 }} />
          <h2 style={{ color: C.ink, marginBottom: 4 }}>Sign in</h2>
          <p style={{ color: C.slate, fontSize: 14, marginTop: 0 }}>{otpOnly ? "Enter your work email, get a one-time code, then sign in." : "Enter your work email and access code."}</p>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Work email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="firstname.lastname@…" style={inp} onKeyDown={(e) => e.key === "Enter" && (otpOnly ? requestCode() : submit())} />
          {otpOnly && <div style={{ marginBottom: 14, marginTop: -6 }}><Btn kind="ghost" onClick={requestCode} disabled={!email}>Email me a sign-in code</Btn></div>}
          <label style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>{otpOnly ? "Sign-in code (from email)" : "Access code"}</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} type="password" inputMode="numeric" placeholder="••••••" style={inp} onKeyDown={(e) => e.key === "Enter" && submit()} />
          {err && <div style={{ color: C.bad, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{err}</div>}
          <Btn onClick={submit} disabled={busy || !email || !code}>{busy ? "Signing in…" : "Sign in"}</Btn>
          {!otpOnly && <div style={{ marginTop: 12 }}>
            <button onClick={requestCode} style={{ background: "none", border: "none", color: C.blue, fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 13 }}>Email me a sign-in code</button>
            {!emailEnabled && <span style={{ fontSize: 12, color: C.slate, marginLeft: 8 }}>(email not yet configured)</span>}
          </div>}
          {otpOnly && !emailEnabled && <div style={{ marginTop: 8, color: C.warn, fontSize: 13 }}>Email isn't configured yet — ask Human Capital.</div>}
          {notice && <div style={{ marginTop: 8, color: C.good, fontSize: 13 }}>{notice}</div>}
        </div>
      </div>
    </div>
  );
}
const inp = { width: "100%", padding: "10px 12px", border: "1px solid " + C.line, borderRadius: 8, fontSize: 14, margin: "6px 0 14px", outline: "none" };

/* ---------------- Top bar ---------------- */
function TopBar({ user, cycle, onOut }) {
  return <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid " + C.line, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><img src="/logo.png" alt="Page" style={{ height: 26 }} /><div><div style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>Performance</div><div style={{ fontSize: 12, color: C.slate }}>{cycle ? cycle.period + (cycle.status !== "open" ? "  ·  " + cycle.status.toUpperCase() : "") : "No open cycle"}</div></div></div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ textAlign: "right" }}><div style={{ fontWeight: 700, fontSize: 14 }}>{user.name}</div><div style={{ fontSize: 12, color: C.slate }}>{user.roleType === "hc" ? "Human Capital · Group" : user.title + " · " + user.company}</div></div>
      <Avatar name={user.name} c={user.roleType === "hc" ? C.proc : user.roleType === "manager" ? C.blueDk : C.navy} size={34} />
      <button onClick={onOut} style={{ border: "1px solid " + C.line, background: "#fff", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: C.slate }}>Sign out</button>
    </div>
  </div>;
}

/* ---------------- Appraisal screen ---------------- */
function AppraisalScreen({ id, me, onBack }) {
  const [a, setA] = useState(null); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [self, setSelf] = useState({}); const [agreed, setAgreed] = useState({});
  const [empC, setEmpC] = useState(""); const [mgrC, setMgrC] = useState(""); const [dev, setDev] = useState(""); const [hcC, setHcC] = useState("");
  useEffect(() => { load(); }, [id]);
  async function load() { try { const r = await api("/api/appraisals/" + id); const x = r.appraisal; setA(x); setSelf(x.self || {}); setAgreed(x.agreed || {}); setEmpC(x.employeeComments || ""); setMgrC(x.managerComments || ""); setDev(x.developmentPlan || ""); setHcC(x.hcComments || ""); } catch (e) { setErr(e.message); } }
  async function act(action) { setMsg(""); setErr(""); try { const r = await api("/api/appraisals/" + id + "/action", { method: "POST", body: JSON.stringify({ action, self, agreed, employeeComments: empC, managerComments: mgrC, developmentPlan: dev, hcComments: hcC }) }); const x = r.appraisal; setA(x); setSelf(x.self); setAgreed(x.agreed); if (["submit-self", "submit-manager", "finalize", "return-to-employee", "return-to-manager"].includes(action)) { onBack(); } else setMsg("Saved."); } catch (e) { setErr(e.message); } }
  if (err) return <div style={wrap}><Btn kind="ghost" onClick={onBack}>← Back</Btn><p style={{ color: C.bad }}>{err}</p></div>;
  if (!a) return <div style={wrap}>Loading…</div>;
  const byP = {}; a.scorecard.forEach((k) => { (byP[k.p] = byP[k.p] || []).push(k); });
  const bandColor = { "Outstanding": C.good, "Exceeds Expectations": C.blue, "Meets Expectations": C.proc, "Needs Improvement": C.warn, "Unsatisfactory": C.bad }[a.band] || C.slate;
  return (
    <div>
      <div style={{ position: "sticky", top: 55, zIndex: 5, background: C.bg, borderBottom: "1px solid " + C.line, padding: "8px 20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.navy, fontWeight: 700, cursor: "pointer" }}>← Back</button>
        <span style={{ color: C.slate, fontSize: 14, marginLeft: 10 }}>{a.employeeName} · {a.company} · {a.department}</span>
      </div>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 20px 110px" }}>
        <Card style={{ overflow: "hidden", marginBottom: 18 }}>
          <div style={{ padding: 16, borderBottom: "1px solid " + C.line, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}><Avatar name={a.employeeName} size={42} /><div><div style={{ fontWeight: 800 }}>{a.employeeName}</div><div style={{ fontSize: 12, color: C.slate, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{a.role} · Appraiser {a.managerName || "—"} <Pill>{a.grade} · {a.levelLabel}</Pill></div></div></div>
            <Badge s={a.status} />
          </div>
          <div style={{ padding: "20px 24px" }}><Rail status={a.status} /></div>
          <div style={{ padding: "0 16px 16px", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Metric label="Self-score" value={a.selfScore} />
            <Metric label={a.status === "finalized" ? "Final score" : "Agreed score"} value={a.agreedScore} />
            <div style={{ flex: 1, minWidth: 200, borderRadius: 12, padding: "10px 16px", background: a.selfScore || a.agreedScore ? bandColor : "#fff", border: "1px solid " + ((a.selfScore || a.agreedScore) ? bandColor : C.line) }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: (a.selfScore || a.agreedScore) ? "rgba(255,255,255,.85)" : C.slate }}>Overall outcome</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: (a.selfScore || a.agreedScore) ? "#fff" : C.ink }}>{(a.agreedScore || a.selfScore) ? a.band : "In progress"}</div>
            </div>
          </div>
        </Card>
        {PORDER.filter((p) => byP[p]).map((p) => (
          <Card key={p} style={{ overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "10px 16px", background: PC[p] + "18", display: "flex", justifyContent: "space-between" }}><b style={{ color: PC[p] }}>{p}</b><span style={{ color: PC[p], fontWeight: 700 }}>{a.perspectiveWeights[p]}%</span></div>
            {byP[p].map((k, idx) => (
              <div key={k.id} style={{ padding: "12px 16px", borderTop: idx ? "1px solid " + C.line : "none", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 220 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{k.obj}</div><div style={{ fontSize: 12, color: C.slate }}>{k.meas} · weight {k.w}%{k.target ? <span style={{ color: C.blue, fontWeight: 700 }}> · target: {k.target}</span> : ""}</div></div>
                <div style={{ display: "flex", gap: 18 }}>
                  <div><div style={{ fontSize: 11, fontWeight: 700, color: C.slate, marginBottom: 4 }}>Self</div><Rating value={self[k.id]} disabled={!a.canEditSelf} onChange={(v) => setSelf({ ...self, [k.id]: v })} /></div>
                  {(a.stage >= 1 || a.canEditManager) && <div><div style={{ fontSize: 11, fontWeight: 700, color: a.canEditManager ? PC[p] : C.slate, marginBottom: 4 }}>Agreed</div><Rating value={agreed[k.id]} disabled={!a.canEditManager} onChange={(v) => setAgreed({ ...agreed, [k.id]: v })} /></div>}
                </div>
              </div>
            ))}
          </Card>
        ))}
        <Card style={{ padding: 16, marginBottom: 14 }}>
          <Field label="Employee — achievements & strengths" value={empC} onChange={setEmpC} editable={a.canEditSelf} />
          <Field label="Line-manager comments" value={mgrC} onChange={setMgrC} editable={a.canEditManager} />
          <Field label="Development plan" value={dev} onChange={setDev} editable={a.canEditSelf || a.canEditManager} />
          {(a.canFinalize || a.status === "finalized" || me.roleType === "hc") && <Field label="Human Capital note" value={hcC} onChange={setHcC} editable={a.canFinalize} />}
        </Card>
        {msg && <div style={{ color: C.good, fontWeight: 600 }}>{msg}</div>}
        {err && <div style={{ color: C.bad, fontWeight: 600 }}>{err}</div>}
      </div>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid " + C.line, padding: "10px 20px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {a.canEditSelf && <><Btn kind="ghost" onClick={() => act("save-self")}>Save draft</Btn><Btn onClick={() => act("submit-self")}>Submit to line manager</Btn></>}
          {a.canEditManager && <><Btn kind="ghost" onClick={() => setAgreed({ ...self, ...agreed })}>Adopt self-ratings</Btn><Btn kind="ghost" onClick={() => act("save-manager")}>Save</Btn><Btn kind="danger" onClick={() => act("return-to-employee")}>Return</Btn><Btn onClick={() => act("submit-manager")}>Submit to Human Capital</Btn></>}
          {a.canFinalize && <><Btn kind="danger" onClick={() => act("return-to-manager")}>Return to manager</Btn><Btn onClick={() => act("finalize")}>Finalise</Btn></>}
        </div>
      </div>
    </div>
  );
}
function Metric({ label, value }) { return <div style={{ borderRadius: 12, padding: "10px 16px", background: "#fff", border: "1px solid " + C.line, minWidth: 120 }}><div style={{ fontSize: 12, fontWeight: 600, color: C.slate }}>{label}</div><div style={{ fontSize: 24, fontWeight: 800, color: C.ink }}>{value ? value.toFixed(2) : "—"}<span style={{ fontSize: 12, color: C.slate, fontWeight: 500 }}> / 5</span></div></div>; }
function Field({ label, value, onChange, editable }) { return <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>{editable ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={{ width: "100%", border: "1px solid " + C.line, borderRadius: 8, padding: 10, fontSize: 14, resize: "vertical" }} /> : <div style={{ background: C.bg, border: "1px solid " + C.line, borderRadius: 8, padding: 10, fontSize: 14, color: value ? C.ink : "#A8B4C6", minHeight: 40, whiteSpace: "pre-wrap" }}>{value || "—"}</div>}</div>; }

/* ---------------- Row ---------------- */
function Row({ r, onOpen, right }) {
  const nm = r.name || r.employeeName || "";
  const score = r.agreedScore || r.selfScore, bc = { "Outstanding": C.good, "Exceeds Expectations": C.blue, "Meets Expectations": C.proc, "Needs Improvement": C.warn, "Unsatisfactory": C.bad }[r.band] || "#C3CEDD";
  return <button onClick={onOpen} style={{ width: "100%", textAlign: "left", background: "#fff", border: "1px solid " + C.line, borderRadius: 12, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", cursor: "pointer", marginBottom: 8 }}>
    <Avatar name={nm} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{nm}</div><div style={{ fontSize: 12, color: C.slate, marginBottom: 3 }}>{r.role} · {r.company} · {r.department}</div><Pill>{r.grade} · {r.levelLabel}</Pill></div>
    <Badge s={r.status} /><div style={{ textAlign: "right", minWidth: 54 }}><div style={{ fontWeight: 800, color: score ? bc : "#C3CEDD" }}>{score ? score.toFixed(2) : "—"}</div><div style={{ fontSize: 11, color: C.slate }}>{right || (r.agreedScore ? "final" : r.selfScore ? "self" : "")}</div></div>
  </button>;
}

/* ---------------- Home views ---------------- */
function EmployeeHome({ me, onOpen }) {
  const [a, setA] = useState(undefined); const [open, setOpen] = useState(true);
  useEffect(() => { api("/api/my/appraisal").then((r) => { setA(r.appraisal); setOpen(r.cycleOpen); }).catch(() => setA(null)); }, []);
  if (a === undefined) return <div style={wrap}>Loading…</div>;
  return <div style={wrap}><h2>Good to see you, {me.name.split(" ")[0]}.</h2><p style={{ color: C.slate, marginTop: -6 }}>{me.role} · {me.company}</p>
    {!a ? <Card style={{ padding: 20, color: C.slate }}>{open ? "No appraisal is assigned to you for this cycle." : "The review cycle is not open yet."}</Card>
      : <div>{a && <Row r={a} onOpen={() => onOpen(a.id)} right={a.status === "not_started" || a.status === "self_in_progress" ? "open" : ""} />}</div>}</div>;
}
function ManagerHome({ me, onOpen }) {
  const [d, setD] = useState(null);
  useEffect(() => { api("/api/team").then(setD).catch(() => setD({ reports: [], own: null })); }, []);
  if (!d) return <div style={wrap}>Loading…</div>;
  const awaiting = d.reports.filter((r) => ["submitted_to_manager", "manager_in_progress"].includes(r.status));
  return <div style={wrap}><h2>Your team, {me.name.split(" ")[0]}.</h2><p style={{ color: C.slate, marginTop: -6 }}>{me.company} · {d.reports.length} report(s) · {awaiting.length} awaiting you</p>
    {d.own && <><div style={sub}>Your appraisal</div><Row r={d.own} onOpen={() => onOpen(d.own.id)} /></>}
    {awaiting.length > 0 && <><div style={{ ...sub, color: C.blue }}>Awaiting you</div>{awaiting.map((r) => <Row key={r.id} r={r} onOpen={() => onOpen(r.id)} right="review" />)}</>}
    <div style={sub}>All direct reports</div>{d.reports.map((r) => <Row key={r.id} r={r} onOpen={() => onOpen(r.id)} />)}
    {d.reports.length === 0 && <Card style={{ padding: 16, color: C.slate }}>No direct reports mapped to you.</Card>}
  </div>;
}
function TargetTeam({ me }) {
  const [d, setD] = useState(null); const [emp, setEmp] = useState(null);
  function reload() { api("/api/my/target-team").then(setD).catch(() => setD({ reports: [] })); }
  useEffect(() => { reload(); }, []);
  if (!d) return <div style={wrap}>Loading…</div>;
  if (emp) return <TargetScreen empId={emp} onBack={() => { setEmp(null); reload(); }} />;
  const done = d.reports.filter((r) => r.targetsSet).length;
  return <div style={wrap}><h2>Set H2 targets</h2>
    <p style={{ color: C.slate, marginTop: -6 }}>{d.period || ""} · target-setting {d.open ? "open" : "(not open)"} · {done}/{d.reports.length} done</p>
    {d.reports.map((r) => <button key={r.id} onClick={() => setEmp(r.id)} style={{ width: "100%", textAlign: "left", background: "#fff", border: "1px solid " + C.line, borderRadius: 12, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", cursor: "pointer", marginBottom: 8 }}>
      <Avatar name={r.name} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div><div style={{ fontSize: 12, color: C.slate }}>{r.role} · {r.company}</div></div>
      <span style={{ color: r.targetsSet ? C.good : C.warn, background: (r.targetsSet ? C.good : C.warn) + "1A", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{r.targetsSet ? "Targets set" : "Set targets"}</span>
    </button>)}
    {d.reports.length === 0 && <Card style={{ padding: 16, color: C.slate }}>No direct reports mapped to you.</Card>}
  </div>;
}
function TargetScreen({ empId, onBack }) {
  const [d, setD] = useState(null); const [kpis, setKpis] = useState([]); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { api("/api/targets/" + empId).then((r) => { setD(r); setKpis(r.kpis.map((k) => ({ ...k }))); }).catch((e) => setErr(e.message)); }, [empId]);
  if (!d) return <div style={wrap}>{err ? <span style={{ color: C.bad }}>{err}</span> : "Loading…"}</div>;
  const total = kpis.reduce((s, k) => s + (parseInt(k.w) || 0), 0);
  const upd = (idx, f, v) => setKpis(kpis.map((k, j) => j === idx ? { ...k, [f]: v } : k));
  const addObj = (p) => setKpis([...kpis, { id: "new" + Date.now(), p, obj: "", meas: "", w: 0, target: "", source: "individual" }]);
  const removeObj = (idx) => setKpis(kpis.filter((_, j) => j !== idx));
  async function save() { setErr(""); setMsg(""); try { const r = await api("/api/targets/" + empId, { method: "POST", body: JSON.stringify({ kpis: kpis.map((k) => ({ perspective: k.p, objective: k.obj, measure: k.meas, weight: parseInt(k.w) || 0, target: k.target, source: k.source })) }) }); setKpis(r.kpis.map((k) => ({ ...k }))); setMsg("Targets saved."); } catch (e) { setErr(e.message); } }
  return <div style={wrap}>
    <button onClick={onBack} style={{ background: "none", border: "none", color: C.navy, fontWeight: 700, cursor: "pointer", padding: 0 }}>← Back to team</button>
    <h2 style={{ marginBottom: 2 }}>{d.employee.name}</h2>
    <p style={{ color: C.slate, marginTop: 0 }}>{d.employee.role} · {d.employee.dept} · {d.cycle.period || d.cycle.name}</p>
    {d.locked && <div style={{ color: C.warn, fontWeight: 600, marginBottom: 8 }}>Target-setting isn't open — read only.</div>}
    {PORDER.map((p) => { const rows = kpis.map((k, i) => ({ k, i })).filter((x) => x.k.p === p); const pt = kpis.filter((k) => k.p === p).reduce((s, k) => s + (parseInt(k.w) || 0), 0);
      return <Card key={p} style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><b style={{ color: PC[p] }}>{p}</b><span style={{ color: PC[p], fontWeight: 700 }}>{pt}%</span></div>
        {rows.map(({ k, i }) => <div key={k.id} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input value={k.obj} disabled={d.locked} onChange={(e) => upd(i, "obj", e.target.value)} placeholder="Objective" style={{ ...inp, margin: 0, flex: 2, minWidth: 150 }} />
          <input value={k.meas} disabled={d.locked} onChange={(e) => upd(i, "meas", e.target.value)} placeholder="Measure" style={{ ...inp, margin: 0, flex: 1, minWidth: 120 }} />
          <input value={k.target} disabled={d.locked} onChange={(e) => upd(i, "target", e.target.value)} placeholder="Target" style={{ ...inp, margin: 0, flex: 1, minWidth: 110 }} />
          <input value={k.w} disabled={d.locked} onChange={(e) => upd(i, "w", e.target.value.replace(/\D/g, ""))} style={{ ...inp, margin: 0, width: 50 }} /><span style={{ color: C.slate }}>%</span>
          {k.source === "individual" && !d.locked && <button onClick={() => removeObj(i)} title="Remove" style={{ border: "none", background: "none", color: C.bad, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>}
        </div>)}
        {!d.locked && <button onClick={() => addObj(p)} style={{ border: "1px dashed " + C.line, background: "#fff", color: C.blue, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>+ Add objective</button>}
      </Card>; })}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
      <span style={{ fontWeight: 800, color: total === 100 ? C.good : C.bad }}>Total: {total}%{total === 100 ? " ✓" : " — must equal 100%"}</span>
      <Btn onClick={save} disabled={d.locked || total !== 100}>Save targets</Btn>
    </div>
    {msg && <div style={{ color: C.good, marginTop: 8 }}>{msg}</div>}
    {err && <div style={{ color: C.bad, marginTop: 8 }}>{err}</div>}
  </div>;
}
const sub = { fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: C.slate, letterSpacing: .3, margin: "16px 0 8px" };

function HCHome({ me, cycle, onOpen, refreshMe }) {
  const [tab, setTab] = useState("appraisals");
  return <div style={wrap}>
    <h2>Human Capital · Group</h2>
    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
      {[["appraisals", "Appraisals"], ["employees", "Employees"], ["scorecards", "Scorecards"], ["org", "Org data"], ["cycle", "Cycle"], ["audit", "Audit"]].map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid " + C.line, background: tab === k ? C.navy : "#fff", color: tab === k ? "#fff" : C.ink, fontWeight: 600, cursor: "pointer" }}>{l}</button>)}
    </div>
    {tab === "appraisals" && <HCList onOpen={onOpen} />}
    {tab === "employees" && <HCEmployees />}
    {tab === "scorecards" && <HCScorecards />}
    {tab === "org" && <HCOrg />}
    {tab === "cycle" && <HCCycle cycle={cycle} refreshMe={refreshMe} />}
    {tab === "audit" && <HCAudit />}
  </div>;
}
function HCList({ onOpen }) {
  const [rows, setRows] = useState(null); const [f, setF] = useState({ company: "all", dept: "all", grade: "all", status: "all" });
  useEffect(() => { api("/api/hc/appraisals").then((r) => setRows(r.rows)).catch(() => setRows([])); }, []);
  if (!rows) return <div>Loading…</div>;
  const uniq = (k) => ["all", ...Array.from(new Set(rows.map((r) => r[k])))];
  const shown = rows.filter((r) => (f.company === "all" || r.company === f.company) && (f.dept === "all" || r.department === f.dept) && (f.grade === "all" || r.grade === f.grade) && (f.status === "all" || r.status === f.status));
  const finals = shown.map((r) => r.agreedScore).filter(Boolean); const avg = finals.length ? (finals.reduce((a, b) => a + b, 0) / finals.length).toFixed(2) : "—";
  const Sel = (key, label, opts) => <label style={{ fontSize: 11, fontWeight: 700, color: C.slate, display: "flex", flexDirection: "column", gap: 3 }}>{label}<select value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} style={{ padding: "7px 8px", border: "1px solid " + C.line, borderRadius: 8 }}>{opts.map((o) => <option key={o} value={o}>{o === "all" ? "All" : o}</option>)}</select></label>;
  return <div>
    <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      {Sel("company", "Company", uniq("company"))}{Sel("dept", "Department", uniq("department"))}{Sel("grade", "Grade", uniq("grade"))}{Sel("status", "Status", uniq("status"))}
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 13, color: C.slate }}>{shown.length} shown · avg {avg}</span><a href="/api/hc/export.csv" style={{ textDecoration: "none" }}><Btn kind="ghost">Export CSV</Btn></a></div>
    </div>
    {shown.map((r) => <Row key={r.id} r={r} onOpen={() => onOpen(r.id)} />)}
    {shown.length === 0 && <Card style={{ padding: 16, color: C.slate }}>No appraisals match.</Card>}
  </div>;
}
const tabBtn = (on) => ({ padding: "6px 10px", borderRadius: 8, border: "1px solid " + C.line, background: on ? C.blue : "#fff", color: on ? "#fff" : C.ink, fontWeight: 600, cursor: "pointer", fontSize: 13 });
function HCScorecards() {
  const [list, setList] = useState(null); const [dept, setDept] = useState(null);
  function reload() { api("/api/hc/scorecards").then(setList).catch(() => setList({ departments: [], locked: false })); }
  useEffect(() => { reload(); }, []);
  if (!list) return <div>Loading…</div>;
  if (dept) return <ScorecardDetail dept={dept} onBack={() => { setDept(null); reload(); }} />;
  return <Card style={{ padding: 16 }}>
    <b>Scorecards</b>
    <p style={{ color: C.slate, fontSize: 14 }}>Edit objectives, measures and weights per department, and set targets per role &amp; grade. {list.locked && <span style={{ color: C.warn, fontWeight: 700 }}>A cycle is open — objectives/weights are locked; targets stay editable.</span>}</p>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {list.departments.map((d) => { const ok = d.total === 100; return <button key={d.department} onClick={() => setDept(d.department)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid " + C.line, borderRadius: 10, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontWeight: 600 }}>{d.department}</span><span style={{ fontSize: 13, fontWeight: 700, color: ok ? C.good : C.bad }}>{d.total}%{ok ? "" : " ⚠"}</span>
      </button>; })}
    </div>
  </Card>;
}
function ScorecardDetail({ dept, onBack }) {
  const [d, setD] = useState(null); const [mode, setMode] = useState("kpis"); const [kpis, setKpis] = useState([]); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { api("/api/hc/scorecard/" + encodeURIComponent(dept)).then((r) => { setD(r); setKpis(r.kpis.map((k) => ({ ...k }))); }).catch((e) => setErr(e.message)); }, [dept]);
  if (!d) return <div>Loading…</div>;
  const total = kpis.reduce((s, k) => s + (parseInt(k.w) || 0), 0);
  const upd = (i, f, v) => setKpis(kpis.map((k, j) => j === i ? { ...k, [f]: v } : k));
  async function save() { setErr(""); setMsg(""); try { const r = await api("/api/hc/scorecard/" + encodeURIComponent(dept) + "/kpis", { method: "POST", body: JSON.stringify({ kpis: kpis.map((k) => ({ perspective: k.p, seq: k.seq, objective: k.obj, measure: k.meas, weight: parseInt(k.w) || 0 })) }) }); setKpis(r.kpis.map((k) => ({ ...k }))); setMsg("Saved."); } catch (e) { setErr(e.message); } }
  return <Card style={{ padding: 16 }}>
    <button onClick={onBack} style={{ background: "none", border: "none", color: C.navy, fontWeight: 700, cursor: "pointer", padding: 0 }}>← All departments</button>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
      <b style={{ fontSize: 16 }}>{dept}</b>
      <div style={{ display: "flex", gap: 6 }}><button onClick={() => setMode("kpis")} style={tabBtn(mode === "kpis")}>Objectives &amp; weights</button><button onClick={() => setMode("targets")} style={tabBtn(mode === "targets")}>Targets by role &amp; grade</button></div>
    </div>
    {mode === "kpis" ? <div style={{ marginTop: 12 }}>
      {d.locked && <div style={{ color: C.warn, fontSize: 13, marginBottom: 8, fontWeight: 600 }}>Cycle is open — objectives and weights are read-only. Close the cycle to edit them.</div>}
      {PORDER.map((p) => { const rows = kpis.map((k, i) => ({ k, i })).filter((x) => x.k.p === p); if (!rows.length) return null;
        const pt = kpis.filter((k) => k.p === p).reduce((s, k) => s + (parseInt(k.w) || 0), 0);
        return <div key={p} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: PC[p], textTransform: "uppercase", marginBottom: 4 }}>{p} — {pt}%</div>
          {rows.map(({ k, i }) => <div key={k.id} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input value={k.obj} disabled={d.locked} onChange={(e) => upd(i, "obj", e.target.value)} placeholder="Objective" style={{ ...inp, margin: 0, flex: 2, minWidth: 180 }} />
            <input value={k.meas} disabled={d.locked} onChange={(e) => upd(i, "meas", e.target.value)} placeholder="Measure" style={{ ...inp, margin: 0, flex: 2, minWidth: 150 }} />
            <input value={k.w} disabled={d.locked} onChange={(e) => upd(i, "w", e.target.value.replace(/\D/g, ""))} style={{ ...inp, margin: 0, width: 56 }} /><span style={{ color: C.slate }}>%</span>
          </div>)}
        </div>; })}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 800, color: total === 100 ? C.good : C.bad }}>Total: {total}%{total === 100 ? " ✓" : " — must equal 100%"}</span>
        <Btn onClick={save} disabled={d.locked || total !== 100}>Save objectives</Btn>
      </div>
    </div> : <TargetsEditor dept={dept} d={d} />}
    {msg && <div style={{ color: C.good, marginTop: 8 }}>{msg}</div>}
    {err && <div style={{ color: C.bad, marginTop: 8 }}>{err}</div>}
  </Card>;
}
function TargetsEditor({ dept, d }) {
  const rgs = d.roleGrades || [];
  const [sel, setSel] = useState(rgs.length ? rgs[0].role + "||" + rgs[0].grade : "");
  const [targets, setTargets] = useState({}); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [role, grade] = sel ? sel.split("||") : ["", ""];
  useEffect(() => { if (sel) api("/api/hc/scorecard/" + encodeURIComponent(dept) + "/targets?role=" + encodeURIComponent(role) + "&grade=" + encodeURIComponent(grade)).then((r) => setTargets(r.targets || {})).catch(() => setTargets({})); }, [sel]);
  async function save() { setErr(""); setMsg(""); try { await api("/api/hc/scorecard/" + encodeURIComponent(dept) + "/targets", { method: "POST", body: JSON.stringify({ role, grade, targets }) }); setMsg("Targets saved."); } catch (e) { setErr(e.message); } }
  if (!rgs.length) return <div style={{ marginTop: 12, color: C.slate }}>No people are mapped to this department yet, so there are no role &amp; grade combinations to target.</div>;
  return <div style={{ marginTop: 12 }}>
    <label style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Role &amp; grade</label>
    <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ ...inp, maxWidth: 460 }}>{rgs.map((rg) => <option key={rg.role + "||" + rg.grade} value={rg.role + "||" + rg.grade}>{rg.role} · {rg.grade}</option>)}</select>
    <div style={{ marginTop: 6 }}>{d.kpis.map((k) => <div key={k.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{k.obj}</div><div style={{ fontSize: 11, color: C.slate }}>{k.meas} · {k.w}%</div></div>
      <input value={targets[k.id] || ""} onChange={(e) => setTargets({ ...targets, [k.id]: e.target.value })} placeholder="Target" style={{ ...inp, margin: 0, width: 200 }} />
    </div>)}</div>
    <Btn onClick={save}>Save targets</Btn>
    {msg && <div style={{ color: C.good, marginTop: 8 }}>{msg}</div>}
    {err && <div style={{ color: C.bad, marginTop: 8 }}>{err}</div>}
  </div>;
}
function HCOrg() {
  const [file, setFile] = useState(null); const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [codes, setCodes] = useState(null);
  async function send(url, set) { if (!file) return; setBusy(true); setErr(""); const fd = new FormData(); fd.append("file", file); try { const r = await fetch(url, { method: "POST", credentials: "include", body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Error"); set(j); } catch (e) { setErr(e.message); } finally { setBusy(false); } }
  return <Card style={{ padding: 18 }}>
    <b>Org-data import</b>
    <p style={{ color: C.slate, fontSize: 14 }}>Upload the roster as <b>CSV or Excel (.xlsx)</b> with columns: Employee Name, Grade Level, Role, Job Title, Reports To, COMPANY, Email. Email is each person's login; if a row has no email a placeholder is derived and flagged. Validate first, then apply — applying (re)loads employees, updates emails and reporting lines, and creates appraisals for the current cycle.</p>
    <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { setFile(e.target.files[0]); setRes(null); setCodes(null); }} />
    <div style={{ fontSize: 12, color: C.slate, marginTop: 6 }}>{file ? "Selected: " + file.name : "No file selected. If your file looks greyed out, choose “All files” in the picker."}</div>
    <div style={{ display: "flex", gap: 10, marginTop: 12 }}><Btn kind="ghost" disabled={!file || busy} onClick={() => send("/api/hc/orgdata/validate", setRes)}>Validate</Btn><Btn disabled={!file || busy} onClick={() => send("/api/hc/orgdata/apply", setCodes)}>Apply</Btn></div>
    {err && <div style={{ color: C.bad, marginTop: 10 }}>{err}</div>}
    {res && <div style={{ marginTop: 12, fontSize: 14 }}><div>{res.count} people parsed.</div>{res.errors.length > 0 && <ul style={{ color: C.bad }}>{res.errors.map((e, i) => <li key={i}>{e.msg}</li>)}</ul>}{res.warnings.length > 0 && <ul style={{ color: C.warn }}>{res.warnings.map((e, i) => <li key={i}>{e.msg}</li>)}</ul>}{res.errors.length === 0 && <div style={{ color: C.good }}>No blocking errors — ready to apply.</div>}</div>}
    {codes && <div style={{ marginTop: 12, color: C.good }}>Applied {codes.applied} people · issued {codes.newCodes} new access code(s). Distribute codes privately (server code sheet).</div>}
  </Card>;
}
function HCCycle({ cycle, refreshMe }) {
  const [busy, setBusy] = useState(false); const [nm, setNm] = useState(""); const [pd, setPd] = useState(""); const [prog, setProg] = useState(null); const [gen, setGen] = useState("");
  async function post(url, body) { setBusy(true); try { await api(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }); await refreshMe(); } finally { setBusy(false); } }
  async function generate() { setBusy(true); setGen(""); try { const r = await api("/api/hc/cycle/generate-appraisals", { method: "POST" }); setGen(`Created ${r.created} new appraisal(s); ${r.existing} already existed (${r.total} appraisees).`); } catch (e) { setGen(e.message); } finally { setBusy(false); } }
  useEffect(() => { if (cycle && cycle.phase === "target") api("/api/hc/targets-progress").then(setProg).catch(() => {}); }, [cycle && cycle.phase, cycle && cycle.status]);
  const phase = cycle && (cycle.phase || "appraisal");
  return <Card style={{ padding: 18 }}>
    <b>Review cycle</b>
    <p style={{ color: C.slate, fontSize: 14 }}>{cycle ? <>Current: <b>{cycle.name}</b> — {cycle.period || "no period set"} — status <b>{cycle.status}</b> — phase <b>{phase === "target" ? "target-setting" : "appraisal"}</b>.</> : "No cycle yet."}</p>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <Btn kind="ghost" disabled={busy || !cycle || cycle.status === "open"} onClick={() => post("/api/hc/cycle/open")}>Open cycle</Btn>
      <Btn kind="danger" disabled={busy || !cycle || cycle.status === "closed"} onClick={() => post("/api/hc/cycle/close")}>Close cycle</Btn>
      <Btn kind="ghost" disabled={busy || !cycle || phase === "target"} onClick={() => post("/api/hc/cycle/phase", { phase: "target" })}>Switch to target-setting</Btn>
      <Btn kind="ghost" disabled={busy || !cycle || phase === "appraisal"} onClick={() => post("/api/hc/cycle/phase", { phase: "appraisal" })}>Switch to appraisal</Btn>
    </div>
    {phase === "target" && prog && <div style={{ marginTop: 12, fontSize: 14, color: C.navy, fontWeight: 700 }}>Target-setting progress: {prog.set} / {prog.total} people have targets set.</div>}
    <div style={{ borderTop: "1px solid " + C.line, marginTop: 16, paddingTop: 14 }}>
      <b style={{ fontSize: 14 }}>Generate appraisals for this cycle</b>
      <p style={{ color: C.slate, fontSize: 13, margin: "4px 0 8px" }}>Creates an appraisal for every active appraisee (using their current line manager and any targets set), skipping anyone who already has one. Use this after switching to the appraisal phase — no roster re-upload needed.</p>
      <Btn disabled={busy || !cycle} onClick={generate}>Generate appraisals</Btn>
      {gen && <div style={{ marginTop: 8, color: C.good, fontWeight: 600 }}>{gen}</div>}
    </div>
    <div style={{ borderTop: "1px solid " + C.line, marginTop: 16, paddingTop: 14 }}>
      <b style={{ fontSize: 14 }}>Start a new cycle (e.g. H2 2026)</b>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Name (H2 2026)" style={{ ...inp, margin: 0, width: 160 }} />
        <input value={pd} onChange={(e) => setPd(e.target.value)} placeholder="Period (Jul–Dec 2026)" style={{ ...inp, margin: 0, width: 200 }} />
        <Btn disabled={busy || !nm} onClick={async () => { await post("/api/hc/cycle", { name: nm, period: pd, phase: "target" }); setNm(""); setPd(""); }}>Create in target-setting</Btn>
      </div>
      <p style={{ color: C.slate, fontSize: 12, marginTop: 8 }}>New cycles start in draft — click <b>Open cycle</b> so line managers can set targets. When target-setting is done, switch to <b>appraisal</b> and click <b>Generate appraisals</b>.</p>
    </div>
  </Card>;
}
function HCAudit() { const [ev, setEv] = useState(null); useEffect(() => { api("/api/hc/audit").then((r) => setEv(r.events)).catch(() => setEv([])); }, []); if (!ev) return <div>Loading…</div>; return <Card style={{ padding: 12, fontSize: 13 }}><b>Recent activity</b><div style={{ marginTop: 8, maxHeight: 460, overflow: "auto" }}>{ev.map((e) => <div key={e.id} style={{ display: "flex", gap: 10, padding: "4px 0", borderBottom: "1px solid " + C.bg }}><span style={{ color: C.slate, minWidth: 150 }}>{new Date(e.ts).toLocaleString()}</span><span style={{ minWidth: 130, color: C.navy }}>{e.actor_id || "—"}</span><span style={{ fontWeight: 600 }}>{e.action}</span><span style={{ color: C.slate }}>{e.target || ""}</span></div>)}</div></Card>; }

function HCEmployees() {
  const [data, setData] = useState(null); const [q, setQ] = useState(""); const [msg, setMsg] = useState(""); const [codes, setCodes] = useState({});
  async function load() { const r = await api("/api/hc/employees"); setData(r); }
  useEffect(() => { load(); }, []);
  if (!data) return <div>Loading…</div>;
  const shown = data.employees.filter((e) => (e.name + " " + e.email + " " + e.role + " " + e.company).toLowerCase().includes(q.toLowerCase()));
  return <Card style={{ padding: 16 }}>
    <b>Employees — login email & reporting line</b>
    <p style={{ color: C.slate, fontSize: 14 }}>Update a person's work email (their login) or their line manager, then Save — changes take effect immediately and re-route the current appraisal. “Reissue code” issues a fresh access code to share privately (the old one stops working).</p>
    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, role…" style={{ ...inp, maxWidth: 300 }} />
    {msg && <div style={{ color: C.good, marginBottom: 8, fontWeight: 600 }}>{msg}</div>}
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {shown.map((e) => <EmpRow key={e.id} e={e} opts={data.options} code={codes[e.id]} onSaved={(m) => { setMsg(m); load(); }} onCode={(c) => setCodes((p) => ({ ...p, [e.id]: c }))} />)}
      {shown.length === 0 && <div style={{ color: C.slate }}>No match.</div>}
    </div>
  </Card>;
}
function EmpRow({ e, opts, onSaved, onCode, code }) {
  const [email, setEmail] = useState(e.email); const [mgr, setMgr] = useState(e.managerId || ""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const dirty = email !== e.email || (mgr || "") !== (e.managerId || "");
  async function save() { setBusy(true); setErr(""); try { const r = await api("/api/hc/employee/" + e.id, { method: "POST", body: JSON.stringify({ email, managerId: mgr || null }) }); onSaved("Saved " + r.employee.name); } catch (ex) { setErr(ex.message); } finally { setBusy(false); } }
  async function reissue() { setBusy(true); setErr(""); try { const r = await api("/api/hc/employee/" + e.id + "/reissue-code", { method: "POST" }); onCode(r.code); } catch (ex) { setErr(ex.message); } finally { setBusy(false); } }
  return <div style={{ border: "1px solid " + C.line, borderRadius: 10, padding: "10px 12px" }}>
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ minWidth: 170 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{e.name}</div><div style={{ fontSize: 12, color: C.slate }}>{e.role} · {e.company} {e.roleType === "hc" ? "· HC" : e.roleType === "manager" ? "· Manager" : ""}</div></div>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.slate, display: "flex", flexDirection: "column" }}>Login email<input value={email} onChange={(ev) => setEmail(ev.target.value)} style={{ ...inp, margin: "3px 0", minWidth: 240 }} /></label>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.slate, display: "flex", flexDirection: "column" }}>Reports to<select value={mgr} onChange={(ev) => setMgr(ev.target.value)} style={{ padding: "9px 8px", border: "1px solid " + C.line, borderRadius: 8, margin: "3px 0", minWidth: 200 }}><option value="">— none (top of house) —</option>{opts.filter((o) => o.id !== e.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}><Btn kind="ghost" disabled={busy} onClick={reissue}>Reissue code</Btn><Btn disabled={busy || !dirty} onClick={save}>Save</Btn></div>
    </div>
    {code && <div style={{ marginTop: 6, color: C.good, fontSize: 13 }}>New access code for {e.name}: <b>{code}</b> — share privately; the previous code no longer works.</div>}
    {err && <div style={{ marginTop: 6, color: C.bad, fontSize: 13 }}>{err}</div>}
  </div>;
}

/* ---------------- App ---------------- */
function App() {
  const [me, setMe] = useState(undefined); const [cycle, setCycle] = useState(null); const [openId, setOpenId] = useState(null);
  async function refresh() { try { const r = await api("/api/me"); setMe(r.user); setCycle(r.cycle); } catch { setMe(null); } }
  useEffect(() => { refresh(); }, []);
  if (me === undefined) return <div style={{ ...wrap, color: C.slate }}>Loading…</div>;
  if (!me) return <Login onIn={(r) => { setMe(r.user); setCycle(r.cycle); }} />;
  return <div>
    <TopBar user={me} cycle={cycle} onOut={async () => { await api("/api/logout", { method: "POST" }); setMe(null); setOpenId(null); }} />
    {openId ? <AppraisalScreen id={openId} me={me} onBack={() => setOpenId(null)} />
      : me.roleType === "employee" ? <EmployeeHome me={me} onOpen={setOpenId} />
        : me.roleType === "manager" ? (cycle && cycle.status === "open" && cycle.phase === "target" ? <TargetTeam me={me} /> : <ManagerHome me={me} onOpen={setOpenId} />)
          : <HCHome me={me} cycle={cycle} onOpen={setOpenId} refreshMe={refresh} />}
  </div>;
}
createRoot(document.getElementById("root")).render(<App />);
