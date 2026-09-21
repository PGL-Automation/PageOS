"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Wifi, WifiOff, Settings2, RefreshCw } from "lucide-react";
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
  if (!provider) return <span className="text-slate-400 text-xs">—</span>;
  const colours: Record<string, string> = {
    mono: "bg-blue-100 text-blue-700",
    okra: "bg-purple-100 text-purple-700",
    sftp: "bg-amber-100 text-amber-700",
    manual: "bg-slate-100 text-slate-600",
  };
  const label: Record<string, string> = {
    mono: "Mono",
    okra: "Okra",
    sftp: "SFTP",
    manual: "Manual",
  };
  const cls = colours[provider] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label[provider] ?? provider}
    </span>
  );
}

function PullStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>;
  const variant: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
    success: "default",
    error: "destructive",
    pending: "secondary",
  };
  return (
    <Badge variant={variant[status] ?? "outline"} className="text-xs uppercase">
      {status}
    </Badge>
  );
}

export default function ConnectivityPage() {
  const { subsidiary } = useAuth();
  const subsidId = subsidiary?.ID ?? "";

  const [configOpen, setConfigOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountWithConnectivity | null>(null);
  const [pullingIds, setPullingIds] = useState<Set<string>>(new Set());

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
      setPullingIds((prev) => { const s = new Set(prev); s.delete(accountId); return s; });
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
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <Wifi className="w-7 h-7 text-slate-400" />
            Bank Connectivity
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Configure Mono, Okra, SFTP or manual feeds per bank account
          </p>
        </div>
        {accounts.length > 0 && (
          <div className="text-sm text-slate-500">
            {configuredCount}/{accounts.length} account{accounts.length !== 1 ? "s" : ""} configured
          </div>
        )}
      </div>

      {/* Accounts table */}
      <Card>
        <CardHeader>
          <CardTitle>Bank Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank Name</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Last Pulled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-12 text-slate-400"
                    >
                      No bank accounts found. Add one on the{" "}
                      <a href="/reconciliation" className="underline hover:text-slate-600">
                        Reconciliation
                      </a>{" "}
                      page first.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((account) => {
                    const conn = account.connectivity;
                    const isConfigured = Boolean(conn?.provider);
                    return (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {isConfigured ? (
                              <Wifi className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            ) : (
                              <WifiOff className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            )}
                            {account.bank_name}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {account.account_number}
                        </TableCell>
                        <TableCell>
                          <ProviderBadge provider={conn?.provider} />
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {fmt(conn?.last_pulled_at)}
                        </TableCell>
                        <TableCell>
                          <PullStatusBadge status={conn?.last_pull_status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => triggerPull(account.id)}
                              disabled={pullingIds.has(account.id)}
                              className="gap-1.5"
                            >
                              {pullingIds.has(account.id) ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                              Trigger Pull
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openConfig(account)}
                              className="gap-1.5"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                              Configure
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Configure dialog */}
      <Dialog open={configOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Connectivity</DialogTitle>
            <DialogDescription>
              {selectedAccount
                ? `${selectedAccount.bank_name} — ${selectedAccount.account_number}`
                : "Set up a bank data provider for this account."}
            </DialogDescription>
          </DialogHeader>
          {selectedAccount && (
            <ConnectivityForm
              accountId={selectedAccount.id}
              bankName={selectedAccount.bank_name}
              onClose={handleClose}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
