"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Briefcase, Shield, Zap, Building2, Lock } from "lucide-react";

const FEATURES = [
  { icon: Building2, text: "One system across all subsidiaries — asset management, capital markets, and more" },
  { icon: Shield,    text: "Multi-tier compliance, approvals, and governance built in from day one" },
  { icon: Zap,       text: "AI Copilot that understands your business, clients, and financial data" },
];

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  // Already authenticated → go to dashboard
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
    <div className="min-h-screen flex">

      {/* ── Brand panel ───────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[460px] xl:w-[520px] shrink-0 flex-col p-10 relative overflow-hidden"
           style={{ background: "linear-gradient(160deg,#06091a 0%,#0d1427 50%,#091020 100%)" }}>

        {/* Radial glow */}
        <div className="absolute top-0 inset-x-0 h-72 pointer-events-none"
             style={{ background: "radial-gradient(ellipse at 50% -5%,rgba(37,99,235,0.3) 0%,rgba(37,99,235,0.05) 40%,transparent 70%)" }} />
        {/* Grid */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.035]"
             style={{ backgroundImage:"linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)", backgroundSize:"48px 48px" }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background:"linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow:"0 0 20px rgba(37,99,235,0.5)" }}>
            <Briefcase className="w-4.5 h-4.5 text-white" style={{ width:18,height:18 }} />
          </div>
          <span className="text-white font-bold text-base tracking-tight">PageOS</span>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center py-16">
          <h1 className="text-[2.2rem] font-bold leading-[1.15] text-white">
            One system.<br />
            <span style={{ color:"rgba(255,255,255,0.5)" }}>All of Page Group.</span>
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed max-w-[280px]"
             style={{ color:"rgba(148,163,184,0.8)" }}>
            PageOS is the operating backbone for Page Group — connecting subsidiaries, teams, clients, and compliance in one place.
          </p>
          <div className="mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                     style={{ background:"rgba(37,99,235,0.15)",border:"1px solid rgba(37,99,235,0.25)" }}>
                  <Icon className="w-3.5 h-3.5" style={{ color:"#93c5fd" }} />
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color:"rgba(148,163,184,0.8)" }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[11px]" style={{ color:"rgba(100,116,139,0.6)" }}>
          © 2026 Page Group · All rights reserved
        </p>
      </div>

      {/* ── Login form ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6"
           style={{ background:"var(--pg-bg)" }}>
        <div className="w-full max-w-[360px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background:"linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              <Briefcase className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-[13px]" style={{ color:"var(--pg-text-1)" }}>PageOS</span>
          </div>

          <div className="mb-7">
            <h2 className="text-[22px] font-bold leading-tight" style={{ color:"var(--pg-text-1)" }}>
              Sign in to PageOS
            </h2>
            <p className="text-[13px] mt-1" style={{ color:"var(--pg-text-3)" }}>
              Access is managed by your HR team.
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-2xl p-6"
               style={{ background:"var(--pg-card)", border:"1px solid var(--pg-card-border)", boxShadow:"0 2px 8px var(--pg-card-shadow)" }}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px] font-medium" style={{ color:"var(--pg-text-1)" }}>
                  Email
                </Label>
                <Input id="email" type="email"
                       placeholder="firstname.lastname@pagegroup.ng"
                       value={email} onChange={e => setEmail(e.target.value)}
                       required
                       className="h-10 text-sm" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[13px] font-medium" style={{ color:"var(--pg-text-1)" }}>
                  Password
                </Label>
                <Input id="password" type="password"
                       placeholder="••••••••"
                       value={password} onChange={e => setPassword(e.target.value)}
                       required minLength={8}
                       className="h-10 text-sm" />
              </div>

              {error && (
                <div className="rounded-lg px-3 py-2.5 text-[13px]"
                     style={{ background:"#fef2f2",border:"1px solid #fecaca",color:"#dc2626" }}>
                  {error}
                </div>
              )}

              <button type="submit"
                      disabled={loading}
                      className="w-full h-10 rounded-xl font-semibold text-[13px] mt-1 text-white flex items-center justify-center gap-2 disabled:opacity-70 transition-opacity"
                      style={{ background:"linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow:"0 1px 4px rgba(37,99,235,0.3)" }}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign In
              </button>
            </form>
          </div>

          {/* HR note */}
          <div className="mt-5 flex items-start gap-2.5 px-4 py-3.5 rounded-xl"
               style={{ background:"rgba(37,99,235,0.06)",border:"1px solid rgba(37,99,235,0.12)" }}>
            <Lock className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[12px] leading-relaxed" style={{ color:"var(--pg-text-2)" }}>
              Don&apos;t have an account? Your HR team will provision your access.
              Contact <strong>hr@pagegroup.ng</strong> to get started.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
