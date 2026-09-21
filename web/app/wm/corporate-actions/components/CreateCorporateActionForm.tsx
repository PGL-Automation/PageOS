"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Search } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

/* ─── Types ────────────────────────────────────────────────────────────── */

type ActionType =
  | "cash_dividend"
  | "stock_split"
  | "bonus_share"
  | "rights_issue"
  | "coupon_payment"
  | "stock_dividend"
  | "merger"
  | "spin_off";

type Instrument = {
  id: string;
  ticker: string;
  name: string;
  asset_class: string;
};

type CreateCABody = {
  instrument_id: string;
  action_type: ActionType;
  ex_date: string;
  pay_date?: string;
  amount_per_unit?: number;
  split_ratio?: string;
  bonus_ratio?: string;
  rights_ratio?: string;
  rights_price?: number;
  notes?: string;
};

/* ─── Demo Instruments (fallback) ───────────────────────────────────────── */

const DEMO_INSTRUMENTS: Instrument[] = [
  { id: "inst-1", ticker: "DANGCEM",    name: "Dangote Cement Plc",         asset_class: "equity" },
  { id: "inst-2", ticker: "MTNN",       name: "MTN Nigeria Plc",             asset_class: "equity" },
  { id: "inst-3", ticker: "ZENITHBANK", name: "Zenith Bank Plc",             asset_class: "equity" },
  { id: "inst-4", ticker: "ACCESSCORP", name: "Access Holdings Plc",         asset_class: "equity" },
  { id: "inst-5", ticker: "FBNH",       name: "FBN Holdings Plc",            asset_class: "equity" },
  { id: "inst-6", ticker: "GTCO",       name: "Guaranty Trust Holding Co.",  asset_class: "equity" },
  { id: "inst-7", ticker: "NESTLE",     name: "Nestle Nigeria Plc",          asset_class: "equity" },
  { id: "inst-8", ticker: "BUACEMENT",  name: "BUA Cement Plc",              asset_class: "equity" },
  { id: "inst-9", ticker: "AIRTELAFRI", name: "Airtel Africa Plc",           asset_class: "equity" },
];

const ACTION_TYPE_LABEL: Record<ActionType, string> = {
  cash_dividend:  "Cash Dividend",
  stock_split:    "Stock Split",
  bonus_share:    "Bonus Share",
  rights_issue:   "Rights Issue",
  coupon_payment: "Coupon Payment",
  stock_dividend: "Stock Dividend",
  merger:         "Merger",
  spin_off:       "Spin-Off",
};

/* ─── Helper: which extra fields are shown per type ─────────────────────── */

function showAmount(t: ActionType)  { return t === "cash_dividend" || t === "coupon_payment"; }
function showSplit(t: ActionType)   { return t === "stock_split"; }
function showBonus(t: ActionType)   { return t === "bonus_share"; }
function showRights(t: ActionType)  { return t === "rights_issue"; }

/* ─── Component ─────────────────────────────────────────────────────────── */

