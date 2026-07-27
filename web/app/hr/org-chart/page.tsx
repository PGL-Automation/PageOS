"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Users, User, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type OrgNode = {
  id: string; code: string; title: string;
  reports_to_position_id?: string;
  holder_names: string[];
};

type TreeNode = OrgNode & { children: TreeNode[] };

type SubsidiaryOption = { id: string; code: string; name: string };

// ── Tree builder ───────────────────────────────────────────────────────────────

function buildTree(nodes: OrgNode[]): TreeNode[] {
  const map: Record<string, TreeNode> = {};
  nodes.forEach(n => { map[n.id] = { ...n, children: [] }; });
  const roots: TreeNode[] = [];
  nodes.forEach(n => {
    if (n.reports_to_position_id && map[n.reports_to_position_id]) {
      map[n.reports_to_position_id].children.push(map[n.id]);
    } else {
      roots.push(map[n.id]);
    }
  });
  return roots;
}

// ── Node component ─────────────────────────────────────────────────────────────

function OrgTreeNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const noHolder = node.holder_names.length === 0;

  const DEPTH_COLORS = [
    { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
    { bg: "#f5f3ff", border: "#c4b5fd", text: "#6d28d9" },
    { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" },
    { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
    { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" },
  ];
  const c = DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div className="relative rounded-xl px-4 py-3 min-w-[180px] max-w-[220px] text-center cursor-pointer transition-all hover:scale-[1.02]"
           style={{ background: c.bg, border: `1.5px solid ${c.border}`, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}
           onClick={() => hasChildren && setExpanded(e => !e)}>
        {hasChildren && (
          <button className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded" style={{ color: c.text }}>
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        )}
        <p className="text-[12px] font-bold leading-tight" style={{ color: c.text }}>{node.title}</p>
        <p className="text-[9px] font-mono mt-0.5 opacity-60" style={{ color: c.text }}>{node.code}</p>
        {node.holder_names.length > 0 ? (
          <div className="mt-2 space-y-0.5">
            {node.holder_names.map(name => (
              <div key={name} className="flex items-center justify-center gap-1">
                <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                     style={{ background: c.text }}>
                  {name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
                </div>
                <span className="text-[10px]" style={{ color: c.text }}>{name.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] mt-1.5 opacity-50" style={{ color: c.text }}>Vacant</p>
        )}
        {hasChildren && (
          <p className="text-[9px] mt-1 opacity-50" style={{ color: c.text }}>{node.children.length} direct report{node.children.length > 1 ? "s" : ""}</p>
        )}
      </div>

      {/* Connector + children */}
      {hasChildren && expanded && (
        <div className="flex flex-col items-center mt-0">
          {/* Vertical line down */}
          <div className="w-px h-5" style={{ background: "#cbd5e1" }} />
          {/* Children row */}
          <div className="flex items-start gap-6 relative">
            {/* Horizontal connector line */}
            {node.children.length > 1 && (
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "#cbd5e1" }} />
            )}
            {node.children.map(child => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="w-px h-5" style={{ background: "#cbd5e1" }} />
                <OrgTreeNode node={child} depth={depth + 1} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

export default function OrgChartPage() {
  const [selectedSub, setSelectedSub] = useState<string>("");

  const { data: subsidiaries = [] } = useQuery<SubsidiaryOption[]>({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/subsidiaries`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<SubsidiaryOption[]>;
    },
  });

  const { data: nodes = [], isLoading } = useQuery<OrgNode[]>({
    queryKey: ["org-chart", selectedSub],
    queryFn: async () => {
      const params = selectedSub ? `?subsidiary_id=${selectedSub}` : "";
      const res = await fetch(`${BASE}/api/v1/org/org-chart${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<OrgNode[]>;
    },
  });

  const tree = buildTree(nodes);
  const selectedSubName = subsidiaries.find(s => s.id === selectedSub)?.name ?? "Group-level";

  const totalPositions = nodes.length;
  const filledPositions = nodes.filter(n => n.holder_names.length > 0).length;
  const vacantPositions = totalPositions - filledPositions;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Organisation Chart</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Reporting lines and position holders · {selectedSubName}
          </p>
        </div>
        <select value={selectedSub} onChange={e => setSelectedSub(e.target.value)}
                className="h-9 px-3 rounded-xl text-[12px] font-medium outline-none appearance-none"
                style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }}>
          <option value="">Group-level positions</option>
          {subsidiaries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Positions", value: totalPositions,  color: "#2563eb", bg: "#eff6ff", icon: Building2 },
          { label: "Filled",          value: filledPositions, color: "#059669", bg: "#ecfdf5", icon: User },
          { label: "Vacant",          value: vacantPositions, color: "#d97706", bg: "#fffbeb", icon: Users },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 flex items-center gap-3"
               style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-[22px] font-bold tabular leading-none" style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: s.color }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe" }} />
          Level 1 (MD / Head)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "#f5f3ff", border: "1.5px solid #c4b5fd" }} />
          Level 2
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "#ecfdf5", border: "1.5px solid #a7f3d0" }} />
          Level 3
        </span>
        <span className="ml-auto flex items-center gap-1">
          <span className="font-medium" style={{ color: "var(--pg-text-2)" }}>Click a node to expand/collapse · Vacant = no current holder</span>
        </span>
      </div>

      {/* Chart */}
      <div className="rounded-2xl p-8 overflow-auto"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", minHeight: 300 }}>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--pg-text-4)", borderTopColor: "#2563eb" }} />
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Building2 className="w-10 h-10" style={{ color: "var(--pg-text-4)" }} />
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No positions found for this selection.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-12 justify-center">
            {tree.map(root => <OrgTreeNode key={root.id} node={root} depth={0} />)}
          </div>
        )}
      </div>
    </div>
  );
}
