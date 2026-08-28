"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { Check, Sun, Moon, Bell, Shield, Globe, Users, Sliders, ChevronRight, Brain, Save, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "general" | "security" | "notifications" | "organisation" | "integrations";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "general",       label: "General",       icon: Sliders },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "security",      label: "Security",       icon: Shield },
  { key: "organisation",  label: "Organisation",   icon: Users },
  { key: "integrations",  label: "Integrations",   icon: Globe },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background:"var(--pg-card)", border:"1px solid var(--pg-card-border)" }}>
      <div className="px-6 py-5" style={{ borderBottom:"1px solid var(--pg-row-border)" }}>
        <h3 className="text-[14px] font-semibold" style={{ color:"var(--pg-text-1)" }}>{title}</h3>
        {description && <p className="text-[12px] mt-1" style={{ color:"var(--pg-text-3)" }}>{description}</p>}
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, description, children, validated }: { label: string; description?: string; children: React.ReactNode; validated?: boolean }) {
  return (
    <div className="grid md:grid-cols-3 gap-4 items-start">
      <div>
        <label className="text-[13px] font-medium" style={{ color:"var(--pg-text-1)" }}>{label}</label>
        {description && <p className="text-[11px] mt-0.5" style={{ color:"var(--pg-text-3)" }}>{description}</p>}
      </div>
      <div className="md:col-span-2">
        <div className="flex items-center gap-2">
          {children}
          {validated && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
        </div>
      </div>
    </div>
  );
}

function Input({ value, onChange, type="text", placeholder="" }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
           className="flex-1 h-10 px-3 rounded-xl text-[13px] outline-none transition-all focus:ring-2 ring-orange-500/20 focus:border-orange-500"
           style={{ background:"var(--pg-input)", border:"1px solid var(--pg-input-border)", color:"var(--pg-text-1)" }} />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(!checked)}
              className="w-11 h-6 rounded-full relative transition-colors"
              style={{ background: checked ? "#FF6600" : "var(--pg-muted-bg)" }}>
        <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }} />
      </button>
      {label && <span className="text-[13px]" style={{ color:"var(--pg-text-2)" }}>{label}</span>}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const [tab, setTab] = useState<Tab>("general");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState(user?.DisplayName ?? "");
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [currency, setCurrency] = useState("NGN");
  const [notifApprovals, setNotifApprovals] = useState(true);
  const [notifRecon,     setNotifRecon]     = useState(true);
  const [notifRisk,      setNotifRisk]      = useState(true);
  const [notifDigest,    setNotifDigest]    = useState(false);
  const [twoFactor,      setTwoFactor]      = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState("8");

  function save() {
    setSaving(true);
    setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500); }, 900);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color:"var(--pg-text-1)" }}>Settings</h1>
          <p className="text-[12px] mt-0.5" style={{ color:"var(--pg-text-3)" }}>Manage your account and workspace preferences</p>
        </div>
        <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-70 transition-all"
                style={{ background:"linear-gradient(135deg,#FF6600,#E05500)", boxShadow:"0 1px 6px rgba(255,102,0,0.35)" }}>
          <Save className="w-3.5 h-3.5" />
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
        </button>
      </div>

      {/* Tab + content */}
      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-48 shrink-0 space-y-0.5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
                    className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-[13px] font-medium transition-all",
                                  tab === t.key ? "text-white" : "hover:bg-black/5 dark:hover:bg-white/10")}
                    style={tab === t.key ? { background:"linear-gradient(135deg,rgba(255,102,0,0.9),rgba(224,85,0,0.9))" } : { color:"var(--pg-text-2)" }}>
              <t.icon className={cn("w-4 h-4 shrink-0", tab === t.key ? "text-blue-100" : "")} style={tab !== t.key ? { color:"var(--pg-text-3)" } : undefined} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5">
          {tab === "general" && (
            <>
              <Section title="Profile" description="Your personal display information within PageOS.">
                <Field label="Display Name" validated={displayName.length > 2}>
                  <Input value={displayName} onChange={setDisplayName} placeholder="Your full name" />
                </Field>
                <Field label="Email" description="Contact your administrator to change your email.">
                  <Input value={user?.Email ?? ""} onChange={() => {}} type="email" />
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background:"#d1fae5", color:"#065f46" }}>Verified</span>
                </Field>
              </Section>

              <Section title="Preferences" description="Appearance and locale settings.">
                <Field label="Theme" description="Choose between light and dark mode.">
                  <div className="flex gap-2">
                    <button onClick={() => !dark && toggleTheme()}
                            className={cn("flex items-center gap-2 h-9 px-4 rounded-xl text-[12px] font-medium transition-all", !dark && "ring-2 ring-orange-500")}
                            style={{ background:"var(--pg-input)", border:"1px solid var(--pg-input-border)", color:"var(--pg-text-1)" }}>
                      <Sun className="w-3.5 h-3.5" /> Light
                    </button>
                    <button onClick={() => dark && toggleTheme()}
                            className={cn("flex items-center gap-2 h-9 px-4 rounded-xl text-[12px] font-medium transition-all", dark && "ring-2 ring-orange-500")}
                            style={{ background:"var(--pg-input)", border:"1px solid var(--pg-input-border)", color:"var(--pg-text-1)" }}>
                      <Moon className="w-3.5 h-3.5" /> Dark
                    </button>
                  </div>
                </Field>
                <Field label="Timezone">
                  <select value={timezone} onChange={e => setTimezone(e.target.value)}
                          className="flex-1 h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                          style={{ background:"var(--pg-input)", border:"1px solid var(--pg-input-border)", color:"var(--pg-text-1)" }}>
                    <option value="Africa/Lagos">Africa/Lagos (WAT, UTC+1)</option>
                    <option value="Europe/London">Europe/London (GMT, UTC+0)</option>
                    <option value="America/New_York">America/New York (EST, UTC-5)</option>
                  </select>
                </Field>
                <Field label="Base Currency">
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                          className="flex-1 h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                          style={{ background:"var(--pg-input)", border:"1px solid var(--pg-input-border)", color:"var(--pg-text-1)" }}>
                    <option value="NGN">Nigerian Naira (NGN ₦)</option>
                    <option value="USD">US Dollar (USD $)</option>
                    <option value="GBP">British Pound (GBP £)</option>
                  </select>
                </Field>
              </Section>

              <Section title="AI Preferences" description="Control how PageOS AI assists you.">
                <Field label="AI Suggestions" description="Show contextual AI suggestions on every page.">
                  <Toggle checked={true} onChange={() => {}} label="Enabled" />
                </Field>
                <Field label="AI Data Access" description="Allow AI to read your financial data for deeper insights.">
                  <Toggle checked={true} onChange={() => {}} label="Full access (recommended)" />
                </Field>
              </Section>
            </>
          )}

          {tab === "notifications" && (
            <Section title="Notification Preferences" description="Choose what you want to be notified about.">
              <Field label="Pending Approvals" description="Notify when tasks are assigned to you for approval.">
                <Toggle checked={notifApprovals} onChange={setNotifApprovals} label={notifApprovals ? "On" : "Off"} />
              </Field>
              <Field label="Reconciliation Alerts" description="Notify on unmatched items and completed auto-matches.">
                <Toggle checked={notifRecon} onChange={setNotifRecon} label={notifRecon ? "On" : "Off"} />
              </Field>
              <Field label="Risk Alerts" description="Notify on new risk flags and exceptions.">
                <Toggle checked={notifRisk} onChange={setNotifRisk} label={notifRisk ? "On" : "Off"} />
              </Field>
              <Field label="Daily Digest" description="Receive a morning summary of your priorities.">
                <Toggle checked={notifDigest} onChange={setNotifDigest} label={notifDigest ? "On" : "Off"} />
              </Field>
            </Section>
          )}

          {tab === "security" && (
            <>
              <Section title="Authentication">
                <Field label="Two-Factor Authentication" description="Add an extra layer of security to your account.">
                  <Toggle checked={twoFactor} onChange={setTwoFactor} label={twoFactor ? "Enabled" : "Disabled"} />
                </Field>
                <Field label="Session Timeout" description="Automatically sign out after inactivity (hours).">
                  <select value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)}
                          className="flex-1 h-10 px-3 rounded-xl text-[13px] outline-none appearance-none"
                          style={{ background:"var(--pg-input)", border:"1px solid var(--pg-input-border)", color:"var(--pg-text-1)" }}>
                    <option value="1">1 hour</option>
                    <option value="4">4 hours</option>
                    <option value="8">8 hours (recommended)</option>
                    <option value="24">24 hours</option>
                  </select>
                </Field>
              </Section>

              <Section title="Change Password">
                <Field label="Current Password">
                  <Input value="" onChange={() => {}} type="password" placeholder="••••••••" />
                </Field>
                <Field label="New Password">
                  <Input value="" onChange={() => {}} type="password" placeholder="Min. 12 characters" />
                </Field>
                <Field label="Confirm Password">
                  <Input value="" onChange={() => {}} type="password" placeholder="Repeat new password" />
                </Field>
                <div className="flex justify-end">
                  <button className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white" style={{ background:"#FF6600" }}>
                    Update Password
                  </button>
                </div>
              </Section>

              <div className="flex items-start gap-3 px-5 py-4 rounded-xl" style={{ background:"#fef2f2", border:"1px solid #fecaca" }}>
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-red-800">Danger Zone</p>
                  <p className="text-[12px] text-red-600 mt-0.5">Deactivating your account will remove your access to all PageOS modules. Contact your administrator.</p>
                </div>
              </div>
            </>
          )}

          {(tab === "organisation" || tab === "integrations") && (
            <div className="rounded-2xl flex items-center justify-center py-20" style={{ background:"var(--pg-card)", border:"2px dashed var(--pg-card-border)" }}>
              <div className="text-center">
                <p className="text-[14px] font-semibold" style={{ color:"var(--pg-text-1)" }}>{TABS.find(t => t.key === tab)?.label} Settings</p>
                <p className="text-[12px] mt-1" style={{ color:"var(--pg-text-3)" }}>Available to administrators — coming in Q1 2027.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
