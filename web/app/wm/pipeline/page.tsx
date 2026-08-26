"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api/client";
import { components } from "@/lib/api/types";
import {
  AlertCircle, CheckCircle2, Clock, Loader2,
  Users, RotateCcw, ChevronRight, Plus,
} from "lucide-react";

type OnboardingCase = components["schemas"]["OnboardingCase"];
type CaseDetails    = components["schemas"]["CaseDetails"];

// ─── Pipeline column definitions ────────────────────────────────────────────

interface ColumnDef {
  id:       string;
  label:    string;
  states:   string[];
  accentColor: string;
  headerBg:    string;
  headerText:  string;
}

const COLUMNS: ColumnDef[] = [
  {
    id: "draft",
    label: "Draft",
    states: ["draft", "returned"],
    accentColor: "#64748b",
    headerBg:    "#f1f5f9",
    headerText:  "#475569",
  },
  {
    id: "submitted",
    label: "Submitted",
    states: ["submitted"],
    accentColor: "#0369a1",
    headerBg:    "#e0f2fe",
    headerText:  "#0369a1",
  },
  {
    id: "in_review",
    label: "In Review",
    states: ["in_review"],
    accentColor: "#1d4ed8",
    headerBg:    "#dbeafe",
    headerText:  "#1d4ed8",
  },
  {
    id: "compliance",
    label: "Compliance",
    states: ["compliance_review"],
    accentColor: "#6d28d9",
    headerBg:    "#ede9fe",
    headerText:  "#6d28d9",
  },
  {
    id: "closed",
    label: "Closed",
    states: ["approved", "rejected"],
    accentColor: "#059669",
    headerBg:    "#d1fae5",
    headerText:  "#065f46",
  },
];

// ─── Enriched card data ──────────────────────────────────────────────────────

