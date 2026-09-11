"use client";

import { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from "react";
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
  /** Server-authoritative role family — set by the backend on GET /org/me/positions. */
  family?: string;
}

// Canonical role codes — must match position codes in the database.
// Add new codes here as new positions are created; the nav/routing system
// uses family-pattern matching so unknown codes still work without changes.
export const ROLE = {
  // Group-level
  GROUP_ADMIN:                   "GROUP_ADMIN",
  HR_MANAGER:                    "HR_MANAGER",
  HR_OFFICER:                    "HR_OFFICER",
  IT_ADMIN:                      "IT_ADMIN",
  COMPLIANCE_MANAGER:            "COMPLIANCE_MANAGER",
  EXECUTIVE_DIRECTOR:            "EXECUTIVE_DIRECTOR",
  // Page Asset Management
  MANAGING_DIRECTOR:             "MANAGING_DIRECTOR",
  HEAD_OF_OPERATIONS:            "HEAD_OF_OPERATIONS",
  TREASURY_OPS_FINANCE_MGR:      "TREASURY_OPS_FINANCE_MGR",
  FUND_TREASURY_OPERATIONS:      "FUND_TREASURY_OPERATIONS",
  TL_FINANCIAL_REPORTING:        "TL_FINANCIAL_REPORTING",
  FINANCE_OPS_ASSOCIATE:         "FINANCE_OPS_ASSOCIATE",
  FINANCE_OPS_INTERN:            "FINANCE_OPS_INTERN",
  DATA_ANALYST_INTERN:           "DATA_ANALYST_INTERN",
  OPERATIONS_EXECUTIVE:          "OPERATIONS_EXECUTIVE",
  OPERATIONS_ASSOCIATE:          "OPERATIONS_ASSOCIATE",
  GROUP_HEAD_WEALTH_MGMT:        "GROUP_HEAD_WEALTH_MGMT",
  PORTFOLIO_MANAGER:             "PORTFOLIO_MANAGER",
  EQUITY_TRADER:                 "EQUITY_TRADER",
  PORTFOLIO_MGMT_ASSISTANT:      "PORTFOLIO_MGMT_ASSISTANT",
  WEALTH_MANAGER:                "WEALTH_MANAGER",
  HEAD_CORPORATE_COMPLIANCE:     "HEAD_CORPORATE_COMPLIANCE",
  HEAD_COMPLIANCE_CORPORATE:     "HEAD_COMPLIANCE_CORPORATE",
  INTERNAL_CONTROL_OFFICER:      "INTERNAL_CONTROL_OFFICER",
  ADMIN_OFFICER:                 "ADMIN_OFFICER",
  ADMIN_LOGISTICS_OFFICER:       "ADMIN_LOGISTICS_OFFICER",
  BRAND_STRATEGY_MANAGER:        "BRAND_STRATEGY_MANAGER",
  IT_SUPPORT:                    "IT_SUPPORT",
  HEAD_HR:                       "HEAD_HR",
  HEAD_HUMAN_CAPITAL:            "HEAD_HUMAN_CAPITAL",
  HR_OPS_MANAGER:                "HR_OPS_MANAGER",
  HR_ADMIN:                      "HR_ADMIN",
  HC_OFFICER:                    "HC_OFFICER",
  HC_MANAGER:                    "HC_MANAGER",
  // Page Capital
  HEAD_OF_INVESTMENT:            "HEAD_OF_INVESTMENT",
  HEAD_INVESTMENT_MGMT:          "HEAD_INVESTMENT_MGMT",
  GROUP_HEAD_BUSINESS_DEV:       "GROUP_HEAD_BUSINESS_DEV",
  HEAD_RISK_TRADE_MGMT:          "HEAD_RISK_TRADE_MGMT",
  TL_RESEARCH_RISK_MGMT:         "TL_RESEARCH_RISK_MGMT",
  TRADING_RESEARCH_ANALYST:      "TRADING_RESEARCH_ANALYST",
  QUANT_MARKET_ANALYST:          "QUANT_MARKET_ANALYST",
  INVESTMENT_RESEARCH_TRAINEE:   "INVESTMENT_RESEARCH_TRAINEE",
  LEAD_SOFTWARE_ENGINEER:        "LEAD_SOFTWARE_ENGINEER",
  // Cross-subsidiary
  RECONCILIATION_OFFICER:        "RECONCILIATION_OFFICER",
  TREASURY_ANALYST:              "TREASURY_ANALYST",
  FINOPS_MANAGER:                "FINOPS_MANAGER",
  FINANCE_OFFICER:               "FINANCE_OFFICER",
  RELATIONSHIP_MANAGER:          "RELATIONSHIP_MANAGER",
} as const;

