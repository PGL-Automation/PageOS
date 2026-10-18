"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RoleGuard } from "@/components/role-guard";

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentAccount = {
  id: string;
  subsidiary_id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  cut_off_time: string;
  is_active: boolean;
};

type RequestType = "client_payout" | "liquidation" | "transfer" | "expense" | "placement";

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  client_payout: "Client Payout",
  liquidation: "Liquidation",
  transfer: "Transfer",
  expense: "Expense",
  placement: "Placement",
};

type BeneficiaryCheckResult = "on_register" | "not_on_register" | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

async function payoutFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/payouts${path}`, {
    credentials: "include",
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      body?.error?.message ?? body?.message ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

// ── Form ─────────────────────────────────────────────────────────────────────

function RaiseRequestForm() {
  const router = useRouter();
  const { subsidiary, subsidiaries } = useAuth();
  const { toast } = useToast();

  // ── Form state ────────────────────────────────────────────────────────────

  // Use the user's active subsidiary; if they have multiple, allow selection.
  const [subsidiaryId, setSubsidiaryId] = useState<string>(
    subsidiary?.ID ?? ""
  );
  const [requestType, setRequestType] = useState<RequestType | "">("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [amountNaira, setAmountNaira] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryBank, setBeneficiaryBank] = useState("");
  const [beneficiaryAccount, setBeneficiaryAccount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [docFilename, setDocFilename] = useState("");

  // Beneficiary account check
  const [checkStatus, setCheckStatus] = useState<BeneficiaryCheckResult>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  // ── Payment accounts ──────────────────────────────────────────────────────

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<
    PaymentAccount[]
  >({
    queryKey: ["payout-accounts", subsidiaryId],
    enabled: Boolean(subsidiaryId),
    queryFn: async () => {
      const raw = await payoutFetch(
        `/accounts?subsidiary_id=${subsidiaryId}`
      );
      return Array.isArray(raw) ? (raw as PaymentAccount[]) : [];
    },
  });

  // ── Beneficiary check ─────────────────────────────────────────────────────

  const checkBeneficiary = useCallback(async () => {
    const acct = beneficiaryAccount.trim();
    if (!acct || !subsidiaryId) return;
    // Basic 10-digit check
    if (!/^\d{10}$/.test(acct)) return;

    setCheckLoading(true);
    setCheckStatus(null);
    try {
      const data = await payoutFetch("/beneficiaries/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_number: acct,
          subsidiary_id: subsidiaryId,
        }),
      });
      setCheckStatus(
        data?.on_register ? "on_register" : "not_on_register"
      );
    } catch {
      // Non-fatal — just don't show indicator
      setCheckStatus(null);
    } finally {
      setCheckLoading(false);
    }
  }, [beneficiaryAccount, subsidiaryId]);

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!subsidiaryId) return "Please select a company.";
    if (!requestType) return "Please select a request type.";
    if (!paymentAccountId) return "Please select a payment account.";

    const parsed = parseFloat(amountNaira);
    if (!amountNaira || isNaN(parsed) || parsed <= 0)
      return "Please enter a valid amount greater than ₦0.";

    if (!beneficiaryName.trim()) return "Beneficiary name is required.";
    if (!beneficiaryBank.trim()) return "Beneficiary bank is required.";

    const acct = beneficiaryAccount.trim();
    if (!acct) return "Beneficiary account number is required.";
    if (!/^\d{10}$/.test(acct))
      return "Account number must be exactly 10 digits.";

    if (!purpose.trim()) return "Purpose is required.";

    return null;
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const submitMutation = useMutation({
    mutationFn: async () => {
      const amountKobo = Math.round(parseFloat(amountNaira) * 100);

      // Step 1: create draft
      const draft = await payoutFetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subsidiary_id: subsidiaryId,
          request_type: requestType,
          payment_account_id: paymentAccountId,
          amount_kobo: amountKobo,
          beneficiary_name: beneficiaryName.trim(),
          beneficiary_bank: beneficiaryBank.trim(),
          beneficiary_account: beneficiaryAccount.trim(),
          purpose: purpose.trim(),
          supporting_doc_path: docFilename || "",
        }),
      });

      const draftId: string = draft?.id;
      if (!draftId) throw new Error("Server did not return a draft ID.");

      // Step 2: submit (builds step chain, sends first email)
      await payoutFetch(`/${draftId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      return draftId;
    },
    onSuccess: (id: string) => {
      toast({
        title: "Request submitted",
        description: "Your payment request is now pending approval.",
      });
      router.push(`/approvals/${id}`);
    },
    onError: (err: Error) => {
      toast({
        title: "Submission failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: "Validation error", description: err, variant: "destructive" });
      return;
    }
    submitMutation.mutate();
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isSingleSubsidiary = subsidiaries.length <= 1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: "var(--pg-bg)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{
          background: "var(--pg-card)",
          borderBottom: "1px solid var(--pg-card-border)",
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/approvals")}
          className="flex items-center justify-center w-8 h-8 rounded-xl transition-colors"
          style={{ background: "var(--pg-muted-bg)" }}
          aria-label="Back to approvals"
        >
          <ArrowLeft className="w-4 h-4" style={{ color: "var(--pg-text-2)" }} />
        </button>
        <div>
          <h1
            className="text-[15px] font-bold"
            style={{ color: "var(--pg-text-1)" }}
          >
            Raise a Request
          </h1>
          <p
            className="text-[11px]"
            style={{ color: "var(--pg-text-3)" }}
          >
            New payment approval request
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-xl mx-auto px-4 py-6 space-y-5">

        {/* 1. Company */}
        <div className="space-y-1.5">
          <Label
            className="text-[12px] font-semibold"
            style={{ color: "var(--pg-text-2)" }}
          >
            Company
          </Label>
          {isSingleSubsidiary ? (
            <div
              className="flex items-center h-10 px-3 rounded-xl text-[13px]"
              style={{
                background: "var(--pg-muted-bg)",
                border: "1px solid var(--pg-input-border)",
                color: "var(--pg-text-1)",
              }}
            >
              {subsidiary?.Name ?? "—"}
            </div>
          ) : (
            <Select
              value={subsidiaryId}
              onValueChange={(v) => {
                if (v) setSubsidiaryId(v);
                setPaymentAccountId("");
                setCheckStatus(null);
              }}
            >
              <SelectTrigger className="h-10 rounded-xl text-[13px]">
                <SelectValue placeholder="Select company…" />
              </SelectTrigger>
              <SelectContent>
                {subsidiaries.map((s) => (
                  <SelectItem key={s.ID} value={s.ID}>
                    {s.Name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* 2. Request Type */}
        <div className="space-y-1.5">
          <Label
            className="text-[12px] font-semibold"
            style={{ color: "var(--pg-text-2)" }}
          >
            Request Type
          </Label>
          <Select
            value={requestType}
            onValueChange={(v) => setRequestType(v as RequestType)}
          >
            <SelectTrigger className="h-10 rounded-xl text-[13px]">
              <SelectValue placeholder="Select request type…" />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(REQUEST_TYPE_LABELS) as [RequestType, string][]).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>

        {/* 3. Payment Account */}
        <div className="space-y-1.5">
          <Label
            className="text-[12px] font-semibold"
            style={{ color: "var(--pg-text-2)" }}
          >
            Payment Account
          </Label>
          <Select
            value={paymentAccountId}
            onValueChange={(v) => setPaymentAccountId(v ?? "")}
            disabled={!subsidiaryId || accountsLoading}
          >
            <SelectTrigger className="h-10 rounded-xl text-[13px]">
              <SelectValue
                placeholder={
                  accountsLoading
                    ? "Loading accounts…"
                    : accounts.length === 0
                    ? "No accounts available"
                    : "Select payment account…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {accounts
                .filter((a) => a.is_active)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.account_name} – {a.bank_name} ({a.account_number})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* 4. Amount */}
        <div className="space-y-1.5">
          <Label
            className="text-[12px] font-semibold"
            style={{ color: "var(--pg-text-2)" }}
          >
            Amount (₦)
          </Label>
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold select-none"
              style={{ color: "var(--pg-text-3)" }}
            >
              ₦
            </span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amountNaira}
              onChange={(e) => setAmountNaira(e.target.value)}
              placeholder="0.00"
              className="pl-7 h-10 rounded-xl text-[13px] font-mono"
            />
          </div>
          {amountNaira && !isNaN(parseFloat(amountNaira)) && parseFloat(amountNaira) > 0 && (
            <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              {new Intl.NumberFormat("en-NG", {
                style: "currency",
                currency: "NGN",
                maximumFractionDigits: 2,
              }).format(parseFloat(amountNaira))}
            </p>
          )}
        </div>

        {/* Beneficiary section */}
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
          }}
        >
          <p
            className="text-[11px] font-bold uppercase tracking-widest"
            style={{ color: "var(--pg-text-3)" }}
          >
            Beneficiary Details
          </p>

          {/* 5. Beneficiary Name */}
          <div className="space-y-1.5">
            <Label
              className="text-[12px] font-semibold"
              style={{ color: "var(--pg-text-2)" }}
            >
              Beneficiary Name
            </Label>
            <Input
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder="e.g. John Doe"
              className="h-10 rounded-xl text-[13px]"
            />
          </div>

          {/* 6. Beneficiary Bank */}
          <div className="space-y-1.5">
            <Label
              className="text-[12px] font-semibold"
              style={{ color: "var(--pg-text-2)" }}
            >
              Beneficiary Bank
            </Label>
            <Input
              value={beneficiaryBank}
              onChange={(e) => setBeneficiaryBank(e.target.value)}
              placeholder="e.g. GT Bank"
              className="h-10 rounded-xl text-[13px]"
            />
          </div>

          {/* 7. Beneficiary Account Number */}
          <div className="space-y-1.5">
            <Label
              className="text-[12px] font-semibold"
              style={{ color: "var(--pg-text-2)" }}
            >
              Beneficiary Account Number
            </Label>
            <Input
              value={beneficiaryAccount}
              onChange={(e) => {
                setBeneficiaryAccount(e.target.value);
                setCheckStatus(null);
              }}
              onBlur={checkBeneficiary}
              placeholder="10-digit account number"
              maxLength={10}
              inputMode="numeric"
              pattern="\d{10}"
              className="h-10 rounded-xl text-[13px] font-mono"
            />

            {/* Register check indicator */}
            {checkLoading && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--pg-text-3)" }} />
                <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                  Checking register…
                </span>
              </div>
            )}
            {!checkLoading && checkStatus === "on_register" && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="text-[11px] font-medium text-emerald-600">
                  On register
                </span>
              </div>
            )}
            {!checkLoading && checkStatus === "not_on_register" && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-[11px] font-medium text-amber-600">
                  Not on register — will go to Compliance review
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 8. Purpose */}
        <div className="space-y-1.5">
          <Label
            className="text-[12px] font-semibold"
            style={{ color: "var(--pg-text-2)" }}
          >
            Purpose
          </Label>
          <Textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Describe the reason for this payment…"
            rows={3}
            className="rounded-xl text-[13px] resize-none"
          />
        </div>

        {/* 9. Supporting Document */}
        <div className="space-y-1.5">
          <Label
            className="text-[12px] font-semibold"
            style={{ color: "var(--pg-text-2)" }}
          >
            Supporting Document
            <span
              className="ml-1.5 text-[11px] font-normal"
              style={{ color: "var(--pg-text-3)" }}
            >
              (optional)
            </span>
          </Label>

          <div
            className="relative flex items-center gap-3 h-10 px-3 rounded-xl cursor-pointer"
            style={{
              background: "var(--pg-muted-bg)",
              border: "1px dashed var(--pg-input-border)",
            }}
          >
            <Paperclip className="w-4 h-4 shrink-0" style={{ color: "var(--pg-text-3)" }} />
            <span
              className="flex-1 text-[12px] truncate"
              style={{ color: docFilename ? "var(--pg-text-1)" : "var(--pg-text-4)" }}
            >
              {docFilename || "Choose a file…"}
            </span>
            <input
              type="file"
              className="absolute inset-0 opacity-0 cursor-pointer w-full"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setDocFilename(f.name);
              }}
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
            />
          </div>
          <p className="text-[10px]" style={{ color: "var(--pg-text-4)" }}>
            File upload is coming soon — the filename will be recorded with your request for now.
          </p>
        </div>

        {/* Submit */}
        <div className="pt-2 pb-8">
          <Button
            type="submit"
            disabled={submitMutation.isPending}
            className="w-full h-11 rounded-xl text-[14px] font-semibold text-white"
            style={{
              background: submitMutation.isPending
                ? "#FF660099"
                : "linear-gradient(135deg,#FF6600,#E05500)",
            }}
          >
            {submitMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting…
              </span>
            ) : (
              "Submit for Approval"
            )}
          </Button>
          <p
            className="text-center text-[11px] mt-3"
            style={{ color: "var(--pg-text-4)" }}
          >
            Once submitted, this request will enter the approval workflow and cannot be edited.
          </p>
        </div>
      </form>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RaiseRequestPage() {
  return (
    <RoleGuard allow={["finance", "finops", "md", "default"]}>
      <RaiseRequestForm />
    </RoleGuard>
  );
}
