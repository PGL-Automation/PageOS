"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

export default function PinSetupPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [pin,        setPin]        = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [showPin,    setShowPin]    = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState("");

  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!isLoading && user) pinRef.current?.focus();
  }, [user, isLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN must be 4 to 6 digits.");
      return;
    }
    if (pin !== confirm) {
      setError("PINs do not match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/v1/auth/set-pin`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "Failed to set PIN.");
      }
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !user) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8fafc",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: "#fff",
        borderRadius: 20,
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        padding: "40px 32px",
      }}>
        {done ? (
          /* ── Success ── */
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "#d1fae5", display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 20px",
            }}>
              <ShieldCheck style={{ width: 32, height: 32, color: "#059669" }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
              PIN set successfully
            </h1>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 32, lineHeight: 1.6 }}>
              You can now use your PIN to log in to PageOS from any device.
              Keep it private — every action is recorded in your name.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              style={{
                width: "100%", height: 44, borderRadius: 12, border: "none",
                background: "#FF6600", color: "#fff", fontSize: 14,
                fontWeight: 600, cursor: "pointer",
              }}
            >
              Go to dashboard
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "#fff7ed", display: "flex", alignItems: "center",
                justifyContent: "center", margin: "0 auto 16px",
              }}>
                <ShieldCheck style={{ width: 28, height: 28, color: "#FF6600" }} />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                Set your PIN
              </h1>
              <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
                Hi {user.DisplayName?.split(" ")[0] ?? "there"}. Choose a 4–6 digit PIN.
                You'll use it to log in and approve requests from your phone.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* PIN */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  PIN
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    ref={pinRef}
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="4 – 6 digits"
                    required
                    style={{
                      width: "100%", height: 48, padding: "0 44px 0 16px",
                      borderRadius: 12, border: "1.5px solid #e2e8f0",
                      background: "#f8fafc", fontSize: 20, letterSpacing: "0.3em",
                      color: "#0f172a", outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#FF6600"; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = "#e2e8f0"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(v => !v)}
                    style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: "#94a3b8",
                      display: "flex", alignItems: "center", padding: 0,
                    }}
                  >
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Confirm PIN */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Confirm PIN
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConf ? "text" : "password"}
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value.replace(/\D/g, ""))}
                    placeholder="Repeat your PIN"
                    required
                    style={{
                      width: "100%", height: 48, padding: "0 44px 0 16px",
                      borderRadius: 12, border: "1.5px solid #e2e8f0",
                      background: "#f8fafc", fontSize: 20, letterSpacing: "0.3em",
                      color: "#0f172a", outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#FF6600"; e.currentTarget.style.borderColor = confirm === pin || !confirm ? "#FF6600" : "#ef4444"; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = "#e2e8f0"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConf(v => !v)}
                    style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: "#94a3b8",
                      display: "flex", alignItems: "center", padding: 0,
                    }}
                  >
                    {showConf ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {confirm.length > 0 && pin.length > 0 && confirm !== pin && (
                  <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>PINs do not match</p>
                )}
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  padding: "10px 14px", borderRadius: 10,
                  background: "#fef2f2", border: "1px solid #fecaca",
                  fontSize: 13, color: "#dc2626",
                }}>
                  {error}
                </div>
              )}

              {/* Rules */}
              <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>
                Never share your PIN. Every approval action is recorded in your name with the exact time and cannot be changed afterwards. Five wrong attempts locks you out for 15 minutes.
              </p>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving || pin.length < 4 || pin !== confirm}
                style={{
                  height: 48, borderRadius: 12, border: "none",
                  background: saving || pin.length < 4 || pin !== confirm
                    ? "#cbd5e1" : "#FF6600",
                  color: "#fff", fontSize: 15, fontWeight: 700,
                  cursor: saving || pin.length < 4 || pin !== confirm ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "background 0.15s",
                }}
              >
                {saving ? <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> : null}
                {saving ? "Saving…" : "Set PIN"}
              </button>
            </form>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
