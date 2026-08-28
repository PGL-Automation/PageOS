"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, FolderOpen, AlertCircle } from "lucide-react";
import { RequirementsPanel } from "@/components/onboarding/requirements-panel";
import { components } from "@/lib/api/types";

type OnboardingCase = components["schemas"]["OnboardingCase"];
type RequirementInstance = components["schemas"]["RequirementInstance"];

const STATE_CFG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft:             { label: "Draft",            variant: "secondary" },
  submitted:         { label: "Submitted",         variant: "outline" },
  in_review:         { label: "In Review",         variant: "outline" },
  compliance_review: { label: "Compliance Review", variant: "outline" },
  approved:          { label: "Approved",          variant: "default" },
  rejected:          { label: "Rejected",          variant: "destructive" },
  returned:          { label: "Returned",          variant: "secondary" },
};

export default function DocumentsPage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["cases-documents", subsidId],
    enabled: Boolean(subsidId),
    queryFn: async () => {
      const { data, error } = await api.GET("/onboarding/cases", {
        params: { query: { subsidiary_id: subsidId } },
      });
      if (error) throw new Error("Failed to fetch cases");
      return (data ?? []) as OnboardingCase[];
    },
  });

  const { data: caseDetails } = useQuery({
    queryKey: ["case-details-docs", selectedCaseId],
    enabled: Boolean(selectedCaseId),
    queryFn: async () => {
      const { data, error } = await api.GET("/onboarding/cases/{id}", {
        params: { path: { id: selectedCaseId! } },
      });
      if (error) return null;
      return data;
    },
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ["case-requirements-docs", selectedCaseId],
    enabled: Boolean(selectedCaseId),
    queryFn: async () => {
      const { data } = await api.GET("/onboarding/cases/{id}/requirements", {
        params: { path: { id: selectedCaseId! } },
      });
      return (data ?? []) as RequirementInstance[];
    },
  });

  const selectedCase = cases.find(c => c.ID === selectedCaseId);
  const satisfied   = requirements.filter(r => (r.Status ?? r.status) === "satisfied").length;
  const total       = requirements.length;

  return (
    <div className="max-w-[1300px] mx-auto space-y-6">

      <div>
        <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>Document Vault</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          Client onboarding documents and requirement checklists
        </p>
      </div>

      <div className="grid xl:grid-cols-3 gap-5 items-start">

        {/* Case list */}
        <div className="xl:col-span-1 rounded-2xl overflow-hidden"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
              Client Cases{cases.length > 0 && (
                <span className="font-normal text-[11px] ml-1" style={{ color: "var(--pg-text-3)" }}>
                  ({cases.length})
                </span>
              )}
            </h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
            </div>
          ) : cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <FolderOpen className="w-10 h-10 mb-3" style={{ color: "var(--pg-text-4)" }} />
              <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No cases yet</p>
              <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-4)" }}>
                Cases appear here once a Wealth Manager starts an onboarding
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
              {cases.map(c => {
                const cfg       = STATE_CFG[c.State] ?? { label: c.State, variant: "secondary" as const };
                const isSelected = selectedCaseId === c.ID;
                return (
                  <button
                    key={c.ID}
                    onClick={() => setSelectedCaseId(isSelected ? null : c.ID)}
                    className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors"
                    style={{ background: isSelected ? "rgba(255,102,0,0.06)" : "" }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                         style={{ background: c.RiskFlag ? "#fef2f2" : "#fff7f0" }}>
                      <FileText className="w-4 h-4" style={{ color: c.RiskFlag ? "#dc2626" : "#FF6600" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">{cfg.label}</Badge>
                        {c.RiskFlag && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: "#fee2e2", color: "#dc2626" }}>
                            <AlertCircle className="w-2.5 h-2.5" /> Risk
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] mt-1 font-mono truncate" style={{ color: "var(--pg-text-4)" }}>
                        {c.ID.slice(0, 16)}…
                      </p>
                      <p className="text-[11px] mt-0.5 capitalize" style={{ color: "var(--pg-text-3)" }}>
                        {c.ClientType}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Requirements / documents panel */}
        <div className="xl:col-span-2">
          {!selectedCaseId ? (
            <div className="rounded-2xl flex flex-col items-center justify-center py-20"
                 style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
              <FolderOpen className="w-12 h-12 mb-4" style={{ color: "var(--pg-text-4)" }} />
              <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>Select a case</p>
              <p className="text-[12px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                Choose a client case on the left to view its documents and requirements
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Case header */}
              <div className="rounded-2xl px-5 py-4"
                   style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                      {caseDetails?.application?.full_name ?? "Client"}
                    </p>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                      {selectedCase?.ClientType === "individual" ? "Individual" : "Corporate"} ·{" "}
                      <span className="font-mono">{selectedCaseId?.slice(0, 8)}…</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                      {satisfied}/{total} requirements satisfied
                    </p>
                    <div className="h-1.5 w-32 rounded-full mt-1.5" style={{ background: "var(--pg-muted-bg)" }}>
                      <div className="h-1.5 rounded-full transition-all"
                           style={{ width: total > 0 ? `${(satisfied / total) * 100}%` : "0%", background: "#059669" }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Requirements list */}
              <RequirementsPanel
                caseId={selectedCaseId}
                requirements={requirements}
                canUpload={selectedCase?.State === "draft" || selectedCase?.State === "returned"}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
