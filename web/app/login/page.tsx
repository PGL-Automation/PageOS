"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Loader2, Briefcase, Shield, Zap, Building2, Lock } from "lucide-react";

const FEATURES = [
  { icon: Building2, text: "One system across all subsidiaries — asset management, capital markets, and more" },
  { icon: Shield,    text: "Multi-tier compliance, approvals, and governance built in from day one" },
  { icon: Zap,       text: "AI Copilot that understands your business, clients, and financial data" },
];

// Standalone field — no shadcn dependency, no CSS-variable dependency.
function Field({
  id, label, type, placeholder, value, onChange, required, minLength,
}: {
  id: string; label: string; type: string; placeholder: string;
  value: string; onChange: (v: string) => void; required?: boolean; minLength?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        style={{
          height: 40,
          width: "100%",
          padding: "0 12px",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
          fontSize: 14,
          color: "#0f172a",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 0.15s",
        }}
        onFocus={e => { e.currentTarget.style.borderColor = "#FF6600"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,102,0,0.12)"; }}
        onBlur={e  => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none"; }}
      />
    </div>
  );
}

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace("/dashboard");
  }, [user, isLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    // h-screen + overflow-hidden guarantees full-viewport coverage regardless
    // of body/html styles — immune to global CSS resets and theme transitions.
    <div style={{
      height: "100vh",
      overflow: "hidden",
      display: "flex",
      fontFamily: "var(--font-sans, system-ui, sans-serif)",
    }}>

      {/* ── Brand panel (desktop only) ─────────────────────── */}
      <div className="hidden lg:flex" style={{
        width: 460, flexShrink: 0,
        flexDirection: "column",
        padding: 40,
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(160deg,#06091a 0%,#0d1427 50%,#091020 100%)",
      }}>
        {/* Radial glow */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 288, pointerEvents: "none",
          background: "radial-gradient(ellipse at 50% -5%,rgba(255,102,0,0.28) 0%,rgba(255,102,0,0.04) 40%,transparent 70%)",
        }} />
        {/* Subtle grid */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.035,
          backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
        }} />

        {/* Logo */}
        <div style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/page-logo.png" alt="Page Group" style={{ height: 32, objectFit: "contain" }} />
          <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400, fontSize: 13 }}>PageOS</span>
        </div>

        {/* Tagline */}
        <div style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "64px 0" }}>
          <h1 style={{ fontSize: "2.2rem", fontWeight: 700, lineHeight: 1.15, color: "white", margin: 0 }}>
            One system.<br />
            <span style={{ color: "rgba(255,255,255,0.5)" }}>All of Page Group.</span>
          </h1>
          <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.7, maxWidth: 280, color: "rgba(148,163,184,0.8)" }}>
            PageOS is the operating backbone for Page Group — connecting subsidiaries,
            teams, clients, and compliance in one place.
          </p>
          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 16 }}>
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,102,0,0.15)", border: "1px solid rgba(255,102,0,0.25)",
                }}>
                  <Icon style={{ width: 14, height: 14, color: "#ffb380" }} />
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(148,163,184,0.8)", margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p style={{ position: "relative", zIndex: 10, fontSize: 11, color: "rgba(100,116,139,0.6)", margin: 0 }}>
          © 2026 Page Group · All rights reserved
        </p>
      </div>

      {/* ── Form panel ─────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#f0f4f9",
        overflowY: "auto",
      }}>
        <div style={{ width: "100%", maxWidth: 360 }}>

          {/* Mobile-only logo */}
          <div className="lg:hidden" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg,#FF6600,#E05500)",
            }}>
              <Briefcase style={{ width: 14, height: 14, color: "white" }} />
            </div>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>PageOS</span>
          </div>

          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: "#0f172a", margin: 0 }}>
              Sign in to PageOS
            </h2>
            <p style={{ fontSize: 13, marginTop: 4, color: "#94a3b8" }}>
              Access is managed by your HR team.
            </p>
          </div>

          {/* Card */}
          <div style={{
            borderRadius: 16,
            padding: 24,
            background: "#ffffff",
            border: "1px solid #e8edf3",
            boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
          }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field
                id="email" label="Email" type="email"
                placeholder="firstname.lastname@pagegroup.ng"
                value={email} onChange={setEmail} required
              />
              <Field
                id="password" label="Password" type="password"
                placeholder="••••••••"
                value={password} onChange={setPassword} required minLength={8}
              />

              {error && (
                <div style={{
                  borderRadius: 8, padding: "10px 12px", fontSize: 13,
                  background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626",
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  height: 40, width: "100%", borderRadius: 10, border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 600, fontSize: 13, color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: loading ? 0.7 : 1,
                  background: "linear-gradient(135deg,#FF6600,#E05500)",
                  boxShadow: "0 1px 4px rgba(37,99,235,0.3)",
                  transition: "opacity 0.15s",
                  marginTop: 4,
                }}
              >
                {loading && <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />}
                Sign In
              </button>
            </form>
          </div>

          {/* HR note */}
          <div style={{
            marginTop: 20,
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "14px 16px", borderRadius: 12,
            background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.12)",
          }}>
            <Lock style={{ width: 14, height: 14, color: "#FF6600", flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, lineHeight: 1.6, color: "#475569", margin: 0 }}>
              Don&apos;t have an account? Your HR team will provision your access.
              Contact <strong>hr@pagegroup.ng</strong> to get started.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
