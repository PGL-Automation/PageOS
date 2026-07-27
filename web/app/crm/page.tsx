"use client";
import { ModuleStub } from "@/components/ui/module-stub";
import { Users } from "lucide-react";
export default function Page() {
  return <ModuleStub title="CRM" description="Client relationship management, pipeline tracking, and engagement history."
    icon={Users} color="#7c3aed" bg="#f5f3ff"
    aiCaption="AI can score lead quality, predict churn, summarise client history, and draft relationship notes."
    features={[
      { label: "Client 360 View",        description: "Complete client profile: portfolio, history, documents, interactions" },
      { label: "Pipeline Management",    description: "Visual deal pipeline with AI-powered next-step recommendations" },
      { label: "Interaction Logging",    description: "Log calls, meetings, emails directly from the CRM interface" },
      { label: "AI Client Insights",     description: "AI analyses client behaviour and flags cross-sell opportunities" },
    ]} />;
}
