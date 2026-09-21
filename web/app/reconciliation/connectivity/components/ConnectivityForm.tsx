"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

const PROVIDERS = ["mono", "okra", "sftp", "manual"] as const;
type Provider = (typeof PROVIDERS)[number];

const providerLabels: Record<Provider, string> = {
  mono: "Mono",
  okra: "Okra",
  sftp: "SFTP",
  manual: "Manual",
};

const schema = z.object({
  provider: z.enum(PROVIDERS),
  provider_account_id: z.string().min(1, "Provider account ID is required"),
  provider_customer_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type ConnectivityStatus = {
  provider: string;
  provider_account_id: string;
  provider_customer_id?: string;
  last_pulled_at?: string | null;
  last_pull_status?: string | null;
  last_pull_error?: string | null;
};

interface ConnectivityFormProps {
  accountId: string;
  bankName: string;
  onClose?: () => void;
}

function fmt(dateStr: string | undefined | null) {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ConnectivityForm({ accountId, bankName, onClose }: ConnectivityFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery<ConnectivityStatus | null>({
    queryKey: ["recon-connectivity", accountId],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts/${accountId}/connectivity`,
        { credentials: "include" }
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch connectivity status");
      return res.json();
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      provider: (status?.provider as Provider) ?? "mono",
      provider_account_id: status?.provider_account_id ?? "",
      provider_customer_id: status?.provider_customer_id ?? "",
    },
    values: status
      ? {
          provider: (status.provider as Provider) ?? "mono",
          provider_account_id: status.provider_account_id ?? "",
          provider_customer_id: status.provider_customer_id ?? "",
        }
      : undefined,
  });

  const selectedProvider = watch("provider");

  const configureMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts/${accountId}/connectivity`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.message ?? "Configuration failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-connectivity", accountId] });
      queryClient.invalidateQueries({ queryKey: ["recon-accounts"] });
      toast({ title: "Connectivity Saved", description: `${bankName} is now configured.` });
      onClose?.();
    },
    onError: (e) =>
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
  });

  const pullMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts/${accountId}/pull`,
        { method: "POST", credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.message ?? "Pull failed");
      return json as { transactions_pulled?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recon-connectivity", accountId] });
      toast({
        title: "Pull Complete",
        description:
          data.transactions_pulled != null
            ? `${data.transactions_pulled} transaction${data.transactions_pulled !== 1 ? "s" : ""} pulled.`
            : "Transactions pulled successfully.",
      });
    },
    onError: (e) =>
      toast({ title: "Pull Failed", description: (e as Error).message, variant: "destructive" }),
  });

  if (statusLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const isSuccess = status?.last_pull_status === "success";
  const isError = status?.last_pull_status === "error";

  return (
    <div className="space-y-6 pt-2">
      {/* Last pull status panel */}
      {status && (
        <div className="rounded-lg border bg-slate-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Last Pull</p>
            {status.last_pull_status && (
              <Badge
                variant={isSuccess ? "default" : isError ? "destructive" : "secondary"}
                className="text-xs uppercase"
              >
                {status.last_pull_status}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {isSuccess && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
            {isError && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
            <span>{fmt(status.last_pulled_at)}</span>
          </div>
          {isError && status.last_pull_error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 font-mono break-words">
              {status.last_pull_error}
            </p>
          )}
        </div>
      )}

      {/* Configuration form */}
      <form
        onSubmit={handleSubmit((v) => configureMutation.mutate(v))}
        className="space-y-4"
      >
        {/* Provider */}
        <div className="space-y-2">
          <Label htmlFor="provider">Provider</Label>
          <Select
            value={selectedProvider}
            onValueChange={(v) => setValue("provider", v as Provider)}
          >
            <SelectTrigger id="provider">
              <SelectValue placeholder="Select provider…" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {providerLabels[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.provider && (
            <p className="text-xs text-red-500">{errors.provider.message}</p>
          )}
        </div>

        {/* Provider Account ID */}
        <div className="space-y-2">
          <Label htmlFor="provider_account_id">
            {selectedProvider === "mono"
              ? "Mono Account ID"
              : selectedProvider === "okra"
              ? "Okra Account ID"
              : selectedProvider === "sftp"
              ? "SFTP Path / Account Key"
              : "Account Reference"}
          </Label>
          <Input
            id="provider_account_id"
            placeholder={
              selectedProvider === "mono"
                ? "mono_acc_xxxxxxxxxx"
                : selectedProvider === "okra"
                ? "okra_acct_xxxxxxxxxx"
                : selectedProvider === "sftp"
                ? "/statements/account-001"
                : "ref-001"
            }
            {...register("provider_account_id")}
          />
          {errors.provider_account_id && (
            <p className="text-xs text-red-500">{errors.provider_account_id.message}</p>
          )}
        </div>

        {/* Provider Customer ID */}
        <div className="space-y-2">
          <Label htmlFor="provider_customer_id">
            Provider Customer ID{" "}
            <span className="text-slate-400 font-normal">(optional)</span>
          </Label>
          <Input
            id="provider_customer_id"
            placeholder={
              selectedProvider === "mono"
                ? "mono_customer_xxxxxxxxxx"
                : selectedProvider === "okra"
                ? "okra_cust_xxxxxxxxxx"
                : "customer-id"
            }
            {...register("provider_customer_id")}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={configureMutation.isPending}
        >
          {configureMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Save Configuration
        </Button>
      </form>

      {/* Manual pull — only available when connectivity is already configured */}
      {status && (
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Trigger Manual Pull</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Fetch the latest transactions from {providerLabels[status.provider as Provider] ?? status.provider} now.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pullMutation.mutate()}
              disabled={pullMutation.isPending}
              className="shrink-0"
            >
              {pullMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Pull Now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
