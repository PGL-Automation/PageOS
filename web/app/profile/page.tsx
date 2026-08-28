"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { User, Mail, Building2, Clock, Shield, Star, CheckSquare, RefreshCw, BarChart2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const RECENT_ACTIVITY = [
  { icon: CheckSquare, text: "Approved account opening — Tunde Balogun",  time: "2h ago", color: "#FF6600" },
  { icon: RefreshCw,   text: "Reviewed Nov reconciliation — GT Bank",      time: "5h ago", color: "#7c3aed" },
  { icon: BarChart2,   text: "Generated Q4 revenue report",               time: "1d ago", color: "#059669" },
  { icon: FileText,    text: "Submitted compliance check — Delta Corp",    time: "2d ago", color: "#d97706" },
];

const PERMISSIONS = [
  { label: "Finance — View",          granted: true },
  { label: "Finance — Reconciliation",granted: true },
  { label: "Finance — Approve",       granted: false },
  { label: "Onboarding — RM",         granted: true },
  { label: "Compliance — Review",     granted: true },
  { label: "HR — View",               granted: false },
  { label: "Admin — Full Access",     granted: false },
];

export default function ProfilePage() {
  const { user, subsidiary } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.DisplayName ?? "");

  const initials = user?.DisplayName?.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() ?? "?";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile header card */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--pg-card)", border:"1px solid var(--pg-card-border)", boxShadow:"0 1px 4px var(--pg-card-shadow)" }}>
        <div className="h-24 relative" style={{ background:"linear-gradient(135deg,#080d18,#1e3a8a)" }}>
          <div className="absolute inset-0 opacity-[0.08]"
               style={{ backgroundImage:"linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)", backgroundSize:"32px 32px" }} />
        </div>
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-10 mb-4">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-[22px] font-bold text-white ring-4 ring-white dark:ring-[#0f131d]"
                 style={{ background:"linear-gradient(135deg,#FF6600,#E05500)", boxShadow:"0 4px 16px rgba(255,102,0,0.4)" }}>
              {initials}
            </div>
            <div className="flex-1 mb-1">
              {editing ? (
                <div className="flex gap-2">
                  <input value={name} onChange={e => setName(e.target.value)}
                         className="h-9 px-3 rounded-xl text-[15px] font-bold outline-none flex-1"
                         style={{ background:"var(--pg-input)", border:"1px solid var(--pg-input-border)", color:"var(--pg-text-1)" }} />
                  <button onClick={() => setEditing(false)} className="h-9 px-3 rounded-xl text-[12px] font-semibold text-white" style={{ background:"#FF6600" }}>Save</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-[18px] font-bold" style={{ color:"var(--pg-text-1)" }}>{user?.DisplayName}</h1>
                  <button onClick={() => setEditing(true)} className="text-[11px] font-medium hover:underline" style={{ color:"var(--pg-text-3)" }}>Edit</button>
                </div>
              )}
              <p className="text-[13px] mt-0.5" style={{ color:"var(--pg-text-3)" }}>Relationship Manager · {subsidiary?.Name}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: Mail,      label: "Email",      value: user?.Email ?? "—" },
              { icon: Building2, label: "Subsidiary", value: subsidiary?.Name ?? "—" },
              { icon: Clock,     label: "Last login",  value: "Today, 08:42 AM" },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-2.5 px-4 py-3 rounded-xl" style={{ background:"var(--pg-muted-bg)" }}>
                <f.icon className="w-4 h-4 shrink-0" style={{ color:"var(--pg-text-3)" }} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:"var(--pg-text-3)" }}>{f.label}</p>
                  <p className="text-[12px] font-medium" style={{ color:"var(--pg-text-1)" }}>{f.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Recent activity */}
        <div className="rounded-2xl overflow-hidden" style={{ background:"var(--pg-card)", border:"1px solid var(--pg-card-border)" }}>
          <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--pg-row-border)" }}>
            <h2 className="text-[13px] font-semibold" style={{ color:"var(--pg-text-1)" }}>Recent Activity</h2>
          </div>
          <div className="divide-y" style={{ borderColor:"var(--pg-row-border)" }}>
            {RECENT_ACTIVITY.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background:a.color + "18" }}>
                  <a.icon className="w-3.5 h-3.5" style={{ color:a.color }} />
                </div>
                <p className="text-[12.5px] flex-1" style={{ color:"var(--pg-text-2)" }}>{a.text}</p>
                <span className="text-[11px] shrink-0" style={{ color:"var(--pg-text-4)" }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Permissions */}
        <div className="rounded-2xl overflow-hidden" style={{ background:"var(--pg-card)", border:"1px solid var(--pg-card-border)" }}>
          <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--pg-row-border)" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold" style={{ color:"var(--pg-text-1)" }}>Permissions</h2>
              <span className="text-[11px] font-medium" style={{ color:"var(--pg-text-3)" }}>Contact admin to modify</span>
            </div>
          </div>
          <div className="px-5 py-4 space-y-2">
            {PERMISSIONS.map(p => (
              <div key={p.label} className="flex items-center justify-between py-1.5">
                <span className="text-[12.5px]" style={{ color:p.granted ? "var(--pg-text-1)" : "var(--pg-text-3)" }}>{p.label}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background:p.granted ? "#d1fae5" : "var(--pg-muted-bg)", color:p.granted ? "#065f46" : "var(--pg-text-3)" }}>
                  {p.granted ? "Granted" : "Denied"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
