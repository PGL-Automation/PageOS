"use client";
import { ModuleStub } from "@/components/ui/module-stub";
import { TrendingUp } from "lucide-react";
export default function FinancePage() {
  return <ModuleStub
    title="Finance Overview"
    description="Group-wide financial health, cash flow, P&L, and management accounts."
    icon={TrendingUp} color="#2563eb" bg="#eff6ff"
    aiCaption="AI can generate your management accounts, explain variances, and forecast next quarter — ask below."
    features={[
      { label: "Cash Flow Dashboard",      description: "Real-time cash position across all Page Group bank accounts" },
      { label: "P&L by Subsidiary",        description: "Consolidated and individual P&L with drill-down" },
      { label: "Budget vs Actual",          description: "Track performance against approved budgets" },
      { label: "Intercompany Eliminations", description: "Automatic elimination of intragroup transactions" },
      { label: "Multi-currency Accounting", description: "Native NGN, USD, GBP, EUR support with live FX" },
      { label: "AI Variance Explanation",   description: "AI explains every significant financial variance automatically" },
    ]}
  />;
}
