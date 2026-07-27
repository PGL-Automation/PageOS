"use client";
import { ModuleStub } from "@/components/ui/module-stub";
import { ShoppingCart } from "lucide-react";
export default function Page() {
  return <ModuleStub title="Procurement" description="Purchase requests, vendor management, and procurement approvals."
    icon={ShoppingCart} color="#d97706" bg="#fffbeb"
    aiCaption="AI can evaluate vendor quotes, flag pricing anomalies, and recommend optimal procurement decisions."
    features={[
      { label: "Purchase Requests",      description: "Digital purchase request workflow with budget checking" },
      { label: "Vendor Management",      description: "Vendor registration, qualification, and performance scoring" },
      { label: "Contract Management",    description: "Contract repository with expiry alerts and renewal workflows" },
      { label: "Spend Analytics",        description: "AI-powered spend categorisation and savings identification" },
    ]} />;
}
