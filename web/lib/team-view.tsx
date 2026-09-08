"use client";

/**
 * Team-view support for heads of department.
 *
 * When a head-of-department role is active the user can switch between:
 *   "Me"           → their own records only
 *   "All"          → every team member combined
 *   a specific WM  → one team member's records
 *
 * Extend HEAD_CODES to add new head-of-department roles.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePosition } from "./position";
import { useAuth } from "./auth";
import { Users, ChevronDown } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Sentinel value meaning "show only the head's own records". */
export const ME_SENTINEL = "__me__";

/** Sentinel value meaning "show all team members". */
export const ALL_SENTINEL = "__all__";

// Role codes that grant team-head view. Add new codes here as needed.
const HEAD_CODES: Record<string, { label: string; teamLabel: string }> = {
  GROUP_HEAD_WEALTH_MGMT: { label: "Group Head, WM",     teamLabel: "Wealth Management Team" },
  HEAD_OF_INVESTMENT:     { label: "Head of Investment",  teamLabel: "Investment Team" },
};

// ── Types ──────────────────────────────────────────────────────────────────────

export type WMOption = { id: string; name: string };

export interface TeamViewState {
  /** True when the active role is a recognised head-of-department. */
  isTeamHead: boolean;
  /** Display label for the current head role, e.g. "Group Head, WM". */
  headLabel: string;
  /** Team label, e.g. "Wealth Management Team". */
  teamLabel: string;
  /**
   * Current selection:
   *   ME_SENTINEL  → my own data
   *   ALL_SENTINEL → all team members
   *   {userId}     → a specific team member
   */
  selectedMemberId: string;
  setSelectedMemberId: (id: string) => void;
  /** The current user's own ID (useful for pages that need to build their own filter). */
  myUserId: string;
  /** Registered team-member options (populated by the page via setMemberOptions). */
  memberOptions: WMOption[];
  setMemberOptions: (opts: WMOption[]) => void;
  /**
   * Returns true if a record belonging to `initiatorId` should be shown.
   * Uses the current selectedMemberId to decide.
   * Non-heads: always returns false (pages handle their own per-user filter).
   */
  shouldInclude: (initiatorId: string) => boolean;
  /**
   * Variant of shouldInclude for data that is attributed by display name
   * rather than user ID (e.g. interaction wm_name strings).
   */
  shouldIncludeName: (wmName: string, myDisplayName: string) => boolean;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useTeamView(): TeamViewState {
  const { activePosition }   = usePosition();
  const { user }             = useAuth();
  const code  = activePosition?.code ?? "";
  const meta  = HEAD_CODES[code];
  const isTeamHead = Boolean(meta);

  const [selectedMemberId, setSelectedMemberId] = useState<string>(ME_SENTINEL);
  const [memberOptions, setMemberOptions]       = useState<WMOption[]>([]);

  const myUserId = user?.ID ?? "";

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
      // specific member: match by name (memberOptions stores name as id when no UUID available)
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
    shouldInclude,
    shouldIncludeName,
  };
}

// ── TeamViewBar ────────────────────────────────────────────────────────────────

interface TeamViewBarProps {
  tv: TeamViewState;
  quickLinks?: { href: string; label: string }[];
}

export function TeamViewBar({ tv, quickLinks }: TeamViewBarProps) {
  if (!tv.isTeamHead) return null;

  const labelFor = (id: string) => {
    if (id === ME_SENTINEL)  return "Me (my data)";
    if (id === ALL_SENTINEL) return `All ${tv.teamLabel.split(" ")[0]} Managers`;
    return tv.memberOptions.find(m => m.id === id)?.name ?? id;
  };

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
      {/* Icon + label */}
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

      {/* Selector — always rendered for team heads */}
      <>
        <div className="w-px h-6 shrink-0" style={{ background: "#bfdbfe" }} />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium" style={{ color: "#1e40af" }}>Viewing:</span>
          <div className="relative">
            <select
              value={tv.selectedMemberId}
              onChange={e => tv.setSelectedMemberId(e.target.value)}
              className="appearance-none h-7 pl-2.5 pr-6 rounded-lg text-[12px] font-semibold outline-none cursor-pointer"
              style={{ background: "#fff", border: "1px solid #93c5fd", color: "#1d4ed8" }}
            >
              <option value={ME_SENTINEL}>Me (my data)</option>
              <option value={ALL_SENTINEL}>All {tv.teamLabel.split(" ")[0]} Managers</option>
              {tv.memberOptions.length > 0 && (
                <optgroup label="── Individual ──">
                  {tv.memberOptions.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <ChevronDown
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
              style={{ color: "#1d4ed8" }}
            />
          </div>
        </div>
      </>

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

      {/* Status text */}
      <div className="ml-auto text-[11px]" style={{ color: "#3b82f6" }}>
        {statusText()}
      </div>
    </div>
  );
}
