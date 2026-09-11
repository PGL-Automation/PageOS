"use client";

import Link from "next/link";
import {
  ClipboardList,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart2,
  Building2,
  Shield,
  ChevronRight,
  Info,
} from "lucide-react";

interface ReportCard {
  id: string;
  title: string;
  description: string;
  color: string;
  icon: React.ElementType;
  phase2: boolean;
}

const reportCards: ReportCard[] = [
  {
    id: "rcsa",
    title: "RCSA (Risk & Control Self-Assessment)",
    description:
      "Record departmental risks, causes, existing controls, likelihood, impact and residual risk rating.",
    color: "#FF6600",
    icon: ClipboardList,
    phase2: true,
  },
  {
    id: "kri",
    title: "Key Risk Indicators (KRI)",
    description:
      "Monitor indicator thresholds, current values, trends, status and breach action plans.",
    color: "#1d4ed8",
    icon: TrendingUp,
    phase2: true,
  },
  {
    id: "operational-risk",
    title: "Operational Risk Register",
    description:
      "Risks from departmental operating procedures, linked controls, incidents and remediation plans.",
    color: "#d97706",
    icon: AlertTriangle,
    phase2: true,
  },
  {
    id: "portfolio-risk",
    title: "Portfolio Risk Analysis",
    description:
      "Exposure and risk by asset class, instrument, issuer, sector, currency, tenor and portfolio.",
    color: "#7c3aed",
    icon: BarChart2,
    phase2: true,
  },
  {
    id: "stop-loss",
    title: "Stop-Loss Analysis",
    description:
      "Approved limits, current market values, loss positions, threshold utilisation and breach status.",
    color: "#dc2626",
    icon: TrendingDown,
    phase2: true,
  },
  {
    id: "counterparty",
    title: "Counterparty Exposure",
    description:
      "Exposure by counterparty, approved limits, available headroom, maturity profile and concentration flags.",
    color: "#059669",
    icon: Building2,
    phase2: true,
  },
];

const rolesAccess = [
  {
    role: "Internal Control Reviewer",
    access: "Full access to Control Review Queue and Document Checklist",
  },
  {
    role: "Risk Manager",
    access: "RCSA, KRI and Risk Register management (Phase 2)",
  },
  {
    role: "Head of Internal Audit",
    access: "View all modules, approve reports, monitor exceptions",
  },
  {
    role: "Business Submitter",
    access: "Submit items and view own cases",
  },
];

export default function RiskPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Link
          href="/audit"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium mb-3"
        >
          <span>←</span>
          <span>Internal Audit Dashboard</span>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Risk Management</h1>
        <p className="text-sm text-gray-500">Internal Audit, Control &amp; Risk</p>
      </div>

      {/* Status Notice Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
        <p className="text-sm text-blue-800">
          Risk management reports draw from data approved through the Control Review Queue. Phase 2
          modules will be enabled once the Control Review workflow is operational.
        </p>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {reportCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              {/* Colored top bar */}
              <div className="h-1.5 w-full" style={{ backgroundColor: card.color }} />

              <div className="flex flex-1 flex-col gap-3 p-5">
                {/* Icon + title */}
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${card.color}18` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: card.color }} />
                  </div>
                  <h2 className="text-sm font-semibold leading-snug text-gray-900">
                    {card.title}
                  </h2>
                </div>

                {/* Description */}
                <p className="flex-1 text-sm text-gray-500 leading-relaxed">
                  {card.description}
                </p>

                {/* Action button */}
                {card.phase2 ? (
                  <button
                    disabled
                    className="mt-auto inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400"
                  >
                    Coming in Phase 2
                  </button>
                ) : (
                  <button className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: card.color }}>
                    Open
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Roles & Access */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Shield className="h-5 w-5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Roles &amp; Access</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left font-medium text-gray-600">Role</th>
                <th className="px-5 py-3 text-left font-medium text-gray-600">Access</th>
              </tr>
            </thead>
            <tbody>
              {rolesAccess.map((row, idx) => (
                <tr
                  key={row.role}
                  className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                >
                  <td className="px-5 py-3 font-medium text-gray-800">{row.role}</td>
                  <td className="px-5 py-3 text-gray-600">{row.access}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FMDQ Data Notice */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-gray-900">
                Market Data — FMDQ Integration
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
                Controlled uploads of approved market-data files (FMDQ or equivalent) will be
                supported in Phase 2, with source date and uploader recorded. Full API integration
                is subject to licence confirmation, technical assessment and regulatory approval.
              </p>
            </div>
            <span className="flex-shrink-0 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200">
              Under Assessment
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
