"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAuth } from "./auth";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UserPosition {
  id: string;
  code: string;          // WEALTH_MANAGER | MANAGING_DIRECTOR | COMPLIANCE_MANAGER | ...
  title: string;
  subsidiary_id?: string;
  department_id?: string;
  is_primary: boolean;
  isDemo?: boolean;      // true when using client-side demo mode (no org assignment yet)
}

// Canonical role codes — must match position codes in the database.
export const ROLE = {
  WEALTH_MANAGER:     "WEALTH_MANAGER",
  MANAGING_DIRECTOR:  "MANAGING_DIRECTOR",
  COMPLIANCE_MANAGER: "COMPLIANCE_MANAGER",
  FINANCE_OFFICER:    "FINANCE_OFFICER",
  HR_MANAGER:         "HR_MANAGER",
} as const;

export type RoleCode = (typeof ROLE)[keyof typeof ROLE];

// Demo positions — shown when the user has no real org assignments yet.
// These let developers preview each role view without fully wiring org assignments.
// In production, all users are onboarded by HR and have real assignments.
export const DEMO_POSITIONS: UserPosition[] = [
  { id:"demo-admin",      code:"GROUP_ADMIN",        title:"Group Administrator", is_primary:true,  isDemo:true },
  { id:"demo-hr",         code:"HR_MANAGER",         title:"HR Manager",          is_primary:false, isDemo:true },
  { id:"demo-wm",         code:"WEALTH_MANAGER",     title:"Wealth Manager",      is_primary:false, isDemo:true },
  { id:"demo-md",         code:"MANAGING_DIRECTOR",  title:"Managing Director",   is_primary:false, isDemo:true },
  { id:"demo-compliance", code:"COMPLIANCE_MANAGER", title:"Compliance Manager",  is_primary:false, isDemo:true },
  { id:"demo-finance",    code:"FINANCE_OFFICER",    title:"Finance Officer",     is_primary:false, isDemo:true },
];

interface PositionCtx {
  positions:      UserPosition[];
  activePosition: UserPosition | null;
  setActive:      (p: UserPosition) => void;
  isLoading:      boolean;
  /** True if the user holds the given position code in the current subsidiary. */
  hasRole:        (code: string) => boolean;
  /** The primary role code, or null while loading. */
  primaryCode:    string | null;
  /** True when running in demo mode (no real org assignments found). */
  isDemoMode:     boolean;
}

const Ctx = createContext<PositionCtx>({
  positions: [], activePosition: null, setActive: () => {}, isLoading: true,
  hasRole: () => false, primaryCode: null, isDemoMode: false,
});

// ── Provider ───────────────────────────────────────────────────────────────────

export function PositionProvider({ children }: { children: ReactNode }) {
  const { user, subsidiary } = useAuth();
  const [positions, setPositions]           = useState<UserPosition[]>([]);
  const [activePosition, setActivePosition] = useState<UserPosition | null>(null);
  const [isLoading, setIsLoading]           = useState(true);
  const [isDemoMode, setIsDemoMode]         = useState(false);

  useEffect(() => {
    if (!user || !subsidiary) { setIsLoading(false); return; }
    setIsLoading(true);

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";
    fetch(`${baseUrl}/api/v1/org/me/positions?subsidiary_id=${subsidiary.ID}`, { credentials: "include" })
      .then(async res => {
        if (!res.ok) return [] as UserPosition[];
        const json = await res.json() as UserPosition[] | null;
        return (json ?? []) as UserPosition[];
      })
      .then((list: UserPosition[]) => {
        if (list.length > 0) {
          // Real positions found — use them
          setIsDemoMode(false);
          setPositions(list);
          const saved = localStorage.getItem(`pageos_position_${subsidiary.ID}`);
          const found = saved ? list.find(p => p.id === saved) : null;
          setActivePosition(found ?? list.find(p => p.is_primary) ?? list[0]);
        } else {
          // No real positions — activate demo mode so UI can be previewed
          setIsDemoMode(true);
          setPositions(DEMO_POSITIONS);
          const savedDemo = localStorage.getItem("pageos_demo_role");
          const found = savedDemo ? DEMO_POSITIONS.find(p => p.code === savedDemo) : null;
          setActivePosition(found ?? DEMO_POSITIONS[0]);
        }
      })
      .catch(() => {
        // On network error, still fall back to demo mode
        setIsDemoMode(true);
        setPositions(DEMO_POSITIONS);
        const savedDemo = localStorage.getItem("pageos_demo_role");
        const found = savedDemo ? DEMO_POSITIONS.find(p => p.code === savedDemo) : null;
        setActivePosition(found ?? DEMO_POSITIONS[0]);
      })
      .finally(() => setIsLoading(false));
  }, [user?.ID, subsidiary?.ID]);

  const setActive = useCallback((p: UserPosition) => {
    setActivePosition(p);
    if (p.isDemo) {
      localStorage.setItem("pageos_demo_role", p.code);
    } else if (subsidiary) {
      localStorage.setItem(`pageos_position_${subsidiary.ID}`, p.id);
    }
  }, [subsidiary?.ID]);

  const hasRole     = useCallback((code: string) => positions.some(p => p.code === code), [positions]);
  const primaryCode = activePosition?.code ?? null;

  return (
    <Ctx.Provider value={{ positions, activePosition, setActive, isLoading, hasRole, primaryCode, isDemoMode }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePosition(): PositionCtx {
  return useContext(Ctx);
}
