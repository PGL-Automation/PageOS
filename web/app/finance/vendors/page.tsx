"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Download, X, AlertCircle, Loader2, ArrowUpDown,
  Building2, CheckCircle2, XCircle, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

// ── Types ──────────────────────────────────────────────────────────────────────

type Vendor = {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  currency: string;
  payment_terms_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type VendorFormData = {
  name: string;
  code: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  currency: string;
  payment_terms_days: number;
  is_active: boolean;
};

// ── API calls ─────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1/finance${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(err.error?.message ?? "Request failed");
  }
  return res.json();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{
        background: active ? "#d1fae5" : "#fee2e2",
        color: active ? "#065f46" : "#991b1b",
      }}
    >
      {active ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        className="block text-[11px] font-bold uppercase tracking-wider mb-1.5"
        style={{ color: "var(--pg-text-3)" }}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full h-9 px-3 rounded-lg text-[13px] outline-none";
const inputStyle = {
  background: "var(--pg-input)",
  border: "1px solid var(--pg-input-border)",
  color: "var(--pg-text-1)",
};

// ── Vendor Form Sheet ─────────────────────────────────────────────────────────

function VendorSheet({
  vendor,
  onClose,
}: {
  vendor: Vendor | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!vendor;

  const [form, setForm] = useState<VendorFormData>({
    name: vendor?.name ?? "",
    code: vendor?.code ?? "",
    email: vendor?.email ?? "",
    phone: vendor?.phone ?? "",
    address: vendor?.address ?? "",
    tax_id: vendor?.tax_id ?? "",
    currency: vendor?.currency ?? "NGN",
    payment_terms_days: vendor?.payment_terms_days ?? 30,
    is_active: vendor?.is_active ?? true,
  });

  const [error, setError] = useState("");

  // Keep form in sync if vendor prop changes
  useEffect(() => {
    setForm({
      name: vendor?.name ?? "",
      code: vendor?.code ?? "",
      email: vendor?.email ?? "",
      phone: vendor?.phone ?? "",
      address: vendor?.address ?? "",
      tax_id: vendor?.tax_id ?? "",
      currency: vendor?.currency ?? "NGN",
      payment_terms_days: vendor?.payment_terms_days ?? 30,
      is_active: vendor?.is_active ?? true,
    });
    setError("");
  }, [vendor]);

  const createMutation = useMutation({
    mutationFn: (data: VendorFormData) =>
      apiFetch("/vendors", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (v: Vendor) => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast({ title: "Vendor Created", description: v.name });
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: VendorFormData) =>
      apiFetch(`/vendors/${vendor!.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (v: Vendor) => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast({ title: "Vendor Updated", description: v.name });
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  function set<K extends keyof VendorFormData>(key: K, value: VendorFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit() {
    setError("");
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.code.trim()) { setError("Code is required."); return; }
    const payload = { ...form, code: form.code.toUpperCase() };
    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg flex flex-col overflow-hidden"
        style={{
          background: "var(--pg-card)",
          borderLeft: "1px solid var(--pg-card-border)",
          boxShadow: "-24px 0 64px rgba(0,0,0,0.25)",
        }}
      >
        {/* Sheet header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--pg-row-border)" }}
        >
          <div>
            <h2
              className="text-[15px] font-bold"
              style={{ color: "var(--pg-text-1)" }}
            >
              {isEdit ? "Edit Vendor" : "New Vendor"}
            </h2>
            {isEdit && (
              <p
                className="text-[12px] mt-0.5"
                style={{ color: "var(--pg-text-3)" }}
              >
                {vendor!.code}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--pg-text-3)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" required className="col-span-2">
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Vendor full name"
                className={inputClass}
                style={inputStyle}
              />
            </Field>

            <Field label="Code" required>
              <input
                type="text"
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="e.g. ACME-001"
                className={cn(inputClass, "font-mono")}
                style={inputStyle}
              />
            </Field>

            <Field label="Tax ID">
              <input
                type="text"
                value={form.tax_id}
                onChange={(e) => set("tax_id", e.target.value)}
                placeholder="TIN / VAT number"
                className={cn(inputClass, "font-mono")}
                style={inputStyle}
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="accounts@vendor.com"
                className={inputClass}
                style={inputStyle}
              />
            </Field>

            <Field label="Phone">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+234 800 000 0000"
                className={inputClass}
                style={inputStyle}
              />
            </Field>

            <Field label="Currency">
              <div className="relative">
                <select
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  className="w-full h-9 px-3 pr-8 rounded-lg text-[13px] outline-none appearance-none"
                  style={inputStyle}
                >
                  {["NGN", "USD", "GBP", "EUR", "GHS", "ZAR", "KES"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ArrowUpDown
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: "var(--pg-text-4)" }}
                />
              </div>
            </Field>

            <Field label="Payment Terms (Days)">
              <input
                type="number"
                min={0}
                step={1}
                value={form.payment_terms_days}
                onChange={(e) =>
                  set("payment_terms_days", parseInt(e.target.value) || 0)
                }
                placeholder="30"
                className={cn(inputClass, "font-mono")}
                style={inputStyle}
              />
            </Field>

            <Field label="Address" className="col-span-2">
              <textarea
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                rows={3}
                placeholder="Street address, city, state, country…"
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none resize-none"
                style={inputStyle}
              />
            </Field>

            {isEdit && (
              <Field label="Status" className="col-span-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => set("is_active", true)}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold transition-all"
                    style={
                      form.is_active
                        ? { background: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0" }
                        : { background: "var(--pg-input)", color: "var(--pg-text-3)", border: "1px solid var(--pg-input-border)" }
                    }
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active
                  </button>
                  <button
                    type="button"
                    onClick={() => set("is_active", false)}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold transition-all"
                    style={
                      !form.is_active
                        ? { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }
                        : { background: "var(--pg-input)", color: "var(--pg-text-3)", border: "1px solid var(--pg-input-border)" }
                    }
                  >
                    <XCircle className="w-3.5 h-3.5" /> Inactive
                  </button>
                </div>
              </Field>
            )}
          </div>

          {error && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
            >
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          className="flex justify-end gap-2 px-6 py-4 shrink-0"
          style={{ borderTop: "1px solid var(--pg-row-border)" }}
        >
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-xl text-[13px] font-medium"
            style={{
              border: "1px solid var(--pg-card-border)",
              color: "var(--pg-text-2)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg,#FF6600,#E05500)",
              boxShadow: "0 1px 6px rgba(255,102,0,0.35)",
            }}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isEdit ? (
              "Save Changes"
            ) : (
              "Create Vendor"
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type ActiveFilter = "all" | "active";

export default function VendorsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [sortField, setSortField] = useState<keyof Vendor>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ["vendors", activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeFilter === "active") params.set("active", "true");
      const raw = await apiFetch(`/vendors?${params.toString()}`);
      return Array.isArray(raw) ? (raw as Vendor[]) : [];
    },
    refetchInterval: 30000,
  });

  function openCreate() {
    setEditingVendor(null);
    setSheetOpen(true);
  }

  function openEdit(v: Vendor, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditingVendor(v);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingVendor(null);
  }

  function toggleSort(field: keyof Vendor) {
    if (sortField === field) setSortAsc((v) => !v);
    else { setSortField(field); setSortAsc(true); }
  }

  const filtered = vendors
    .filter((v) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.code.toLowerCase().includes(q) ||
        v.email?.toLowerCase().includes(q) ||
        v.tax_id?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sortField] as string | number | boolean;
      const bv = b[sortField] as string | number | boolean;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });

  const totalActive = vendors.filter((v) => v.is_active).length;
  const totalInactive = vendors.filter((v) => !v.is_active).length;

  function SortHeader({
    field,
    label,
    align,
  }: {
    field: keyof Vendor;
    label: string;
    align?: "right";
  }) {
    const active = sortField === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        className={cn(
          "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
          align === "right" && "ml-auto"
        )}
        style={{ color: active ? "var(--pg-text-1)" : "var(--pg-text-3)" }}
      >
        {label}
        <ArrowUpDown
          className={cn(
            "w-3 h-3 transition-opacity",
            active ? "opacity-100" : "opacity-40"
          )}
        />
      </button>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-[18px] font-bold"
            style={{ color: "var(--pg-text-1)" }}
          >
            Vendors
          </h1>
          <p
            className="text-[12px] mt-0.5"
            style={{ color: "var(--pg-text-3)" }}
          >
            Supplier directory ·{" "}
            {vendors.length} vendor{vendors.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
          style={{
            background: "linear-gradient(135deg,#FF6600,#E05500)",
            boxShadow: "0 1px 6px rgba(255,102,0,0.35)",
          }}
        >
          <Plus className="w-3.5 h-3.5" /> New Vendor
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Vendors",    n: vendors.length,  color: "#FF6600", bg: "#fff3ed" },
          { label: "Active",           n: totalActive,     color: "#059669", bg: "#d1fae5" },
          { label: "Inactive",         n: totalInactive,   color: "#dc2626", bg: "#fee2e2" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl px-5 py-4 flex items-center gap-4"
            style={{
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: s.bg }}
            >
              <Building2 style={{ color: s.color, width: 18, height: 18 }} />
            </div>
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: s.color }}
              >
                {s.label}
              </p>
              <p
                className="text-[24px] font-bold tabular leading-none mt-0.5"
                style={{ color: "var(--pg-text-1)" }}
              >
                {s.n}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl flex-1 max-w-xs"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
          }}
        >
          <svg
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: "var(--pg-text-3)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"
            />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, email…"
            className="flex-1 text-[12px] bg-transparent outline-none"
            style={{ color: "var(--pg-text-1)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--pg-text-4)" }}>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Active/All toggle */}
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{
            background: "var(--pg-card)",
            border: "1px solid var(--pg-card-border)",
          }}
        >
          {(["active", "all"] as ActiveFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveFilter(t)}
              className="h-7 px-3 rounded-lg text-[11px] font-medium capitalize transition-all"
              style={
                activeFilter === t
                  ? {
                      background: "linear-gradient(135deg,#FF6600,#E05500)",
                      color: "white",
                    }
                  : { color: "var(--pg-text-2)" }
              }
            >
              {t === "active" ? "Active" : "All"}
            </button>
          ))}
        </div>

        {/* Export */}
        <button
          onClick={() => {
            const csv = [
              "Code,Name,Email,Phone,Tax ID,Currency,Payment Terms (Days),Status",
              ...filtered.map((v) =>
                [
                  v.code,
                  `"${v.name}"`,
                  v.email,
                  v.phone,
                  v.tax_id,
                  v.currency,
                  v.payment_terms_days,
                  v.is_active ? "Active" : "Inactive",
                ].join(",")
              ),
            ].join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            a.download = `vendors-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
          }}
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-medium"
          style={{
            border: "1px solid var(--pg-card-border)",
            color: "var(--pg-text-2)",
          }}
        >
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--pg-card)",
          border: "1px solid var(--pg-card-border)",
        }}
      >
        {/* Column headers */}
        <div
          className="grid items-center gap-3 px-4 py-3"
          style={{
            gridTemplateColumns: "110px 1fr 160px 140px 120px 130px 90px 80px",
            borderBottom: "1px solid var(--pg-row-border)",
            background: "var(--pg-muted-bg)",
          }}
        >
          <SortHeader field="code"               label="Code" />
          <SortHeader field="name"               label="Name" />
          <SortHeader field="email"              label="Email" />
          <SortHeader field="phone"              label="Phone" />
          <SortHeader field="tax_id"             label="Tax ID" />
          <SortHeader field="payment_terms_days" label="Payment Terms" />
          <SortHeader field="is_active"          label="Status" />
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "var(--pg-text-3)" }}
          >
            Actions
          </span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2
              className="w-5 h-5 animate-spin"
              style={{ color: "var(--pg-text-4)" }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Building2
              className="w-8 h-8 mx-auto mb-3"
              style={{ color: "var(--pg-text-4)" }}
            />
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
              {search
                ? "No vendors match your search."
                : "No vendors yet — create one to get started."}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {filtered.map((v) => (
              <div
                key={v.id}
                className="grid items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                style={{
                  gridTemplateColumns:
                    "110px 1fr 160px 140px 120px 130px 90px 80px",
                }}
                onClick={() => openEdit(v)}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    "var(--pg-row-hover)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "")
                }
              >
                {/* Code */}
                <code
                  className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--pg-muted-bg)",
                    color: "var(--pg-text-2)",
                  }}
                >
                  {v.code}
                </code>

                {/* Name */}
                <p
                  className="text-[13px] font-medium truncate"
                  style={{ color: "var(--pg-text-1)" }}
                >
                  {v.name}
                </p>

                {/* Email */}
                <p
                  className="text-[12px] truncate"
                  style={{ color: "var(--pg-text-2)" }}
                >
                  {v.email || "—"}
                </p>

                {/* Phone */}
                <p
                  className="text-[12px] font-mono"
                  style={{ color: "var(--pg-text-2)" }}
                >
                  {v.phone || "—"}
                </p>

                {/* Tax ID */}
                <code
                  className="text-[11px] font-mono"
                  style={{ color: "var(--pg-text-3)" }}
                >
                  {v.tax_id || "—"}
                </code>

                {/* Payment Terms */}
                <p
                  className="text-[12px]"
                  style={{ color: "var(--pg-text-2)" }}
                >
                  {v.payment_terms_days != null
                    ? `Net ${v.payment_terms_days}d`
                    : "—"}
                </p>

                {/* Status */}
                <StatusBadge active={v.is_active} />

                {/* Actions */}
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => openEdit(v, e)}
                    title="Edit vendor"
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                    style={{ color: "var(--pg-text-3)" }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background =
                        "var(--pg-muted-bg)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "")
                    }
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vendor sheet */}
      {sheetOpen && (
        <VendorSheet vendor={editingVendor} onClose={closeSheet} />
      )}
    </div>
  );
}