export type RoleCode = (typeof ROLE)[keyof typeof ROLE];

// roleFamily is a FALLBACK for rendering other users' position codes or when
// position.family is not yet available from the API.
// For the current logged-in user's family, use primaryFamily from usePosition().
//
// Maps a position code to a role family for nav/routing/badge decisions.
// Patterns are evaluated in priority order; more specific checks come first.
export function roleFamily(code: string | null | undefined): "wm" | "md" | "hr" | "finance" | "compliance" | "pm" | "default" {
  if (!code) return "default";
  const c = code.toUpperCase();
  // HR family — HR_*, HC_*, *_HR suffix, human capital, payroll, recruitment
  if (c.startsWith("HR_") || c.startsWith("HC_") || c.endsWith("_HR") ||
      c.includes("HUMAN_CAPITAL") || c.includes("PAYROLL") ||
      c.includes("RECRUITMENT") || c.includes("TALENT")) return "hr";
  // GROUP_HEAD_WEALTH_MGMT — stays in WM family to retain all client/pipeline/CRM features.
  // Access to /pm/* is granted by adding "wm" to the pm layout guard.
  if (c === "GROUP_HEAD_WEALTH_MGMT") return "wm";
  // MD/Senior leadership — directors, group admins, executive director
  if (c === "MANAGING_DIRECTOR" || c === "EXECUTIVE_DIRECTOR" || c === "GROUP_ADMIN" ||
      c.includes("DIRECTOR") || c.startsWith("CEO") || c.startsWith("CXO")) return "md";
  // Investment/BizDev heads — PM workspace + appraisal management, but NOT HR admin write
  if (c === "HEAD_OF_INVESTMENT" || c === "HEAD_INVESTMENT_MGMT" ||
      c === "GROUP_HEAD_BUSINESS_DEV") return "pm";
  // PM family — portfolio managers, traders, investment roles
  if (c === "PORTFOLIO_MANAGER" || c === "PORTFOLIO_MGMT_ASSISTANT" || c === "EQUITY_TRADER" ||
      c === "INVESTMENT_ANALYST" || c === "FUND_MANAGER" || c === "TRADER" ||
      c === "DEALING_OFFICER" || c === "SETTLEMENT_OFFICER" || c === "BROKER_SALES_OFFICER") return "pm";
  // WM family — wealth management, relationship managers
  if (c.includes("WEALTH") || c.includes("PORTFOLIO") ||
      c.includes("RELATIONSHIP_MANAGER") || c.startsWith("RM_")) return "wm";
  // Finance/Ops family — operations, treasury, finance reporting, reconciliation
  if (c.includes("FINANCE") || c.includes("FINANCIAL") || c.includes("FINOPS") ||
      c.includes("TREASURY") || c.includes("ACCOUNT") || c.includes("RECONCILI") ||
      c.includes("LEDGER") || c.includes("AUDIT") || c.includes("OPERATIONS") ||
      c.includes("FUND_TREASURY") || c.includes("DATA_ANALYST")) return "finance";
  // Compliance/Risk family — compliance, risk, control, AML, KYC, quant/trading research
  if (c.includes("COMPLIANCE") || c.includes("RISK") || c.includes("AML") ||
      c.includes("KYC") || c.includes("REGULATORY") || c.includes("CONTROL") ||
      c.includes("INTERNAL_CONTROL") || c.includes("RESEARCH_RISK") ||
      c.includes("TRADE_MGMT") || c.includes("QUANT") ||
      c === "TRADING_RESEARCH_ANALYST" || c === "QUANT_MARKET_ANALYST" ||
      c === "TL_RESEARCH_RISK_MGMT" || c === "INVESTMENT_RESEARCH_TRAINEE" ||
      c === "TRADING_RESEARCH_TRAINEE" || c === "RESEARCH_ANALYST") return "compliance";
  return "default";
}

