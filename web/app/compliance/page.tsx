"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ClipboardList, CheckCircle2, XCircle, AlertCircle, StickyNote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ApplicationForm } from "@/components/onboarding/application-form";
import { RequirementsPanel } from "@/components/onboarding/requirements-panel";
import { components } from "@/lib/api/types";

type ComplianceCheck = components["schemas"]["ComplianceCheck"];
type OnboardingCase = components["schemas"]["OnboardingCase"];
type RequirementInstance = components["schemas"]["RequirementInstance"];

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

const CHECK_TYPES = [
  { value: "pep_screening", label: "PEP Screening" },
  { value: "sanctions_screening", label: "Sanctions / Watchlist" },
  { value: "source_of_funds", label: "Source of Funds Review" },
  { value: "id_verification", label: "ID Verification" },
  { value: "bvn_validation", label: "BVN Validation" },
  { value: "address_verification", label: "Address Verification (Utility Bill)" },
  { value: "duplicate_check", label: "Duplicate / Existing Client Check" },
];

const OUTCOME_CONFIG: Record<string, { label: string; variant: "default" | "destructive" | "secondary"; icon: React.ReactNode }> = {
  pass: { label: "Pass", variant: "default", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  fail: { label: "Fail", variant: "destructive", icon: <XCircle className="w-3.5 h-3.5" /> },
  needs_info: { label: "Needs Info", variant: "secondary", icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

const STATE_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  in_review: "bg-amber-100 text-amber-700",
  compliance_review: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  returned: "bg-orange-100 text-orange-700",
};

const REVIEW_STATES = ["in_review", "compliance_review", "submitted"];

interface CaseRowData {
  id: string;
  state: string;
  clientType: string;
  riskFlag: boolean;
}

type ActionDialog = "approve" | "return" | "reject" | "reopen" | null;

export default function CompliancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const [selectedCase, setSelectedCase] = useState<CaseRowData | null>(null);
  const [checkType, setCheckType] = useState("");
  const [outcome, setOutcome] = useState<"pass" | "fail" | "needs_info">("pass");
  const [notes, setNotes] = useState("");

  // Notes (compliance_note) state
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Show approved/rejected toggle
  const [showAll, setShowAll] = useState(false);

  // Action dialog state
  const [actionDialog, setActionDialog] = useState<ActionDialog>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionPending, setActionPending] = useState(false);

  // Fetch all cases
  const { data: casesRaw, isLoading } = useQuery({
    queryKey: ["cases-compliance", subsidId],
    enabled: Boolean(subsidId),
    queryFn: async () => {
      const { data, error } = await api.GET("/onboarding/cases", {
        params: { query: { subsidiary_id: subsidId } },
      });
      if (error) throw new Error("Failed to fetch cases");
      return data ?? [];
    },
  });

  const cases = (casesRaw ?? []).filter((c: OnboardingCase) => {
    if (showAll) return true;
    return REVIEW_STATES.includes(c.State);
  });

  // Fetch checks for selected case
  const { data: checks } = useQuery({
    queryKey: ["compliance-checks", selectedCase?.id],
    queryFn: async () => {
      if (!selectedCase) return [];
      const { data, error } = await api.GET("/onboarding/cases/{id}/compliance", {
        params: { path: { id: selectedCase.id } },
      });
      if (error) return [];
      return data ?? [];
    },
    enabled: Boolean(selectedCase),
  });

  // Fetch case details (includes application + requirements from CaseDetails)
  const { data: caseDetails } = useQuery({
    queryKey: ["case", selectedCase?.id],
    queryFn: async () => {
      if (!selectedCase) return null;
      const { data, error } = await api.GET("/onboarding/cases/{id}", {
        params: { path: { id: selectedCase.id } },
      });
      if (error) return null;
      return data;
    },
    enabled: Boolean(selectedCase),
  });

  // Fetch requirements for selected case separately
  const { data: requirements } = useQuery({
    queryKey: ["case-requirements", selectedCase?.id],
    queryFn: async () => {
      if (!selectedCase) return [];
      const { data, error } = await api.GET("/onboarding/cases/{id}/requirements", {
        params: { path: { id: selectedCase.id } },
      });
      if (error) return (caseDetails?.requirements ?? []) as RequirementInstance[];
      return (data ?? []) as RequirementInstance[];
    },
    enabled: Boolean(selectedCase),
  });

  // Derived
  const completedTypes = new Set((checks ?? []).map((c: ComplianceCheck) => c.CheckType));
  const allPassed = CHECK_TYPES.every(t => {
    const check = (checks ?? []).find((c: ComplianceCheck) => c.CheckType === t.value);
    return check?.Outcome === "pass";
  });

  const complianceNotes = (checks ?? []).filter((c: ComplianceCheck) => c.CheckType === "compliance_note");
  const realChecks = (checks ?? []).filter((c: ComplianceCheck) => c.CheckType !== "compliance_note");

  // Current live case state (prefer caseDetails.case.State over CaseRowData)
  const liveState: string = (caseDetails as { case?: OnboardingCase } | null)?.case?.State ?? selectedCase?.state ?? "";
  const returnNotes: string | undefined = (caseDetails as { case?: OnboardingCase } | null)?.case?.ReturnNotes;
  const initiatedBy: string | undefined = (caseDetails as { case?: OnboardingCase } | null)?.case?.InitiatedBy;

  // Record compliance check mutation
  const recordMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCase || !checkType) throw new Error("Select a check type");
      const { data, error } = await api.POST("/onboarding/cases/{id}/compliance", {
        params: { path: { id: selectedCase.id } },
        body: { check_type: checkType, outcome, notes },
      });
      if (error) throw new Error("Failed to record check");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-checks", selectedCase?.id] });
      queryClient.invalidateQueries({ queryKey: ["case", selectedCase?.id] });
      toast({ title: "Check Recorded", description: `${checkType} → ${outcome}` });
      setCheckType("");
      setNotes("");
    },
    onError: (err) => {
      toast({ title: "Record Failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  // Save compliance note via compliance_note check type
  async function saveNote() {
    if (!selectedCase || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const { error } = await api.POST("/onboarding/cases/{id}/compliance", {
        params: { path: { id: selectedCase.id } },
        body: { check_type: "compliance_note", outcome: "pass", notes: noteText.trim() },
      });
      if (error) throw new Error("Failed to save note");
      queryClient.invalidateQueries({ queryKey: ["compliance-checks", selectedCase.id] });
      toast({ title: "Note Saved" });
      setNoteText("");
    } catch (err) {
      toast({ title: "Failed to Save Note", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingNote(false);
    }
  }

  // Generic state-change action via fetch()
  async function executeAction(action: "approve" | "return" | "reject" | "reopen") {
    if (!selectedCase) return;
    setActionPending(true);
    try {
      const body: Record<string, string> = {};
      if (action === "return") body.notes = actionReason;
      if (action === "reject") body.reason = actionReason;

      const res = await fetch(`${BASE_URL}/api/v1/onboarding/cases/${selectedCase.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as Record<string, string>).message ?? `${action} failed`);
      }

      queryClient.invalidateQueries({ queryKey: ["cases-compliance"] });
      toast({
        title: `Case ${action === "return" ? "Returned to WM" : action.charAt(0).toUpperCase() + action.slice(1)}`,
        description: `Case ${selectedCase.id.slice(0, 8)}… has been ${action === "return" ? "returned" : action + "d"}.`,
      });
      setActionDialog(null);
      setActionReason("");
      setSelectedCase(null);
    } catch (err) {
      toast({ title: "Action Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setActionPending(false);
    }
  }

  function openDialog(action: ActionDialog) {
    setActionReason("");
    setActionDialog(action);
  }

  const isReviewState = REVIEW_STATES.includes(liveState);
  const isTerminalState = liveState === "approved" || liveState === "rejected";

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Compliance Queue</h1>
          <p className="text-slate-500 text-sm mt-1">Cases awaiting compliance review</p>
        </div>
        {selectedCase ? (
          <Button variant="outline" onClick={() => setSelectedCase(null)}>
            ← Back to Queue
          </Button>
        ) : (
          <Button
            variant={showAll ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? "Showing All Cases" : "Show Only Pending"}
          </Button>
        )}
      </div>

      {!selectedCase ? (
        // ── Queue list ──────────────────────────────────────────
        <Card>
          <CardHeader>
            <CardTitle>{showAll ? "All Cases" : "Cases Pending Review"}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                        {showAll ? "No cases found." : "No cases pending compliance review."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    cases.map((c: OnboardingCase) => (
                      <TableRow key={c.ID}>
                        <TableCell className="font-mono text-xs">{c.ID?.slice(0, 8)}&hellip;</TableCell>
                        <TableCell className="capitalize text-sm">{c.ClientType}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase ${STATE_BADGE[c.State] ?? "bg-slate-100 text-slate-600"}`}>
                            {c.State?.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell>
                          {c.RiskFlag
                            ? <Badge variant="destructive" className="text-xs">High Risk</Badge>
                            : <Badge variant="outline" className="text-xs">Standard</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedCase({ id: c.ID, state: c.State, clientType: c.ClientType, riskFlag: c.RiskFlag })}
                          >
                            <ClipboardList className="w-4 h-4 mr-1" /> Review
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
        <div className="space-y-4">
          {/* Return notes banner */}
          {returnNotes && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Case was previously returned</p>
                <p className="text-sm text-amber-700 mt-0.5">{returnNotes}</p>
              </div>
            </div>
          )}

          {/* Case header */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-500 font-mono">{selectedCase.id}</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold uppercase ${STATE_BADGE[liveState] ?? "bg-slate-100 text-slate-600"}`}>
              {liveState.replace(/_/g, " ")}
            </span>
            {selectedCase.riskFlag && (
              <Badge variant="destructive" className="text-xs">High Risk</Badge>
            )}
            {allPassed && (
              <Badge variant="default" className="text-xs gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> All Checks Passed
              </Badge>
            )}
            {initiatedBy && (
              <span className="text-xs text-slate-400">
                Initiated by: <span className="font-mono text-slate-600">{initiatedBy}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: application (read-only) */}
            <div className="lg:col-span-2 space-y-4">
              <ApplicationForm
                caseId={selectedCase.id}
                initialData={caseDetails?.application as Record<string, unknown>}
                readOnly
              />
            </div>

            {/* Right: requirements + checklist + notes */}
            <div className="space-y-4">
              {/* Requirements panel — compliance can always upload */}
              <RequirementsPanel
                caseId={selectedCase.id}
                requirements={requirements ?? caseDetails?.requirements ?? []}
                canUpload={true}
              />

              {/* Action buttons */}
              <Card>
                <CardHeader><CardTitle>Case Actions</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {isReviewState && (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => openDialog("approve")}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          className="bg-amber-500 hover:bg-amber-600 text-white"
                          onClick={() => openDialog("return")}
                        >
                          <AlertCircle className="w-4 h-4 mr-1" />
                          Return to WM
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openDialog("reject")}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    {isTerminalState && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDialog("reopen")}
                      >
                        Reopen
                      </Button>
                    )}
                    {!isReviewState && !isTerminalState && (
                      <p className="text-xs text-slate-400">No actions available for state: {liveState}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Compliance checklist */}
              <Card>
                <CardHeader><CardTitle>Compliance Checklist</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {/* Completed checks (excluding notes) */}
                  {realChecks.length > 0 && (
                    <div className="space-y-2">
                      {(realChecks as ComplianceCheck[]).map(c => {
                        const cfg = OUTCOME_CONFIG[c.Outcome] ?? OUTCOME_CONFIG.needs_info;
                        const label = CHECK_TYPES.find(t => t.value === c.CheckType)?.label ?? c.CheckType;
                        return (
                          <div key={c.ID} className="flex items-center justify-between rounded border p-2 text-sm">
                            <div className="min-w-0">
                              <span className="text-slate-700">{label}</span>
                              {c.Notes && (
                                <p className="text-xs text-slate-400 mt-0.5 truncate">{c.Notes}</p>
                              )}
                            </div>
                            <Badge variant={cfg.variant} className="gap-1 text-xs shrink-0 ml-2">
                              {cfg.icon}{cfg.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Record new check */}
                  <div className="border-t pt-3 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Record Check</p>
                    <div className="space-y-2">
                      <Label>Check Type</Label>
                      <Select value={checkType} onValueChange={v => setCheckType(v ?? "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select check type…" />
                        </SelectTrigger>
                        <SelectContent>
                          {CHECK_TYPES.filter(t => !completedTypes.has(t.value)).map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Outcome</Label>
                      <Select value={outcome} onValueChange={v => setOutcome((v ?? "pass") as "pass" | "fail" | "needs_info")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pass">Pass</SelectItem>
                          <SelectItem value="fail">Fail</SelectItem>
                          <SelectItem value="needs_info">Needs Info</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes (optional)</Label>
                      <Input
                        placeholder="Any findings or notes…"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => recordMutation.mutate()}
                      disabled={!checkType || recordMutation.isPending}
                    >
                      {recordMutation.isPending
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : null}
                      Record Check
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Compliance Notes */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <StickyNote className="w-4 h-4 text-slate-500" />
                    <CardTitle>Compliance Notes</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Existing notes */}
                  {complianceNotes.length > 0 && (
                    <div className="space-y-2">
                      {(complianceNotes as ComplianceCheck[]).map(n => (
                        <div key={n.ID} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                          <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.Notes}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {n.PerformedBy && <span className="mr-2 font-mono">{n.PerformedBy.slice(0, 8)}…</span>}
                            {n.PerformedAt && new Date(n.PerformedAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new note */}
                  <div className="space-y-2 border-t pt-3">
                    <Label>Add Note</Label>
                    <Textarea
                      placeholder="Free-form compliance note…"
                      className="min-h-[80px] resize-y"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                    />
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={saveNote}
                      disabled={!noteText.trim() || savingNote}
                    >
                      {savingNote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save Note
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ── Action Dialogs ──────────────────────────────────────── */}

      {/* Approve */}
      <Dialog open={actionDialog === "approve"} onOpenChange={open => !open && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Case</DialogTitle>
            <DialogDescription>
              {allPassed
                ? "All compliance checks have passed. Confirm approval."
                : "Not all checks have passed. Approving will override the checklist. Are you sure?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)} disabled={actionPending}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => executeAction("approve")}
              disabled={actionPending}
            >
              {actionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return to WM */}
      <Dialog open={actionDialog === "return"} onOpenChange={open => !open && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to Wealth Manager</DialogTitle>
            <DialogDescription>
              Provide return notes explaining what needs to be corrected or supplied.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Return Notes</Label>
            <Textarea
              placeholder="Describe what needs to be addressed…"
              className="min-h-[100px]"
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)} disabled={actionPending}>
              Cancel
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => executeAction("return")}
              disabled={actionPending || !actionReason.trim()}
            >
              {actionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Return Case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={actionDialog === "reject"} onOpenChange={open => !open && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Case</DialogTitle>
            <DialogDescription>
              This will permanently reject the onboarding case. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Rejection Reason</Label>
            <Textarea
              placeholder="Reason for rejection…"
              className="min-h-[100px]"
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)} disabled={actionPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => executeAction("reject")}
              disabled={actionPending || !actionReason.trim()}
            >
              {actionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reject Case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen */}
      <Dialog open={actionDialog === "reopen"} onOpenChange={open => !open && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Case</DialogTitle>
            <DialogDescription>
              This will move the case back into review. Confirm to proceed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)} disabled={actionPending}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => executeAction("reopen")}
              disabled={actionPending}
            >
              {actionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reopen Case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
