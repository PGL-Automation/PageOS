"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { msApi, OrgUser } from "./components";

interface Props {
  /** Current comma-separated value in the input (for controlled mode) */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/**
 * PeoplePicker — text input with live people-search dropdown.
 * Manages a list of selected email chips. On blur or comma, the current
 * typed value is added to the chip list.
 */
export function PeoplePicker({ value, onChange, placeholder = "To" }: Props) {
  const [input, setInput] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // Sync external value → chips on mount
  useEffect(() => {
    if (value && chips.length === 0) {
      const parts = value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      if (parts.length) setChips(parts);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep parent value in sync
  useEffect(() => {
    onChange(chips.join(", "));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chips]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data: searchData, isLoading } = useQuery({
    queryKey: ["people-search", query],
    queryFn: () => msApi(`/users/search?q=${encodeURIComponent(query)}`) as Promise<{ users: OrgUser[] }>,
    enabled: query.length >= 2,
    staleTime: 30_000,
  });

  const suggestions = searchData?.users ?? [];

  function addChip(email: string) {
    const e = email.trim();
    if (e && !chips.includes(e)) setChips(prev => [...prev, e]);
    setInput("");
    setQuery("");
    setOpen(false);
  }

  function removeChip(email: string) {
    setChips(prev => prev.filter(c => c !== email));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "," || e.key === ";" || e.key === "Enter") && input.trim()) {
      e.preventDefault();
      addChip(input);
    }
    if (e.key === "Backspace" && !input && chips.length > 0) {
      setChips(prev => prev.slice(0, -1));
    }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 px-3 py-2 rounded-xl min-h-[40px] items-center"
           style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}
           onClick={() => document.getElementById("people-picker-input")?.focus()}>
        {chips.map(chip => (
          <span key={chip} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                style={{ background: "#0078d4", color: "white" }}>
            {chip}
            <button type="button" onClick={e => { e.stopPropagation(); removeChip(chip); }}
                    className="opacity-70 hover:opacity-100">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          id="people-picker-input"
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
          onFocus={() => query.length >= 2 && setOpen(true)}
          onBlur={() => { setTimeout(() => setOpen(false), 150); if (input.trim()) addChip(input); }}
          placeholder={chips.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-[13px]"
          style={{ color: "var(--pg-text-1)" }}
        />
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: "var(--pg-text-4)" }} />}
      </div>

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-lg"
             style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
          {suggestions.map(p => (
            <button key={p.id} type="button"
                    onMouseDown={e => { e.preventDefault(); addChip(p.mail || p.displayName); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ borderBottom: "1px solid var(--pg-row-border)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                   style={{ background: "#0078d4" }}>
                {p.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{p.displayName}</p>
                <p className="text-[11px] truncate" style={{ color: "var(--pg-text-3)" }}>{p.mail}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