// Demo positions — shown when the user has no real org assignments yet.
// SECURITY: Only read-only / low-privilege roles are included here.
// Elevated roles (GROUP_ADMIN, MANAGING_DIRECTOR, HR_MANAGER) are intentionally
// excluded so that demo mode cannot be used to bypass RoleGuard checks.
export const DEMO_POSITIONS: UserPosition[] = [
  { id:"demo-wm",         code:"WEALTH_MANAGER",            title:"Wealth Manager",                   is_primary:true,  isDemo:true },
  { id:"demo-pm",         code:"PORTFOLIO_MANAGER",         title:"Portfolio Manager",                is_primary:false, isDemo:true },
  { id:"demo-recon",      code:"RECONCILIATION_OFFICER",    title:"Reconciliation Officer",           is_primary:false, isDemo:true },
];

interface PositionCtx {
  positions:           UserPosition[];
  activePosition:      UserPosition | null;
  setActive:           (p: UserPosition) => void;
  isLoading:           boolean;
  /** True if the position API call failed (network error / non-2xx). */
  positionLoadError:   boolean;
  /** True if the user holds the given position code in the current subsidiary. */
  hasRole:             (code: string) => boolean;
  /** The primary role code, or null while loading. */
  primaryCode:         string | null;
  /**
   * Server-authoritative role family for the primary position.
   * Sourced from position.family returned by GET /org/me/positions.
   * Falls back to roleFamily(primaryCode) for demo/legacy positions.
   */
  primaryFamily:  string;
  /** True when running in demo mode (no real org assignments found). */
  isDemoMode:          boolean;
  /**
   * True when the logged-in user is a GROUP_ADMIN and has role-simulation
   * available. In this mode the position list includes all DEMO_POSITIONS so
   * the admin can "View As" any role without leaving the session.
   */
  isAdminMode:         boolean;
  /** The real GROUP_ADMIN position — always available for admin users to return to. */
  adminPosition:       UserPosition | null;
}

const Ctx = createContext<PositionCtx>({
  positions: [], activePosition: null, setActive: () => {}, isLoading: true,
  positionLoadError: false,
  hasRole: () => false, primaryCode: null, primaryFamily: "default", isDemoMode: false,
  isAdminMode: false, adminPosition: null,
});

// ── Provider ───────────────────────────────────────────────────────────────────

