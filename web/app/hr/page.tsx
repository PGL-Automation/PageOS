"use client";
import { ModuleStub } from "@/components/ui/module-stub";
import { Users } from "lucide-react";
export default function Page() {
  return <ModuleStub title="Human Resources" description="Employee records, performance management, org charts, and leave management."
    icon={Users} color="#0891b2" bg="#ecfeff"
    aiCaption="AI can analyse employee performance, flag retention risks, and generate org charts automatically."
    features={[
      { label: "Employee Directory",    description: "Searchable org-wide directory with photos and org chart" },
      { label: "Performance Reviews",   description: "360° reviews with AI-assisted scoring and calibration" },
      { label: "Leave Management",      description: "Automated leave approvals with calendar integration" },
      { label: "Headcount Planning",    description: "AI-powered headcount forecasting and budget modelling" },
    ]} />;
}