interface PipelineCard {
  id:          string;
  name:        string;
  clientType:  string;
  state:       string;
  riskFlag:    boolean;
  returnCount: number;
  daysSince:   number;    // days since SubmittedAt, or 0 if draft
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATE_PILL: Record<string, { label: string; bg: string; color: string }> = {
  draft:             { label: "Draft",       bg: "#f1f5f9", color: "#475569" },
  submitted:         { label: "Submitted",   bg: "#e0f2fe", color: "#0369a1" },
  in_review:         { label: "In Review",   bg: "#dbeafe", color: "#1d4ed8" },
  compliance_review: { label: "Compliance",  bg: "#ede9fe", color: "#6d28d9" },
  approved:          { label: "Approved",    bg: "#d1fae5", color: "#065f46" },
  rejected:          { label: "Rejected",    bg: "#fee2e2", color: "#991b1b" },
  returned:          { label: "Returned",    bg: "#fef3c7", color: "#92400e" },
};

function daysSinceDate(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function initials(name: string): string {
  return name
    .split(" ")
    .map(w => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ─── Card component ──────────────────────────────────────────────────────────

function PipelineCard({ card }: { card: PipelineCard }) {
  const router = useRouter();
  const pill = STATE_PILL[card.state] ?? { label: card.state, bg: "#f1f5f9", color: "#475569" };
  const avatarBg = card.riskFlag
    ? "linear-gradient(135deg,#dc2626,#b91c1c)"
    : "linear-gradient(135deg,#2563eb,#1d4ed8)";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/dashboard/cases/${card.id}`)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") router.push(`/dashboard/cases/${card.id}`); }}
      className="rounded-xl p-3 cursor-pointer transition-all select-none"
      style={{
        background:  "var(--pg-card)",
        border:      "1px solid var(--pg-card-border)",
        boxShadow:   "0 1px 3px var(--pg-card-shadow)",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 10px var(--pg-card-shadow)";
        (e.currentTarget as HTMLElement).style.transform  = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px var(--pg-card-shadow)";
        (e.currentTarget as HTMLElement).style.transform  = "";
      }}
    >
      {/* Avatar + name row */}
      <div className="flex items-start gap-2.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
          style={{ background: avatarBg }}
        >
          {initials(card.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold truncate leading-tight" style={{ color: "var(--pg-text-1)" }}>
            {card.name}
          </p>
          {/* Type + state pills */}
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize"
              style={{ background: "#f1f5f9", color: "#64748b" }}
            >
              {card.clientType}
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: pill.bg, color: pill.color }}
            >
              {pill.label}
            </span>
          </div>
        </div>
      </div>

      {/* Risk + return + age row */}
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {card.riskFlag && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}>
            <AlertCircle className="w-2.5 h-2.5" /> High Risk
          </span>
        )}
        {card.returnCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#92400e" }}>
            <RotateCcw className="w-2.5 h-2.5" /> {card.returnCount}x returned
          </span>
        )}
        {card.daysSince > 0 && (
          <span className="flex items-center gap-1 text-[10px] ml-auto" style={{ color: "var(--pg-text-4)" }}>
            <Clock className="w-2.5 h-2.5" />
            {card.daysSince}d ago
          </span>
        )}
      </div>

      {/* Footer link */}
      <div className="flex items-center justify-end mt-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
        <Link
          href={`/dashboard/cases/${card.id}`}
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-0.5 text-[10.5px] font-medium text-blue-600 hover:underline"
        >
          Open case <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ─── Column component ────────────────────────────────────────────────────────

function PipelineColumn({ col, cards }: { col: ColumnDef; cards: PipelineCard[] }) {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden shrink-0"
      style={{
        width:       "240px",
        background:  "var(--pg-surface, #f8fafc)",
        border:      "1px solid var(--pg-card-border)",
      }}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ background: col.headerBg, borderBottom: "1px solid var(--pg-card-border)" }}
      >
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: col.headerText }}>
          {col.label}
        </span>
        <span
          className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: col.accentColor + "22", color: col.accentColor }}
        >
          {cards.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center mb-2"
              style={{ background: col.accentColor + "15" }}
            >
              <CheckCircle2 className="w-4 h-4" style={{ color: col.accentColor }} />
            </div>
            <p className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>
              No cases
            </p>
          </div>
        ) : (
          cards.map(card => <PipelineCard key={card.id} card={card} />)
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WMPipelinePage() {
  const { user, subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const { data: cards = [], isLoading } = useQuery<PipelineCard[]>({
    queryKey: ["wm-pipeline", subsidId, user?.ID],
    enabled:  Boolean(subsidId) && Boolean(user?.ID),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn:  async () => {
      const { data: cases, error } = await api.GET("/onboarding/cases", {
        params: { query: { subsidiary_id: subsidId } },
      });
      if (error || !cases) return [];

      // Filter to cases this WM initiated
      const mine = (cases as OnboardingCase[]).filter(
        c => !c.InitiatedBy || c.InitiatedBy === user!.ID,
      );

      // Fetch details in parallel to get client names
      const details: (CaseDetails | null)[] = await Promise.all(
        mine.map(async c => {
          const { data } = await api.GET("/onboarding/cases/{id}", {
            params: { path: { id: c.ID } },
          });
          return data ?? null;
        }),
      );

      return mine.map((c, i): PipelineCard => ({
        id:          c.ID,
        name:        details[i]?.application?.full_name ?? `Case ${c.ID.slice(0, 6)}`,
        clientType:  c.ClientType,
        state:       c.State,
        riskFlag:    c.RiskFlag,
        returnCount: c.ReturnCount ?? 0,
        daysSince:   daysSinceDate(c.SubmittedAt),
      }));
    },
  });

  // ── Stats ──
  const total      = cards.length;
  const approved   = cards.filter(c => c.state === "approved").length;
  const inReview   = cards.filter(c => ["in_review", "compliance_review"].includes(c.state)).length;
  const returned   = cards.filter(c => c.state === "returned").length;

  const stats = [
    { label: "Total",     value: total,    color: "#2563eb", bg: "#eff6ff",  icon: Users },
    { label: "Approved",  value: approved, color: "#059669", bg: "#ecfdf5",  icon: CheckCircle2 },
    { label: "In Review", value: inReview, color: "#d97706", bg: "#fffbeb",  icon: Clock },
    { label: "Returned",  value: returned, color: "#dc2626", bg: "#fef2f2",  icon: RotateCcw },
  ];

  return (
    <div className="space-y-5">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
            My Pipeline
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {subsidiary?.Name} · track your client applications across every stage
          </p>
        </div>
        <Link
          href="/investments/onboarding"
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white shrink-0"
          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 1px 8px rgba(37,99,235,0.35)" }}
        >
          <Plus className="w-3.5 h-3.5" /> New Client
        </Link>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <div
            key={s.label}
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}
          >
            <div className="h-[3px]" style={{ background: s.color }} />
            <div className="p-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: s.color }}>
                  {s.label}
                </p>
                <p className="text-[22px] font-bold tabular leading-none mt-1.5" style={{ color: "var(--pg-text-1)" }}>
                  {isLoading ? "—" : s.value}
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Pipeline board ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
        </div>
      ) : (
        <div
          className="overflow-x-auto pb-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex gap-3" style={{ minWidth: "max-content" }}>
            {COLUMNS.map(col => {
              const colCards = cards.filter(c => col.states.includes(c.state));
              return <PipelineColumn key={col.id} col={col} cards={colCards} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
