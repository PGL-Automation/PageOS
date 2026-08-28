"use client";

import { useState, useMemo, ReactNode } from "react";
import {
  ChevronUp, ChevronDown, ChevronsUpDown, Search, SlidersHorizontal,
  Download, Eye, EyeOff, ChevronLeft, ChevronRight, Check, Square,
  CheckSquare, MinusSquare, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Column<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => unknown);
  cell?: (value: unknown, row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
  initiallyHidden?: boolean;
}

export interface BulkAction {
  label: string;
  icon?: React.ElementType;
  destructive?: boolean;
  onClick: (selectedIds: string[]) => void;
}

export interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKeys?: Array<keyof T>;
  bulkActions?: BulkAction[];
  onExport?: () => void;
  pageSize?: number;
  emptyMessage?: string;
  isLoading?: boolean;
  className?: string;
}

type SortDir = "asc" | "desc" | null;

// ── Component ──────────────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown> & { id: string }>({
  columns,
  data,
  searchPlaceholder = "Search…",
  searchKeys = [],
  bulkActions = [],
  onExport,
  pageSize = 25,
  emptyMessage = "No data found.",
  isLoading = false,
  className,
}: DataTableProps<T>) {
  const [sortCol, setSortCol]     = useState<string | null>(null);
  const [sortDir, setSortDir]     = useState<SortDir>(null);
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [page, setPage]           = useState(0);
  const [colMenu, setColMenu]     = useState(false);
  const [visible, setVisible]     = useState<Set<string>>(
    new Set(columns.filter(c => !c.initiallyHidden).map(c => c.id))
  );

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(row =>
      (searchKeys as Array<keyof T>).some(k => String(row[k] ?? "").toLowerCase().includes(q))
    );
  }, [data, search, searchKeys]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortCol || !sortDir) return filtered;
    const col = columns.find(c => c.id === sortCol);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const va = typeof col.accessor === "function" ? col.accessor(a) : a[col.accessor];
      const vb = typeof col.accessor === "function" ? col.accessor(b) : b[col.accessor];
      const cmp = String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir, columns]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged      = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const allOnPage   = paged.length > 0 && paged.every(r => selected.has(r.id));
  const someOnPage  = paged.some(r => selected.has(r.id)) && !allOnPage;
  const selectedIds = [...selected];

  function toggleAll() {
    setSelected(s => {
      const n = new Set(s);
      allOnPage ? paged.forEach(r => n.delete(r.id)) : paged.forEach(r => n.add(r.id));
      return n;
    });
  }
  function toggleRow(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function onSort(id: string) {
    if (sortCol !== id) { setSortCol(id); setSortDir("asc"); return; }
    if (sortDir === "asc")  { setSortDir("desc"); return; }
    if (sortDir === "desc") { setSortCol(null); setSortDir(null); }
  }

  const visCols = columns.filter(c => visible.has(c.id));
  const totalCols = visCols.length + (bulkActions.length > 0 ? 1 : 0);

  return (
    <div className={cn("flex flex-col rounded-2xl overflow-hidden", className)}
         style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedIds.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                {selectedIds.length} selected
              </span>
              {bulkActions.map(a => (
                <button key={a.label} onClick={() => a.onClick(selectedIds)}
                        className={cn("flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-medium transition-colors",
                                      a.destructive
                                        ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
                                        : "hover:bg-black/5 dark:hover:bg-white/10")}
                        style={!a.destructive ? { background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" } : undefined}>
                  {a.icon && <a.icon className="w-3.5 h-3.5" />}
                  {a.label}
                </button>
              ))}
              <button onClick={() => setSelected(new Set())}
                      className="text-[11px] hover:underline" style={{ color: "var(--pg-text-3)" }}>
                Clear
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 h-8 px-3 rounded-xl max-w-[280px] flex-1"
                 style={{ border: "1px solid var(--pg-input-border)", background: "var(--pg-input)" }}>
              <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                     placeholder={searchPlaceholder}
                     className="flex-1 text-[12px] bg-transparent outline-none" style={{ color: "var(--pg-text-1)" }} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 relative">
          {/* Column toggle */}
          <div className="relative">
            <button onClick={() => setColMenu(o => !o)}
                    className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> Columns
            </button>
            {colMenu && (
              <div className="absolute top-full right-0 mt-1 w-48 rounded-xl overflow-hidden z-50"
                   style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 8px 24px var(--pg-card-shadow)" }}>
                <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--pg-text-3)", borderBottom: "1px solid var(--pg-row-border)" }}>
                  Toggle columns
                </p>
                {columns.map(col => {
                  const isVis = visible.has(col.id);
                  return (
                    <button key={col.id}
                            onClick={() => setVisible(s => { const n = new Set(s); isVis ? n.delete(col.id) : n.add(col.id); return n; })}
                            className="w-full flex items-center justify-between px-3 py-2 text-[12px] transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                            style={{ color: "var(--pg-text-2)" }}>
                      <span>{col.header}</span>
                      {isVis ? <Eye className="w-3.5 h-3.5 text-orange-500" /> : <EyeOff className="w-3.5 h-3.5" style={{ color: "var(--pg-text-3)" }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {onExport && (
            <button onClick={onExport}
                    className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          )}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
              {bulkActions.length > 0 && (
                <th className="w-10 pl-4 py-3 text-left">
                  <button onClick={toggleAll}>
                    {allOnPage ? <CheckSquare className="w-4 h-4 text-orange-500" />
                      : someOnPage ? <MinusSquare className="w-4 h-4 text-orange-500" />
                      : <Square className="w-4 h-4" style={{ color: "var(--pg-text-4)" }} />}
                  </button>
                </th>
              )}
              {visCols.map(col => (
                <th key={col.id} style={{ width: col.width }}
                    className={cn("py-3 px-3 select-none", col.sortable && "cursor-pointer",
                                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left")}
                    onClick={() => col.sortable && onSort(col.id)}>
                  <div className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                                     col.align === "right" && "flex-row-reverse")}
                       style={{ color: "var(--pg-text-3)" }}>
                    {col.header}
                    {col.sortable && (sortCol === col.id
                      ? sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-orange-500" /> : <ChevronDown className="w-3 h-3 text-orange-500" />
                      : <ChevronsUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                  {Array.from({ length: totalCols }).map((_, j) => (
                    <td key={j} className="py-3 px-3">
                      <div className="h-3.5 rounded-full animate-pulse" style={{ background: "var(--pg-skeleton)", width: `${55 + (j * 17 + i * 11) % 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "var(--pg-muted-bg)" }}>
                      <Search className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
                    </div>
                    <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map(row => (
                <tr key={row.id}
                    className="transition-colors"
                    style={{
                      borderBottom: "1px solid var(--pg-row-border)",
                      background: selected.has(row.id) ? "rgba(255,102,0,0.07)" : undefined,
                    }}
                    onMouseEnter={e => { if (!selected.has(row.id)) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                    onMouseLeave={e => { if (!selected.has(row.id)) (e.currentTarget as HTMLElement).style.background = ""; }}>
                  {bulkActions.length > 0 && (
                    <td className="w-10 pl-4 py-3" onClick={e => { e.stopPropagation(); toggleRow(row.id); }}>
                      <button>
                        {selected.has(row.id)
                          ? <CheckSquare className="w-4 h-4 text-orange-500" />
                          : <Square className="w-4 h-4" style={{ color: "var(--pg-text-4)" }} />}
                      </button>
                    </td>
                  )}
                  {visCols.map(col => {
                    const raw = typeof col.accessor === "function" ? col.accessor(row) : row[col.accessor as keyof T];
                    return (
                      <td key={col.id}
                          className={cn("py-3 px-3", col.align === "right" && "text-right", col.align === "center" && "text-center")}>
                        {col.cell
                          ? col.cell(raw, row)
                          : <span className="text-[13px]" style={{ color: "var(--pg-text-1)" }}>{String(raw ?? "—")}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
        <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
          {sorted.length > 0 ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, sorted.length)} of ${sorted.length.toLocaleString()} rows` : "0 rows"}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: "var(--pg-text-2)" }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(0, Math.min(totalPages - 5, page - 2)) + i;
              return (
                <button key={pg} onClick={() => setPage(pg)}
                        className={cn("w-7 h-7 rounded-lg text-[12px] font-medium transition-colors",
                                      pg !== page && "hover:bg-black/5 dark:hover:bg-white/10")}
                        style={{ background: pg === page ? "#FF6600" : "transparent", color: pg === page ? "white" : "var(--pg-text-2)" }}>
                  {pg + 1}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: "var(--pg-text-2)" }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
