"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  Users, TrendingUp, TrendingDown, Plus, Search,
  Loader2, AlertCircle, ChevronRight, X, ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type ClientAccount = {
  id: string; account_number: string;
  client_id: string; client_name: string;
  fund_id: string; fund_name: string; fund_type: string;
  currency: string; units_held: number; invested_amount: number;
  current_value: number; realized_pnl: number; unrealized_pnl: number;
  rm_name: string; status: string; opened_date: string;
};

type Fund = { id: string; code: string; name: string; fund_type: string; };

function fmtNGN(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)     return `${sign}₦${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)         return `${sign}₦${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₦${abs.toFixed(2)}`;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/portfolio${path}`, { credentials: "include", ...opts });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Error ${res.status}`;
    try { msg = JSON.parse(text)?.error?.message ?? msg; } catch { /* */ }
    throw new Error(msg);
  }
  return res.json();
}

// OnboardingClient is a compliance-approved investor from the WM onboarding flow.
type OnboardingClient = {
  ID: string;
  DisplayName: string;
  Status: string;       // "active" = compliance-approved
  ClientType: string;
  SubsidiaryID: string;
};

// ── Open Account Modal ────────────────────────────────────────────────────────
// Pulls clients from the onboarding module — only "active" (compliance-approved)
// clients are shown, creating the direct link between the compliance sign-off
// and the portfolio account opening.

function OpenAccountModal({ funds, onClose }: { funds: Fund[]; onClose: () => void }) {
  const { toast }   = useToast();
  const qc          = useQueryClient();
  const router      = useRouter();
  const { subsidiary } = useAuth();
  const subsidId    = subsidiary?.ID ?? "";

  const [selectedClient, setSelectedClient] = useState<OnboardingClient | null>(null);
  const [clientSearch, setClientSearch]     = useState("");
  const [fundId, setFundId]     = useState(funds[0]?.id ?? "");
  const [openedDate, setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [rmName, setRMName]     = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  // Fetch compliance-approved clients from the onboarding module.
  // No subsidiary filter — Finance needs to see approved clients across ALL subsidiaries.
  // Returns clients whose status='active' OR whose onboarding case is 'approved'.
  const { data: onboardingClients = [], isLoading: loadingClients } = useQuery<OnboardingClient[]>({
    queryKey: ["onboarding-clients-active"],
    staleTime: 0,
    queryFn: async () => {
      // Primary: new endpoint that spans all subsidiaries and checks case state too
      const res = await fetch(`${BASE}/api/v1/onboarding/clients?status=active`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json().catch(() => []);
        return Array.isArray(data) ? (data as OnboardingClient[]) : [];
      }

      // Fallback (old server): derive approved clients from approved cases.
      // GET /api/v1/onboarding/cases?state=approved works without subsidiary_id.
      const casesRes = await fetch(`${BASE}/api/v1/onboarding/cases?state=approved`, { credentials: "include" });
      if (!casesRes.ok) return [];
      const cases = await casesRes.json().catch(() => []);
      if (!Array.isArray(cases)) return [];

      // Each case has ClientID and ClientType — fetch clients by ID in parallel
      const uniqueClientIds = [...new Set((cases as Array<{ ClientID: string; ClientType: string }>).map(c => c.ClientID))];
      const clients = await Promise.all(uniqueClientIds.map(async (id) => {
        const r = await fetch(`${BASE}/api/v1/onboarding/clients/${id}`, { credentials: "include" });
        if (!r.ok) return null;
        return r.json().catch(() => null);
      }));
      return clients.filter(Boolean) as OnboardingClient[];
    },
  });

  const filteredClients = onboardingClients.filter(c =>
    !clientSearch || c.DisplayName.toLowerCase().includes(clientSearch.toLowerCase())
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient) { setError("Select a verified client."); return; }
    setSaving(true); setError("");
    try {
      const acc = await apiFetch("/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id:   selectedClient.ID,
          client_name: selectedClient.DisplayName,
          fund_id:     fundId,
          opened_date: openedDate,
          rm_name:     rmName,
        }),
      }) as ClientAccount;
      qc.invalidateQueries({ queryKey: ["all-client-accounts"] });
      toast({ title: "Account opened", description: `${acc.account_number} opened for ${acc.client_name}` });
      router.push(`/wm/portfolio/accounts/${acc.id}`);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Open Investment Account</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Only compliance-verified clients are shown
            </p>
          </div>
          <button onClick={onClose} style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1">
          <div className="p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px]" style={{ background: "#fef2f2", color: "#dc2626" }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}

            {/* Client selector — from onboarding (compliance-approved only) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
                  Client (Compliance Verified) *
                </label>
                {selectedClient && (
                  <button type="button" onClick={() => { setSelectedClient(null); setClientSearch(""); }}
                          className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>Change</button>
                )}
              </div>

              {selectedClient ? (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                     style={{ background: "#ecfdf5", border: "1px solid #6ee7b7" }}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-emerald-800">{selectedClient.DisplayName}</p>
                    <p className="text-[10px] text-emerald-600 capitalize">{selectedClient.ClientType} · Compliance Approved</p>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 h-9 px-3 rounded-lg mb-2"
                       style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)" }}>
                    <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                    <input value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                           placeholder="Search verified clients…"
                           className="flex-1 text-[13px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
                    {loadingClients && <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--pg-text-4)" }} />}
                  </div>
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pg-card-border)", maxHeight: 160, overflowY: "auto" }}>
                    {filteredClients.length === 0 ? (
                      <div className="px-4 py-4 text-center">
                        <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                          {loadingClients ? "Loading…" : "No compliance-approved clients found."}
                        </p>
                        {!loadingClients && (
                          <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-4)" }}>
                            Clients become available here after compliance approves their onboarding.
                          </p>
                        )}
                      </div>
                    ) : filteredClients.map((c, i) => (
                      <div key={c.ID}
                           className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-emerald-50/60 transition-colors"
                           style={{ borderBottom: i < filteredClients.length - 1 ? "1px solid var(--pg-row-border)" : "none" }}
                           onClick={() => setSelectedClient(c)}>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <div>
                          <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{c.DisplayName}</p>
                          <p className="text-[10px] capitalize" style={{ color: "var(--pg-text-3)" }}>{c.ClientType}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Fund */}
            <div>
              <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Fund / Mandate *</label>
              <div className="relative">
                <select value={fundId} onChange={e => setFundId(e.target.value)}
                        className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                        style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }}>
                  {(Array.isArray(funds) ? funds : []).map(f => <option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-3)" }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Account Open Date</label>
                <input type="date" value={openedDate} onChange={e => setDate(e.target.value)} required
                       className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                       style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--pg-text-2)" }}>Assigned RM</label>
                <input value={rmName} onChange={e => setRMName(e.target.value)} placeholder="RM Name"
                       className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                       style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-muted-bg)", color: "var(--pg-text-1)" }} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 px-6 pb-6 shrink-0">
            <button type="button" onClick={onClose}
                    className="flex-1 h-9 rounded-xl text-[13px] font-semibold"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving || !selectedClient}
                    className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: saving || !selectedClient ? "#94a3b8" : "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Open Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientAccountsPage() {
  const [search, setSearch] = useState("");
  const [showOpen, setShowOpen] = useState(false);

  const { data: accounts = [], isLoading } = useQuery<ClientAccount[]>({
    queryKey: ["all-client-accounts"],
    staleTime: 0,
    queryFn: () => apiFetch("/accounts") as Promise<ClientAccount[]>,
  });

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ["portfolio-funds"],
    queryFn: () => apiFetch("/funds") as Promise<Fund[]>,
  });

  const filtered = accounts.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.client_name.toLowerCase().includes(q) ||
           a.account_number.toLowerCase().includes(q) ||
           a.fund_name.toLowerCase().includes(q);
  });

  const totalAUM = accounts.reduce((s, a) => s + a.current_value, 0);
  const totalPnL = accounts.reduce((s, a) => s + a.unrealized_pnl + a.realized_pnl, 0);
  // Count unique clients (one client can have multiple accounts across funds).
  const uniqueClientCount = new Set(accounts.map(a => a.client_id)).size;

  return (
    <div className="max-w-[1000px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Client Accounts</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Track investor positions across all funds and mandates
          </p>
        </div>
        <button onClick={() => setShowOpen(true)}
                className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
          <Plus className="w-3.5 h-3.5" /> Open Account
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Unique Clients", value: String(uniqueClientCount), color: "#2563eb", bg: "#eff6ff" },
          { label: "Total AUM", value: fmtNGN(totalAUM), color: "#7c3aed", bg: "#f5f3ff" },
          { label: "Total P&L", value: fmtNGN(totalPnL), color: totalPnL >= 0 ? "#059669" : "#dc2626", bg: totalPnL >= 0 ? "#ecfdf5" : "#fef2f2" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-2xl p-4" style={{ background: bg, border: "1px solid var(--pg-card-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color }}>{label}</p>
            <p className="text-[18px] font-bold" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search + table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
        <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Search client name, account number, or fund…"
                 className="flex-1 text-[13px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
          <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{filtered.length} account{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <Users className="w-8 h-8 mb-3 text-slate-200" />
            <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-2)" }}>No accounts yet</p>
            <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>Open an account to start tracking client investments.</p>
            <button onClick={() => setShowOpen(true)}
                    className="mt-4 flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-semibold text-white"
                    style={{ background: "#2563eb" }}>
              <Plus className="w-3.5 h-3.5" /> Open Account
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}>
                  {["Account No.", "Client", "Fund", "Invested", "Current Value", "Unrealized P&L", "Status", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--pg-text-3)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((acc, i) => {
                  const pnlPos = acc.unrealized_pnl >= 0;
                  return (
                    <tr key={acc.id}
                        className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                        style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--pg-row-border)" : "none" }}
                        onClick={() => window.location.href = `/wm/portfolio/accounts/${acc.id}`}>
                      <td className="px-4 py-3 font-mono font-semibold" style={{ color: "#2563eb" }}>{acc.account_number}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--pg-text-1)" }}>{acc.client_name}</td>
                      <td className="px-4 py-3">
                        <div style={{ color: "var(--pg-text-2)" }}>{acc.fund_name}</div>
                        <div className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>{acc.fund_type}</div>
                      </td>
                      <td className="px-4 py-3 font-mono" style={{ color: "var(--pg-text-1)" }}>{fmtNGN(acc.invested_amount)}</td>
                      <td className="px-4 py-3 font-mono font-semibold" style={{ color: "#2563eb" }}>{fmtNGN(acc.current_value)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {pnlPos
                            ? <TrendingUp className="w-3 h-3 text-emerald-500" />
                            : <TrendingDown className="w-3 h-3 text-red-500" />}
                          <span className={cn("font-mono font-semibold", pnlPos ? "text-emerald-600" : "text-red-600")}>
                            {pnlPos ? "+" : ""}{fmtNGN(acc.unrealized_pnl)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: acc.status === "active" ? "#d1fae5" : "#f1f5f9",
                                       color: acc.status === "active" ? "#065f46" : "#475569" }}>
                          {acc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4" style={{ color: "var(--pg-text-4)" }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showOpen && <OpenAccountModal funds={funds} onClose={() => setShowOpen(false)} />}
    </div>
  );
}
