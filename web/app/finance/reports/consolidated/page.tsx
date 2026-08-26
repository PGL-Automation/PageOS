"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  LayoutGrid,
  Columns2,
} from "lucide-react";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportLine = { code: string; name: string; amount: number };
type ReportGroup = { group: string; lines: ReportLine[]; total: number };
type PLReport = {
  from: string;
  to: string;
  revenue: ReportGroup[];
  expenses: ReportGroup[];
  total_revenue: number;
  total_expenses: number;
  net_income: number;
};
type BalanceSheetReport = {
  as_of: string;
  assets: ReportGroup[];
  liabilities: ReportGroup[];
  equity: ReportGroup[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
};
type Subsidiary = { id: string; name: string };

type ReportType = "pl" | "bs";
type ViewMode = "consolidated" | "side-by-side";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, showNeg = true): string {
  const f = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  if (showNeg && n < 0) return `(${f})`;
  return f;
}

/** Merge an array of group arrays by group name and line code, summing amounts. */
function mergeGroups(allGroups: ReportGroup[][]): ReportGroup[] {
  const groupMap = new Map<string, Map<string, ReportLine>>();

  for (const groups of allGroups) {
    for (const grp of groups ?? []) {
      if (!groupMap.has(grp.group)) groupMap.set(grp.group, new Map());
      const lineMap = groupMap.get(grp.group)!;
      for (const line of grp.lines ?? []) {
        const existing = lineMap.get(line.code);
        if (existing) {
          lineMap.set(line.code, { ...existing, amount: existing.amount + line.amount });
        } else {
          lineMap.set(line.code, { ...line });
        }
      }
    }
  }

  return Array.from(groupMap.entries()).map(([group, lineMap]) => {
    const lines = Array.from(lineMap.values());
    const total = lines.reduce((s, l) => s + l.amount, 0);
    return { group, lines, total };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  total,
  color,
  bg,
}: {
  title: string;
  total: number;
  color: string;
  bg: string;
}) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3"
      style={{ background: bg, borderBottom: "1px solid var(--pg-row-border)" }}
    >
      <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color }}>
        {title}
      </p>
      <p className="text-[14px] font-bold tabular font-mono" style={{ color }}>
        {fmt(Math.abs(total), false)}
      </p>
    </div>
  );
}

/** Consolidated single-column section */
function ConsolidatedSection({
  title,
  groups,
  total,
  color,
  bg,
  amtColor,
}: {
  title: string;
  groups: ReportGroup[];
  total: number;
  color: string;
  bg: string;
  amtColor: string;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
    >
      <SectionHeader title={title} total={total} color={color} bg={bg} />
      {(groups ?? []).map((grp) => (
        <div key={grp.group}>
          <p
            className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: "var(--pg-muted-bg)",
              borderBottom: "1px solid var(--pg-row-border)",
              color: "var(--pg-text-3)",
            }}
          >
            {grp.group}
          </p>
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {grp.lines
              .filter((l) => l.amount !== 0)
              .map((l) => (
                <div
                  key={l.code}
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors"
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "")
                  }
                >
                  <code
                    className="text-[11px] font-mono w-12 shrink-0"
                    style={{ color: "var(--pg-text-4)" }}
                  >
                    {l.code}
                  </code>
                  <p className="flex-1 text-[12.5px]" style={{ color: "var(--pg-text-1)" }}>
                    {l.name}
                  </p>
                  <p
                    className="text-[13px] font-semibold tabular font-mono"
                    style={{ color: l.amount < 0 ? "#dc2626" : amtColor }}
                  >
                    {fmt(l.amount)}
                  </p>
                </div>
              ))}
          </div>
          <div
            className="flex justify-between items-center px-5 py-2.5 font-semibold"
            style={{
              background: "var(--pg-muted-bg)",
              borderTop: "1px solid var(--pg-row-border)",
            }}
          >
            <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              {grp.group} subtotal
            </p>
            <p
              className="text-[13px] tabular font-mono"
              style={{ color: grp.total < 0 ? "#dc2626" : amtColor }}
            >
              {fmt(grp.total)}
            </p>
          </div>
        </div>
      ))}
      {(!groups || groups.length === 0) && (
        <p
          className="px-5 py-6 text-[13px] text-center"
          style={{ color: "var(--pg-text-4)" }}
        >
          No data in this period.
        </p>
      )}
    </div>
  );
}

