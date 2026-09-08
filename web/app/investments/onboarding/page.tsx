"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  User, Building2, FileScan, AlertCircle, X, CheckCircle,
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
                    ? "linear-gradient(135deg,#FF6600,#E05500)"
                    : "var(--pg-card)",
                  border: done || active ? "none" : "1.5px solid var(--pg-card-border)",
                  boxShadow: active ? "0 2px 8px rgba(255,102,0,0.35)" : "none",
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
                background: active ? "linear-gradient(135deg,#fff7f0,#fff0e0)" : "var(--pg-card)",
                border: active ? "2px solid #FF6600" : "1.5px solid var(--pg-card-border)",
                boxShadow: active ? "0 2px 8px rgba(255,102,0,0.15)" : "none",
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: active ? "#FF6600" : "var(--pg-card-border)" }}
              >
                <Icon className="w-5 h-5" style={{ color: active ? "#fff" : "var(--pg-text-3)" }} />
              </div>
              <span
                className="text-[13px] font-semibold capitalize"
                style={{ color: active ? "#FF6600" : "var(--pg-text-2)" }}
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
        style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
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

/* ─── PDF field extraction ──────────────────────────────────────── */

type ExtractedField = { value: string; confidence: "high" | "medium" | "low" };
type ExtractedFields = {
  full_name?: ExtractedField;
  email?: ExtractedField;
  phone_numbers?: ExtractedField;
  bvn?: ExtractedField;
  bank_account_number?: ExtractedField;
  bank_name?: ExtractedField;
  investment_amount?: ExtractedField;
  source_of_funds?: ExtractedField;
  residential_address?: ExtractedField;
  date_of_birth?: ExtractedField;
};

const FIELD_LABELS: Record<keyof ExtractedFields, string> = {
  full_name: "Full Name", email: "Email Address", phone_numbers: "Phone Number",
  bvn: "BVN", bank_account_number: "Account Number", bank_name: "Bank Name",
  investment_amount: "Investment Amount", source_of_funds: "Source of Funds",
  residential_address: "Residential Address", date_of_birth: "Date of Birth",
};

const NIGERIAN_BANKS = [
  "access bank", "zenith bank", "gtbank", "guaranty trust",
  "uba", "united bank for africa", "first bank", "sterling bank",
  "fcmb", "stanbic ibtc", "polaris bank", "keystone bank",
  "jaiz bank", "heritage bank", "union bank", "ecobank",
  "fidelity bank", "providus bank", "moniepoint", "opay", "kuda bank",
  "wema bank", "citibank", "standard chartered",
];

async function extractFieldsFromPDF(file: File): Promise<ExtractedFields> {
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(buf);
      let out = "";
      for (let i = 0; i < bytes.length; i++) {
        const c = bytes[i];
        if (c >= 32 && c <= 126) out += String.fromCharCode(c);
        else if (c === 10 || c === 13) out += " ";
      }
      resolve(out);
    };
    reader.readAsArrayBuffer(file);
  });

  // Strip PDF operators and collapse whitespace
  const clean = text
    .replace(/\b(stream|endstream|obj|endobj|xref|trailer|startxref|BT|ET|Tf|Tj|TJ|Td|TD|Tm|q|Q|cm|cs|CS|sc|SC|rg|RG|re|m|l|h|f|s|n|w|J|j|d|i|gs)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const result: ExtractedFields = {};

  // Email
  const email = clean.match(/\b[\w.+%-]+@[\w.-]+\.[a-zA-Z]{2,}\b/)?.[0];
  if (email) result.email = { value: email, confidence: "high" };

  // Nigerian phone
  const phone = clean.match(/(?:\+?234|0)[789]\d{9}/)?.[0];
  if (phone) result.phone_numbers = { value: phone, confidence: "high" };

  // BVN (11 digits)
  const allEleven = [...clean.matchAll(/\b(\d{11})\b/g)].map(m => m[1]);
  if (allEleven.length > 0) result.bvn = { value: allEleven[0], confidence: "medium" };

  // Account number (10 digits, not the BVN)
  const allTen = [...clean.matchAll(/\b(\d{10})\b/g)].map(m => m[1])
    .filter(n => !allEleven.includes(n.padStart(11, "0")));
  if (allTen.length > 0) result.bank_account_number = { value: allTen[0], confidence: "medium" };

  // Bank name
  const lc = clean.toLowerCase();
  for (const bank of NIGERIAN_BANKS) {
    if (lc.includes(bank)) {
      const title = bank.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
      result.bank_name = { value: title, confidence: "high" };
      break;
    }
  }

  // Investment amount (NGN figures)
  const amtMatch = clean.match(/(?:NGN|₦|N)\s*([\d,]+(?:\.\d{2})?)/);
  if (amtMatch) {
    const raw = parseInt(amtMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(raw)) result.investment_amount = { value: String(raw), confidence: "medium" };
  }

  // Full name (after common labels)
  const nameMatch = clean.match(/(?:full\s*name|surname|client\s*name|applicant\s*name|name\s*of\s*client)\s*[:\-]?\s*([A-Z][A-Za-z,.\s]{4,50})/i);
  if (nameMatch) {
    result.full_name = { value: nameMatch[1].trim().replace(/\s+/g, " "), confidence: "medium" };
  }

  // Source of funds
  const sofMatch = clean.match(/(?:source of funds?|source of income)\s*[:\-]?\s*([A-Za-z\s&/]{5,60}?)(?:\.|,|$)/i);
  if (sofMatch) result.source_of_funds = { value: sofMatch[1].trim(), confidence: "medium" };

  // Date of birth (DD/MM/YYYY or YYYY-MM-DD)
  const dobMatch = clean.match(/\b((?:\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}))\b/);
  if (dobMatch) result.date_of_birth = { value: dobMatch[1], confidence: "low" };

  return result;
}

