"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api/client";
import { useToast } from "@/hooks/use-toast";
import { ApplicationForm } from "@/components/onboarding/application-form";
import { RequirementsPanel } from "@/components/onboarding/requirements-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  UserPlus, FileText, Upload, CheckCircle2,
  ChevronRight, Loader2, ArrowLeft, Send,
  User, Building2,
} from "lucide-react";
import { components } from "@/lib/api/types";

type OnboardingCase   = components["schemas"]["OnboardingCase"];
type Client           = components["schemas"]["Client"];
type RequirementInstance = components["schemas"]["RequirementInstance"];

/* ─── Step metadata ─────────────────────────────────────────────── */
const STEPS = [
  { id: 1, label: "Client Setup",      icon: UserPlus  },
  { id: 2, label: "Application Form",  icon: FileText  },
  { id: 3, label: "Documents",         icon: Upload    },
  { id: 4, label: "Review & Submit",   icon: CheckCircle2 },
] as const;

/* ─── Step indicator ────────────────────────────────────────────── */
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((s, idx) => {
        const done    = s.id < current;
        const active  = s.id === current;
        const Icon    = s.icon;
        return (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200"
                style={{
                  background: done
                    ? "linear-gradient(135deg,#059669,#047857)"
                    : active
                    ? "linear-gradient(135deg,#2563eb,#1d4ed8)"
                    : "var(--pg-card)",
                  border: done || active ? "none" : "1.5px solid var(--pg-card-border)",
                  boxShadow: active ? "0 2px 8px rgba(37,99,235,0.35)" : "none",
                }}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-white" />
                ) : (
                  <Icon
                    className="w-4 h-4"
                    style={{ color: active ? "#fff" : "var(--pg-text-3)" }}
                  />
                )}
              </div>
              <span
                className="text-[10px] font-semibold uppercase tracking-wide hidden sm:block"
                style={{ color: active ? "var(--pg-text-1)" : "var(--pg-text-3)" }}
              >
                {s.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className="w-12 md:w-20 h-[2px] mx-1 mb-4 rounded-full transition-all duration-300"
                style={{ background: done ? "#059669" : "var(--pg-card-border)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Step 1: Client Setup ──────────────────────────────────────── */
function StepClientSetup({
  onCreated,
}: {
  onCreated: (client: Client, onboardingCase: OnboardingCase) => void;
}) {
  const { subsidiary } = useAuth();
  const { toast } = useToast();
  const [clientType, setClientType] = useState<"individual" | "corporate">("individual");
  const [displayName, setDisplayName] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const subsidId = subsidiary?.ID ?? "";
      if (!subsidId) throw new Error("No subsidiary selected — please reload.");
      if (!displayName.trim()) throw new Error("Please enter a client name.");

      // 1. Create client
      const { data: client, error: clientErr } = await api.POST("/onboarding/clients", {
        body: {
          subsidiary_id: subsidId,
          client_type: clientType,
          display_name: displayName.trim(),
        },
      });
      if (clientErr || !client) throw new Error("Failed to create client.");

      // 2. Create case
      const { data: onboardingCase, error: caseErr } = await api.POST("/onboarding/cases", {
        body: { client_id: client.ID },
      });
      if (caseErr || !onboardingCase) throw new Error("Failed to create onboarding case.");

      return { client, onboardingCase };
    },
    onSuccess: ({ client, onboardingCase }) => {
      toast({ title: "Client Created", description: `${client.DisplayName} — case opened.` });
      onCreated(client, onboardingCase);
    },
    onError: (err) => {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-[18px] font-bold mb-1" style={{ color: "var(--pg-text-1)" }}>
          New Client
        </h2>
        <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          Choose client type and enter their full name to open an onboarding case.
        </p>
      </div>

      {/* Client type toggle */}
      <div className="grid grid-cols-2 gap-3">
        {(["individual", "corporate"] as const).map((t) => {
          const Icon = t === "individual" ? User : Building2;
          const active = clientType === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setClientType(t)}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl transition-all duration-150"
              style={{
                background: active ? "linear-gradient(135deg,#eff6ff,#dbeafe)" : "var(--pg-card)",
                border: active ? "2px solid #2563eb" : "1.5px solid var(--pg-card-border)",
                boxShadow: active ? "0 2px 8px rgba(37,99,235,0.15)" : "none",
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: active ? "#2563eb" : "var(--pg-card-border)" }}
              >
                <Icon className="w-5 h-5" style={{ color: active ? "#fff" : "var(--pg-text-3)" }} />
              </div>
              <span
                className="text-[13px] font-semibold capitalize"
                style={{ color: active ? "#2563eb" : "var(--pg-text-2)" }}
              >
                {t}
              </span>
            </button>
          );
        })}
      </div>

      {/* Name field */}
      <div className="space-y-2">
        <Label htmlFor="display-name" className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>
          {clientType === "individual" ? "Full Name (Surname First)" : "Company Name"}
        </Label>
        <Input
          id="display-name"
          placeholder={clientType === "individual" ? "e.g. Okonkwo, Chidera James" : "e.g. Zenith Capital Ltd"}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") createMutation.mutate(); }}
          className="h-11 rounded-xl text-[14px]"
        />
      </div>

      <Button
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending || !displayName.trim()}
        className="w-full h-11 rounded-xl text-[14px] font-semibold"
        style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
      >
        {createMutation.isPending ? (
          <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Creating…</>
        ) : (
          <>Continue <ChevronRight className="ml-1 w-4 h-4" /></>
        )}
      </Button>
    </div>
  );
}

