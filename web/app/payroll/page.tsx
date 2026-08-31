"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play, CheckCircle2, Download, DollarSign,
  FileText, X, AlertCircle, Loader2, ChevronDown,
  TrendingUp, Shield, Landmark,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Run = {
  id: string; subsidiary_id?: string; subsidiary_name: string;
  period_year: number; period_month: number; period_name: string;
  status: "draft" | "approved" | "paid";
  employee_count: number;
  total_gross: number; total_paye: number;
  total_emp_pension: number; total_employer_pension: number; total_net: number;
  created_by_name: string; approved_at?: string; journal_id?: string;
  created_at: string;
};

type Payslip = {
  id: string; employee_name: string; employee_email: string;
  position_title: string; grade_code: string; grade_name: string;
  gross_salary: number; basic_salary: number; housing_allowance: number; transport_allowance: number;
  cra: number; taxable_income: number; paye_tax: number;
  pensionable_earnings: number; emp_pension: number; employer_pension: number;
  net_pay: number; has_salary: boolean;
};

type RunWithPayslips = Run & { payslips: Payslip[] };
type Subsidiary = { id: string; name: string };

function fmt(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/payroll${path}`, {
    credentials: "include", headers: { "Content-Type": "application/json" }, ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Server error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message ?? parsed?.message ?? message;
    } catch { if (text) message = text.slice(0, 200); }
    throw new Error(message);
  }
  return res.json();
}

const STATUS_CFG = {
  draft:    { label: "Draft",    bg: "#f1f5f9", color: "#475569" },
  approved: { label: "Approved", bg: "#d1fae5", color: "#065f46" },
  paid:     { label: "Paid",     bg: "#fff0e0", color: "#E05500" },
};

const MONTHS = ["","January","February","March","April","May","June",
                "July","August","September","October","November","December"];

function InitiateRunModal({ subsidiaries, onClose }: { subsidiaries: Subsidiary[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const now = new Date();
  const [subId, setSubId] = useState(subsidiaries[0]?.id ?? "");
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await apiFetch("/runs", {
        method: "POST",
        body: JSON.stringify({ subsidiary_id: subId || null, year, month }),
      });
      await queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      await queryClient.refetchQueries({ queryKey: ["payroll-runs"] });
      toast({ title: "Payroll Run Initiated", description: `${MONTHS[month]} ${year} payslips computed.` });
      onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>Initiate Payroll Run</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--pg-text-3)" }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Entity</label>
            <div className="relative">
              <select value={subId} onChange={e => setSubId(e.target.value)}
                      className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                      style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                <option value="">All entities (group payroll)</option>
                {(Array.isArray(subsidiaries) ? subsidiaries : []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-4)" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Year</label>
              <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} min="2024" max="2030"
                     className="w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                     style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }} />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--pg-text-2)" }}>Month</label>
              <div className="relative">
                <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
                        className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                        style={{ background: "var(--pg-input)", border: "1px solid var(--pg-input-border)", color: "var(--pg-text-1)" }}>
                  {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--pg-text-4)" }} />
              </div>
            </div>
          </div>
          <p className="text-[12px] px-3 py-2.5 rounded-lg" style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-3)" }}>
            Payslips auto-computed from each employee's grade level salary. PAYE uses Nigerian FIRS rates; pension at PenCom 8%/10%.
          </p>
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button type="button" onClick={onClose}
                    className="h-9 px-4 rounded-xl text-[13px] font-medium"
                    style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Cancel</button>
            <button type="submit" disabled={saving}
                    className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-3.5 h-3.5 inline mr-1" />Run Payroll</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PayslipPanel({ payslip, periodName }: { payslip: Payslip; periodName: string }) {
  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
      <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>{label}</p>
      <p className="text-[13px] font-semibold tabular font-mono" style={{ color: color ?? "var(--pg-text-1)" }}>{value}</p>
    </div>
  );
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)", background: "linear-gradient(135deg,#FF660018,#7c3aed12)" }}>
        <p className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>{payslip.employee_name}</p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>{payslip.position_title} · {payslip.grade_name}</p>
        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{periodName}</p>
      </div>
      <div className="p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--pg-text-4)" }}>Earnings</p>
        <Row label="Gross Salary"     value={fmt(payslip.gross_salary)} />
        <Row label="Basic (70%)"      value={fmt(payslip.basic_salary)} />
        <Row label="Housing (15%)"    value={fmt(payslip.housing_allowance)} />
        <Row label="Transport (15%)"  value={fmt(payslip.transport_allowance)} />
        <p className="text-[10px] font-bold uppercase tracking-wider mt-4 mb-2" style={{ color: "var(--pg-text-4)" }}>Tax (PAYE)</p>
        <Row label="Taxable Income"   value={fmt(payslip.taxable_income)} />
        <Row label="PAYE Tax"         value={fmt(payslip.paye_tax)}  color="#dc2626" />
        <p className="text-[10px] font-bold uppercase tracking-wider mt-4 mb-2" style={{ color: "var(--pg-text-4)" }}>Pension (PenCom)</p>
        <Row label="Pensionable Earnings" value={fmt(payslip.pensionable_earnings)} />
        <Row label="Employee (8%)"    value={fmt(payslip.emp_pension)}      color="#dc2626" />
        <Row label="Employer (10%)"   value={fmt(payslip.employer_pension)}  color="#d97706" />
        <div className="mt-4 flex items-center justify-between rounded-xl px-4 py-3"
             style={{ background: "#d1fae5", border: "1px solid #a7f3d0" }}>
          <p className="text-[13px] font-bold text-emerald-700">Net Pay</p>
          <p className="text-[16px] font-bold tabular font-mono text-emerald-700">{fmt(payslip.net_pay)}</p>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInitiate, setShowInitiate]       = useState(false);
  const [selectedRun, setSelectedRun]         = useState<Run | null>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  const { data: subsidiaries = [] } = useQuery<Subsidiary[]>({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/org/subsidiaries`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: runs = [], isLoading } = useQuery<Run[]>({
    queryKey: ["payroll-runs"],
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const data = await apiFetch("/runs");
      return Array.isArray(data) ? data as Run[] : [];
    },
    refetchInterval: 30000,
  });

  const { data: runDetail } = useQuery<RunWithPayslips>({
    queryKey: ["payroll-run", selectedRun?.id],
    queryFn: () => apiFetch(`/runs/${selectedRun!.id}`),
    enabled: !!selectedRun,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/runs/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run"] });
      queryClient.refetchQueries({ queryKey: ["payroll-runs"] });
      toast({ title: "Payroll Approved & GL Journal Posted" });
    },
    onError: (err) => toast({ title: "Approval Failed", description: (err as Error).message, variant: "destructive" }),
  });

  // Sort newest-first in case the API does not guarantee ordering.
  const sortedRuns = [...runs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latestRun = sortedRuns[0];
  const totalGrossYTD = runs.filter(r => r.status !== "draft").reduce((s, r) => s + r.total_gross, 0);

  return (
    <div className="max-w-[1300px] mx-auto space-y-5">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>Payroll</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Nigerian PAYE · PenCom 8%/10% · {runs.length} run{runs.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={() => setShowInitiate(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#059669,#047857)", boxShadow: "0 1px 6px rgba(5,150,105,0.4)" }}>
          <Play className="w-3.5 h-3.5" /> Run Payroll
        </button>
      </div>

      {latestRun && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Gross Payroll",        value: fmt(latestRun.total_gross), icon: DollarSign, color: "#FF6600", bg: "#fff7f0", sub: latestRun.period_name },
            { label: "PAYE Liability",        value: fmt(latestRun.total_paye),  icon: Shield, color: "#dc2626", bg: "#fef2f2", sub: "To FIRS" },
            { label: "Pension Contributions", value: fmt(latestRun.total_emp_pension + latestRun.total_employer_pension), icon: Landmark, color: "#d97706", bg: "#fffbeb", sub: "Emp 8% + Employer 10%" },
            { label: "Net Salaries",          value: fmt(latestRun.total_net),   icon: TrendingUp, color: "#059669", bg: "#d1fae5", sub: `${latestRun.employee_count} employees` },
          ].map(s => (
            <div key={s.label} className="rounded-xl px-4 py-4 flex items-center gap-3"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.bg }}>
                <s.icon style={{ color: s.color, width: 16, height: 16 }} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
                <p className="text-[14px] font-bold tabular leading-tight mt-0.5" style={{ color: "var(--pg-text-1)" }}>{s.value}</p>
                <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalGrossYTD > 0 && (
        <div className="px-5 py-3 rounded-xl text-[12px] flex items-center justify-between"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <span style={{ color: "var(--pg-text-2)" }}>Year-to-date payroll (approved runs)</span>
          <span className="font-bold tabular font-mono" style={{ color: "var(--pg-text-1)" }}>{fmt(totalGrossYTD)}</span>
        </div>
      )}

      <div className={`grid gap-5 ${selectedRun ? "xl:grid-cols-5" : "grid-cols-1"}`}>

        {/* Runs list */}
        <div className={selectedRun ? "xl:col-span-2" : ""}>
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
            <div className="grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider"
                 style={{ gridTemplateColumns: "1fr 70px 110px 80px 100px", borderBottom: "1px solid var(--pg-row-border)", color: "var(--pg-text-3)" }}>
              <span>Period</span><span className="text-right">Staff</span><span className="text-right">Net Pay</span>
              <span>Status</span><span>Actions</span>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
            ) : runs.length === 0 ? (
              <div className="py-14 flex flex-col items-center gap-3">
                <FileText className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
                <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No payroll runs yet.</p>
                <button onClick={() => setShowInitiate(true)}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold text-white"
                        style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
                  <Play className="w-3 h-3" /> Start
                </button>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {runs.map(run => {
                  const cfg = STATUS_CFG[run.status];
                  const isSel = selectedRun?.id === run.id;
                  return (
                    <div key={run.id}
                         className="grid items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors"
                         style={{ gridTemplateColumns: "1fr 70px 110px 80px 100px", background: isSel ? "rgba(255,102,0,0.05)" : undefined }}
                         onClick={() => { setSelectedRun(isSel ? null : run); setSelectedPayslip(null); }}
                         onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                         onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = ""; }}>
                      <div>
                        <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{run.period_name}</p>
                        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{run.subsidiary_name || "All entities"}</p>
                      </div>
                      <p className="text-[13px] tabular text-right" style={{ color: "var(--pg-text-2)" }}>{run.employee_count}</p>
                      <p className="text-[12px] font-bold tabular text-right font-mono" style={{ color: "#059669" }}>{fmt(run.total_net)}</p>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        {run.status === "draft" && (
                          <button onClick={() => approveMutation.mutate(run.id)} disabled={approveMutation.isPending}
                                  className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold text-white"
                                  style={{ background: "linear-gradient(135deg,#059669,#047857)" }}>
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </button>
                        )}
                        {run.status !== "draft" && (
                          <button onClick={() => window.open(`${BASE}/api/v1/payroll/runs/${run.id}/paye-schedule`, "_blank")}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "#FF6600" }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fff7f0"}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Run detail */}
        {selectedRun && runDetail && (
          <div className="xl:col-span-3 space-y-4">
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                <div>
                  <h3 className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>{runDetail.period_name} Payroll</h3>
                  <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{runDetail.subsidiary_name || "All entities"} · {runDetail.employee_count} employees</p>
                </div>
                {runDetail.status !== "draft" && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => window.open(`${BASE}/api/v1/payroll/runs/${runDetail.id}/paye-schedule`, "_blank")}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-semibold"
                            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                      <Download className="w-3 h-3" /> PAYE
                    </button>
                    <button onClick={() => window.open(`${BASE}/api/v1/payroll/runs/${runDetail.id}/pension-schedule`, "_blank")}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-semibold"
                            style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                      <Download className="w-3 h-3" /> Pension
                    </button>
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="grid grid-cols-4 divide-x" style={{ borderBottom: "1px solid var(--pg-row-border)", borderColor: "var(--pg-row-border)" }}>
                {[
                  { label: "Gross",   value: fmt(runDetail.total_gross),    color: "var(--pg-text-1)" },
                  { label: "PAYE",    value: fmt(runDetail.total_paye),     color: "#dc2626" },
                  { label: "Pension", value: fmt(runDetail.total_emp_pension + runDetail.total_employer_pension), color: "#d97706" },
                  { label: "Net",     value: fmt(runDetail.total_net),      color: "#059669" },
                ].map(s => (
                  <div key={s.label} className="px-4 py-3 text-center" style={{ borderColor: "var(--pg-row-border)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--pg-text-3)" }}>{s.label}</p>
                    <p className="text-[13px] font-bold tabular font-mono" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Payslip list */}
              <div className="grid px-5 py-2 text-[10px] font-bold uppercase tracking-wider"
                   style={{ gridTemplateColumns: "2fr 1fr 90px 80px 80px 90px", color: "var(--pg-text-3)" }}>
                <span>Employee</span><span>Grade</span>
                <span className="text-right">Gross</span><span className="text-right">PAYE</span>
                <span className="text-right">Pension</span><span className="text-right">Net</span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
                {(runDetail.payslips ?? []).map(p => (
                  <div key={p.id}
                       className="grid items-center gap-2 px-5 py-2.5 cursor-pointer transition-colors"
                       style={{ gridTemplateColumns: "2fr 1fr 90px 80px 80px 90px",
                                background: selectedPayslip?.id === p.id ? "rgba(255,102,0,0.05)" : undefined }}
                       onClick={() => setSelectedPayslip(selectedPayslip?.id === p.id ? null : p)}
                       onMouseEnter={e => { if (selectedPayslip?.id !== p.id) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                       onMouseLeave={e => { if (selectedPayslip?.id !== p.id) (e.currentTarget as HTMLElement).style.background = ""; }}>
                    <div>
                      <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{p.employee_name}</p>
                      <p className="text-[10px] truncate" style={{ color: "var(--pg-text-4)" }}>{p.position_title}</p>
                    </div>
                    <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>{p.grade_name || p.grade_code || "—"}</p>
                    <p className="text-[12px] tabular text-right font-mono" style={{ color: p.has_salary ? "var(--pg-text-1)" : "var(--pg-text-4)" }}>
                      {p.has_salary ? fmt(p.gross_salary) : "Manual"}
                    </p>
                    <p className="text-[12px] tabular text-right font-mono" style={{ color: "#dc2626" }}>{fmt(p.paye_tax)}</p>
                    <p className="text-[12px] tabular text-right font-mono" style={{ color: "#d97706" }}>{fmt(p.emp_pension)}</p>
                    <p className="text-[12px] tabular text-right font-mono font-semibold" style={{ color: "#059669" }}>{fmt(p.net_pay)}</p>
                  </div>
                ))}
              </div>
            </div>

            {selectedPayslip && (
              <PayslipPanel payslip={selectedPayslip} periodName={runDetail.period_name} />
            )}
          </div>
        )}
      </div>

      {showInitiate && <InitiateRunModal subsidiaries={subsidiaries} onClose={() => setShowInitiate(false)} />}
    </div>
  );
}