// ─── Side-by-side table ───────────────────────────────────────────────────────

function SideBySideSection({
  title,
  subs,
  allGroupData,
  consolidated,
  color,
  bg,
  amtColor,
}: {
  title: string;
  subs: Subsidiary[];
  allGroupData: (ReportGroup[] | null)[];
  consolidated: ReportGroup[];
  color: string;
  bg: string;
  amtColor: string;
}) {
  // Collect every unique group name and code in order
  const groupNames: string[] = [];
  const seen = new Set<string>();
  for (const grps of [...allGroupData, consolidated]) {
    for (const g of grps ?? []) {
      if (!seen.has(g.group)) { seen.add(g.group); groupNames.push(g.group); }
    }
  }

  const colCount = subs.length + 1; // subsidiaries + consolidated

  const getGrp = (groups: ReportGroup[] | null, name: string): ReportGroup | undefined =>
    (groups ?? []).find((g) => g.group === name);

  const getLine = (grp: ReportGroup | undefined, code: string): number =>
    grp?.lines.find((l) => l.code === code)?.amount ?? 0;

  // All line codes per group across all sources
  function linesForGroup(name: string): Array<{ code: string; label: string }> {
    const codeMap = new Map<string, string>();
    for (const grps of [...allGroupData, consolidated]) {
      const g = getGrp(grps, name);
      for (const l of g?.lines ?? []) codeMap.set(l.code, l.name);
    }
    return Array.from(codeMap.entries()).map(([code, label]) => ({ code, label }));
  }

  const totalPerSub = (groups: ReportGroup[] | null): number =>
    (groups ?? []).reduce((s, g) => s + g.total, 0);
  const consolidatedTotal = consolidated.reduce((s, g) => s + g.total, 0);

  const colW = `${Math.max(100, Math.floor(520 / colCount))}px`;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
    >
      {/* Section header */}
      <div
        className="px-5 py-3 font-bold text-[12px] uppercase tracking-wider"
        style={{ background: bg, color, borderBottom: "1px solid var(--pg-row-border)" }}
      >
        {title}
      </div>

      {/* Column headers */}
      <div
        className="flex items-center px-5 py-2 text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10"
        style={{
          background: "var(--pg-muted-bg)",
          borderBottom: "1px solid var(--pg-row-border)",
          color: "var(--pg-text-3)",
        }}
      >
        <span className="flex-1">Account</span>
        {subs.map((s) => (
          <span key={s.id} className="text-right shrink-0 px-2" style={{ width: colW }}>
            {s.name}
          </span>
        ))}
        <span className="text-right shrink-0 px-2 font-extrabold" style={{ width: colW, color }}>
          Consolidated
        </span>
      </div>

      {groupNames.map((gName) => {
        const lines = linesForGroup(gName);
        const grpTotal = consolidated.find((g) => g.group === gName)?.total ?? 0;
        return (
          <div key={gName}>
            <p
              className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider"
              style={{
                background: "var(--pg-muted-bg)",
                borderBottom: "1px solid var(--pg-row-border)",
                color: "var(--pg-text-3)",
              }}
            >
              {gName}
            </p>
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {lines.map(({ code, label }) => {
                const vals = allGroupData.map((gd) =>
                  getLine(getGrp(gd, gName), code)
                );
                const consolidatedVal = getLine(
                  getGrp(consolidated, gName),
                  code
                );
                if (vals.every((v) => v === 0) && consolidatedVal === 0) return null;
                return (
                  <div
                    key={code}
                    className="flex items-center px-5 py-2 transition-colors"
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "")
                    }
                  >
                    <div className="flex-1 flex items-center gap-2">
                      <code
                        className="text-[10px] font-mono w-10 shrink-0"
                        style={{ color: "var(--pg-text-4)" }}
                      >
                        {code}
                      </code>
                      <span className="text-[12px]" style={{ color: "var(--pg-text-1)" }}>
                        {label}
                      </span>
                    </div>
                    {vals.map((v, i) => (
                      <span
                        key={i}
                        className="text-right text-[12px] tabular font-mono shrink-0 px-2"
                        style={{
                          width: colW,
                          color: v < 0 ? "#dc2626" : v === 0 ? "var(--pg-text-4)" : "var(--pg-text-2)",
                        }}
                      >
                        {v !== 0 ? fmt(v) : "—"}
                      </span>
                    ))}
                    <span
                      className="text-right text-[12px] font-semibold tabular font-mono shrink-0 px-2"
                      style={{
                        width: colW,
                        color: consolidatedVal < 0 ? "#dc2626" : amtColor,
                      }}
                    >
                      {consolidatedVal !== 0 ? fmt(consolidatedVal) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Group subtotal row */}
            <div
              className="flex items-center px-5 py-2 font-semibold"
              style={{
                background: "var(--pg-muted-bg)",
                borderTop: "1px solid var(--pg-row-border)",
              }}
            >
              <span className="flex-1 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                {gName} subtotal
              </span>
              {allGroupData.map((gd, i) => {
                const t = getGrp(gd, gName)?.total ?? 0;
                return (
                  <span
                    key={i}
                    className="text-right text-[12px] tabular font-mono shrink-0 px-2"
                    style={{ width: colW, color: t < 0 ? "#dc2626" : amtColor }}
                  >
                    {t !== 0 ? fmt(t) : "—"}
                  </span>
                );
              })}
              <span
                className="text-right text-[13px] font-bold tabular font-mono shrink-0 px-2"
                style={{ width: colW, color: grpTotal < 0 ? "#dc2626" : amtColor }}
              >
                {fmt(grpTotal)}
              </span>
            </div>
          </div>
        );
      })}

      {/* Section total row */}
      <div
        className="flex items-center px-5 py-3 font-bold"
        style={{
          background: bg,
          borderTop: "2px solid var(--pg-row-border)",
        }}
      >
        <span className="flex-1 text-[12px]" style={{ color }}>
          Total {title}
        </span>
        {allGroupData.map((gd, i) => {
          const t = totalPerSub(gd);
          return (
            <span
              key={i}
              className="text-right text-[13px] tabular font-mono shrink-0 px-2"
              style={{ width: colW, color: t < 0 ? "#dc2626" : color }}
            >
              {fmt(Math.abs(t), false)}
            </span>
          );
        })}
        <span
          className="text-right text-[14px] font-extrabold tabular font-mono shrink-0 px-2"
          style={{ width: colW, color }}
        >
          {fmt(Math.abs(consolidatedTotal), false)}
        </span>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ConsolidatedReportsPage() {
  const now = new Date();
  const firstOfYear = `${now.getFullYear()}-01-01`;
  const today = now.toISOString().slice(0, 10);

  const [reportType, setReportType] = useState<ReportType>("pl");
  const [viewMode, setViewMode] = useState<ViewMode>("consolidated");
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);

  // Fetch subsidiaries
  const { data: subsidiaries = [] } = useQuery<Subsidiary[]>({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/subsidiaries`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    },
  });

  // Fetch all P&L reports in parallel
  const {
    data: plResults,
    isLoading: plLoading,
    isFetching: plFetching,
  } = useQuery<Array<{ sub: Subsidiary; report: PLReport | null; error: boolean }>>({
    queryKey: ["consolidated-pl", from, to, subsidiaries.map((s) => s.id).join(",")],
    enabled: reportType === "pl" && subsidiaries.length > 0,
    queryFn: async () => {
      const results = await Promise.allSettled(
        subsidiaries.map(async (sub) => {
          const params = new URLSearchParams({ from, to, subsidiary_id: sub.id });
          const res = await fetch(`${BASE}/api/v1/finance/reports/pl?${params}`, {
            credentials: "include",
          });
          if (!res.ok) throw new Error(`Failed for ${sub.name}`);
          const report: PLReport = await res.json();
          return { sub, report, error: false };
        })
      );
      return results.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { sub: subsidiaries[i], report: null, error: true }
      );
    },
  });

  // Fetch all Balance Sheet reports in parallel
  const {
    data: bsResults,
    isLoading: bsLoading,
    isFetching: bsFetching,
  } = useQuery<Array<{ sub: Subsidiary; report: BalanceSheetReport | null; error: boolean }>>({
    queryKey: ["consolidated-bs", asOf, subsidiaries.map((s) => s.id).join(",")],
    enabled: reportType === "bs" && subsidiaries.length > 0,
    queryFn: async () => {
      const results = await Promise.allSettled(
        subsidiaries.map(async (sub) => {
          const params = new URLSearchParams({ as_of: asOf, subsidiary_id: sub.id });
          const res = await fetch(`${BASE}/api/v1/finance/reports/balance-sheet?${params}`, {
            credentials: "include",
          });
          if (!res.ok) throw new Error(`Failed for ${sub.name}`);
          const report: BalanceSheetReport = await res.json();
          return { sub, report, error: false };
        })
      );
      return results.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { sub: subsidiaries[i], report: null, error: true }
      );
    },
  });

  const isLoading =
    (reportType === "pl" && (plLoading || plFetching)) ||
    (reportType === "bs" && (bsLoading || bsFetching));

  // ── Consolidated P&L ──────────────────────────────────────────────────────
  const consolidatedPL = useMemo<PLReport | null>(() => {
    if (!plResults) return null;
    const ok = plResults.filter((r) => r.report !== null).map((r) => r.report as PLReport);
    if (ok.length === 0) return null;
    const revenue = mergeGroups(ok.map((r) => r.revenue));
    const expenses = mergeGroups(ok.map((r) => r.expenses));
    const total_revenue = revenue.reduce((s, g) => s + g.total, 0);
    const total_expenses = expenses.reduce((s, g) => s + g.total, 0);
    return {
      from,
      to,
      revenue,
      expenses,
      total_revenue,
      total_expenses,
      net_income: total_revenue - total_expenses,
    };
  }, [plResults, from, to]);

  // ── Consolidated Balance Sheet ─────────────────────────────────────────────
  const consolidatedBS = useMemo<BalanceSheetReport | null>(() => {
    if (!bsResults) return null;
    const ok = bsResults
      .filter((r) => r.report !== null)
      .map((r) => r.report as BalanceSheetReport);
    if (ok.length === 0) return null;
    const assets = mergeGroups(ok.map((r) => r.assets));
    const liabilities = mergeGroups(ok.map((r) => r.liabilities));
    const equity = mergeGroups(ok.map((r) => r.equity));
    return {
      as_of: asOf,
      assets,
      liabilities,
      equity,
      total_assets: assets.reduce((s, g) => s + g.total, 0),
      total_liabilities: liabilities.reduce((s, g) => s + g.total, 0),
      total_equity: equity.reduce((s, g) => s + g.total, 0),
    };
  }, [bsResults, asOf]);

  // ── Warnings ──────────────────────────────────────────────────────────────
  const failedSubs =
    reportType === "pl"
      ? (plResults ?? []).filter((r) => r.error).map((r) => r.sub.name)
      : (bsResults ?? []).filter((r) => r.error).map((r) => r.sub.name);

  // ── Export ────────────────────────────────────────────────────────────────
  function exportCSV() {
    if (reportType === "pl" && consolidatedPL) {
      const r = consolidatedPL;
      const rows: string[] = [
        `Consolidated Income Statement — ${from} to ${to}`,
        "",
        "REVENUE",
        "Group,Code,Name,Amount",
        ...(r.revenue ?? []).flatMap((g) => [
          ...g.lines.map((l) => `${g.group},${l.code},"${l.name}",${l.amount.toFixed(2)}`),
          `${g.group} Total,,,${g.total.toFixed(2)}`,
        ]),
        `Total Revenue,,,${r.total_revenue.toFixed(2)}`,
        "",
        "EXPENSES",
        "Group,Code,Name,Amount",
        ...(r.expenses ?? []).flatMap((g) => [
          ...g.lines.map((l) => `${g.group},${l.code},"${l.name}",${l.amount.toFixed(2)}`),
          `${g.group} Total,,,${g.total.toFixed(2)}`,
        ]),
        `Total Expenses,,,${r.total_expenses.toFixed(2)}`,
        "",
        `Net Income / (Loss),,,${r.net_income.toFixed(2)}`,
      ];
      download(rows.join("\n"), `consolidated-pl-${from}-to-${to}.csv`);
    } else if (reportType === "bs" && consolidatedBS) {
      const r = consolidatedBS;
      const section = (title: string, groups: ReportGroup[], total: number) => [
        title,
        "Group,Code,Name,Balance",
        ...(groups ?? []).flatMap((g) => [
          ...g.lines.map((l) => `${g.group},${l.code},"${l.name}",${l.amount.toFixed(2)}`),
          `${g.group} Total,,,${g.total.toFixed(2)}`,
        ]),
        `Total ${title},,,${total.toFixed(2)}`,
        "",
      ];
      const rows = [
        `Consolidated Balance Sheet — As of ${asOf}`,
        "",
        ...section("ASSETS", r.assets, r.total_assets),
        ...section("LIABILITIES", r.liabilities, r.total_liabilities),
        ...section("EQUITY", r.equity, r.total_equity),
        `Total Liabilities + Equity,,,${(r.total_liabilities + r.total_equity).toFixed(2)}`,
      ];
      download(rows.join("\n"), `consolidated-balance-sheet-${asOf}.csv`);
    }
  }

  function download(content: string, filename: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    a.download = filename;
    a.click();
  }

  const netPositive = (consolidatedPL?.net_income ?? 0) >= 0;

  // ── Derived side-by-side data ──────────────────────────────────────────────
  const successfulPLSubs = (plResults ?? []).filter((r) => !r.error);
  const successfulBSSubs = (bsResults ?? []).filter((r) => !r.error);

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/finance" className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              Finance
            </Link>
            <span style={{ color: "var(--pg-text-4)" }}>›</span>
            <Link
              href="/finance/reports"
              className="text-[12px]"
              style={{ color: "var(--pg-text-3)" }}
            >
              Reports
            </Link>
            <span style={{ color: "var(--pg-text-4)" }}>›</span>
            <span className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
              Consolidated
            </span>
          </div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Consolidated Financial Reports
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Consolidated P&amp;L and Balance Sheet rolled up across all subsidiaries
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"
          style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
        >
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      {/* ── Report type tabs + view mode toggle ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Report type tabs */}
        <div
          className="flex rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}
        >
          {(
            [
              { key: "pl", label: "P&L" },
              { key: "bs", label: "Balance Sheet" },
            ] as { key: ReportType; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setReportType(t.key)}
              className="h-9 px-5 text-[13px] font-semibold transition-colors"
              style={{
                background: reportType === t.key ? "var(--pg-accent)" : "transparent",
                color: reportType === t.key ? "#fff" : "var(--pg-text-2)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div
          className="flex rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}
        >
          <button
            onClick={() => setViewMode("consolidated")}
            className="h-9 px-4 flex items-center gap-1.5 text-[12px] font-semibold transition-colors"
            style={{
              background: viewMode === "consolidated" ? "var(--pg-muted-bg)" : "transparent",
              color: viewMode === "consolidated" ? "var(--pg-text-1)" : "var(--pg-text-3)",
            }}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Consolidated
          </button>
          <button
            onClick={() => setViewMode("side-by-side")}
            className="h-9 px-4 flex items-center gap-1.5 text-[12px] font-semibold transition-colors"
            style={{
              background: viewMode === "side-by-side" ? "var(--pg-muted-bg)" : "transparent",
              color: viewMode === "side-by-side" ? "var(--pg-text-1)" : "var(--pg-text-3)",
            }}
          >
            <Columns2 className="w-3.5 h-3.5" /> Side by Side
          </button>
        </div>
      </div>

      {/* ── Period controls ── */}
      <div
        className="flex items-center gap-3 flex-wrap p-4 rounded-2xl"
        style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
      >
        {reportType === "pl" ? (
          <>
            <div>
              <label
                className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--pg-text-3)" }}
              >
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 px-3 rounded-lg text-[13px] outline-none"
                style={{
                  background: "var(--pg-input)",
                  border: "1px solid var(--pg-input-border)",
                  color: "var(--pg-text-1)",
                }}
              />
            </div>
            <div>
              <label
                className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--pg-text-3)" }}
              >
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 px-3 rounded-lg text-[13px] outline-none"
                style={{
                  background: "var(--pg-input)",
                  border: "1px solid var(--pg-input-border)",
                  color: "var(--pg-text-1)",
                }}
              />
            </div>
          </>
        ) : (
          <div>
            <label
              className="block text-[10px] font-bold uppercase tracking-wider mb-1"
              style={{ color: "var(--pg-text-3)" }}
            >
              As of Date
            </label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="h-9 px-3 rounded-lg text-[13px] outline-none"
              style={{
                background: "var(--pg-input)",
                border: "1px solid var(--pg-input-border)",
                color: "var(--pg-text-1)",
              }}
            />
          </div>
        )}

        {subsidiaries.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              {subsidiaries.length} subsidiaries
            </span>
          </div>
        )}
      </div>

      {/* ── Failed subsidiary warnings ── */}
      {failedSubs.length > 0 && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl"
          style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-orange-500" />
          <p className="text-[12.5px] text-orange-700">
            Could not load data for:{" "}
            <strong>{failedSubs.join(", ")}</strong>. These subsidiaries are excluded from
            the consolidated totals.
          </p>
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2
            className="w-6 h-6 animate-spin"
            style={{ color: "var(--pg-text-4)" }}
          />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
            Fetching reports for {subsidiaries.length} subsidiaries…
          </p>
        </div>
      )}

      {/* ── P&L content ── */}
      {!isLoading && reportType === "pl" && consolidatedPL && (
        <div className="space-y-4">
          {viewMode === "consolidated" ? (
            <>
              <ConsolidatedSection
                title="Revenue"
                groups={consolidatedPL.revenue ?? []}
                total={consolidatedPL.total_revenue}
                color="#059669"
                bg="#ecfdf5"
                amtColor="#059669"
              />
              <ConsolidatedSection
                title="Expenses"
                groups={consolidatedPL.expenses ?? []}
                total={consolidatedPL.total_expenses}
                color="#dc2626"
                bg="#fef2f2"
                amtColor="#dc2626"
              />
            </>
          ) : (
            <>
              {/* Side-by-side revenue */}
              <div className="overflow-x-auto">
                <SideBySideSection
                  title="Revenue"
                  subs={successfulPLSubs.map((r) => r.sub)}
                  allGroupData={successfulPLSubs.map((r) => r.report?.revenue ?? null)}
                  consolidated={consolidatedPL.revenue ?? []}
                  color="#059669"
                  bg="#ecfdf5"
                  amtColor="#059669"
                />
              </div>
              {/* Side-by-side expenses */}
              <div className="overflow-x-auto">
                <SideBySideSection
                  title="Expenses"
                  subs={successfulPLSubs.map((r) => r.sub)}
                  allGroupData={successfulPLSubs.map((r) => r.report?.expenses ?? null)}
                  consolidated={consolidatedPL.expenses ?? []}
                  color="#dc2626"
                  bg="#fef2f2"
                  amtColor="#dc2626"
                />
              </div>
            </>
          )}

          {/* Net Income / Loss */}
          <div
            className="flex items-center justify-between px-6 py-5 rounded-2xl"
            style={{
              background: netPositive ? "#d1fae5" : "#fee2e2",
              border: `2px solid ${netPositive ? "#a7f3d0" : "#fca5a5"}`,
            }}
          >
            <div className="flex items-center gap-3">
              {netPositive ? (
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              ) : (
                <TrendingDown className="w-6 h-6 text-red-600" />
              )}
              <div>
                <p
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: netPositive ? "#065f46" : "#991b1b" }}
                >
                  Consolidated {netPositive ? "Net Income" : "Net Loss"}
                </p>
                <p
                  className="text-[11px]"
                  style={{ color: netPositive ? "#059669" : "#dc2626" }}
                >
                  {from} → {to} · {successfulPLSubs.length} subsidiaries
                </p>
              </div>
            </div>
            <p
              className="text-[22px] font-bold tabular font-mono"
              style={{ color: netPositive ? "#059669" : "#dc2626" }}
            >
              {netPositive ? "" : "("}
              {fmt(consolidatedPL.net_income, false)}
              {netPositive ? "" : ")"}
            </p>
          </div>

          {/* Summary row */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--pg-card)", border: "2px solid var(--pg-card-border)" }}
          >
            {[
              { label: "Total Revenue", value: consolidatedPL.total_revenue, color: "#059669" },
              { label: "Total Expenses", value: consolidatedPL.total_expenses, color: "#dc2626" },
              {
                label: "Net Income / (Loss)",
                value: consolidatedPL.net_income,
                color: netPositive ? "#059669" : "#dc2626",
                bold: true,
              },
            ].map((row, i) => (
              <div
                key={row.label}
                className="flex items-center justify-between px-6 py-3.5 font-semibold"
                style={{
                  borderTop: i === 2 ? "2px solid var(--pg-card-border)" : i > 0 ? "1px solid var(--pg-row-border)" : undefined,
                }}
              >
                <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
                  {row.label}
                </p>
                <p
                  className="text-[15px] tabular font-bold font-mono"
                  style={{ color: row.color }}
                >
                  {fmt(Math.abs(row.value), false)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Balance Sheet content ── */}
      {!isLoading && reportType === "bs" && consolidatedBS && (
        <div className="space-y-4">
          {viewMode === "consolidated" ? (
            <>
              <ConsolidatedSection
                title="Assets"
                groups={consolidatedBS.assets ?? []}
                total={consolidatedBS.total_assets}
                color="#2563eb"
                bg="#eff6ff"
                amtColor="var(--pg-text-1)"
              />
              <ConsolidatedSection
                title="Liabilities"
                groups={consolidatedBS.liabilities ?? []}
                total={consolidatedBS.total_liabilities}
                color="#dc2626"
                bg="#fef2f2"
                amtColor="var(--pg-text-1)"
              />
              <ConsolidatedSection
                title="Equity"
                groups={consolidatedBS.equity ?? []}
                total={consolidatedBS.total_equity}
                color="#7c3aed"
                bg="#f5f3ff"
                amtColor="var(--pg-text-1)"
              />
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <SideBySideSection
                  title="Assets"
                  subs={successfulBSSubs.map((r) => r.sub)}
                  allGroupData={successfulBSSubs.map((r) => r.report?.assets ?? null)}
                  consolidated={consolidatedBS.assets ?? []}
                  color="#2563eb"
                  bg="#eff6ff"
                  amtColor="var(--pg-text-1)"
                />
              </div>
              <div className="overflow-x-auto">
                <SideBySideSection
                  title="Liabilities"
                  subs={successfulBSSubs.map((r) => r.sub)}
                  allGroupData={successfulBSSubs.map((r) => r.report?.liabilities ?? null)}
                  consolidated={consolidatedBS.liabilities ?? []}
                  color="#dc2626"
                  bg="#fef2f2"
                  amtColor="var(--pg-text-1)"
                />
              </div>
              <div className="overflow-x-auto">
                <SideBySideSection
                  title="Equity"
                  subs={successfulBSSubs.map((r) => r.sub)}
                  allGroupData={successfulBSSubs.map((r) => r.report?.equity ?? null)}
                  consolidated={consolidatedBS.equity ?? []}
                  color="#7c3aed"
                  bg="#f5f3ff"
                  amtColor="var(--pg-text-1)"
                />
              </div>
            </>
          )}

          {/* BS summary */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--pg-card)", border: "2px solid var(--pg-card-border)" }}
          >
            {[
              { label: "Total Assets", value: consolidatedBS.total_assets, color: "#2563eb" },
              {
                label: "Total Liabilities",
                value: consolidatedBS.total_liabilities,
                color: "#dc2626",
              },
              { label: "Total Equity", value: consolidatedBS.total_equity, color: "#7c3aed" },
              {
                label: "Total Liabilities + Equity",
                value: consolidatedBS.total_liabilities + consolidatedBS.total_equity,
                color: "#059669",
              },
            ].map((row, i) => (
              <div
                key={row.label}
                className="flex items-center justify-between px-6 py-3.5 font-semibold"
                style={{
                  borderTop: i === 3 ? "2px solid var(--pg-card-border)" : i > 0 ? "1px solid var(--pg-row-border)" : undefined,
                }}
              >
                <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
                  {row.label}
                </p>
                <p
                  className="text-[15px] tabular font-bold font-mono"
                  style={{ color: row.color }}
                >
                  {fmt(row.value, false)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state (no subsidiaries loaded yet) ── */}
      {!isLoading &&
        subsidiaries.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-2xl"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
          >
            <Loader2
              className="w-6 h-6 mb-3 animate-spin"
              style={{ color: "var(--pg-text-4)" }}
            />
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
              Loading subsidiaries…
            </p>
          </div>
        )}

      {/* ── No data after fetch ── */}
      {!isLoading &&
        subsidiaries.length > 0 &&
        reportType === "pl" &&
        !consolidatedPL && (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-2xl"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
          >
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
              No P&amp;L data available for the selected period.
            </p>
          </div>
        )}

      {!isLoading &&
        subsidiaries.length > 0 &&
        reportType === "bs" &&
        !consolidatedBS && (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-2xl"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
          >
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
              No Balance Sheet data available as of this date.
            </p>
          </div>
        )}
    </div>
  );
}
