"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api/client";
import { components } from "@/lib/api/types";
import {
  TrendingUp, DollarSign, Users, Loader2, Info,
} from "lucide-react";

type OnboardingCase = components["schemas"]["OnboardingCase"];
type CaseDetails    = components["schemas"]["CaseDetails"];

// ── Constants ──────────────────────────────────────────────────────────────────
const MGMT_FEE_BPS   = 100;   // 1% per annum
const WM_PORTION     = 0.30;  // WM gets 30% of management fee
const QUARTER_DAYS   = 90;
const YEAR_DAYS      = 365;
const QUARTERLY_TARGET = 1_500_000; // ₦1,500,000

// ── Formatting ─────────────────────────────────────────────────────────────────
const fmtNGN = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    notation: "standard",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

function koboToNaira(kobo: number): number {
  return kobo / 100;
}

function calcQuarterlyCommission(naira: number): number {
  return naira * (MGMT_FEE_BPS / 10000) * (QUARTER_DAYS / YEAR_DAYS) * WM_PORTION;
}

// ── State pill ─────────────────────────────────────────────────────────────────
const CASE_PILL: Record<string, { label: string; bg: string; color: string }> = {
  draft:             { label: "Draft",       bg: "#f1f5f9", color: "#475569" },
  submitted:         { label: "Submitted",   bg: "#e0f2fe", color: "#0369a1" },
  in_review:         { label: "In Review",   bg: "#dbeafe", color: "#1d4ed8" },
  compliance_review: { label: "Compliance",  bg: "#ede9fe", color: "#6d28d9" },
  approved:          { label: "Approved",    bg: "#d1fae5", color: "#065f46" },
  rejected:          { label: "Rejected",    bg: "#fee2e2", color: "#991b1b" },
  returned:          { label: "Returned",    bg: "#fef3c7", color: "#92400e" },
};

interface ClientRow {
  id:             string;
  name:           string;
  state:          string;
  investmentNaira: number;
  quarterlyComm:  number;
}

