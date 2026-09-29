"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { Loader2, Wifi, WifiOff, RefreshCw, X, Settings2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConnectivityForm } from "./components/ConnectivityForm";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type ConnectivityStatus = {
  provider: string;
  last_pulled_at?: string | null;
  last_pull_status?: string | null;
  last_pull_error?: string | null;
};

type AccountWithConnectivity = {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  currency: string;
  status: string;
  connectivity?: ConnectivityStatus | null;
};

function fmt(dateStr: string | undefined | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ProviderBadge({ provider }: { provider?: string | null }) {
  if (!provider) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
        style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-4)" }}
      >
        Not configured
      </span>
    );
  }

  const styles: Record<string, { background: string; color: string }> = {
    mono:   { background: "#dbeafe", color: "#1d4ed8" },
    okra:   { background: "#ede9fe", color: "#6d28d9" },
    sftp:   { background: "#fef3c7", color: "#92400e" },
    manual: { background: "#f1f5f9", color: "#64748b" },
  };
  const label: Record<string, string> = {
    mono: "Mono",
    okra: "Okra",
    sftp: "SFTP",
    manual: "Manual",
  };
  const style = styles[provider] ?? { background: "var(--pg-muted-bg)", color: "var(--pg-text-4)" };

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={style}
    >
      {label[provider] ?? provider}
    </span>
  );
}

function PullStatusBadge({ status }: { status?: string | null }) {
  if (!status) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
        style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-4)" }}
      >
        Never
      </span>
    );
  }

  const styleMap: Record<string, { background: string; color: string }> = {
    success: { background: "#d1fae5", color: "#065f46" },
    error:   { background: "#fee2e2", color: "#991b1b" },
    failed:  { background: "#fee2e2", color: "#991b1b" },
    pending: { background: "#f1f5f9", color: "#64748b" },
  };
  const style = styleMap[status] ?? { background: "var(--pg-muted-bg)", color: "var(--pg-text-4)" };

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase"
      style={style}
    >
      {status}
    </span>
  );
}