/* ─── Step 2: Application Form ──────────────────────────────────── */
function StepApplicationForm({
  caseId,
  initialData,
  onSaved,
}: {
  caseId:        string;
  initialData?:  Record<string, unknown>;
  onSaved:       () => void;
}) {
  const [mode, setMode]                   = useState<"manual" | "upload">("manual");
  const [extracting, setExtracting]       = useState(false);
  const [extracted, setExtracted]         = useState<ExtractedFields | null>(null);
  const [pendingPrefill, setPendingPrefill] = useState<Record<string, unknown> | null>(null);
  // Track which extracted fields the user wants to apply (all by default)
  const [selected, setSelected]           = useState<Set<string>>(new Set());

  // Fetch any previously-saved application data so the form is pre-populated
  // when the user returns to this step after navigating forward and back.
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
      </div>
    );
  }

  // Server data wins; prop supplies name on first visit; pendingPrefill overlays PDF extraction.
  const merged: Record<string, unknown> = {
    ...initialData,
    ...(caseDetails?.application ?? {}),
    ...(pendingPrefill ?? {}),
  };

  async function handlePdfFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) return;
    setExtracting(true);
    setExtracted(null);
    try {
      const fields = await extractFieldsFromPDF(file);
      setExtracted(fields);
      setSelected(new Set(Object.keys(fields)));
    } finally {
      setExtracting(false);
    }
  }

  function applyExtracted() {
    if (!extracted) return;
    const prefill: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(extracted)) {
      if (selected.has(key) && field) {
        if (key === "investment_amount") {
          // Convert string amount to kobo integer
          prefill.investment_amount_kobo = parseInt((field as ExtractedField).value, 10) * 100;
        } else if (key === "date_of_birth") {
          // Normalise to YYYY-MM-DD if DD/MM/YYYY
          const raw = (field as ExtractedField).value;
          const ddmm = raw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
          prefill.date_of_birth = ddmm ? `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}` : raw;
        } else {
          prefill[key] = (field as ExtractedField).value;
        }
      }
    }
    setPendingPrefill(prefill);
    setMode("manual");
  }

  const confidenceColor = (c: "high" | "medium" | "low") =>
    c === "high" ? "#059669" : c === "medium" ? "#d97706" : "#dc2626";
  const confidenceBg = (c: "high" | "medium" | "low") =>
    c === "high" ? "#d1fae5" : c === "medium" ? "#fef3c7" : "#fee2e2";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Application Form
          </h2>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
            {mode === "manual"
              ? <>Fill in the client&apos;s details, then click <strong>Save &amp; Continue</strong>.</>
              : "Upload a completed PDF form to auto-fill the fields."}
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

      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--pg-muted-bg)" }}>
        {(["manual", "upload"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold transition-all"
            style={{
              background: mode === m ? "var(--pg-card)" : "transparent",
              color: mode === m ? "var(--pg-text-1)" : "var(--pg-text-3)",
              boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {m === "manual" ? <FileText className="w-3.5 h-3.5" /> : <FileScan className="w-3.5 h-3.5" />}
            {m === "manual" ? "Fill Manually" : "Upload PDF"}
          </button>
        ))}
      </div>

      {/* ── PDF Upload Panel ── */}
      {mode === "upload" && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
          <div className="h-[3px]" style={{ background: "#7c3aed" }} />
          <div className="p-5 space-y-4">

            {/* Info banner */}
            <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#1d4ed8" }} />
              <div>
                <p className="text-[12px] font-semibold" style={{ color: "#1d4ed8" }}>
                  PDF text extraction — review before applying
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "#3b82f6" }}>
                  PageOS will read text from the PDF and pre-fill matching fields. Works best with digital (not scanned) forms.
                  Always verify extracted values before saving.
                </p>
              </div>
            </div>

            {/* Drop zone */}
            {!extracted && !extracting && (
              <label
                htmlFor="pdf-upload-input"
                className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl cursor-pointer transition-all"
                style={{ border: "2px dashed var(--pg-card-border)", background: "var(--pg-muted-bg)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "#7c3aed"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)"}
                onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "#7c3aed"; }}
                onDragLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)"}
                onDrop={e => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--pg-card-border)";
                  const f = e.dataTransfer.files[0];
                  if (f) handlePdfFile(f);
                }}
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#ede9fe" }}>
                  <FileScan className="w-6 h-6" style={{ color: "#7c3aed" }} />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                    Drop PDF here or <span style={{ color: "#7c3aed" }}>click to browse</span>
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-3)" }}>
                    Completed client application form in PDF format
                  </p>
                </div>
                <input
                  id="pdf-upload-input"
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfFile(f); }}
                />
              </label>
            )}

            {/* Extracting state */}
            {extracting && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#7c3aed" }} />
                <p className="text-[13px]" style={{ color: "var(--pg-text-2)" }}>Reading PDF and extracting fields…</p>
              </div>
            )}

            {/* Extraction results */}
            {extracted && !extracting && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
                    Extracted Fields — select which to apply
                  </p>
                  <button
                    onClick={() => { setExtracted(null); setSelected(new Set()); }}
                    className="text-[12px] font-medium"
                    style={{ color: "var(--pg-text-3)" }}
                  >
                    Try another file
                  </button>
                </div>

                {Object.keys(extracted).length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
                      No readable fields detected. The PDF may be scanned or image-based.
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: "var(--pg-text-4)" }}>
                      Please fill the form manually.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: "var(--pg-card-border)" }}>
                    {(Object.entries(extracted) as [keyof ExtractedFields, ExtractedField][]).map(([key, field]) => (
                      <div key={key} className="flex items-center gap-3 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selected);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            setSelected(next);
                          }}
                          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors"
                          style={{
                            background: selected.has(key) ? "#FF6600" : "var(--pg-muted-bg)",
                            border: `1.5px solid ${selected.has(key) ? "#FF6600" : "var(--pg-card-border)"}`,
                          }}
                        >
                          {selected.has(key) && <CheckCircle className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>
                            {FIELD_LABELS[key] ?? key}
                          </p>
                          <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>
                            {field.value}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={{ background: confidenceBg(field.confidence), color: confidenceColor(field.confidence) }}>
                          {field.confidence}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {Object.keys(extracted).length > 0 && (
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => setSelected(new Set(Object.keys(extracted)))}
                      className="text-[12px] font-medium"
                      style={{ color: "#FF6600" }}
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setSelected(new Set())}
                      className="text-[12px] font-medium"
                      style={{ color: "var(--pg-text-3)" }}
                    >
                      Deselect all
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => setMode("manual")}
                      className="h-9 px-4 rounded-xl text-[13px] font-semibold"
                      style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)", border: "1px solid var(--pg-card-border)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={applyExtracted}
                      disabled={selected.size === 0}
                      className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white"
                      style={{
                        background: selected.size > 0 ? "linear-gradient(135deg,#FF6600,#E05500)" : "var(--pg-muted-bg)",
                        color: selected.size > 0 ? "#fff" : "var(--pg-text-3)",
                      }}
                    >
                      Apply {selected.size} field{selected.size !== 1 ? "s" : ""} to form
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Manual entry panel ── */}
      {mode === "manual" && (
        <div className="space-y-3">
          {pendingPrefill && (
            <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "#fef3c7", border: "1px solid #d97706" }}>
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#d97706" }} />
              <div className="flex-1">
                <p className="text-[12px] font-semibold" style={{ color: "#92400e" }}>
                  Form pre-filled from PDF — please review all fields before saving
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "#b45309" }}>
                  Extracted values are shown below. Correct anything that looks wrong.
                </p>
              </div>
              <button
                onClick={() => setPendingPrefill(null)}
                className="shrink-0"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e" }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <ApplicationForm caseId={caseId} initialData={merged} onSaveSuccess={onSaved} />
        </div>
      )}
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
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
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
  const queryClient = useQueryClient();

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
      // Invalidate all case-related caches so the pipeline page shows the
      // updated state immediately when the WM is redirected there.
      queryClient.invalidateQueries({ queryKey: ["wm-pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["case"] });
      queryClient.invalidateQueries({ queryKey: ["case-details"] });
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
                style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
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
            initialData={{ full_name: client.DisplayName }}
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
