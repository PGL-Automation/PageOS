"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ApplicationForm } from "@/components/onboarding/application-form";
import { RequirementsPanel } from "@/components/onboarding/requirements-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Send, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

const STATE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  submitted: "outline",
  in_review: "default",
  compliance_review: "default",
  pending_finance: "outline",
  approved: "default",
  rejected: "destructive",
  returned: "secondary",
};

export default function CaseDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const caseId = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const { data, error } = await api.GET("/onboarding/cases/{id}", {
        params: { path: { id: caseId } },
      });
      if (error) throw new Error("Failed to fetch case details");
      return data;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/onboarding/cases/{id}/submit", {
        params: { path: { id: caseId } },
      });
      if (error) throw new Error((error as Record<string, string>).message ?? "Submission failed");
      return data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast({ title: "Case Submitted", description: `Status: ${updated?.State}` });
    },
    onError: (err) => {
      toast({ title: "Submit Failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  if (isLoading) return (
    <div className="flex h-[50vh] items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  );

  if (error) return (
    <div className="p-4 bg-red-50 text-red-600 rounded-md">
      Error loading case: {(error as Error).message}
    </div>
  );

  const caseData = data?.case;
  const state = caseData?.State ?? "draft";
  const canEdit = state === "draft" || state === "returned";
  const canSubmit = Boolean(data?.can_submit) && canEdit;
  const requirements = data?.requirements ?? [];

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/onboarding/cases/${caseId}/finalize`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as Record<string, string>).message ?? "Failed to process account opening");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      toast({ title: "Account Opened ✓", description: "The client account has been activated and the client has been notified." });
    },
    onError: (err) => {
      toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Application Details</h1>
          <p className="text-slate-500 text-sm mt-0.5 font-mono">{caseId}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={STATE_VARIANT[state] ?? "secondary"} className="uppercase text-xs px-3 py-1">
            {state.replace("_", " ")}
          </Badge>
          {caseData?.RiskFlag && (
            <Badge variant="destructive" className="text-xs">High Risk</Badge>
          )}
          {canSubmit && (
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
              {submitMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Send className="mr-2 h-4 w-4" />}
              Submit for Review
            </Button>
          )}
          {!canSubmit && canEdit && (
            <Button variant="outline" disabled title="Complete all required documents to enable submission">
              <Send className="mr-2 h-4 w-4" /> Submit for Review
            </Button>
          )}
          {state === "pending_finance" && (
            <Button
              onClick={() => finalizeMutation.mutate()}
              disabled={finalizeMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {finalizeMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Process Account Opening
            </Button>
          )}
        </div>
      </div>

      {/* Finance action banner */}
      {state === "pending_finance" && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">Action Required — Process Account Opening</p>
          <p>This application has been approved by Compliance and is awaiting finance processing. Review the application details below, then click <strong>Process Account Opening</strong> to activate the client account and notify the client.</p>
        </div>
      )}

      {/* Returned notes */}
      {state === "returned" && caseData?.ReturnNotes && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">Returned for Correction</p>
          <p>{caseData.ReturnNotes}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Application form — 2/3 width */}
        <div className="lg:col-span-2">
          <ApplicationForm
            caseId={caseId}
            initialData={data?.application as Record<string, unknown>}
            readOnly={!canEdit}
          />
        </div>

        {/* Requirements panel — 1/3 width */}
        <div className="lg:col-span-1">
          <RequirementsPanel
            caseId={caseId}
            requirements={requirements}
            canUpload={canEdit}
          />
        </div>
      </div>
    </div>
  );
}
