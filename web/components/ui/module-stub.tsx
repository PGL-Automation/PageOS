"use client";
import { LucideIcon } from "lucide-react";
import { Brain, ArrowRight } from "lucide-react";
import Link from "next/link";

interface Feature { label: string; description: string; }
interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  features?: Feature[];
  aiCaption?: string;
}

export function ModuleStub({ title, description, icon: Icon, color, bg, features = [], aiCaption }: Props) {
  return (
    <div className="max-w-3xl mx-auto space-y-8 pt-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
             style={{ background: bg, boxShadow: `0 4px 16px ${color}25` }}>
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-slate-900">{title}</h1>
          <p className="text-[14px] text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>

      {/* Status banner */}
      <div className="rounded-2xl px-6 py-5"
           style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)", border: "1px solid #bfdbfe" }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#2563eb" }} />
          <p className="text-[13px] font-semibold text-blue-900">This module is under active development</p>
        </div>
        <p className="text-[12px] text-blue-700 mt-1.5 leading-relaxed">
          The backend infrastructure and data models for <strong>{title}</strong> are already in place.
          The UI is being built as part of the PageOS rollout. Estimated availability: Q1 2027.
        </p>
      </div>

      {/* AI banner */}
      {aiCaption && (
        <div className="flex items-start gap-3 px-5 py-4 rounded-xl"
             style={{ background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", border: "1px solid #c4b5fd" }}>
          <Brain className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
          <p className="text-[13px] text-violet-800">{aiCaption}</p>
          <Link href="/ai" className="shrink-0 text-[12px] font-semibold text-violet-700 hover:underline flex items-center gap-0.5">
            Ask AI <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Feature preview */}
      {features.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Planned features</p>
          <div className="grid md:grid-cols-2 gap-3">
            {features.map(f => (
              <div key={f.label} className="flex items-start gap-3 p-4 rounded-xl bg-white"
                   style={{ border: "1px solid #e8edf3", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
                <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: color }} />
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">{f.label}</p>
                  <p className="text-[12px] text-slate-500 mt-0.5">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
