"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, CheckCircle2, Clock, XCircle, Minus, Loader2 } from "lucide-react";
import { components } from "@/lib/api/types";

type Req = components["schemas"]["RequirementInstance"];

interface RequirementsPanelProps {
  caseId: string;
  requirements: Req[];
  canUpload?: boolean;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  satisfied: { label: "Satisfied", variant: "default", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  pending: { label: "Pending", variant: "secondary", icon: <Clock className="w-3.5 h-3.5" /> },
  not_applicable: { label: "N/A", variant: "outline", icon: <Minus className="w-3.5 h-3.5" /> },
  waived: { label: "Waived", variant: "outline", icon: <Minus className="w-3.5 h-3.5" /> },
  failed: { label: "Failed", variant: "destructive", icon: <XCircle className="w-3.5 h-3.5" /> },
};

function getStatus(r: Req) { return r.Status ?? r.status ?? "pending"; }
function getKey(r: Req) { return r.RequirementKey ?? r.requirement_key ?? ""; }
function getLabel(r: Req) { return r.Label ?? r.label ?? getKey(r); }
function getObligation(r: Req) { return r.Obligation ?? r.obligation ?? ""; }
function getCategory(r: Req) { return r.Category ?? r.category ?? ""; }

export function RequirementsPanel({ caseId, requirements, canUpload = false }: RequirementsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async ({ key, file }: { key: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("requirement_key", key);

      const res = await fetch(
        `http://localhost:8081/api/v1/onboarding/cases/${caseId}/documents`,
        { method: "POST", body: formData, credentials: "include" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as Record<string, string>).message ?? "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      toast({ title: "Document Uploaded", description: "The requirement has been marked as satisfied." });
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

  const required = requirements.filter(r => getObligation(r) === "required");
  const conditional = requirements.filter(r => getObligation(r) === "conditional" && getStatus(r) !== "not_applicable");
  const optional = requirements.filter(r => getObligation(r) === "optional");

  const totalRequired = required.length + conditional.length;
  const totalSatisfied = [...required, ...conditional].filter(r => getStatus(r) === "satisfied").length;
  const pct = totalRequired > 0 ? Math.round((totalSatisfied / totalRequired) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Document & Requirements</CardTitle>
          <span className="text-sm text-slate-500">{totalSatisfied}/{totalRequired} required complete</span>
        </div>
        {/* Completeness meter */}
        <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
          <div
            className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />

        {[
          { label: "Required", items: required },
          { label: "Conditional", items: conditional },
          { label: "Optional", items: optional },
        ].map(({ label, items }) => items.length > 0 && (
          <div key={label}>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">{label}</p>
            <div className="space-y-2">
              {items.map(r => {
                const key = getKey(r);
                const status = getStatus(r);
                const cfg = statusConfig[status] ?? statusConfig.pending;
                const isDoc = getCategory(r) === "document";
                const isUploading = uploadingKey === key;

                return (
                  <div key={key} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={cfg.variant} className="shrink-0 gap-1 text-xs">
                        {cfg.icon}{cfg.label}
                      </Badge>
                      <span className="text-sm text-slate-700 truncate">{getLabel(r)}</span>
                    </div>
                    {canUpload && isDoc && status !== "satisfied" && status !== "not_applicable" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => triggerUpload(key)}
                        disabled={isUploading}
                        className="shrink-0"
                      >
                        {isUploading
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Upload className="w-3.5 h-3.5" />}
                        <span className="ml-1">{isUploading ? "Uploading…" : "Upload"}</span>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {requirements.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">No requirements loaded.</p>
        )}
      </CardContent>
    </Card>
  );
}
