"use client";
import { ModuleStub } from "@/components/ui/module-stub";
import { Zap } from "lucide-react";
export default function Page() {
  return <ModuleStub title="Workflow Builder" description="Visual workflow automation for any business process across Page Group."
    icon={Zap} color="#f59e0b" bg="#fffbeb"
    aiCaption="Describe any process in plain English and AI will generate the workflow automatically — no coding required."
    features={[
      { label: "Visual Workflow Designer", description: "Drag-and-drop builder with triggers, conditions, and actions" },
      { label: "AI Workflow Generation",   description: "Describe a process and AI builds the automation instantly" },
      { label: "Cross-module Automation",  description: "Connect Finance, HR, Compliance, and CRM in one workflow" },
      { label: "SLA Monitoring",           description: "Automatically escalate breached SLAs and notify responsible parties" },
    ]} />;
}