export default function WMCommissionPage() {
  const { user, subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const { data: rows = [], isLoading } = useQuery<ClientRow[]>({
    queryKey: ["wm-commission", subsidId, user?.ID],
    enabled: Boolean(subsidId) && Boolean(user?.ID),
    queryFn: async () => {
      const { data: cases, error } = await api.GET("/onboarding/cases", {
        params: { query: { subsidiary_id: subsidId } },
      });
      if (error || !cases) return [];

      // Filter to cases this WM initiated
      const mine = (cases as OnboardingCase[]).filter(
        c => c.InitiatedBy === user!.ID
      );

      // Fetch details in parallel to get investment amounts and names
      const details: (CaseDetails | null)[] = await Promise.all(
        mine.map(async c => {
          const { data } = await api.GET("/onboarding/cases/{id}", {
            params: { path: { id: c.ID } },
          });
          return data ?? null;
        })
      );

      return mine.map((c, i): ClientRow => {
        const det  = details[i];
        const kobo = det?.application?.investment_amount_kobo ?? 0;
        const naira = koboToNaira(kobo);
        return {
          id:              c.ID,
          name:            det?.application?.full_name ?? `Case ${c.ID.slice(0, 6)}`,
          state:           c.State,
          investmentNaira: naira,
          quarterlyComm:   calcQuarterlyCommission(naira),
        };
      });
    },
  });

  // ── Derived totals ──────────────────────────────────────────────────────────
  const totalAUM         = rows.reduce((s, r) => s + r.investmentNaira, 0);
  const approvedAUM      = rows
    .filter(r => r.state === "approved")
    .reduce((s, r) => s + r.investmentNaira, 0);
  const totalCommission  = rows.reduce((s, r) => s + r.quarterlyComm, 0);
  const targetPct        = Math.min(100, (totalCommission / QUARTERLY_TARGET) * 100);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
          My Commission
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          {subsidiary?.Name ?? "Page Capital"} · Wealth Manager · Q4 2026
        </p>
      </div>

      {/* Parameter notice */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
           style={{ background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.18)" }}>
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Commission parameters — Q4 2026
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Management fee: <strong>100 bps (1% p.a.)</strong> ·
            WM portion: <strong>30%</strong> ·
            Quarter: <strong>90 days</strong> ·
            Formula: AUM × (100 ÷ 10,000) × (90 ÷ 365) × 30%
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: "Total AUM",
            value: fmtNGN(totalAUM),
            sub:   `All ${rows.length} client${rows.length !== 1 ? "s" : ""}`,
            color: "#2563eb",
            icon:  Users,
          },
          {
            label: "Approved AUM",
            value: fmtNGN(approvedAUM),
            sub:   `${rows.filter(r => r.state === "approved").length} approved case${rows.filter(r => r.state === "approved").length !== 1 ? "s" : ""}`,
            color: "#059669",
            icon:  TrendingUp,
          },
          {
            label: "Est. Quarterly Commission",
            value: fmtNGN(totalCommission),
            sub:   `${targetPct.toFixed(1)}% of ₦1,500,000.00 target`,
            color: "#7c3aed",
            icon:  DollarSign,
          },
        ].map(card => (
          <div key={card.label} className="rounded-2xl overflow-hidden"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="h-[3px]" style={{ background: card.color }} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: card.color }}>
                  {card.label}
                </p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                     style={{ background: card.color + "15" }}>
                  <card.icon className="w-4 h-4" style={{ color: card.color }} />
                </div>
              </div>
              <p className="text-[18px] font-bold tabular leading-tight" style={{ color: "var(--pg-text-1)" }}>
                {card.value}
              </p>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--pg-text-3)" }}>{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Target progress */}
      <div className="rounded-2xl p-5" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Quarterly Target Progress
          </p>
          <p className="text-[12px] font-semibold"
             style={{ color: targetPct >= 100 ? "#059669" : "var(--pg-text-2)" }}>
            {fmtNGN(totalCommission)} / {fmtNGN(QUARTERLY_TARGET)}
          </p>
        </div>
        <div className="h-4 rounded-full overflow-hidden" style={{ background: "var(--pg-muted-bg)" }}>
          <div className="h-full rounded-full flex items-center pl-2 transition-all"
               style={{
                 width: `${Math.max(targetPct, 1)}%`,
                 background: targetPct >= 100
                   ? "linear-gradient(90deg,#059669,#34d399)"
                   : targetPct >= 75
                   ? "linear-gradient(90deg,#2563eb,#60a5fa)"
                   : "linear-gradient(90deg,#f59e0b,#fbbf24)",
                 minWidth: 8,
               }}>
            {targetPct > 15 && (
              <span className="text-[10px] font-bold text-white">{targetPct.toFixed(1)}%</span>
            )}
          </div>
        </div>
        <p className="text-[11px] mt-2" style={{ color: "var(--pg-text-3)" }}>
          {targetPct >= 100
            ? "Target achieved for Q4 2026!"
            : `${fmtNGN(QUARTERLY_TARGET - totalCommission)} remaining to hit quarterly target`}
        </p>
      </div>

      {/* Per-client breakdown */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Commission Breakdown by Client
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            AUM × (100 ÷ 10,000) × (90 ÷ 365) × 30% WM portion
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <Users className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-4)" }} />
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No clients yet</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-4)" }}>
              Start an onboarding to see commission estimates here.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                {["Client", "Status", "Investment Amount", "Est. Quarterly Commission"].map(h => (
                  <th key={h}
                      className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--pg-text-3)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const pill = CASE_PILL[r.state] ?? { label: r.state, bg: "#f1f5f9", color: "#475569" };
                return (
                  <tr key={r.id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid var(--pg-row-border)" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                             style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                          {r.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>
                          {r.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: pill.bg, color: pill.color }}>
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] tabular font-medium"
                        style={{ color: "var(--pg-text-1)" }}>
                      {fmtNGN(r.investmentNaira)}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] font-semibold tabular"
                        style={{ color: r.quarterlyComm > 0 ? "#059669" : "var(--pg-text-3)" }}>
                      {fmtNGN(r.quarterlyComm)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--pg-row-border)", background: "var(--pg-muted-bg)" }}>
                <td colSpan={2} className="px-5 py-3 text-[12px] font-bold"
                    style={{ color: "var(--pg-text-2)" }}>
                  Total ({rows.length} client{rows.length !== 1 ? "s" : ""})
                </td>
                <td className="px-5 py-3 text-[13px] font-bold tabular"
                    style={{ color: "var(--pg-text-1)" }}>
                  {fmtNGN(totalAUM)}
                </td>
                <td className="px-5 py-3 text-[14px] font-bold tabular"
                    style={{ color: "#059669" }}>
                  {fmtNGN(totalCommission)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        <div className="px-5 py-3 flex items-center gap-2"
             style={{ borderTop: "1px solid var(--pg-row-border)", background: "rgba(5,150,105,0.04)" }}>
          <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
          <p className="text-[12px] text-emerald-700 dark:text-emerald-400">
            Estimated payout date: <strong>January 15, 2027</strong> · Pending MD approval
          </p>
        </div>
      </div>

    </div>
  );
}
