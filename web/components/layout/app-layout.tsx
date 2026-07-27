"use client";

import { ReactNode, useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Brain, TrendingUp, RefreshCw, BookOpen, FileText,
  CreditCard, Wallet, Target, BarChart2, LineChart, UserPlus, Users,
  DollarSign, UserSearch, CheckSquare, Shield, AlertTriangle, Search,
  ShoppingCart, FolderOpen, Zap, BarChart, PieChart, Settings,
  Bell, Command, ChevronDown, Check, Building2, LogOut, Loader2,
  PanelLeft, ChevronRight, Inbox, Sun, Moon, X, Clock,
  CheckCircle2, AlertCircle, Info, FileBarChart,
  Star, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { usePosition, ROLE } from "@/lib/position";

// ── Nav tree per role ──────────────────────────────────────────────────────────

type NavItem  = { href: string; label: string; icon: React.ElementType; badge?: string };
type NavGroup = { id: string; label?: string; items: NavItem[] };

const WM_NAV: NavGroup[] = [
  { id: "core", items: [
    { href: "/wm/dashboard",          label: "My Dashboard",   icon: LayoutDashboard },
    { href: "/ai",                    label: "AI Copilot",     icon: Brain, badge: "AI" },
  ]},
  { id: "clients", label: "My Clients", items: [
    { href: "/wm/clients",            label: "Client List",    icon: Users },
    { href: "/dashboard",             label: "RM Pipeline",    icon: LineChart },
    { href: "/investments/onboarding",label: "New Onboarding", icon: UserPlus },
  ]},
  { id: "business", label: "My Business", items: [
    { href: "/wm/commission",         label: "My Commission",  icon: DollarSign },
    { href: "/approval",              label: "Approvals",      icon: CheckSquare },
    { href: "/documents",             label: "Documents",      icon: FolderOpen },
  ]},
];

const MD_NAV: NavGroup[] = [
  { id: "core", items: [
    { href: "/dashboard",             label: "Executive",      icon: LayoutDashboard },
    { href: "/ai",                    label: "AI Copilot",     icon: Brain, badge: "AI" },
  ]},
  { id: "team", label: "My Team", items: [
    { href: "/md/team",               label: "Team Overview",  icon: Users },
    { href: "/md/targets",            label: "WM Targets",     icon: Target },
  ]},
  { id: "commission", label: "Commission", items: [
    { href: "/md/commission-rates",   label: "Rate Config",    icon: Star },
    { href: "/md/exchange-rates",     label: "Exchange Rates", icon: RefreshCw },
  ]},
  { id: "ops", label: "Operations", items: [
    { href: "/investments/onboarding",label: "Onboarding",     icon: UserPlus },
    { href: "/approval",              label: "Approvals",      icon: CheckSquare },
    { href: "/reports",               label: "Reports",        icon: FileBarChart },
  ]},
  { id: "finance", label: "Finance", items: [
    { href: "/finance",               label: "Finance",        icon: TrendingUp },
    { href: "/finance/reconciliation",label: "Reconciliation", icon: RefreshCw },
  ]},
];

const COMPLIANCE_NAV: NavGroup[] = [
  { id: "core", items: [
    { href: "/dashboard",             label: "Dashboard",      icon: LayoutDashboard },
    { href: "/ai",                    label: "AI Copilot",     icon: Brain, badge: "AI" },
  ]},
  { id: "compliance", label: "Compliance", items: [
    { href: "/compliance",            label: "Queue",          icon: Shield },
    { href: "/risk",                  label: "Risk",           icon: AlertTriangle },
    { href: "/audit",                 label: "Internal Audit", icon: Search },
  ]},
  { id: "actions", label: "Actions", items: [
    { href: "/approval",              label: "Approvals",      icon: CheckSquare },
    { href: "/documents",             label: "Documents",      icon: FolderOpen },
  ]},
];

const FINANCE_NAV: NavGroup[] = [
  { id: "core", items: [
    { href: "/dashboard",             label: "Dashboard",      icon: LayoutDashboard },
    { href: "/ai",                    label: "AI Copilot",     icon: Brain, badge: "AI" },
  ]},
  { id: "finance", label: "Finance", items: [
    { href: "/finance",               label: "Overview",       icon: TrendingUp },
    { href: "/finance/reconciliation",label: "Reconciliation", icon: RefreshCw },
    { href: "/finance/ledger",        label: "General Ledger", icon: BookOpen },
    { href: "/finance/journals",      label: "Journals",       icon: FileText },
    { href: "/finance/payables",      label: "Payables",       icon: CreditCard },
    { href: "/finance/receivables",   label: "Receivables",    icon: Wallet },
  ]},
  { id: "reporting", label: "Reporting", items: [
    { href: "/reports",               label: "Reports",        icon: FileBarChart },
    { href: "/approval",              label: "Approvals",      icon: CheckSquare },
  ]},
];

const HR_NAV: NavGroup[] = [
  { id: "core", items: [
    { href: "/hr/dashboard",      label: "HR Dashboard",    icon: LayoutDashboard },
    { href: "/ai",                label: "AI Copilot",      icon: Brain, badge: "AI" },
  ]},
  { id: "hr", label: "People", items: [
    { href: "/hr/records",        label: "Employee Directory", icon: Users },
    { href: "/hr/org-chart",      label: "Org Chart",          icon: Building2 },
    { href: "/hr/admin",          label: "User Management",    icon: UserSearch },
    { href: "/recruitment",       label: "Recruitment",        icon: UserPlus },
  ]},
  { id: "payroll", label: "Payroll & Benefits", items: [
    { href: "/payroll",           label: "Payroll",         icon: DollarSign },
  ]},
  { id: "actions", label: "Actions", items: [
    { href: "/approval",          label: "Approvals",       icon: CheckSquare },
    { href: "/documents",         label: "Documents",       icon: FolderOpen },
  ]},
];

const ADMIN_NAV: NavGroup[] = [
  { id: "core", items: [
    { href: "/dashboard",              label: "Dashboard",        icon: LayoutDashboard },
    { href: "/ai",                     label: "AI Copilot",       icon: Brain, badge: "AI" },
  ]},
  { id: "admin", label: "Administration", items: [
    { href: "/hr/admin",               label: "User Management",  icon: Users },
    { href: "/settings",               label: "System Settings",  icon: Settings },
  ]},
  { id: "finance", label: "Finance", items: [
    { href: "/finance",                label: "Overview",         icon: TrendingUp },
    { href: "/finance/reconciliation", label: "Reconciliation",   icon: RefreshCw },
    { href: "/finance/ledger",         label: "General Ledger",   icon: BookOpen },
    { href: "/finance/journals",       label: "Journals",         icon: FileText },
  ]},
  { id: "governance", label: "Governance", items: [
    { href: "/approval",               label: "Approvals",        icon: CheckSquare },
    { href: "/compliance",             label: "Compliance",       icon: Shield },
    { href: "/risk",                   label: "Risk",             icon: AlertTriangle },
  ]},
  { id: "ops", label: "Operations", items: [
    { href: "/investments/onboarding", label: "Onboarding",       icon: UserPlus },
    { href: "/hr",                     label: "HR",               icon: Users },
    { href: "/payroll",                label: "Payroll",          icon: DollarSign },
  ]},
  { id: "intel", label: "Intelligence", items: [
    { href: "/reports",                label: "Reports",          icon: FileBarChart },
    { href: "/analytics",              label: "Analytics",        icon: BarChart },
  ]},
];

const DEFAULT_NAV: NavGroup[] = [
  { id: "core", items: [
    { href: "/dashboard",             label: "Dashboard",      icon: LayoutDashboard },
    { href: "/ai",                    label: "AI Copilot",     icon: Brain, badge: "AI" },
  ]},
  { id: "finance", label: "Finance", items: [
    { href: "/finance",               label: "Overview",       icon: TrendingUp },
    { href: "/finance/reconciliation",label: "Reconciliation", icon: RefreshCw },
    { href: "/finance/ledger",        label: "General Ledger", icon: BookOpen },
    { href: "/finance/journals",      label: "Journals",       icon: FileText },
  ]},
  { id: "governance", label: "Governance", items: [
    { href: "/approval",              label: "Approvals",      icon: CheckSquare },
    { href: "/compliance",            label: "Compliance",     icon: Shield },
    { href: "/risk",                  label: "Risk",           icon: AlertTriangle },
  ]},
  { id: "ops", label: "Operations", items: [
    { href: "/investments/onboarding",label: "Onboarding",     icon: UserPlus },
    { href: "/crm",                   label: "CRM",            icon: Users },
    { href: "/hr",                    label: "HR",             icon: Users },
    { href: "/procurement",           label: "Procurement",    icon: ShoppingCart },
  ]},
  { id: "intel", label: "Intelligence", items: [
    { href: "/reports",               label: "Reports",        icon: FileBarChart },
    { href: "/analytics",             label: "Analytics",      icon: BarChart },
  ]},
];

function navForRole(code: string | null): NavGroup[] {
  switch (code) {
    case ROLE.WEALTH_MANAGER:    return WM_NAV;
    case ROLE.MANAGING_DIRECTOR: return MD_NAV;
    case ROLE.COMPLIANCE_MANAGER:return COMPLIANCE_NAV;
    case ROLE.FINANCE_OFFICER:   return FINANCE_NAV;
    case ROLE.HR_MANAGER:
    case "HR_OFFICER":           return HR_NAV;
    case "GROUP_ADMIN":          return ADMIN_NAV;
    default:                     return DEFAULT_NAV;
  }
}

// ── Command palette ────────────────────────────────────────────────────────────

const ALL_CMDS: NavItem[] = [
  { href: "/dashboard",              label: "Dashboard",           icon: LayoutDashboard },
  { href: "/ai",                     label: "AI Copilot",          icon: Brain },
  { href: "/wm/dashboard",           label: "WM Dashboard",        icon: LayoutDashboard },
  { href: "/wm/clients",             label: "My Clients",          icon: Users },
  { href: "/wm/commission",          label: "My Commission",       icon: DollarSign },
  { href: "/md/team",                label: "Team Overview",       icon: Users },
  { href: "/md/targets",             label: "WM Targets",          icon: Target },
  { href: "/md/exchange-rates",      label: "Exchange Rates",      icon: RefreshCw },
  { href: "/finance/reconciliation", label: "Bank Reconciliation", icon: RefreshCw },
  { href: "/finance/ledger",         label: "General Ledger",      icon: BookOpen },
  { href: "/compliance",             label: "Compliance Queue",    icon: Shield },
  { href: "/approval",               label: "Approvals",           icon: CheckSquare },
  { href: "/reports",                label: "Reports",             icon: FileBarChart },
  { href: "/settings",               label: "Settings",            icon: Settings },
];

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(""); setTimeout(() => ref.current?.focus(), 40); } }, [open]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!open) return null;
  const items = q ? ALL_CMDS.filter(c => c.label.toLowerCase().includes(q.toLowerCase())) : ALL_CMDS.slice(0, 8);
  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
         style={{ background: "rgba(5,8,18,0.6)", backdropFilter: "blur(8px)" }}
         onClick={onClose}>
      <div className="w-full max-w-[560px] mx-4 rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", boxShadow: "0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid var(--pg-card-border)" }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: "var(--pg-text-3)" }} />
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)}
                 placeholder="Search PageOS or jump to…"
                 className="flex-1 text-[14px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>ESC</kbd>
        </div>
        <div className="py-2 max-h-72 overflow-y-auto">
          {!q && <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--pg-text-3)" }}>Quick navigation</p>}
          {items.length === 0
            ? <p className="text-center text-sm py-8" style={{ color: "var(--pg-text-3)" }}>No results for &ldquo;{q}&rdquo;</p>
            : items.map(c => (
              <Link key={c.href} href={c.href} onClick={onClose}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors group"
                    style={{} }
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--pg-muted-bg)" }}>
                  <c.icon className="w-3.5 h-3.5" style={{ color: "var(--pg-text-2)" }} />
                </div>
                <span className="text-[13px] font-medium flex-1" style={{ color: "var(--pg-text-1)" }}>{c.label}</span>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}

// ── Notifications ──────────────────────────────────────────────────────────────

const NOTIFS = [
  { id:"n1", type:"approval", title:"Payment requires approval",           desc:"₦25M wire · Finance",            time:"2h",  read:false, priority:"urgent" },
  { id:"n2", type:"alert",    title:"3 unmatched bank transactions",       desc:"GT Bank Nov · ₦1.24M diff",      time:"3h",  read:false, priority:"high" },
  { id:"n3", type:"info",     title:"Auto-reconciliation complete",        desc:"2,835 transactions matched",      time:"5h",  read:false, priority:"low" },
  { id:"n4", type:"approval", title:"Account opening pending review",      desc:"Adebayo Johnson · Onboarding",   time:"6h",  read:true,  priority:"medium" },
  { id:"n5", type:"success",  title:"Q4 report signed off",                desc:"CFO approved Q4 Financial Report",time:"1d", read:true,  priority:"low" },
  { id:"n6", type:"alert",    title:"Compliance deadline in 14 days",      desc:"FRCN filing · CAC annual return", time:"1d", read:true,  priority:"high" },
];
const NICON: Record<string, React.ElementType> = { approval:CheckSquare,alert:AlertCircle,info:Info,success:CheckCircle2 };
const NCOLOR: Record<string, string> = { approval:"#2563eb",alert:"#dc2626",info:"#0891b2",success:"#059669" };
const PDOT: Record<string, string>   = { urgent:"#dc2626",high:"#f97316",medium:"#f59e0b",low:"#94a3b8" };

function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [read, setRead] = useState(new Set(NOTIFS.filter(n => n.read).map(n => n.id)));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!open) return null;
  const unread = NOTIFS.filter(n => !read.has(n.id));
  const earlier = NOTIFS.filter(n => read.has(n.id));
  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div className="fixed top-12 right-0 bottom-0 w-[360px] z-[100] flex flex-col overflow-hidden"
           style={{ background: "var(--pg-card)", borderLeft: "1px solid var(--pg-card-border)", boxShadow: "-8px 0 32px rgba(0,0,0,0.12)" }}>
        <div className="flex items-center justify-between px-4 py-3.5 shrink-0" style={{ borderBottom: "1px solid var(--pg-card-border)" }}>
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>Notifications</h2>
            {unread.length > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#2563eb" }}>{unread.length}</span>}
          </div>
          <div className="flex items-center gap-2">
            {unread.length > 0 && <button onClick={() => setRead(new Set(NOTIFS.map(n => n.id)))} className="text-[11px] font-medium text-blue-600 hover:underline">Mark all read</button>}
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors" style={{ color: "var(--pg-text-3)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {unread.length > 0 && <><p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--pg-text-3)" }}>Unread</p>
            {unread.map(n => <NotifRow key={n.id} n={n} isRead={false} onRead={() => setRead(s => new Set([...s, n.id]))} />)}</>}
          {earlier.length > 0 && <><p className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--pg-text-3)" }}>Earlier</p>
            {earlier.map(n => <NotifRow key={n.id} n={n} isRead onRead={() => {}} />)}</>}
        </div>
      </div>
    </>
  );
}

