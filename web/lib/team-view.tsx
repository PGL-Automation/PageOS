"use client";

/**
 * Team-view support for heads of department.
 *
 * When a head-of-department role is active they see aggregated data
 * for their entire team. This module provides:
 *   - useTeamView()   — hook that returns head status + WM selector state
 *   - TeamViewBar     — sticky banner that renders the WM filter UI
 *
 * Extend HEAD_CODES as new head-of-department roles are added.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePosition } from "./position";
import { Users, ChevronDown } from "lucide-react";

// Role codes that grant team-head view. Add new head roles here.
const HEAD_CODES: Record<string, { label: string; teamLabel: string }> = {
  GROUP_HEAD_WEALTH_MGMT: { label: "Group Head, WM",  teamLabel: "Wealth Management Team" },
  HEAD_OF_INVESTMENT:     { label: "Head of Investment", teamLabel: "Investment Team" },
};

export type WMOption = { id: string; name: string };

export interface TeamViewState {
  /** True when the active role is a recognised head-of-department. */
  isTeamHead: boolean;
  /** Display label for the current head role, e.g. "Group Head, WM". */
  headLabel: string;
  /** Team label, e.g. "Wealth Management Team". */
  teamLabel: string;
  /** The currently-selected team member's user ID, or null for "all". */
  selectedMemberId: string | null;
  setSelectedMemberId: (id: string | null) => void;
  /** Registered WM/team-member options (populated by the page). */
  memberOptions: WMOption[];
  setMemberOptions: (opts: WMOption[]) => void;
  /**
   * Returns true if a case/record with the given initiatorId should be shown.
   * Non-heads: always returns false (they handle their own filter).
   * Heads:     returns true for all (when selectedMemberId is null)
   *            or for the selected member only.
   */
  shouldInclude: (initiatorId: string) => boolean;
}

export function useTeamView(): TeamViewState {
  const { activePosition } = usePosition();
  const code = activePosition?.code ?? "";
  const meta = HEAD_CODES[code];
  const isTeamHead = Boolean(meta);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberOptions, setMemberOptions]       = useState<WMOption[]>([]);

  const shouldInclude = useMemo(
    () => (initiatorId: string) => {
      if (!isTeamHead) return false;
      if (!selectedMemberId) return true;
      return initiatorId === selectedMemberId;
    },
    [isTeamHead, selectedMemberId]
  );

  return {
    isTeamHead,
    headLabel:  meta?.label    ?? "",
    teamLabel:  meta?.teamLabel ?? "",
    selectedMemberId,
    setSelectedMemberId,
    memberOptions,
    setMemberOptions,
    shouldInclude,
  };
}

// ── TeamViewBar ────────────────────────────────────────────────────────────────

interface TeamViewBarProps {
  tv: TeamViewState;
  /** Optional extra nav links (e.g. quick-switch to related pages). */
  quickLinks?: { href: string; label: string }[];
}

export function TeamViewBar({ tv, quickLinks }: TeamViewBarProps) {
  if (!tv.isTeamHead) return null;

  const selected = tv.memberOptions.find(m => m.id === tv.selectedMemberId);

  return (
    <div
      className="flex items-center gap-3 flex-wrap mb-5 px-4 py-2.5 rounded-2xl"
      style={{
        background:  "linear-gradient(135deg,#eff6ff,#dbeafe)",
        border:      "1px solid #bfdbfe",
      }}
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

      {/* WM selector (only shown once memberOptions are populated) */}
      {tv.memberOptions.length > 0 && (
        <>
          <div className="w-px h-6 shrink-0" style={{ background: "#bfdbfe" }} />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium" style={{ color: "#1e40af" }}>Viewing:</span>
            <div className="relative">
              <select
                value={tv.selectedMemberId ?? ""}
                onChange={e => tv.setSelectedMemberId(e.target.value || null)}
                className="appearance-none h-7 pl-2.5 pr-6 rounded-lg text-[12px] font-semibold outline-none cursor-pointer"
                style={{
                  background: "#fff",
                  border:     "1px solid #93c5fd",
                  color:      "#1d4ed8",
                }}
              >
                <option value="">All {tv.teamLabel.split(" ")[0]} Managers</option>
                {tv.memberOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <ChevronDown
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
                style={{ color: "#1d4ed8" }}
              />
            </div>
            {tv.selectedMemberId && (
              <button
                onClick={() => tv.setSelectedMemberId(null)}
                className="text-[11px] font-medium underline"
                style={{ color: "#1e40af" }}
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}

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

      {/* Right: "Personal view" note */}
      <div className="ml-auto text-[11px]" style={{ color: "#3b82f6" }}>
        {selected ? `Showing: ${selected.name}` : "Showing all team members"}
      </div>
    </div>
  );
}
