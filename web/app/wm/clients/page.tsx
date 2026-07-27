"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Mail, Phone, AlertCircle, ChevronRight, Plus, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api/client";
import { components } from "@/lib/api/types";

type OnboardingCase = components["schemas"]["OnboardingCase"];
type CaseDetails    = components["schemas"]["CaseDetails"];

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  draft:            { label: "Draft",       bg: "#f1f5f9", color: "#475569" },
  submitted:        { label: "Submitted",   bg: "#e0f2fe", color: "#0369a1" },
  in_review:        { label: "In Review",   bg: "#dbeafe", color: "#1d4ed8" },
  compliance_review:{ label: "Compliance",  bg: "#ede9fe", color: "#6d28d9" },
  approved:         { label: "Approved",    bg: "#d1fae5", color: "#065f46" },
  rejected:         { label: "Rejected",    bg: "#fee2e2", color: "#991b1b" },
  returned:         { label: "Returned",    bg: "#fef3c7", color: "#92400e" },
};

interface ClientRow {
  id:       string;
  name:     string;
  type:     string;
  email:    string;
  phone:    string;
  state:    string;
  riskFlag: boolean;
  details:  CaseDetails | null;
}

export default function WMClientsPage() {
  const { user, subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter]     = useState<"all" | "individual" | "corporate" | "attention">("all");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["wm-clients-list", subsidId, user?.ID],
    enabled: Boolean(subsidId) && Boolean(user?.ID),
    queryFn: async () => {
      const { data: cases, error } = await api.GET("/onboarding/cases", {
        params: { query: { subsidiary_id: subsidId } },
      });
      if (error || !cases) return [] as ClientRow[];

      const mine = (cases as OnboardingCase[]).filter(
        c => !c.InitiatedBy || c.InitiatedBy === user!.ID
      );

      const details: (CaseDetails | null)[] = await Promise.all(
        mine.map(async c => {
          const { data } = await api.GET("/onboarding/cases/{id}", {
            params: { path: { id: c.ID } },
          });
          return data ?? null;
        })
      );

      return mine.map((c, i): ClientRow => ({
        id:       c.ID,
        name:     details[i]?.application?.full_name ?? `Case ${c.ID.slice(0, 6)}`,
        type:     c.ClientType,
        email:    details[i]?.application?.email ?? "—",
        phone:    details[i]?.application?.phone_numbers?.[0] ?? "—",
        state:    c.State,
        riskFlag: c.RiskFlag,
        details:  details[i],
      }));
    },
  });

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    if (q && !c.name.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q)) return false;
    if (filter === "individual" && c.type !== "individual") return false;
    if (filter === "corporate"  && c.type !== "corporate")  return false;
    if (filter === "attention"  && !c.riskFlag && c.state !== "returned") return false;
    return true;
  });

  const activeClient = clients.find(c => c.id === selected);

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>My Clients</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {isLoading ? "Loading…" : `${clients.length} client${clients.length !== 1 ? "s" : ""} under management`}
          </p>
        </div>
        <Link href="/investments/onboarding"
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 6px rgba(37,99,235,0.35)" }}>
          <Plus className="w-3.5 h-3.5" /> New Client
        </Link>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 h-9 px-3 rounded-xl flex-1 max-w-xs"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
                 className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {([["all","All"],["individual","Individuals"],["corporate","Corporate"],["attention","Needs Attention"]] as [typeof filter, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
                    className={cn("h-7 px-3 rounded-lg text-[12px] font-medium transition-all")}
                    style={filter === k ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "white" } : { color: "var(--pg-text-2)" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="w-12 h-12 mb-4" style={{ color: "var(--pg-text-4)" }} />
          <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>No clients yet</p>
          <Link href="/investments/onboarding" className="mt-3 text-[13px] font-semibold text-blue-600 hover:underline">
            Start a new onboarding →
          </Link>
        </div>
      ) : (

        /* Split: list + detail */
        <div className={cn("grid gap-5", selected ? "xl:grid-cols-2" : "grid-cols-1")}>

          {/* Client list */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {filtered.map(c => {
                const st = STATUS_CFG[c.state] ?? { label: c.state, bg: "#f1f5f9", color: "#475569" };
                return (
                  <div key={c.id}
                       className="flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors"
                       style={{ background: selected === c.id ? "rgba(37,99,235,0.06)" : undefined }}
                       onClick={() => setSelected(c.id === selected ? null : c.id)}
                       onMouseEnter={e => { if (selected !== c.id) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                       onMouseLeave={e => { if (selected !== c.id) (e.currentTarget as HTMLElement).style.background = ""; }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
                         style={{ background: c.riskFlag ? "linear-gradient(135deg,#dc2626,#b91c1c)" : c.type === "corporate" ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                      {c.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{c.name}</p>
                        {c.riskFlag && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] capitalize" style={{ color: "var(--pg-text-3)" }}>{c.type}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0 ml-1" style={{ color: "var(--pg-text-4)" }} />
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No clients match your filters.</p>
                </div>
              )}
            </div>
          </div>

          {/* Client detail panel */}
          {activeClient && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
                       style={{ background: activeClient.riskFlag ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                    {activeClient.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>{activeClient.name}</p>
                    <p className="text-[11px] capitalize" style={{ color: "var(--pg-text-3)" }}>
                      {activeClient.type} · {STATUS_CFG[activeClient.state]?.label ?? activeClient.state}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-5">
                {/* Contact */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--pg-text-3)" }}>Contact</p>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                    <span className="text-[12px]" style={{ color: "var(--pg-text-1)" }}>{activeClient.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                    <span className="text-[12px]" style={{ color: "var(--pg-text-1)" }}>{activeClient.phone}</span>
                  </div>
                </div>

                {/* Case info */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--pg-text-3)" }}>Case Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl p-3" style={{ background: "var(--pg-muted-bg)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#2563eb" }}>Status</p>
                      <p className="text-[14px] font-bold mt-1" style={{ color: "var(--pg-text-1)" }}>
                        {STATUS_CFG[activeClient.state]?.label ?? activeClient.state}
                      </p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: "var(--pg-muted-bg)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#059669" }}>Risk</p>
                      <p className="text-[14px] font-bold mt-1" style={{ color: activeClient.riskFlag ? "#dc2626" : "var(--pg-text-1)" }}>
                        {activeClient.riskFlag ? "High Risk" : "Normal"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Source of funds */}
                {activeClient.details?.application?.source_of_funds && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--pg-text-3)" }}>Source of Funds</p>
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--pg-text-2)" }}>
                      {activeClient.details.application.source_of_funds}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
                  <button className="flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-semibold text-white"
                          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                    <Mail className="w-3.5 h-3.5" /> Send Email
                  </button>
                  <button className="flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-semibold transition-colors"
                          style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)", background: "var(--pg-muted-bg)" }}>
                    <Phone className="w-3.5 h-3.5" /> Log Call
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