function NotifRow({ n, isRead, onRead }: { n: typeof NOTIFS[0]; isRead: boolean; onRead: () => void }) {
  const Icon = NICON[n.type] ?? Info;
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors"
         style={{ background: !isRead ? `${NCOLOR[n.type]}08` : undefined }}
         onClick={onRead}
         onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
         onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = !isRead ? `${NCOLOR[n.type]}08` : ""}>
      <div className="relative shrink-0 mt-0.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: NCOLOR[n.type] + "18" }}>
          <Icon className="w-3.5 h-3.5" style={{ color: NCOLOR[n.type] }} />
        </div>
        {!isRead && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: PDOT[n.priority ?? "low"], border: "2px solid var(--pg-card)" }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] leading-snug" style={{ color: isRead ? "var(--pg-text-2)" : "var(--pg-text-1)", fontWeight: isRead ? 400 : 600 }}>{n.title}</p>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--pg-text-3)" }}>{n.desc}</p>
        <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: "var(--pg-text-4)" }}><Clock className="w-2.5 h-2.5" />{n.time} ago</p>
      </div>
    </div>
  );
}

// ── App layout ─────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname   = usePathname();
  const { user, subsidiary, subsidiaries, isLoading: authLoading, logout, setSubsidiary } = useAuth();
  const { activePosition, positions, setActive, primaryCode, isLoading: posLoading, isDemoMode } = usePosition();
  const { dark, toggle: toggleTheme } = useTheme();

  const [collapsed, setCollapsed]   = useState(false);
  const [subOpen, setSubOpen]       = useState(false);
  const [posOpen, setPosOpen]       = useState(false);
  const [cmdOpen, setCmdOpen]       = useState(false);
  const [notifOpen, setNotifOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const subRef  = useRef<HTMLDivElement>(null);
  const posRef  = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const unread = NOTIFS.filter(n => !n.read).length;

  useEffect(() => {
    const s = localStorage.getItem("pageos_sidebar");
    if (s !== null) setCollapsed(s === "true");
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed(c => { localStorage.setItem("pageos_sidebar", String(!c)); return !c; });
  }, []);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (subRef.current  && !subRef.current.contains(e.target as Node))  setSubOpen(false);
      if (posRef.current  && !posRef.current.contains(e.target as Node))  setPosOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  useEffect(() => {
    function k(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(o => !o); }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); toggleSidebar(); }
    }
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [toggleSidebar]);

  const isLoading = authLoading || posLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--pg-bg)" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  const initials     = user?.DisplayName?.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() ?? "?";
  const canSwitch    = subsidiaries.length > 1;
  const canSwitchPos = positions.length > 1;
  const navGroups    = navForRole(primaryCode);
  const allNavItems  = navGroups.flatMap(g => g.items);
  const activeItem   = allNavItems.find(i => pathname === i.href || pathname.startsWith(i.href + "/"));
  const activeGrp    = navGroups.find(g => g.items.some(i => pathname === i.href || pathname.startsWith(i.href + "/")));
  const W = collapsed ? 60 : 260;

  // Role badge colour
  const roleBadge: Record<string, { bg: string; text: string }> = {
    WEALTH_MANAGER:    { bg: "#eff6ff", text: "#2563eb" },
    MANAGING_DIRECTOR: { bg: "#f5f3ff", text: "#7c3aed" },
    COMPLIANCE_MANAGER:{ bg: "#ecfdf5", text: "#059669" },
    FINANCE_OFFICER:   { bg: "#fffbeb", text: "#d97706" },
  };
  const rb = roleBadge[primaryCode ?? ""] ?? { bg: "#f1f5f9", text: "#475569" };

  return (
    <div className="flex min-h-screen w-full" style={{ background: "var(--pg-bg)" }}>

      {/* ═══ SIDEBAR ═════════════════════════════════════════════════════════ */}
      <aside style={{ width: W, minWidth: W, transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)", background: "linear-gradient(180deg,#080d18 0%,#0c1222 100%)", position: "relative", overflow: "visible", zIndex: 40 }}
             className="hidden md:flex flex-col shrink-0">

        {/* Glow */}
        <div className="absolute top-0 inset-x-0 h-56 pointer-events-none"
             style={{ background: "radial-gradient(ellipse at 50% -5%,rgba(37,99,235,0.28) 0%,transparent 70%)" }} />

        {/* Brand */}
        <div className={cn("relative z-10 flex items-center gap-2.5 shrink-0", collapsed ? "px-3 pt-4 pb-3 justify-center" : "px-4 pt-5 pb-3")}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 0 18px rgba(37,99,235,0.5)" }}>
            <Inbox className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-[13px] font-bold text-white leading-none tracking-tight">Page Group</p>
              <p className="text-[10px] font-medium mt-0.5" style={{ color: "rgba(148,163,184,0.45)" }}>PageOS</p>
            </div>
          )}
        </div>

        {/* Subsidiary context — dropdown only when user spans multiple subsidiaries */}
        {!collapsed && subsidiary && (
          <div className="relative z-20 px-3 pb-2" ref={subRef}>
            {canSwitch ? (
              /* Multi-subsidiary user: show a switchable dropdown */
              <>
                <button onClick={() => setSubOpen(o => !o)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer hover:bg-white/[0.06]"
                        style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: "rgba(37,99,235,0.2)" }}>
                    <Building2 className="w-3 h-3" style={{ color: "#93c5fd" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5" style={{ color: "rgba(148,163,184,0.4)" }}>Active Subsidiary</p>
                    <p className="text-[12px] font-semibold text-white truncate">{subsidiary.Name}</p>
                  </div>
                  <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", subOpen && "rotate-180")} style={{ color: "rgba(148,163,184,0.4)" }} />
                </button>
                {subOpen && (
                  <div className="absolute top-full left-3 right-3 mt-1 rounded-xl overflow-hidden" style={{ background: "#07091a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 16px 48px rgba(0,0,0,0.6)", zIndex: 100 }}>
                    <p className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(148,163,184,0.35)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      Switch Subsidiary
                    </p>
                    {subsidiaries.map(s => (
                      <button key={s.ID} onClick={() => { setSubsidiary(s); setSubOpen(false); }}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-white/[0.05]">
                        <span className={cn("text-[13px] font-medium", s.ID === subsidiary.ID ? "text-white" : "text-slate-400")}>{s.Name}</span>
                        {s.ID === subsidiary.ID && <Check className="w-3.5 h-3.5 text-blue-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Single-subsidiary user: show a static label — no switcher */
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
                   style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: "rgba(37,99,235,0.15)" }}>
                  <Building2 className="w-3 h-3" style={{ color: "#93c5fd" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5" style={{ color: "rgba(148,163,184,0.35)" }}>Subsidiary</p>
                  <p className="text-[12px] font-semibold text-white truncate">{subsidiary.Name}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Role switcher — demo banner when no real org assignment */}
        {!collapsed && activePosition && (
          <div className="relative z-20 px-3 pb-3" ref={posRef}>
            {isDemoMode && (
              <div className="mb-2 px-2 py-1 rounded-md flex items-center gap-1.5"
                   style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#fbbf24" }}>Demo Mode</span>
                <span className="text-[9px]" style={{ color: "rgba(251,191,36,0.7)" }}>— no org assignment</span>
              </div>
            )}
            <button onClick={() => canSwitchPos && setPosOpen(o => !o)}
                    className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all",
                                  canSwitchPos ? "cursor-pointer hover:bg-white/[0.06]" : "cursor-default")}
                    style={{ background: isDemoMode ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${isDemoMode ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.06)"}` }}>
              <span className="flex-1 text-[12px] font-semibold text-white truncate">{activePosition.title}</span>
              {canSwitchPos && <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", posOpen && "rotate-180")} style={{ color: "rgba(148,163,184,0.4)" }} />}
            </button>
            {posOpen && canSwitchPos && (
              <div className="absolute top-full left-3 right-3 mt-0.5 rounded-xl overflow-hidden" style={{ background: "#07091a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 24px rgba(0,0,0,0.6)", zIndex: 100 }}>
                <p className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest"
                   style={{ color: "rgba(148,163,184,0.35)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {isDemoMode ? "Preview Role (Demo)" : "Switch Role"}
                </p>
                {positions.map(p => (
                  <button key={p.id} onClick={() => { setActive(p); setPosOpen(false); }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-white/[0.05] transition-colors">
                    <span className={cn("text-[13px] font-medium", p.id === activePosition.id ? "text-white" : "text-slate-400")}>{p.title}</span>
                    {p.id === activePosition.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search */}
        {!collapsed && (
          <div className="relative z-10 px-3 pb-3">
            <button onClick={() => setCmdOpen(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all hover:bg-white/[0.05]"
                    style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>
              <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(148,163,184,0.5)" }} />
              <span className="text-[12px] flex-1" style={{ color: "rgba(148,163,184,0.5)" }}>Search…</span>
              <kbd className="text-[9px] font-mono" style={{ color: "rgba(100,116,139,0.6)" }}>⌘K</kbd>
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar px-2 pb-2">
          {navGroups.map(group => (
            <div key={group.id} className="mb-1">
              {group.label && !collapsed && (
                <p className="px-3 pt-3 pb-1 text-[9.5px] font-bold uppercase tracking-widest" style={{ color: "rgba(100,116,139,0.5)" }}>{group.label}</p>
              )}
              {group.label && collapsed && <div className="my-2 mx-2 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />}
              {group.items.map(({ href, label, icon: Icon, badge }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link key={href} href={href} title={collapsed ? label : undefined}
                        className={cn("flex items-center rounded-lg transition-all duration-150 group mb-0.5",
                                      collapsed ? "h-9 w-9 mx-auto justify-center" : "gap-2.5 px-3 py-2",
                                      active ? "text-white" : "text-slate-400 hover:text-white")}
                        style={active ? { background: "linear-gradient(135deg,rgba(37,99,235,0.88),rgba(29,78,216,0.88))", boxShadow: "0 1px 10px rgba(37,99,235,0.3)" } : undefined}>
                    <Icon className={cn("w-4 h-4 shrink-0 transition-colors", active ? "text-blue-100" : "text-slate-500 group-hover:text-slate-300")} />
                    {!collapsed && (
                      <>
                        <span className="text-[13px] font-medium flex-1 leading-none">{label}</span>
                        {badge && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: "rgba(37,99,235,0.3)", color: "#93c5fd" }}>{badge}</span>}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
          {!collapsed && <div className="mt-4 mb-1 mx-2 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />}
          <Link href="/settings" title={collapsed ? "Settings" : undefined}
                className={cn("flex items-center rounded-lg transition-all group",
                              collapsed ? "h-9 w-9 mx-auto justify-center" : "gap-2.5 px-3 py-2",
                              pathname.startsWith("/settings") ? "text-white" : "text-slate-400 hover:text-white")}
                style={pathname.startsWith("/settings") ? { background: "linear-gradient(135deg,rgba(37,99,235,0.88),rgba(29,78,216,0.88))" } : undefined}>
            <Settings className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-slate-300" />
            {!collapsed && <span className="text-[13px] font-medium">Settings</span>}
          </Link>
        </div>

        {/* User footer */}
        <div className="relative z-10 p-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {collapsed ? (
            <div className="relative" ref={userRef}>
              <button onClick={() => setUserMenuOpen(m => !m)}
                      className="w-9 h-9 mx-auto flex items-center justify-center rounded-full"
                      style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                <span className="text-[10px] font-bold text-white">{initials}</span>
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-48 rounded-xl overflow-hidden"
                     style={{ background: "#07091a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 100 }}>
                  <Link href="/profile" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-slate-300 hover:bg-white/[0.05] transition-colors">
                    <User className="w-3.5 h-3.5" /> My Profile
                  </Link>
                  <Link href="/settings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-slate-300 hover:bg-white/[0.05] transition-colors">
                    <Settings className="w-3.5 h-3.5" /> Settings
                  </Link>
                  <div className="mx-3 h-px my-1" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <button onClick={() => { logout(); setUserMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors">
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="relative" ref={userRef}>
              <button onClick={() => setUserMenuOpen(m => !m)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06]">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                     style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[12px] font-semibold text-white truncate leading-tight">{user?.DisplayName}</p>
                  <p className="text-[10px] truncate leading-tight" style={{ color: "rgba(148,163,184,0.5)" }}>{user?.Email}</p>
                </div>
                <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", userMenuOpen && "rotate-180")}
                             style={{ color: "rgba(148,163,184,0.4)" }} />
              </button>

              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl overflow-hidden"
                     style={{ background: "#07091a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 100 }}>
                  <div className="px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[11px] font-semibold text-white truncate">{user?.DisplayName}</p>
                    <p className="text-[10px] truncate" style={{ color: "rgba(148,163,184,0.5)" }}>{user?.Email}</p>
                  </div>
                  <Link href="/profile" onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-slate-300 hover:bg-white/[0.05] transition-colors">
                    <User className="w-3.5 h-3.5" /> My Profile
                  </Link>
                  <Link href="/settings" onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-slate-300 hover:bg-white/[0.05] transition-colors">
                    <Settings className="w-3.5 h-3.5" /> Settings
                  </Link>
                  <button onClick={toggleSidebar}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-slate-300 hover:bg-white/[0.05] transition-colors">
                    <PanelLeft className="w-3.5 h-3.5" /> Collapse Sidebar
                  </button>
                  <div className="mx-3 h-px my-1" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <button onClick={() => { logout(); setUserMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors">
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ═══ MAIN ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-12 shrink-0 flex items-center px-4 gap-2"
                style={{ background: "var(--pg-header)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--pg-header-border)", zIndex: 30 }}>
          <button onClick={toggleSidebar} className="w-7 h-7 flex items-center justify-center rounded-lg mr-0.5 transition-colors" style={{ color: "var(--pg-text-3)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
            <PanelLeft className="w-3.5 h-3.5" />
          </button>

          {/* Breadcrumb */}
          <span className="text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}>Page Group</span>
          {subsidiary && (<><ChevronRight className="w-3 h-3 shrink-0" style={{ color: "var(--pg-text-4)" }} /><span className="text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}>{subsidiary.Name}</span></>)}
          {activeGrp?.label && (<><ChevronRight className="w-3 h-3 shrink-0" style={{ color: "var(--pg-text-4)" }} /><span className="text-[11px] font-medium" style={{ color: "var(--pg-text-3)" }}>{activeGrp.label}</span></>)}
          {activeItem && (<><ChevronRight className="w-3 h-3 shrink-0" style={{ color: "var(--pg-text-4)" }} /><span className="text-[11px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{activeItem.label}</span></>)}

          {/* Role badge */}
          {activePosition && (
            <span className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full hidden md:inline" style={{ background: rb.bg, color: rb.text }}>
              {activePosition.title}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => setCmdOpen(true)}
                    className="hidden md:flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              <Command className="w-3 h-3" /> Search <kbd className="font-mono text-[10px]" style={{ color: "var(--pg-text-3)" }}>⌘K</kbd>
            </button>
            <button onClick={toggleTheme} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors" style={{ color: "var(--pg-text-2)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => setNotifOpen(o => !o)} className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors" style={{ color: "var(--pg-text-2)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              <Bell className="w-4 h-4" />
              {unread > 0 && <span className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: "#2563eb" }}>{unread}</span>}
            </button>
            <Link href="/ai" className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", boxShadow: "0 1px 6px rgba(37,99,235,0.35)" }}>
              <Brain className="w-3 h-3" /> AI
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-6 xl:p-8">{children}</div>
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