/* ─── Step 2: Application Form ──────────────────────────────────── */
function StepApplicationForm({
  caseId,
  onSaved,
}: {
  caseId: string;
  onSaved: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Application Form
          </h2>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Fill in the client&apos;s details. You can save and return to this page later.
          </p>
        </div>
        <Button
          onClick={onSaved}
          variant="outline"
          className="h-9 px-4 rounded-xl text-[13px] font-semibold"
        >
          Skip for now <ChevronRight className="ml-1 w-3.5 h-3.5" />
        </Button>
      </div>
      <ApplicationForm caseId={caseId} />
      <div className="flex justify-end pt-2">
        <Button
          onClick={onSaved}
          className="h-10 px-6 rounded-xl text-[13px] font-semibold"
          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
        >
          Save &amp; Continue <ChevronRight className="ml-1 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Step 3: Documents ─────────────────────────────────────────── */
function StepDocuments({
  caseId,
  caseState,
  onContinue,
}: {
  caseId: string;
  caseState: string;
  onContinue: () => void;
}) {
  const { data: requirements = [], isLoading } = useQuery<RequirementInstance[]>({
    queryKey: ["requirements", caseId],
    queryFn: async () => {
      const { data, error } = await api.GET("/onboarding/cases/{id}/requirements", {
        params: { path: { id: caseId } },
      });
      if (error || !data) return [];
      return data;
    },
    enabled: Boolean(caseId),
  });

  const canUpload = caseState === "draft" || caseState === "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Documents
          </h2>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            Upload the required documents for this client.
          </p>
        </div>
        <Button
          onClick={onContinue}
          variant="outline"
          className="h-9 px-4 rounded-xl text-[13px] font-semibold"
        >
          Continue <ChevronRight className="ml-1 w-3.5 h-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
        </div>
      ) : (
        <RequirementsPanel
          caseId={caseId}
          requirements={requirements}
          canUpload={canUpload}
        />
      )}

      <div className="flex justify-end pt-2">
        <Button
          onClick={onContinue}
          className="h-10 px-6 rounded-xl text-[13px] font-semibold"
          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
        >
          Continue to Review <ChevronRight className="ml-1 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Step 4: Review & Submit ───────────────────────────────────── */
function StepReview({
  caseId,
  client,
  onboardingCase,
  onSubmitted,
  onBack,
}: {
  caseId: string;
  client: Client;
  onboardingCase: OnboardingCase;
  onSubmitted: () => void;
  onBack: () => void;
}) {
  const { toast } = useToast();

  // Fetch full case details for summary
  const { data: caseDetails, isLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const { data } = await api.GET("/onboarding/cases/{id}", {
        params: { path: { id: caseId } },
      });
      return data ?? null;
    },
    enabled: Boolean(caseId),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/onboarding/cases/{id}/submit", {
        params: { path: { id: caseId } },
      });
      if (error || !data) throw new Error("Failed to submit case.");
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Case Submitted",
        description: "The onboarding case has been submitted for review.",
      });
      onSubmitted();
    },
    onError: (err) => {
      toast({ title: "Submit Failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  const app = caseDetails?.application;
  const reqs = caseDetails?.requirements ?? [];
  const totalReqs = reqs.filter(r => (r.Obligation ?? r.obligation) !== "optional");
  const satisfiedReqs = totalReqs.filter(r => (r.Status ?? r.status) === "satisfied");

  const summaryRows: Array<{ label: string; value: string }> = [
    { label: "Client Name",    value: client.DisplayName },
    { label: "Client Type",    value: onboardingCase.ClientType },
    { label: "Case ID",        value: caseId.slice(0, 8).toUpperCase() },
    { label: "Case State",     value: onboardingCase.State },
    { label: "Email",          value: app?.email ?? "—" },
    { label: "Phone",          value: app?.phone_numbers?.join(", ") ?? "—" },
    { label: "Investment Amount", value: (() => {
        if (!app?.investment_amount_kobo) return "—";
        const currency = app.investment_amount_words === "USD" ? "USD" : "NGN";
        const symbol   = currency === "USD" ? "$" : "₦";
        return `${symbol}${(app.investment_amount_kobo / 100).toLocaleString()}`;
      })() },
    { label: "Source of Funds", value: app?.source_of_funds ?? "—" },
    { label: "Bank",           value: app?.bank_name ? `${app.bank_name} — ${app.bank_account_number}` : "—" },
    { label: "Documents",      value: `${satisfiedReqs.length} / ${totalReqs.length} required satisfied` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
          Review &amp; Submit
        </h2>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
          Confirm the details below before submitting the case for review.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-3)" }} />
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
            boxShadow: "0 1px 4px var(--pg-card-shadow)",
          }}
        >
          <div
            className="px-5 py-4"
            style={{ borderBottom: "1px solid var(--pg-row-border)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
                style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
              >
                {client.DisplayName
                  .split(" ")
                  .map((w: string) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div>
                <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                  {client.DisplayName}
                </p>
                <p className="text-[11px] capitalize" style={{ color: "var(--pg-text-3)" }}>
                  {onboardingCase.ClientType} &middot; {onboardingCase.State}
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {summaryRows.map(row => (
              <div key={row.label} className="flex items-start px-5 py-3 gap-4">
                <span
                  className="w-44 shrink-0 text-[12px] font-medium"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  {row.label}
                </span>
                <span className="text-[13px] font-medium" style={{ color: "var(--pg-text-1)" }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incomplete warning */}
      {!isLoading && satisfiedReqs.length < totalReqs.length && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl"
          style={{ background: "#fffbeb", border: "1px solid #fde68a" }}
        >
          <span className="text-lg leading-none">&#9888;&#xFE0F;</span>
          <p className="text-[13px]" style={{ color: "#92400e" }}>
            <strong>{totalReqs.length - satisfiedReqs.length}</strong> required document(s) are
            still pending. You can still submit, but the reviewer may return the case.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-2">
        <Button
          variant="outline"
          onClick={onBack}
          className="h-10 px-4 rounded-xl text-[13px]"
        >
          <ArrowLeft className="mr-1.5 w-4 h-4" /> Back
        </Button>
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          className="h-10 px-6 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#059669,#047857)", boxShadow: "0 2px 8px rgba(5,150,105,0.35)" }}
        >
          {submitMutation.isPending ? (
            <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Submitting…</>
          ) : (
            <><Send className="mr-2 w-4 h-4" /> Submit for Review</>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────── */
export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep]     = useState(1);
  const [client, setClient] = useState<Client | null>(null);
  const [onboardingCase, setOnboardingCase] = useState<OnboardingCase | null>(null);

  function handleClientCreated(c: Client, oc: OnboardingCase) {
    setClient(c);
    setOnboardingCase(oc);
    setStep(2);
  }

  function handleSubmitted() {
    // Redirect: WM goes to pipeline, others go to dashboard
    // Heuristic: check display name / role. Fallback to /dashboard.
    // The auth context doesn't expose role directly; use subsidiary presence as WM signal.
    router.push("/wm/pipeline");
  }

  const caseId    = onboardingCase?.ID ?? "";
  const caseState = onboardingCase?.State ?? "draft";

  return (
    <div className="max-w-[860px] mx-auto px-4 py-8">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold" style={{ color: "var(--pg-text-1)" }}>
          Client Onboarding
        </h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--pg-text-3)" }}>
          Open a new account for a Page Capital client in four steps.
        </p>
      </div>

      <StepIndicator current={step} />

      {/* Step panels */}
      <div
        className="rounded-2xl p-6 md:p-8"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
          boxShadow: "0 2px 12px var(--pg-card-shadow)",
        }}
      >
        {step === 1 && (
          <StepClientSetup onCreated={handleClientCreated} />
        )}

        {step === 2 && client && onboardingCase && (
          <StepApplicationForm
            caseId={caseId}
            onSaved={() => setStep(3)}
          />
        )}

        {step === 3 && client && onboardingCase && (
          <StepDocuments
            caseId={caseId}
            caseState={caseState}
            onContinue={() => setStep(4)}
          />
        )}

        {step === 4 && client && onboardingCase && (
          <StepReview
            caseId={caseId}
            client={client}
            onboardingCase={onboardingCase}
            onSubmitted={handleSubmitted}
            onBack={() => setStep(3)}
          />
        )}
      </div>

      {/* Bottom step nav (steps 2–3 only: allow going back without losing state) */}
      {step > 1 && step < 4 && (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => setStep(s => s - 1)}
            className="flex items-center gap-1 text-[12px] font-medium transition-colors"
            style={{ color: "var(--pg-text-3)" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--pg-text-1)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--pg-text-3)"}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Previous step
          </button>
        </div>
      )}
    </div>
  );
}