interface CreateCorporateActionFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function CreateCorporateActionForm({
  onSuccess,
  onCancel,
}: CreateCorporateActionFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /* Instrument search */
  const [instrSearch,   setInstrSearch]   = useState("");
  const [instrOpen,     setInstrOpen]     = useState(false);
  const [selectedInstr, setSelectedInstr] = useState<Instrument | null>(null);

  /* Form fields */
  const [actionType,    setActionType]    = useState<ActionType>("cash_dividend");
  const [exDate,        setExDate]        = useState("");
  const [payDate,       setPayDate]       = useState("");
  const [amountPerUnit, setAmountPerUnit] = useState("");
  const [splitRatio,    setSplitRatio]    = useState("");
  const [bonusRatio,    setBonusRatio]    = useState("");
  const [rightsRatio,   setRightsRatio]   = useState("");
  const [rightsPrice,   setRightsPrice]   = useState("");
  const [notes,         setNotes]         = useState("");

  /* Instruments from API */
  const { data: instruments = [] } = useQuery<Instrument[]>({
    queryKey: ["instruments"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/portfolio/instruments`, { credentials: "include" });
      if (!r.ok) throw new Error("fetch failed");
      const json = await r.json();
      return Array.isArray(json) ? json : [];
    },
    retry: false,
  });

  const instrList = instruments.length > 0 ? instruments : DEMO_INSTRUMENTS;
  const filteredInstrs = instrList.filter(
    (i) =>
      i.ticker.toLowerCase().includes(instrSearch.toLowerCase()) ||
      i.name.toLowerCase().includes(instrSearch.toLowerCase())
  );

  /* Submit mutation */
  const mutation = useMutation({
    mutationFn: async (body: CreateCABody) => {
      const r = await fetch(`${BASE}/api/v1/portfolio/corporate-actions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.text();
        throw new Error(err || "Failed to create corporate action");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["corporate-actions"] });
      toast({
        title: "Corporate action created",
        description: `${ACTION_TYPE_LABEL[actionType]} for ${selectedInstr?.ticker ?? ""} has been saved.`,
      });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInstr) return;
    if (!exDate) return;

    const body: CreateCABody = {
      instrument_id: selectedInstr.id,
      action_type:   actionType,
      ex_date:       exDate,
      ...(payDate ? { pay_date: payDate } : {}),
      ...(showAmount(actionType) && amountPerUnit
        ? { amount_per_unit: parseFloat(amountPerUnit) }
        : {}),
      ...(showSplit(actionType)  && splitRatio  ? { split_ratio:  splitRatio }             : {}),
      ...(showBonus(actionType)  && bonusRatio  ? { bonus_ratio:  bonusRatio }             : {}),
      ...(showRights(actionType) && rightsRatio ? { rights_ratio: rightsRatio }            : {}),
      ...(showRights(actionType) && rightsPrice
        ? { rights_price: parseFloat(rightsPrice) }
        : {}),
      ...(notes ? { notes } : {}),
    };

    mutation.mutate(body);
  }

  /* Shared input styles */
  const inputClass = "w-full h-9 px-3 rounded-xl text-[13px] outline-none transition-colors";
  const inputStyle: React.CSSProperties = {
    background: "var(--pg-muted-bg)",
    border: "1px solid var(--pg-card-border)",
    color: "var(--pg-text-1)",
  };
  const labelStyle: React.CSSProperties = {
    color: "var(--pg-text-3)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: 6,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Instrument searchable select */}
      <div className="space-y-1.5 relative">
        <label style={labelStyle}>Instrument</label>
        <div className="relative">
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--pg-text-3)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder="Search by ticker or name…"
            value={selectedInstr ? `${selectedInstr.ticker} — ${selectedInstr.name}` : instrSearch}
            onFocus={() => {
              if (selectedInstr) setInstrSearch("");
              setInstrOpen(true);
            }}
            onChange={(e) => {
              setSelectedInstr(null);
              setInstrSearch(e.target.value);
              setInstrOpen(true);
            }}
            className={inputClass}
            style={{ ...inputStyle, paddingLeft: 30 }}
            autoComplete="off"
            required
          />
        </div>
        {instrOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 100,
              background: "var(--pg-card)",
              border: "1px solid var(--pg-card-border)",
              borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              maxHeight: 220,
              overflowY: "auto",
              marginTop: 4,
            }}
          >
            {filteredInstrs.length === 0 ? (
              <div className="px-3 py-3 text-[12px]" style={{ color: "var(--pg-text-3)" }}>
                No instruments found.
              </div>
            ) : (
              filteredInstrs.map((instr) => (
                <button
                  key={instr.id}
                  type="button"
                  onClick={() => {
                    setSelectedInstr(instr);
                    setInstrSearch("");
                    setInstrOpen(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--pg-row-border)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "none";
                  }}
                >
                  <span
                    className="text-[11px] font-bold"
                    style={{
                      background: "#fff0e0",
                      color: "#E05500",
                      padding: "2px 7px",
                      borderRadius: 6,
                      minWidth: 70,
                      textAlign: "center",
                    }}
                  >
                    {instr.ticker}
                  </span>
                  <span className="text-[13px]" style={{ color: "var(--pg-text-1)" }}>
                    {instr.name}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Close dropdown when clicking outside */}
      {instrOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 99 }}
          onClick={() => setInstrOpen(false)}
        />
      )}

      {/* Action Type */}
      <div className="space-y-1.5">
        <label style={labelStyle}>Action Type</label>
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value as ActionType)}
          className={inputClass}
          style={inputStyle}
          required
        >
          {(Object.entries(ACTION_TYPE_LABEL) as [ActionType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label style={labelStyle}>Ex Date</label>
          <input
            type="date"
            required
            value={exDate}
            onChange={(e) => setExDate(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div className="space-y-1.5">
          <label style={labelStyle}>Pay Date</label>
          <input
            type="date"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Amount Per Unit — cash_dividend / coupon_payment */}
      {showAmount(actionType) && (
        <div className="space-y-1.5">
          <label style={labelStyle}>Amount Per Unit (₦)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 20.00"
            value={amountPerUnit}
            onChange={(e) => setAmountPerUnit(e.target.value)}
            className={inputClass}
            style={inputStyle}
            required
          />
          <p style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 4 }}>
            Amount distributed per share / unit held on ex-date.
          </p>
        </div>
      )}

      {/* Split Ratio — stock_split */}
      {showSplit(actionType) && (
        <div className="space-y-1.5">
          <label style={labelStyle}>Split Ratio</label>
          <input
            type="text"
            placeholder="e.g. 2:1 (2 new shares for every 1 held)"
            value={splitRatio}
            onChange={(e) => setSplitRatio(e.target.value)}
            className={inputClass}
            style={inputStyle}
            required
          />
          <p style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 4 }}>
            Format: New:Old (e.g. 2:1 means 2 shares for every 1 existing share).
          </p>
        </div>
      )}

      {/* Bonus Ratio — bonus_share */}
      {showBonus(actionType) && (
        <div className="space-y-1.5">
          <label style={labelStyle}>Bonus Ratio</label>
          <input
            type="text"
            placeholder="e.g. 1:10 (1 bonus share per 10 held)"
            value={bonusRatio}
            onChange={(e) => setBonusRatio(e.target.value)}
            className={inputClass}
            style={inputStyle}
            required
          />
          <p style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 4 }}>
            Format: Bonus:Held (e.g. 1:10 means 1 free share for every 10 held).
          </p>
        </div>
      )}

      {/* Rights Ratio + Rights Price — rights_issue */}
      {showRights(actionType) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label style={labelStyle}>Rights Ratio</label>
            <input
              type="text"
              placeholder="e.g. 1:5"
              value={rightsRatio}
              onChange={(e) => setRightsRatio(e.target.value)}
              className={inputClass}
              style={inputStyle}
              required
            />
            <p style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 4 }}>
              Rights offered per shares held.
            </p>
          </div>
          <div className="space-y-1.5">
            <label style={labelStyle}>Rights Price (₦)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 14.50"
              value={rightsPrice}
              onChange={(e) => setRightsPrice(e.target.value)}
              className={inputClass}
              style={inputStyle}
              required
            />
            <p style={{ fontSize: 11, color: "var(--pg-text-3)", marginTop: 4 }}>
              Subscription price per right.
            </p>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <label style={labelStyle}>Notes</label>
        <textarea
          rows={3}
          placeholder="Optional notes or additional details…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{
            ...inputStyle,
            width: "100%",
            padding: "8px 12px",
            borderRadius: 12,
            fontSize: 13,
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 px-5 rounded-xl text-[13px] font-semibold transition-colors"
          style={{ background: "var(--pg-muted-bg)", color: "var(--pg-text-2)" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending || !selectedInstr}
          className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 transition-opacity disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg,#FF6600,#E05500)",
            boxShadow: "0 1px 8px rgba(255,102,0,0.35)",
          }}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Creating…
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              Create Action
            </>
          )}
        </button>
      </div>
    </form>
  );
}
