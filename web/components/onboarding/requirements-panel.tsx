"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, CheckCircle2, Clock, Minus, Loader2,
  FileText, ShieldCheck, AlertCircle,
} from "lucide-react";
import { components } from "@/lib/api/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type Req = components["schemas"]["RequirementInstance"];

interface RequirementsPanelProps {
  caseId:       string;
  requirements: Req[];
  canUpload?:   boolean;
}

function getStatus(r: Req)     { return r.Status     ?? r.status          ?? "pending"; }
function getKey(r: Req)        { return r.RequirementKey ?? r.requirement_key ?? ""; }
function getLabel(r: Req)      { return r.Label       ?? r.label           ?? getKey(r); }
function getObligation(r: Req) { return r.Obligation  ?? r.obligation      ?? ""; }
function getCategory(r: Req)   { return r.Category    ?? r.category        ?? ""; }

const STATUS_CFG: Record<string, {
  bg: string; text: string; border: string;
  icon: React.ReactNode; label: string;
}> = {
  satisfied:      { bg: "#ecfdf5", text: "#059669", border: "#a7f3d0", icon: <CheckCircle2 className="w-3 h-3" />, label: "Satisfied" },
  pending:        { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa", icon: <Clock         className="w-3 h-3" />, label: "Pending"   },
  not_applicable: { bg: "#f1f5f9", text: "#64748b", border: "#e2e8f0", icon: <Minus         className="w-3 h-3" />, label: "N/A"       },
  waived:         { bg: "#f1f5f9", text: "#64748b", border: "#e2e8f0", icon: <Minus         className="w-3 h-3" />, label: "Waived"    },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pending;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
      style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ReqRow({
  r,
  canUpload,
  isUploading,
  onUpload,
}: {
  r:          Req;
  canUpload:  boolean;
  isUploading: boolean;
  onUpload:   (key: string) => void;
}) {
  const key      = getKey(r);
  const status   = getStatus(r);
  const category = getCategory(r);
  const label    = getLabel(r);

  const isDocument = category === "document";
  const isConsent  = category === "consent";
  const isField    = category === "field";

  const isPending = status === "pending";

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 transition-colors"
      style={{ borderBottom: "1px solid var(--pg-row-border)" }}
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "var(--pg-muted-bg)" }}
      >
        {isConsent
          ? <ShieldCheck className="w-4 h-4" style={{ color: status === "satisfied" ? "#059669" : "#94a3b8" }} />
          : isField
          ? <AlertCircle className="w-4 h-4" style={{ color: status === "satisfied" ? "#059669" : "#94a3b8" }} />
          : <FileText    className="w-4 h-4" style={{ color: status === "satisfied" ? "#059669" : "#94a3b8" }} />}
      </div>

      {/* Label + hint */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>
          {label}
        </p>
        {(isConsent || isField) && isPending && (
          <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {isConsent ? "Tick the checkbox in Step 2 (Application Form)" : "Fill in the Application Form"}
          </p>
        )}
        {(isConsent || isField) && status === "satisfied" && (
          <p className="text-[11px] mt-0.5" style={{ color: "#059669" }}>
            {isConsent ? "Accepted in Application Form" : "Provided in Application Form"}
          </p>
        )}
      </div>

      {/* Status pill */}
      <StatusPill status={status} />

      {/* Upload button — documents only */}
      {canUpload && isDocument && isPending && (
        <button
          onClick={() => onUpload(key)}
          disabled={isUploading}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold text-white shrink-0 disabled:opacity-60 transition-opacity"
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
        >
          {isUploading
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</>
            : <><Upload  className="w-3 h-3" /> Upload</>}
        </button>
      )}
    </div>
  );
}

export function RequirementsPanel({ caseId, requirements, canUpload = false }: RequirementsPanelProps) {
  const { toast }      = useToast();
  const queryClient    = useQueryClient();
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [pendingKey,   setPendingKey]   = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async ({ key, file }: { key: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("requirement_key", key);
      const res = await fetch(
        `${BASE}/api/v1/onboarding/cases/${caseId}/documents`,
        { method: "POST", body: form, credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String((body.error as Record<string,string>)?.message ?? body.message ?? "Upload failed"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requirements", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      toast({ title: "Document Uploaded", description: "Requirement marked as satisfied." });
    },
    onError: (err) => {
      toast({ title: "Upload Failed", description: (err as Error).message, variant: "destructive" });
    },
    onSettled: () => {
      setUploadingKey(null);
      setPendingKey(null);
    },
  });

  function triggerUpload(key: string) {
    setPendingKey(key);
    fileInputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingKey) return;
    setUploadingKey(pendingKey);
    uploadMutation.mutate({ key: pendingKey, file });
    e.target.value = "";
  }

  // Group into sections — skip not_applicable items from optional
  const required    = requirements.filter(r => getObligation(r) === "required");
  const conditional = requirements.filter(r => getObligation(r) === "conditional" && getStatus(r) !== "not_applicable");
  const optional    = requirements.filter(r => getObligation(r) === "optional");

  const mandatoryAll  = [...required, ...conditional];
  const totalRequired = mandatoryAll.length;
  const satisfied     = mandatoryAll.filter(r => getStatus(r) === "satisfied").length;
  const pct           = totalRequired > 0 ? Math.round((satisfied / totalRequired) * 100) : 0;
  const allDone       = pct === 100 && totalRequired > 0;

  const sections = [
    { key: "required",    label: "Required",    dot: "#dc2626", items: required    },
    { key: "conditional", label: "Conditional", dot: "#f97316", items: conditional },
    { key: "optional",    label: "Optional",    dot: "#94a3b8", items: optional    },
  ].filter(s => s.items.length > 0);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}
    >
      {/* Header */}
      <div
        className="px-5 py-4"
        style={{ background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Documents &amp; Requirements
          </h3>
          <span className="text-[12px] font-semibold" style={{ color: allDone ? "#059669" : "var(--pg-text-3)" }}>
            {satisfied}/{totalRequired} required complete
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--pg-card-border)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: allDone ? "#10b981" : "#FF6600" }}
          />
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />

      {/* Sections */}
      {requirements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No requirements loaded.</p>
        </div>
      ) : (
        sections.map(({ key, label, dot, items }) => (
          <div key={key}>
            {/* Section label */}
            <div
              className="flex items-center gap-2 px-5 py-2.5"
              style={{ borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-card)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--pg-text-3)" }}>
                {label}
              </span>
            </div>

            {/* Rows */}
            <div style={{ background: "var(--pg-card)" }}>
              {items.map(r => (
                <ReqRow
                  key={getKey(r)}
                  r={r}
                  canUpload={canUpload}
                  isUploading={uploadingKey === getKey(r)}
                  onUpload={triggerUpload}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