export default function ConnectivityPage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [configOpen, setConfigOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountWithConnectivity | null>(null);
  const [pullingIds, setPullingIds] = useState<Set<string>>(new Set());

  // Activate bank form state
  const [activateOpen, setActivateOpen] = useState(false);
  const [selectedGLCode, setSelectedGLCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  async function triggerPull(accountId: string) {
    setPullingIds((prev) => new Set(prev).add(accountId));
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const forDate = yesterday.toISOString().split("T")[0]; // YYYY-MM-DD
      await fetch(`${BASE}/api/v1/reconciliation/accounts/${accountId}/pull`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ for_date: forDate }),
      });
    } finally {
      setPullingIds((prev) => {
        const s = new Set(prev);
        s.delete(accountId);
        return s;
      });
    }
  }

  const { data: accounts = [], isLoading } = useQuery<AccountWithConnectivity[]>({
    queryKey: ["recon-accounts-connectivity", subsidId],
    enabled: Boolean(subsidId),
    queryFn: async () => {
      // Fetch base accounts
      const { data, error } = await api.GET("/reconciliation/accounts", {
        params: { query: { subsidiary_id: subsidId } },
      });
      if (error) throw new Error("Failed to fetch accounts");
      const baseAccounts = (data ?? []) as AccountWithConnectivity[];

      // Fetch connectivity for each account in parallel (best-effort)
      const withConnectivity = await Promise.all(
        baseAccounts.map(async (acct) => {
          try {
            const res = await fetch(
              `${BASE}/api/v1/reconciliation/accounts/${acct.id}/connectivity`,
              { credentials: "include" }
            );
            if (res.status === 404) return { ...acct, connectivity: null };
            if (!res.ok) return { ...acct, connectivity: null };
            const conn = await res.json();
            return { ...acct, connectivity: conn as ConnectivityStatus };
          } catch {
            return { ...acct, connectivity: null };
          }
        })
      );
      return withConnectivity;
    },
  });

  // Available GL bank accounts (not yet registered for reconciliation)
  const { data: availableGL = [] } = useQuery<{ code: string; name: string }[]>({
    queryKey: ["recon-available-gl", subsidId],
    enabled: Boolean(subsidId) && activateOpen,
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/v1/reconciliation/accounts/available-gl?subsidiary_id=${subsidId}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGLCode) throw new Error("Please select a bank");
      if (!accountNumber) throw new Error("Account number is required");
      const res = await fetch(`${BASE}/api/v1/reconciliation/accounts`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subsidiary_id: subsidId,
          gl_account_code: selectedGLCode,
          account_number: accountNumber,
          account_name: accountName,
          currency: "NGN",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to activate bank");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recon-accounts-connectivity"] });
      queryClient.invalidateQueries({ queryKey: ["recon-available-gl"] });
      setActivateOpen(false);
      setSelectedGLCode(""); setAccountNumber(""); setAccountName("");
      toast({ title: "Bank activated", description: "Configure Mono/Okra via the Configure button." });
    },
    onError: (e) => toast({ title: "Error", description: (e as Error).message }),
  });

  function openConfig(account: AccountWithConnectivity) {
    setSelectedAccount(account);
    setConfigOpen(true);
  }

  function handleClose() {
    setConfigOpen(false);
    setSelectedAccount(null);
  }

  const configuredCount = accounts.filter((a) => a.connectivity?.provider).length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: "var(--pg-text-1)" }}>
            Bank Accounts
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--pg-text-3)" }}>
            Activate banks from your General Ledger and configure automated statement feeds
          </p>
        </div>
        <div className="flex items-center gap-3">
          {accounts.length > 0 && (
            <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
              {configuredCount}/{accounts.length} configured
            </span>
          )}
          <button
            onClick={() => setActivateOpen(true)}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-xl text-[13px] font-semibold text-white transition-opacity whitespace-nowrap"
            style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.9")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
          >
            <Plus className="w-3.5 h-3.5" />
            Activate Bank
          </button>
        </div>
      </div>

      {/* Accounts card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
        }}
      >
        {/* Column headers */}
        <div
          className="grid px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest"
          style={{
            gridTemplateColumns: "1fr 160px 130px 180px 120px 200px",
            background: "var(--pg-muted-bg)",
            color: "var(--pg-text-3)",
            borderBottom: "1px solid var(--pg-card-border)",
          }}
        >
          <span>Bank Name</span>
          <span>Account Number</span>
          <span>Provider</span>
          <span>Last Pulled</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex justify-center py-14">
            <Loader2
              className="w-5 h-5 animate-spin"
              style={{ color: "var(--pg-text-4)" }}
            />
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-4" style={{ color: "var(--pg-text-3)" }}>
            <WifiOff className="w-8 h-8" style={{ color: "var(--pg-text-4)" }} />
            <div className="text-center">
              <p className="text-[14px] font-semibold" style={{ color: "var(--pg-text-2)" }}>No banks activated yet</p>
              <p className="text-[12px] mt-1">Select a bank from your General Ledger to start reconciling.</p>
            </div>
            <button
              onClick={() => setActivateOpen(true)}
              className="inline-flex items-center gap-2 h-8 px-4 rounded-xl text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Activate First Bank
            </button>
          </div>
        ) : (
          accounts.map((account, idx) => {
            const conn = account.connectivity;
            const isConfigured = Boolean(conn?.provider);
            const isLast = idx === accounts.length - 1;

            return (
              <div
                key={account.id}
                className="grid items-center px-5 py-3.5 transition-colors"
                style={{
                  gridTemplateColumns: "1fr 160px 130px 180px 120px 200px",
                  borderBottom: isLast ? "none" : "1px solid var(--pg-row-border)",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "")
                }
              >
                {/* Bank name */}
                <div className="flex items-center gap-2 min-w-0">
                  {isConfigured ? (
                    <Wifi className="w-3.5 h-3.5 shrink-0" style={{ color: "#22c55e" }} />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-4)" }} />
                  )}
                  <span
                    className="text-[13px] font-semibold truncate"
                    style={{ color: "var(--pg-text-1)" }}
                  >
                    {account.bank_name}
                  </span>
                </div>

                {/* Account number */}
                <span
                  className="text-[12px] font-mono"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  {account.account_number}
                </span>

                {/* Provider */}
                <span>
                  <ProviderBadge provider={conn?.provider} />
                </span>

                {/* Last pulled */}
                <span className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                  {fmt(conn?.last_pulled_at)}
                </span>

                {/* Status */}
                <span>
                  <PullStatusBadge status={conn?.last_pull_status} />
                </span>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => triggerPull(account.id)}
                    disabled={pullingIds.has(account.id)}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-xl text-[12px] font-medium disabled:opacity-50 transition-opacity whitespace-nowrap"
                    style={{
                      border: "1px solid var(--pg-card-border)",
                      color: "var(--pg-text-2)",
                      background: "transparent",
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "transparent")
                    }
                  >
                    {pullingIds.has(account.id) ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Trigger Pull
                  </button>

                  <button
                    onClick={() => openConfig(account)}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-xl text-[12px] font-semibold text-white transition-opacity"
                    style={{ background: "#FF6600" }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.opacity = "0.88")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.opacity = "1")
                    }
                  >
                    <Settings2 className="w-3 h-3" />
                    Configure
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Configure modal */}
      {configOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          onClick={handleClose}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--pg-row-border)" }}
            >
              <div>
                <h2
                  className="text-[15px] font-bold"
                  style={{ color: "var(--pg-text-1)" }}
                >
                  Configure Connectivity
                </h2>
                {selectedAccount && (
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                    {selectedAccount.bank_name} — {selectedAccount.account_number}
                  </p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: "var(--pg-text-3)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "var(--pg-muted-bg)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "")
                }
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-5 py-5">
              {selectedAccount && (
                <ConnectivityForm
                  accountId={selectedAccount.id}
                  bankName={selectedAccount.bank_name}
                  onClose={handleClose}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Activate Bank Modal ────────────────────────────────────────────── */}
      {activateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setActivateOpen(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-xl"
            style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--pg-row-border)" }}
            >
              <div>
                <p className="text-[15px] font-bold" style={{ color: "var(--pg-text-1)" }}>
                  Activate Bank for Reconciliation
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
                  Select from your General Ledger — only registered banks can be reconciled
                </p>
              </div>
              <button onClick={() => setActivateOpen(false)}>
                <X className="w-4 h-4" style={{ color: "var(--pg-text-3)" }} />
              </button>
            </div>

            {/* Form */}
            <form
              className="px-5 py-5 flex flex-col gap-4"
              onSubmit={(e) => { e.preventDefault(); activateMutation.mutate(); }}
            >
              {/* GL account selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
                  Bank (from General Ledger)
                </label>
                <select
                  value={selectedGLCode}
                  onChange={(e) => setSelectedGLCode(e.target.value)}
                  required
                  style={{
                    height: "36px", padding: "0 10px", borderRadius: "8px",
                    border: "1px solid var(--pg-card-border)",
                    background: "var(--pg-card)", color: "var(--pg-text-1)",
                    fontSize: "13px", outline: "none", width: "100%",
                  }}
                >
                  <option value="">— Select a bank —</option>
                  {availableGL.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.code} – {opt.name}
                    </option>
                  ))}
                </select>
                {availableGL.length === 0 && (
                  <p className="text-[11px]" style={{ color: "#f59e0b" }}>
                    All GL bank accounts are already activated.
                  </p>
                )}
              </div>

              {/* Account number */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
                  Account Number
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="0044456789"
                  required
                  style={{
                    height: "36px", padding: "0 10px", borderRadius: "8px",
                    border: "1px solid var(--pg-card-border)",
                    background: "var(--pg-card)", color: "var(--pg-text-1)",
                    fontSize: "13px", outline: "none", width: "100%",
                    fontFamily: "monospace",
                  }}
                />
              </div>

              {/* Account name (optional) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold" style={{ color: "var(--pg-text-2)" }}>
                  Account Name <span style={{ color: "var(--pg-text-4)", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Page Asset Management Limited"
                  style={{
                    height: "36px", padding: "0 10px", borderRadius: "8px",
                    border: "1px solid var(--pg-card-border)",
                    background: "var(--pg-card)", color: "var(--pg-text-1)",
                    fontSize: "13px", outline: "none", width: "100%",
                  }}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActivateOpen(false)}
                  className="h-8 px-4 rounded-xl text-[13px] font-semibold"
                  style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={activateMutation.isPending}
                  className="inline-flex items-center gap-2 h-8 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}
                >
                  {activateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Activate Bank
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
