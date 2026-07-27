"use client";
import { ModuleStub } from "@/components/ui/module-stub";
import { Search } from "lucide-react";
export default function Page() {
  return <ModuleStub title="Internal Audit" description="Audit programmes, findings management, and management action tracking."
    icon={Search} color="#0891b2" bg="#ecfeff"
    aiCaption="AI can generate audit programmes, summarise findings, and assess management action plan adequacy."
    features={[
      { label: "Audit Planning",         description: "Risk-based audit universe with AI-recommended audit priorities" },
      { label: "Digital Workpapers",     description: "Structured workpapers with evidence attachments and sign-off" },
      { label: "Findings Management",    description: "Track audit findings from identification through remediation" },
      { label: "Management Dashboard",   description: "Executive dashboard showing audit status and open findings" },
    ]} />;
}
