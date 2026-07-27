"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, XCircle, RotateCcw, ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ApplicationForm } from "@/components/onboarding/application-form";
import { RequirementsPanel } from "@/components/onboarding/requirements-panel";
import { components } from "@/lib/api/types";

type QueueItem = components["schemas"]["ApprovalQueueItem"];
type ApprovalStep = components["schemas"]["ApprovalStep"];

const STEP_STATUS_CONFIG: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "secondary", label: "Pending" },
  approved: { variant: "default", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
  returned: { variant: "secondary", label: "Returned" },
  skipped: { variant: "outline", label: "Skipped" },
};

export default function ApprovalPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [notes, setNotes] = useState("");

  const { data: queue, isLoading } = useQuery({
    queryKey: ["approval-queue"],
    queryFn: async () => {
      const { data, error } = await api.GET("/approval/queue");
      if (error) throw new Error("Failed to fetch queue");
      return data ?? [];
    },
  });

  const { data: reqDetails } = useQuery({
    queryKey: ["approval-request", selected?.step.RequestID],
    queryFn: async () => {
      if (!selected) return null;
      const { data, error } = await api.GET("/approval/requests/{id}", {
        params: { path: { id: selected.step.RequestID } },
      });
      if (error) return null;
      return data;
    },
    enabled: Boolean(selected),
  });

  const { data: caseDetails } = useQuery({
    queryKey: ["case", selected?.resource_id],
    queryFn: async () => {
      if (!selected || selected.resource_type !== "onboarding_case") return null;
      const { data, error } = await api.GET("/onboarding/cases/{id}", {
        params: { path: { id: selected.resource_id } },
      });
      if (error) return null;
      return data;
    },
    enabled: Boolean(selected) && selected?.resource_type === "onboarding_case",
  });

  const decideMutation = useMutation({
    mutationFn: async ({ action }: { action: "approve" | "reject" | "return" }) => {
      if (!selected) throw new Error("No step selected");
      const { error } = await api.POST("/approval/requests/{id}/steps/{stepId}/decide", {
        params: { path: { id: selected.step.RequestID, stepId: selected.step.ID } },
        body: { action, notes },
      });
      if (error) throw new Error((error as Record<string, string>).message ?? "Decision failed");
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast({ title: "Decision Recorded", description: `Step ${action}d successfully.` });
      setSelected(null);
      setNotes("");
    },
    onError: (err) => {
      toast({ title: "Decision Failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  const ctx = selected?.context as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Approval Queue</h1>
          <p className="text-slate-500 text-sm mt-1">Steps pending your decision</p>
        </div>
        {selected && (
          <Button variant="outline" onClick={() => setSelected(null)}>
            ← Back to Queue
          </Button>
        )}
      </div>

      {!selected ? (
        // ── Queue list ──────────────────────────────────────────
        <Card>
          <CardHeader><CardTitle>Pending Steps</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Step</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(queue ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-slate-400">
                        Your approval queue is empty.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (queue as QueueItem[]).map(item => (
                      <TableRow key={item.step.ID}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{item.step.Label}</p>
                            <p className="text-xs text-slate-500 capitalize">{item.resource_type?.replace("_", " ")}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">
                          {item.resource_id?.slice(0, 8)}&hellip;
                        </TableCell>
                        <TableCell>
                          {(item.context as Record<string, unknown>)?.risk_flag
                            ? <Badge variant="destructive" className="text-xs">High Risk</Badge>
                            : <Badge variant="outline" className="text-xs">Standard</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => { setSelected(item); setNotes(""); }}>
                            <ClipboardCheck className="w-4 h-4 mr-1" /> Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        // ── Review workspace ────────────────────────────────────
        <div className="space-y-6">
          {/* Context summary */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{selected.step.Label}</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-slate-500 font-mono">{selected.resource_id}</span>
            {Boolean(ctx?.risk_flag) && <Badge variant="destructive" className="text-xs">High Risk</Badge>}
          </div>

          {/* Approval chain progress */}
          {reqDetails && (
            <Card>
              <CardHeader><CardTitle className="text-base">Approval Chain</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {reqDetails.steps?.map((step: ApprovalStep, i: number) => {
                    const cfg = STEP_STATUS_CONFIG[step.Status] ?? STEP_STATUS_CONFIG.pending;
                    return (
                      <div key={step.ID} className="flex items-center gap-2">
                        {i > 0 && <div className="h-px w-6 bg-slate-200" />}
                        <div className="text-center">
                          <Badge variant={step.ID === selected.step.ID ? "default" : cfg.variant} className="text-xs mb-1 block">
                            {step.ID === selected.step.ID ? "▶ You" : cfg.label}
                          </Badge>
                          <p className="text-xs text-slate-500 whitespace-nowrap">{step.Label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Case view — 2/3 */}
            {selected.resource_type === "onboarding_case" && (
              <div className="lg:col-span-2 space-y-4">
                <ApplicationForm
                  caseId={selected.resource_id}
                  initialData={caseDetails?.application as Record<string, unknown>}
                  readOnly
                />
              </div>
            )}

            {/* Decision panel — 1/3 */}
            <div className="space-y-4">
              {selected.resource_type === "onboarding_case" && (
                <RequirementsPanel
                  caseId={selected.resource_id}
                  requirements={caseDetails?.requirements ?? []}
                  canUpload={false}
                />
              )}

              <Card>
                <CardHeader><CardTitle className="text-base">Record Decision</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Notes (required for return, optional otherwise)</Label>
                    <Input
                      placeholder="Add notes for this decision…"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      className="w-full gap-2"
                      onClick={() => decideMutation.mutate({ action: "approve" })}
                      disabled={decideMutation.isPending}
                    >
                      {decideMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <CheckCircle2 className="h-4 w-4" />}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => decideMutation.mutate({ action: "return" })}
                      disabled={decideMutation.isPending || !notes.trim()}
                      title={!notes.trim() ? "Notes required to return" : undefined}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Return for Correction
                    </Button>
                    <Button
                      variant="destructive"
                      className="w-full gap-2"
                      onClick={() => decideMutation.mutate({ action: "reject" })}
                      disabled={decideMutation.isPending}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
