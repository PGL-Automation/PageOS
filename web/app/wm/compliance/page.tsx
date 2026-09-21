"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  X,
  Trash2,
  Play,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Fund = {
  id: string;
  code: string;
  name: string;
};

type RuleType =
  | "max_single_issuer"
  | "max_asset_class"
  | "max_sector"
  | "min_liquidity"
  | "max_equity"
  | "max_fixed_income"
  | "max_cash"
  | "max_foreign";

type ComplianceRule = {
  id: string;
  fund_id: string;
  fund_name: string;
  fund_code: string;
  rule_type: RuleType;
  target: string;
  limit_pct: number;
  created_at: string;
};

type BreachStatus = "open" | "acknowledged" | "resolved";

type ComplianceBreach = {
  id: string;
  fund_id: string;
  fund_name: string;
  fund_code: string;
  rule_type: RuleType;
  target: string;
  breach_date: string;
  current_pct: number;
  limit_pct: number;
  status: BreachStatus;
  resolution_notes?: string;
};

type CreateRuleBody = {
  fund_id: string;
  rule_type: RuleType;
  target: string;
  limit_pct: number;
};

type BreachFilterStatus = "all" | BreachStatus;

// ── Constants ──────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

const RULE_TYPE_LABEL: Record<RuleType, string> = {
  max_single_issuer:  "Max Single Issuer",
  max_asset_class:    "Max Asset Class",
  max_sector:         "Max Sector",
  min_liquidity:      "Min Liquidity",
  max_equity:         "Max Equity",
  max_fixed_income:   "Max Fixed Income",
  max_cash:           "Max Cash",
  max_foreign:        "Max Foreign",
};

const RULE_TYPE_COLORS: Record<RuleType, { bg: string; color: string }> = {
  max_single_issuer: { bg: "#ede9fe", color: "#6d28d9" },
  max_asset_class:   { bg: "#dbeafe", color: "#1d4ed8" },
  max_sector:        { bg: "#fff0e0", color: "#E05500" },
  min_liquidity:     { bg: "#d1fae5", color: "#065f46" },
  max_equity:        { bg: "#fce7f3", color: "#9d174d" },
  max_fixed_income:  { bg: "#e0f2fe", color: "#0369a1" },
  max_cash:          { bg: "#fef3c7", color: "#92400e" },
  max_foreign:       { bg: "#f1f5f9", color: "#475569" },
};

const BREACH_STATUS_META: Record<
  BreachStatus,
  { bg: string; color: string; label: string }