export function PositionProvider({ children }: { children: ReactNode }) {
  const { user, subsidiary } = useAuth();
  const [positions, setPositions]                 = useState<UserPosition[]>([]);
  const [activePosition, setActivePosition]       = useState<UserPosition | null>(null);
  const [isLoading, setIsLoading]                 = useState(true);
  const [positionLoadError, setPositionLoadError] = useState(false);
  const [isDemoMode, setIsDemoMode]               = useState(false);
  const [isAdminMode, setIsAdminMode]             = useState(false);
  const [adminPosition, setAdminPosition]         = useState<UserPosition | null>(null);

  // Derive primaryFamily from the active position. Prefer the server-authoritative
  // position.family field; fall back to roleFamily() for demo/legacy positions.
  const primaryFamily = useMemo(() => {
    if (!activePosition) return "default";
    if (activePosition.family && activePosition.family !== "default") {
      return activePosition.family;
    }
    return roleFamily(activePosition.code);
  }, [activePosition]);

  useEffect(() => {
    if (!user || !subsidiary) { setIsLoading(false); return; }
    setIsLoading(true);
    setPositionLoadError(false);

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";
    fetch(`${baseUrl}/api/v1/org/me/positions?subsidiary_id=${subsidiary.ID}`, { credentials: "include" })
      .then(async res => {
        if (!res.ok) return [] as UserPosition[];
        const json = await res.json() as UserPosition[] | null;
        return (json ?? []) as UserPosition[];
      })
      .then((list: UserPosition[]) => {
        if (list.length > 0) {
          const isAdmin = list.some(p => p.code === "GROUP_ADMIN");
          if (isAdmin) {
            // GROUP_ADMIN: inject the full DEMO_POSITIONS list so they can
            // "View As" any role while remaining logged in as themselves.
            const realAdminPos = list.find(p => p.code === "GROUP_ADMIN") ?? list[0];
            const viewAsOptions: UserPosition[] = DEMO_POSITIONS.filter(d => d.code !== "GROUP_ADMIN");
            const merged = [realAdminPos, ...list.filter(p => p.code !== "GROUP_ADMIN"), ...viewAsOptions];
            setIsDemoMode(false);
            setIsAdminMode(true);
            setAdminPosition(realAdminPos);
            setPositions(merged);
            // Restore last "view as" selection if any
            const savedViewAs = localStorage.getItem("pageos_view_as");
            const viewAs = savedViewAs ? merged.find(p => p.code === savedViewAs) : null;
            setActivePosition(viewAs ?? realAdminPos);
          } else {
            setIsDemoMode(false);
            setIsAdminMode(false);
            setAdminPosition(null);
            setPositions(list);
            const saved = localStorage.getItem(`pageos_position_${subsidiary.ID}`);
            const found = saved ? list.find(p => p.id === saved) : null;
            setActivePosition(found ?? list.find(p => p.is_primary) ?? list[0]);
          }
        } else {
          // No real positions — activate demo mode so UI can be previewed
          setIsDemoMode(true);
          setIsAdminMode(false);
          setAdminPosition(null);
          setPositions(DEMO_POSITIONS);
          const savedDemo = localStorage.getItem("pageos_demo_role");
          const found = savedDemo ? DEMO_POSITIONS.find(p => p.code === savedDemo) : null;
          setActivePosition(found ?? DEMO_POSITIONS[0]);
        }
      })
      .catch(() => {
        // SECURITY: A network/server error must NOT grant demo-mode access.
        // Set an error flag so the UI can display an appropriate message.
        setPositionLoadError(true);
        setIsDemoMode(false);
        setIsAdminMode(false);
        setAdminPosition(null);
        setPositions([]);
        setActivePosition(null);
      })
      .finally(() => setIsLoading(false));
  }, [user?.ID, subsidiary?.ID]);

  const setActive = useCallback((p: UserPosition) => {
    setActivePosition(p);
    if (isAdminMode) {
      // Admin "View As" — persist the selected simulation role separately
      localStorage.setItem("pageos_view_as", p.code);
    } else if (p.isDemo) {
      localStorage.setItem("pageos_demo_role", p.code);
    } else if (subsidiary) {
      localStorage.setItem(`pageos_position_${subsidiary.ID}`, p.id);
    }
  }, [subsidiary?.ID, isAdminMode]);

  const hasRole     = useCallback((code: string) => positions.some(p => p.code === code), [positions]);
  const primaryCode = activePosition?.code ?? null;

  return (
    <Ctx.Provider value={{
      positions, activePosition, setActive, isLoading,
      positionLoadError,
      hasRole, primaryCode, primaryFamily, isDemoMode,
      isAdminMode, adminPosition,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePosition(): PositionCtx {
  return useContext(Ctx);
}
