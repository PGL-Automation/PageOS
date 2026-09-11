"use client";

/**
 * Team-view support for heads of department.
 *
 * The hook fetches actual team members from the org API (positions + holders),
 * so the selector is populated with real WMs rather than just case initiators.
 *
 * Extend HEAD_CODES / WM_POSITION_CODES as new roles are onboarded.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { usePosition } from "./position";
import { useAuth } from "./auth";
import { Users, ChevronDown, Check, Loader2 } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

export const ME_SENTINEL  = "__me__";
export const ALL_SENTINEL = "__all__";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Position-code groups by department ────────────────────────────────────────

export const WM_POSITION_CODES = [
  "WEALTH_MANAGER", "RELATIONSHIP_MANAGER", "EQUITY_TRADER",
  "PORTFOLIO_MANAGER", "PORTFOLIO_MGMT_ASSISTANT",
];

export const INVESTMENT_POSITION_CODES = [
  "PORTFOLIO_MANAGER", "EQUITY_TRADER", "PORTFOLIO_MGMT_ASSISTANT",
  "TRADING_RESEARCH_ANALYST", "QUANT_MARKET_ANALYST", "INVESTMENT_RESEARCH_TRAINEE",
];

export const FINANCE_POSITION_CODES = [
  "FINANCE_OPS_ASSOCIATE", "FINANCE_OPS_INTERN", "DATA_ANALYST_INTERN",
  "OPERATIONS_EXECUTIVE", "OPERATIONS_ASSOCIATE", "FUND_TREASURY_OPERATIONS",
  "RECONCILIATION_OFFICER", "TREASURY_ANALYST", "FINANCE_OFFICER", "FINOPS_MANAGER",
];

export const COMPLIANCE_POSITION_CODES = [
  "COMPLIANCE_MANAGER", "INTERNAL_CONTROL_OFFICER",
  "TL_RESEARCH_RISK_MGMT", "TRADING_RESEARCH_ANALYST",
  "QUANT_MARKET_ANALYST", "INVESTMENT_RESEARCH_TRAINEE",
];

export const HR_POSITION_CODES = [
  "HR_OFFICER", "HR_ADMIN", "HR_OPS_MANAGER",
  "ADMIN_OFFICER", "IT_SUPPORT",
];

export const IT_POSITION_CODES = [
  "IT_SUPPORT", "LEAD_SOFTWARE_ENGINEER",
];

export const BUSINESS_DEV_POSITION_CODES = [
  "RELATIONSHIP_MANAGER", "WEALTH_MANAGER",
];

export const BRAND_STRATEGY_POSITION_CODES: string[] = [];

// ── Head-of-department role registry ──────────────────────────────────────────
// Add new head roles here — pages that import useTeamView() will automatically
// show the TeamViewBar for any code listed below.

const HEAD_CODES: Record<string, { label: string; teamLabel: string; memberCodes: string[] }> = {
  // ── Wealth Management ──────────────────────────────────────────────────────
  GROUP_HEAD_WEALTH_MGMT: {
    label: "Group Head, WM", teamLabel: "Wealth Management Team",
    memberCodes: WM_POSITION_CODES,
  },

  // ── Investment ─────────────────────────────────────────────────────────────
  HEAD_OF_INVESTMENT: {
    label: "Head of Investment", teamLabel: "Investment Team",
    memberCodes: INVESTMENT_POSITION_CODES,
  },
  HEAD_INVESTMENT_MGMT: {
    label: "Head, Investment Mgmt", teamLabel: "Investment Management Team",
    memberCodes: INVESTMENT_POSITION_CODES,
  },

  // ── Finance / Operations ───────────────────────────────────────────────────
  HEAD_OF_OPERATIONS: {
    label: "Head of Operations", teamLabel: "Operations Team",
    memberCodes: FINANCE_POSITION_CODES,
  },
  TREASURY_OPS_FINANCE_MGR: {
    label: "Treasury Ops Manager", teamLabel: "Treasury & Finance Team",
    memberCodes: FINANCE_POSITION_CODES,
  },
  TL_FINANCIAL_REPORTING: {
    label: "TL, Financial Reporting", teamLabel: "Financial Reporting Team",
    memberCodes: FINANCE_POSITION_CODES,
  },
  FINOPS_MANAGER: {
    label: "FinOps Manager", teamLabel: "Finance & Operations Team",
    memberCodes: FINANCE_POSITION_CODES,
  },

  // ── Compliance / Risk ──────────────────────────────────────────────────────
  HEAD_CORPORATE_COMPLIANCE: {
    label: "Head, Corporate Compliance", teamLabel: "Compliance Team",
    memberCodes: COMPLIANCE_POSITION_CODES,
  },
  HEAD_RISK_TRADE_MGMT: {
    label: "Head, Risk & Trade Mgmt", teamLabel: "Risk & Trade Team",
    memberCodes: COMPLIANCE_POSITION_CODES,
  },

  // ── Human Resources ────────────────────────────────────────────────────────
  HEAD_HUMAN_CAPITAL: {
    label: "Head, Human Capital", teamLabel: "HR Team",
    memberCodes: HR_POSITION_CODES,
  },
  HR_MANAGER: {
    label: "HR Manager", teamLabel: "HR Team",
    memberCodes: HR_POSITION_CODES,
  },
  HR_OPS_MANAGER: {
    label: "HR Ops Manager", teamLabel: "HR Ops Team",
    memberCodes: HR_POSITION_CODES,
  },

  // ── IT ─────────────────────────────────────────────────────────────────────
  IT_ADMIN: {
    label: "IT Admin", teamLabel: "IT Team",
    memberCodes: IT_POSITION_CODES,
  },

  // ── Brand & Strategy ───────────────────────────────────────────────────────
  BRAND_STRATEGY_MANAGER: {
    label: "Brand Strategy Manager", teamLabel: "Brand & Strategy Team",
    memberCodes: BRAND_STRATEGY_POSITION_CODES,
  },

  // ── Business Development ───────────────────────────────────────────────────
  GROUP_HEAD_BUSINESS_DEV: {
    label: "Group Head, Business Dev", teamLabel: "Business Development Team",
    memberCodes: BUSINESS_DEV_POSITION_CODES,
  },
};

// ── Types ──────────────────────────────────────────────────────────────────────

export type WMOption = { id: string; name: string };

export interface TeamViewState {
  isTeamHead: boolean;
  headLabel:  string;
  teamLabel:  string;
  selectedMemberId: string;
  setSelectedMemberId: (id: string) => void;
  myUserId:     string;
  memberOptions: WMOption[];
  setMemberOptions: (opts: WMOption[]) => void; // kept for page-level overrides
  loadingMembers: boolean;
  shouldInclude:     (initiatorId: string) => boolean;
  shouldIncludeName: (wmName: string, myDisplayName: string) => boolean;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useTeamView(): TeamViewState {
  const { activePosition }   = usePosition();
  const { user, subsidiary } = useAuth();
  const code    = activePosition?.code ?? "";
  const meta    = HEAD_CODES[code];
  const isTeamHead = Boolean(meta);

  const [selectedMemberId, setSelectedMemberId] = useState<string>(ME_SENTINEL);
  const [memberOptions, setMemberOptions]       = useState<WMOption[]>([]);
  const [loadingMembers, setLoadingMembers]     = useState(false);

  const myUserId    = user?.ID ?? "";
  const subsidiaryId = subsidiary?.ID ?? "";

  // Auto-fetch real WM team members from the org API
  useEffect(() => {
    if (!isTeamHead || !subsidiaryId) return;
    let cancelled = false;

    async function loadTeamMembers() {
      setLoadingMembers(true);
      try {
        // 1. Fetch all positions for the subsidiary
        const posRes = await fetch(
          `${BASE}/api/v1/org/positions?subsidiary_id=${subsidiaryId}`,
          { credentials: "include" }
        );
        if (!posRes.ok || cancelled) return;
        const positions: { id: string; code: string; title: string }[] = await posRes.json().catch(() => []);

        // 2. Filter to WM-type positions
        const targetCodes = new Set(meta!.memberCodes);
        const wmPositions = positions.filter(p => targetCodes.has(p.code));
        if (!wmPositions.length || cancelled) return;

        // 3. Fetch holders for each WM position in parallel
        const holderSets = await Promise.all(
          wmPositions.map(pos =>
            fetch(`${BASE}/api/v1/org/positions/${pos.id}/holders`, { credentials: "include" })
              .then(r => r.ok ? r.json() : [])
              .catch(() => []) as Promise<{ user_id?: string; first_name: string; last_name: string }[]>
          )
        );
        if (cancelled) return;

        // 4. Deduplicate by user_id and build options
        const seen = new Map<string, string>();
        holderSets.flat().forEach(p => {
          if (p.user_id && p.user_id !== "00000000-0000-0000-0000-000000000000") {
            const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
            if (name) seen.set(p.user_id, name);
          }
        });
        if (!cancelled) {
          setMemberOptions([...seen.entries()].map(([id, name]) => ({ id, name })));
        }
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    }

    loadTeamMembers();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeamHead, subsidiaryId]);

  const shouldInclude = useMemo(
    () => (initiatorId: string) => {
      if (!isTeamHead) return false;
      if (selectedMemberId === ALL_SENTINEL) return true;
      if (selectedMemberId === ME_SENTINEL)  return initiatorId === myUserId;
      return initiatorId === selectedMemberId;
    },
    [isTeamHead, selectedMemberId, myUserId]
  );

  const shouldIncludeName = useMemo(
    () => (wmName: string, myDisplayName: string) => {
      if (!isTeamHead) return false;
      if (selectedMemberId === ALL_SENTINEL) return true;
      if (selectedMemberId === ME_SENTINEL) {
        return wmName === "Me" || wmName === myDisplayName;
      }
      const opt = memberOptions.find(m => m.id === selectedMemberId);
      if (!opt) return false;
      return wmName === opt.name || wmName === opt.id;
    },
    [isTeamHead, selectedMemberId, myUserId, memberOptions]
  );

  return {
    isTeamHead,
    headLabel:  meta?.label    ?? "",
    teamLabel:  meta?.teamLabel ?? "",
    selectedMemberId,
    setSelectedMemberId,
    myUserId,
    memberOptions,
    setMemberOptions,
    loadingMembers,
    shouldInclude,
    shouldIncludeName,
  };
}

// ── Styled team member dropdown ────────────────────────────────────────────────

function TeamMemberDropdown({ tv }: { tv: TeamViewState }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const labelFor = (id: string) => {
    if (id === ME_SENTINEL)  return "Me (my data)";
    if (id === ALL_SENTINEL) return `All ${tv.teamLabel.split(" ")[0]} Managers`;
    return tv.memberOptions.find(m => m.id === id)?.name ?? "Selected WM";
  };

  const OPTS_SPECIAL = [
    { id: ME_SENTINEL,  label: "Me (my data)",                    sub: "Show only my own records" },
    { id: ALL_SENTINEL, label: `All ${tv.teamLabel.split(" ")[0]} Managers`, sub: "Show everyone's data" },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          height: 32, padding: "0 10px 0 12px",
          borderRadius: 10, cursor: "pointer",
          background: "#fff", border: "1.5px solid #93c5fd",
          boxShadow: open ? "0 0 0 3px rgba(147,197,253,0.3)" : "none",
          transition: "box-shadow 0.15s",
          minWidth: 160,
        }}
      >
        {tv.loadingMembers ? (
          <Loader2 size={12} style={{ color: "#1d4ed8", animation: "spin 1s linear infinite" }} />
        ) : (
          <div style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: tv.selectedMemberId === ALL_SENTINEL ? "#dbeafe"
                      : tv.selectedMemberId === ME_SENTINEL  ? "#eff6ff"
                      : "#f0fdf4",
          }}>
            <Users size={11} style={{ color: "#1d4ed8" }} />
          </div>
        )}
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", flex: 1, textAlign: "left" }}>
          {labelFor(tv.selectedMemberId)}
        </span>
        <ChevronDown
          size={13}
          style={{ color: "#1d4ed8", transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0,
          minWidth: 220, zIndex: 500,
          background: "var(--pg-card)", borderRadius: 14,
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.14)",
          overflow: "hidden",
        }}>
          {/* Special options */}
          <div style={{ padding: "6px 6px 4px" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--pg-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", padding: "4px 8px 2px" }}>
              View
            </p>
            {OPTS_SPECIAL.map(o => (
              <button
                key={o.id}
                onClick={() => { tv.setSelectedMemberId(o.id); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: tv.selectedMemberId === o.id ? "#eff6ff" : "transparent",
                  textAlign: "left",
                }}
                onMouseEnter={e => { if (tv.selectedMemberId !== o.id) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                onMouseLeave={e => { if (tv.selectedMemberId !== o.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: o.id === ME_SENTINEL ? "#dbeafe" : "#e0f2fe",
                }}>
                  <Users size={13} style={{ color: "#1d4ed8" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--pg-text-1)", margin: 0 }}>{o.label}</p>
                  <p style={{ fontSize: 11, color: "var(--pg-text-3)", margin: 0 }}>{o.sub}</p>
                </div>
                {tv.selectedMemberId === o.id && <Check size={14} style={{ color: "#1d4ed8", flexShrink: 0 }} />}
              </button>
            ))}
          </div>

          {/* Individual WMs */}
          {(tv.memberOptions.length > 0 || tv.loadingMembers) && (
            <>
              <div style={{ height: 1, background: "var(--pg-card-border)", margin: "2px 0" }} />
              <div style={{ padding: "4px 6px 6px", maxHeight: 200, overflowY: "auto" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "var(--pg-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", padding: "4px 8px 2px" }}>
                  Individual
                </p>
                {tv.loadingMembers ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                    <Loader2 size={13} style={{ color: "var(--pg-text-3)", animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: 12, color: "var(--pg-text-3)" }}>Loading team…</span>
                  </div>
                ) : (
                  tv.memberOptions.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { tv.setSelectedMemberId(m.id); setOpen(false); }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                        background: tv.selectedMemberId === m.id ? "#eff6ff" : "transparent",
                        textAlign: "left",
                      }}
                      onMouseEnter={e => { if (tv.selectedMemberId !== m.id) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                      onMouseLeave={e => { if (tv.selectedMemberId !== m.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      {/* Avatar initials */}
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "linear-gradient(135deg,#FF6600,#E05500)",
                        fontSize: 11, fontWeight: 700, color: "#fff",
                      }}>
                        {m.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--pg-text-1)", flex: 1 }}>
                        {m.name}
                      </span>
                      {tv.selectedMemberId === m.id && <Check size={14} style={{ color: "#1d4ed8", flexShrink: 0 }} />}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── TeamViewBar ────────────────────────────────────────────────────────────────

interface TeamViewBarProps {
  tv: TeamViewState;
  quickLinks?: { href: string; label: string }[];
}

export function TeamViewBar({ tv, quickLinks }: TeamViewBarProps) {
  if (!tv.isTeamHead) return null;

  const statusText = () => {
    if (tv.selectedMemberId === ME_SENTINEL)  return "Showing: My own records";
    if (tv.selectedMemberId === ALL_SENTINEL) return "Showing: All team members";
    const name = tv.memberOptions.find(m => m.id === tv.selectedMemberId)?.name;
    return name ? `Showing: ${name}` : "Showing: All team members";
  };

  return (
    <div
      className="flex items-center gap-3 flex-wrap mb-5 px-4 py-2.5 rounded-2xl"
      style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)", border: "1px solid #bfdbfe" }}
    >
      {/* Team icon + label */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#1d4ed8" }}>
          <Users className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#1e40af" }}>
            Team View
          </p>
          <p className="text-[12px] font-semibold leading-none" style={{ color: "#1d4ed8" }}>
            {tv.teamLabel}
          </p>
        </div>
      </div>

      {/* Styled selector */}
      <div className="w-px h-6 shrink-0" style={{ background: "#bfdbfe" }} />
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium" style={{ color: "#1e40af" }}>Viewing:</span>
        <TeamMemberDropdown tv={tv} />
      </div>

      {/* Quick links */}
      {quickLinks && quickLinks.length > 0 && (
        <>
          <div className="w-px h-6 shrink-0" style={{ background: "#bfdbfe" }} />
          <div className="flex items-center gap-2 flex-wrap">
            {quickLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
                style={{ color: "#1d4ed8", background: "#dbeafe" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#bfdbfe"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#dbeafe"}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Status */}
      <div className="ml-auto text-[11px]" style={{ color: "#3b82f6" }}>
        {statusText()}
      </div>
    </div>
  );
}
