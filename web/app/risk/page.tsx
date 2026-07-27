"use client";
import { ModuleStub } from "@/components/ui/module-stub";
import { AlertTriangle } from "lucide-react";
export default function Page() {
  return <ModuleStub title="Risk Management" description="Enterprise risk register, exposure tracking, and mitigation workflows."
    icon={AlertTriangle} color="#dc2626" bg="#fef2f2"
    aiCaption="AI monitors transactions, exposures, and market data in real time to detect and alert on emerging risks."
    features={[
      { label: "Risk Register",          description: "Centralised register with likelihood, impact, and status tracking" },
      { label: "Portfolio Risk Analysis", description: "Real-time risk exposure by client, sector, and instrument" },
      { label: "AI Anomaly Detection",   description: "Machine learning flags unusual patterns in transactions and behaviour" },
      { label: "Regulatory Risk",        description: "Monitor regulatory deadlines and flag non-compliance risks proactively" },
    ]} />;
}