> = {
  open:         { bg: "#fee2e2", color: "#991b1b", label: "Open" },
  acknowledged: { bg: "#fef3c7", color: "#92400e", label: "Acknowledged" },
  resolved:     { bg: "#d1fae5", color: "#065f46", label: "Resolved" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function fetchFunds(): Promise<Fund[]> {
  const res = await fetch(`${BASE}/api/v1/portfolio/funds`, { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? json : [];
}

async function fetchRules(): Promise<ComplianceRule[]> {
  const res = await fetch(`${BASE}/api/v1/portfolio/compliance/rules`, { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? json : [];
}

async function fetchBreaches(): Promise<ComplianceBreach[]> {
  const res = await fetch(`${BASE}/api/v1/portfolio/compliance/breaches`, { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? json : [];
}

async function createRule(body: CreateRuleBody): Promise<ComplianceRule> {
  const res = await fetch(`${BASE}/api/v1/portfolio/compliance/rules`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to create rule");
  }
  return res.json() as Promise<ComplianceRule>;
}

async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/portfolio/compliance/rules/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to delete rule");
  }
}

async function runComplianceCheck(fundId: string): Promise<void> {
  const res = await fetch(
    `${BASE}/api/v1/portfolio/compliance/check?fund_id=${fundId}`,
    { method: "POST", credentials: "include" }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Compliance check failed");
  }
}

async function acknowledgeBreach(id: string): Promise<void> {
  const res = await fetch(
    `${BASE}/api/v1/portfolio/compliance/breaches/${id}/acknowledge`,
    { method: "POST", credentials: "include" }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to acknowledge breach");
  }
}

async function resolveBreach(id: string, notes: string): Promise<void> {
  const res = await fetch(
    `${BASE}/api/v1/portfolio/compliance/breaches/${id}/resolve`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution_notes: notes }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to resolve breach");
  }
}

// ── Add Rule Dialog ────────────────────────────────────────────────────────────

interface AddRuleDialogProps {
  funds: Fund[];
  onClose: () => void;
}

function AddRuleDialog({ funds, onClose }: AddRuleDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<{
    fund_id: string;
    rule_type: RuleType;
    target: string;
    limit_pct: string;
  }>({
    fund_id:   funds[0]?.id ?? "",
    rule_type: "max_single_issuer",
    target:    "",
    limit_pct: "",
  });

  const mutation = useMutation({
    mutationFn: (body: CreateRuleBody) => createRule(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-rules"] });
      toast({ title: "Rule created", description: "Compliance rule has been added." });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fund_id || !form.target || !form.limit_pct) return;
    mutation.mutate({
      fund_id:   form.fund_id,
      rule_type: form.rule_type,
      target:    form.target.trim(),
      limit_pct: parseFloat(form.limit_pct),
    });
  }

  const inputClass = "w-full h-9 px-3 rounded-xl text-[13px] outline-none transition-colors";
  const inputStyle = {
    background: "var(--pg-muted-bg)",
    border:     "1px solid var(--pg-card-border)",
    color:      "var(--pg-text-1)",
  };
  const labelStyle: React.CSSProperties = {
    color:         "var(--pg-text-3)",
    fontSize:      11,
    fontWeight:    700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: "var(--pg-card)",
          border:     "1px solid var(--pg-card-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--pg-card-border)" }}
        >
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              Add Compliance Rule
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Define a limit that will be checked during compliance runs
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "var(--pg-muted-bg)" }}
          >
            <X className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Fund */}
          <div className="space-y-1.5">
            <label style={labelStyle}>Fund</label>
            <select
              required
              value={form.fund_id}
              onChange={(e) => setForm((f) => ({ ...f, fund_id: e.target.value }))}
              className={inputClass}
              style={inputStyle}
            >
              {funds.length === 0 && <option value="">No funds available</option>}
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.code} — {fund.name}
                </option>
              ))}
            </select>
          </div>

          {/* Rule Type */}
          <div className="space-y-1.5">
            <label style={labelStyle}>Rule Type</label>
            <select
              required
              value={form.rule_type}
              onChange={(e) => setForm((f) => ({ ...f, rule_type: e.target.value as RuleType }))}
              className={inputClass}
              style={inputStyle}
            >
              {(Object.entries(RULE_TYPE_LABEL) as [RuleType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Target */}
          <div className="space-y-1.5">
            <label style={labelStyle}>Target</label>
            <input
              type="text"
              required
              placeholder="e.g. DANGCEM, Equity, Banking Sector"
              value={form.target}
              onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Limit % */}
          <div className="space-y-1.5">
            <label style={labelStyle}>Limit (%)</label>
            <input
              type="number"
              required
              step="0.1"
              min="0"
              max="100"
              placeholder="25.0"
              value={form.limit_pct}
              onChange={(e) => setForm((f) => ({ ...f, limit_pct: e.target.value }))}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-5 rounded-xl text-[13px] font-semibold transition-colors"
              style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 transition-opacity disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg,#FF6600,#E05500)",
                boxShadow:  "0 1px 8px rgba(255,102,0,0.35)",
              }}
            >
              {mutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding…</>
              ) : (
                <><Plus className="w-3.5 h-3.5" /> Add Rule</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Resolve Dialog ─────────────────────────────────────────────────────────────

interface ResolveDialogProps {
  breachId: string;
  onClose: () => void;
}

function ResolveDialog({ breachId, onClose }: ResolveDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () => resolveBreach(breachId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-breaches"] });
      toast({ title: "Breach resolved", description: "The breach has been marked as resolved." });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const inputStyle = {
    background: "var(--pg-muted-bg)",
    border:     "1px solid var(--pg-card-border)",
    color:      "var(--pg-text-1)",
  };
  const labelStyle: React.CSSProperties = {
    color:         "var(--pg-text-3)",
    fontSize:      11,
    fontWeight:    700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: "var(--pg-card)",
          border:     "1px solid var(--pg-card-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--pg-card-border)" }}
        >
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
              Resolve Breach
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              Provide resolution notes before closing this breach
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "var(--pg-muted-bg)" }}
          >
            <X className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label style={labelStyle}>Resolution Notes</label>
            <textarea
              required
              rows={4}
              placeholder="Describe the corrective action taken to resolve this breach..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none"
              style={inputStyle}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-5 rounded-xl text-[13px] font-semibold"
              style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
            >
              Cancel
            </button>
            <button
              disabled={!notes.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg,#059669,#047857)",
                boxShadow:  "0 1px 8px rgba(5,150,105,0.3)",
              }}
            >
              {mutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolving…</>
              ) : (
                <><CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Rules Tab ──────────────────────────────────────────────────────────────────

interface RulesTabProps {
  rules: ComplianceRule[];
  funds: Fund[];
  isLoading: boolean;
}

function RulesTab({ rules, funds, isLoading }: RulesTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [runningFundId, setRunningFundId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-rules"] });
      toast({ title: "Rule deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const checkMutation = useMutation({
    mutationFn: (fundId: string) => runComplianceCheck(fundId),
    onMutate: (fundId) => setRunningFundId(fundId),
    onSuccess: (_, fundId) => {
      queryClient.invalidateQueries({ queryKey: ["compliance-breaches"] });
      const fund = funds.find((f) => f.id === fundId);
      toast({
        title: "Compliance check complete",
        description: `${fund?.name ?? "Fund"} has been checked. Review the Breaches tab for results.`,
      });
      setRunningFundId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Check failed", description: err.message, variant: "destructive" });
      setRunningFundId(null);
    },
  });

  const thStyle: React.CSSProperties = {
    padding:       "11px 16px",
    textAlign:     "left",
    fontSize:      10,
    fontWeight:    700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color:         "var(--pg-text-3)",
    whiteSpace:    "nowrap",
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          {rules.length} rule{rules.length !== 1 ? "s" : ""} defined
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
          style={{
            background: "linear-gradient(135deg,#FF6600,#E05500)",
            boxShadow:  "0 1px 8px rgba(255,102,0,0.35)",
          }}
        >
          <Plus className="w-3.5 h-3.5" /> Add Rule
        </button>
      </div>

      {/* Table */}
      <div
        style={{
          background:   "var(--pg-card)",
          border:       "1px solid var(--pg-card-border)",
          borderRadius: 16,
          boxShadow:    "0 1px 4px var(--pg-card-shadow)",
          overflow:     "hidden",
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                {["Fund", "Rule Type", "Target", "Limit %", "Actions"].map((col) => (
                  <th key={col} style={thStyle}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding:   "64px 16px",
                      textAlign: "center",
                      color:     "var(--pg-text-3)",
                      fontSize:  13,
                    }}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{ background: "var(--pg-muted-bg)" }}
                      >
                        <ShieldCheck className="w-6 h-6" style={{ color: "var(--pg-text-3)" }} />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--pg-text-1)" }}>
                          No compliance rules yet
                        </p>
                        <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                          Add your first rule to start monitoring portfolio limits.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                rules.map((rule, i) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    isLast={i === rules.length - 1}
                    isRunning={runningFundId === rule.fund_id}
                    onDelete={() => deleteMutation.mutate(rule.id)}
                    onRunCheck={() => checkMutation.mutate(rule.fund_id)}
                    deleteDisabled={deleteMutation.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddRuleDialog
          funds={funds}
          onClose={() => setShowAdd(false)}
        />
      )}
    </>
  );
}

// ── Rule Row ───────────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule: ComplianceRule;
  isLast: boolean;
  isRunning: boolean;
  onDelete: () => void;
  onRunCheck: () => void;
  deleteDisabled: boolean;
}

function RuleRow({ rule, isLast, isRunning, onDelete, onRunCheck, deleteDisabled }: RuleRowProps) {
  const [hovered, setHovered] = useState(false);
  const typeMeta = RULE_TYPE_COLORS[rule.rule_type] ?? { bg: "#f1f5f9", color: "#475569" };

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:   hovered ? "var(--pg-row-hover)" : "transparent",
        borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)",
        transition:   "background 0.12s",
      }}
    >
      {/* Fund */}
      <td style={{ padding: "12px 16px" }}>
        <div>
          <span className="text-[13px] font-bold" style={{ color: "#FF6600" }}>
            {rule.fund_code}
          </span>
          <span className="block text-[12px]" style={{ color: "var(--pg-text-2)" }}>
            {rule.fund_name}
          </span>
        </div>
      </td>

      {/* Rule Type */}
      <td style={{ padding: "12px 16px" }}>
        <span
          style={{
            fontSize:     11,
            fontWeight:   600,
            padding:      "3px 9px",
            borderRadius: 20,
            background:   typeMeta.bg,
            color:        typeMeta.color,
            whiteSpace:   "nowrap",
          }}
        >
          {RULE_TYPE_LABEL[rule.rule_type]}
        </span>
      </td>

      {/* Target */}
      <td style={{ padding: "12px 16px" }}>
        <span className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>
          {rule.target}
        </span>
      </td>

      {/* Limit % */}
      <td style={{ padding: "12px 16px" }}>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--pg-text-1)" }}>
          {rule.limit_pct.toFixed(1)}%
        </span>
      </td>

      {/* Actions */}
      <td style={{ padding: "12px 16px" }}>
        <div className="flex items-center gap-2">
          <button
            onClick={onRunCheck}
            disabled={isRunning}
            title="Run Compliance Check"
            style={{
              height:       28,
              padding:      "0 12px",
              borderRadius: 8,
              fontSize:     11,
              fontWeight:   600,
              background:   "#dbeafe",
              color:        "#1d4ed8",
              border:       "1px solid #bfdbfe",
              cursor:       isRunning ? "not-allowed" : "pointer",
              display:      "inline-flex",
              alignItems:   "center",
              gap:          5,
              opacity:      isRunning ? 0.6 : 1,
              whiteSpace:   "nowrap",
            }}
          >
            {isRunning ? (
              <><Loader2 size={11} className="animate-spin" /> Running…</>
            ) : (
              <><Play size={11} /> Run Check</>
            )}
          </button>
          <button
            onClick={onDelete}
            disabled={deleteDisabled}
            title="Delete Rule"
            style={{
              width:        28,
              height:       28,
              borderRadius: 8,
              fontSize:     11,
              fontWeight:   600,
              background:   "#fee2e2",
              color:        "#991b1b",
              border:       "1px solid #fecaca",
              cursor:       deleteDisabled ? "not-allowed" : "pointer",
              display:      "inline-flex",
              alignItems:   "center",
              justifyContent: "center",
              opacity:      deleteDisabled ? 0.6 : 1,
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Breaches Tab ───────────────────────────────────────────────────────────────

interface BreachesTabProps {
  breaches: ComplianceBreach[];
  isLoading: boolean;
}

function BreachesTab({ breaches, isLoading }: BreachesTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<BreachFilterStatus>("all");
  const [resolveId, setResolveId] = useState<string | null>(null);

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => acknowledgeBreach(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-breaches"] });
      toast({ title: "Breach acknowledged" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = breaches.filter((b) =>
    statusFilter === "all" ? true : b.status === statusFilter
  );

  const counts = {
    all:          breaches.length,
    open:         breaches.filter((b) => b.status === "open").length,
    acknowledged: breaches.filter((b) => b.status === "acknowledged").length,
    resolved:     breaches.filter((b) => b.status === "resolved").length,
  };

  const STATUS_TABS: { key: BreachFilterStatus; label: string }[] = [
    { key: "all",          label: "All" },
    { key: "open",         label: "Open" },
    { key: "acknowledged", label: "Acknowledged" },
    { key: "resolved",     label: "Resolved" },
  ];

  const thStyle: React.CSSProperties = {
    padding:       "11px 16px",
    textAlign:     "left",
    fontSize:      10,
    fontWeight:    700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color:         "var(--pg-text-3)",
    whiteSpace:    "nowrap",
  };

  return (
    <>
      {/* Status filter tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--pg-muted-bg)" }}>
        {STATUS_TABS.map((tab) => {
          const active = statusFilter === tab.key;
          const count  = counts[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold transition-all"
              style={{
                background: active ? "var(--pg-card)" : "transparent",
                color:      active ? "var(--pg-text-1)" : "var(--pg-text-3)",
                boxShadow:  active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {tab.label}
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: active ? "#FF660015" : "transparent",
                  color:      active ? "#FF6600"   : "var(--pg-text-3)",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div
        style={{
          background:   "var(--pg-card)",
          border:       "1px solid var(--pg-card-border)",
          borderRadius: 16,
          boxShadow:    "0 1px 4px var(--pg-card-shadow)",
          overflow:     "hidden",
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                {[
                  "Fund",
                  "Rule Type",
                  "Target",
                  "Breach Date",
                  "Current %",
                  "Limit %",
                  "Status",
                  "Actions",
                ].map((col) => (
                  <th key={col} style={thStyle}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding:   "64px 16px",
                      textAlign: "center",
                      color:     "var(--pg-text-3)",
                      fontSize:  13,
                    }}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{ background: "var(--pg-muted-bg)" }}
                      >
                        <CheckCircle2 className="w-6 h-6" style={{ color: "#059669" }} />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--pg-text-1)" }}>
                          {statusFilter === "all" ? "No breaches found" : `No ${statusFilter} breaches`}
                        </p>
                        <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                          {statusFilter === "all"
                            ? "Run a compliance check to detect breaches."
                            : `There are no ${statusFilter} breaches at this time.`}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((breach, i) => (
                  <BreachRow
                    key={breach.id}
                    breach={breach}
                    isLast={i === filtered.length - 1}
                    onAcknowledge={() => acknowledgeMutation.mutate(breach.id)}
                    onResolve={() => setResolveId(breach.id)}
                    acknowledgeDisabled={acknowledgeMutation.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {resolveId && (
        <ResolveDialog
          breachId={resolveId}
          onClose={() => setResolveId(null)}
        />
      )}
    </>
  );
}

// ── Breach Row ─────────────────────────────────────────────────────────────────

interface BreachRowProps {
  breach: ComplianceBreach;
  isLast: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
  acknowledgeDisabled: boolean;
}

function BreachRow({ breach, isLast, onAcknowledge, onResolve, acknowledgeDisabled }: BreachRowProps) {
  const [hovered, setHovered] = useState(false);
  const typeMeta   = RULE_TYPE_COLORS[breach.rule_type]      ?? { bg: "#f1f5f9", color: "#475569" };
  const statusMeta = BREACH_STATUS_META[breach.status];
  const isOver     = breach.current_pct > breach.limit_pct;

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:   hovered ? "var(--pg-row-hover)" : "transparent",
        borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)",
        transition:   "background 0.12s",
      }}
    >
      {/* Fund */}
      <td style={{ padding: "12px 16px" }}>
        <div>
          <span className="text-[13px] font-bold" style={{ color: "#FF6600" }}>
            {breach.fund_code}
          </span>
          <span className="block text-[12px]" style={{ color: "var(--pg-text-2)" }}>
            {breach.fund_name}
          </span>
        </div>
      </td>

      {/* Rule Type */}
      <td style={{ padding: "12px 16px" }}>
        <span
          style={{
            fontSize:     11,
            fontWeight:   600,
            padding:      "3px 9px",
            borderRadius: 20,
            background:   typeMeta.bg,
            color:        typeMeta.color,
            whiteSpace:   "nowrap",
          }}
        >
          {RULE_TYPE_LABEL[breach.rule_type]}
        </span>
      </td>

      {/* Target */}
      <td style={{ padding: "12px 16px" }}>
        <span className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>
          {breach.target}
        </span>
      </td>

      {/* Breach Date */}
      <td style={{ padding: "12px 16px" }}>
        <span className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>
          {fmtDate(breach.breach_date)}
        </span>
      </td>

      {/* Current % */}
      <td style={{ padding: "12px 16px" }}>
        <span
          className="text-[13px] font-bold tabular-nums"
          style={{ color: isOver ? "#dc2626" : "#059669" }}
        >
          {breach.current_pct.toFixed(1)}%
        </span>
      </td>

      {/* Limit % */}
      <td style={{ padding: "12px 16px" }}>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--pg-text-2)" }}>
          {breach.limit_pct.toFixed(1)}%
        </span>
      </td>

      {/* Status */}
      <td style={{ padding: "12px 16px" }}>
        <span
          style={{
            fontSize:     11,
            fontWeight:   600,
            padding:      "3px 9px",
            borderRadius: 20,
            background:   statusMeta.bg,
            color:        statusMeta.color,
            whiteSpace:   "nowrap",
          }}
        >
          {statusMeta.label}
        </span>
      </td>

      {/* Actions */}
      <td style={{ padding: "12px 16px" }}>
        <div className="flex items-center gap-2">
          {breach.status === "open" && (
            <button
              onClick={onAcknowledge}
              disabled={acknowledgeDisabled}
              style={{
                height:       28,
                padding:      "0 12px",
                borderRadius: 8,
                fontSize:     11,
                fontWeight:   600,
                background:   "#fef3c7",
                color:        "#92400e",
                border:       "1px solid #fde68a",
                cursor:       acknowledgeDisabled ? "not-allowed" : "pointer",
                display:      "inline-flex",
                alignItems:   "center",
                gap:          5,
                opacity:      acknowledgeDisabled ? 0.6 : 1,
                whiteSpace:   "nowrap",
              }}
            >
              <AlertTriangle size={11} />
              Acknowledge
            </button>
          )}
          {breach.status === "acknowledged" && (
            <button
              onClick={onResolve}
              style={{
                height:       28,
                padding:      "0 12px",
                borderRadius: 8,
                fontSize:     11,
                fontWeight:   600,
                background:   "#d1fae5",
                color:        "#065f46",
                border:       "1px solid #a7f3d0",
                cursor:       "pointer",
                display:      "inline-flex",
                alignItems:   "center",
                gap:          5,
                whiteSpace:   "nowrap",
              }}
            >
              <CheckCircle2 size={11} />
              Resolve
            </button>
          )}
          {breach.status === "resolved" && (
            <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              Closed
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type ActiveTab = "rules" | "breaches";

export default function CompliancePage() {
  const { subsidiary } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("rules");

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ["portfolio-funds"],
    queryFn:  fetchFunds,
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery<ComplianceRule[]>({
    queryKey: ["compliance-rules"],
    queryFn:  fetchRules,
  });

  const { data: breaches = [], isLoading: breachesLoading } = useQuery<ComplianceBreach[]>({
    queryKey: ["compliance-breaches"],
    queryFn:  fetchBreaches,
  });

  const openBreaches = breaches.filter((b) => b.status === "open").length;

  const TABS: { key: ActiveTab; label: string; count?: number }[] = [
    { key: "rules",    label: "Rules",    count: rules.length },
    { key: "breaches", label: "Breaches", count: openBreaches || undefined },
  ];

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={20} color="#FF6600" />
            <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--pg-text-1)" }}>
              Compliance Management
            </h1>
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {subsidiary?.Name ?? "Page Asset Management"} · Rules, Limits & Breach Monitoring
          </p>
        </div>

        {/* Open breach alert badge */}
        {openBreaches > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-xl"
            style={{
              background: "#fee2e2",
              border:     "1px solid #fecaca",
            }}
          >
            <AlertTriangle size={14} color="#991b1b" />
            <span className="text-[12px] font-semibold" style={{ color: "#991b1b" }}>
              {openBreaches} open breach{openBreaches !== 1 ? "es" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Rules",
            value: rules.length,
            color: "#FF6600",
            bg:    "#fff0e0",
          },
          {
            label: "Open Breaches",
            value: breaches.filter((b) => b.status === "open").length,
            color: "#dc2626",
            bg:    "#fee2e2",
          },
          {
            label: "Acknowledged",
            value: breaches.filter((b) => b.status === "acknowledged").length,
            color: "#d97706",
            bg:    "#fef3c7",
          },
          {
            label: "Resolved",
            value: breaches.filter((b) => b.status === "resolved").length,
            color: "#059669",
            bg:    "#d1fae5",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--pg-card)",
              border:     "1px solid var(--pg-card-border)",
              boxShadow:  "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div className="h-[3px]" style={{ background: card.color }} />
            <div className="p-4">
              <p
                className="text-[10px] font-bold uppercase tracking-wider mb-2"
                style={{ color: card.color }}
              >
                {card.label}
              </p>
              <p
                className="text-[26px] font-bold tabular-nums leading-tight"
                style={{ color: "var(--pg-text-1)" }}
              >
                {card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--pg-muted-bg)" }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold capitalize transition-all"
              style={{
                background: active ? "var(--pg-card)" : "transparent",
                color:      active ? "var(--pg-text-1)" : "var(--pg-text-3)",
                boxShadow:  active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {tab.label}
              {tab.count != null && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: active
                      ? (tab.key === "breaches" && openBreaches > 0 ? "#fee2e2" : "#FF660015")
                      : "transparent",
                    color: active
                      ? (tab.key === "breaches" && openBreaches > 0 ? "#991b1b" : "#FF6600")
                      : "var(--pg-text-3)",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "rules" ? (
        <RulesTab
          rules={rules}
          funds={funds}
          isLoading={rulesLoading}
        />
      ) : (
        <BreachesTab
          breaches={breaches}
          isLoading={breachesLoading}
        />
      )}
    </div>
  );
}
