"use client";
import { ModuleStub } from "@/components/ui/module-stub";
import { BarChart } from "lucide-react";
export default function Page() {
  return <ModuleStub title="Analytics & BI" description="Interactive dashboards, drill-down reporting, and AI-powered business intelligence."
    icon={BarChart} color="#FF6600" bg="#fff7f0"
    aiCaption="Ask any business question in plain English — AI translates it to a query and returns an interactive chart instantly."
    features={[
      { label: "Executive Dashboards",   description: "Configurable, real-time dashboards for C-suite and board reporting" },
      { label: "Drill-down Reports",     description: "Click any number to drill from summary to transaction level" },
      { label: "Natural Language Query", description: "Type a business question and AI returns a chart or table" },
      { label: "Scheduled Reports",      description: "Auto-deliver reports to stakeholders on any schedule" },
    ]} />;
}
