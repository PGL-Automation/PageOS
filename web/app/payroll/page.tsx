"use client";
import { ModuleStub } from "@/components/ui/module-stub";
import { DollarSign } from "lucide-react";
export default function Page() {
  return <ModuleStub title="Payroll" description="Automated payroll processing, tax computation, and payslip distribution."
    icon={DollarSign} color="#059669" bg="#ecfdf5"
    aiCaption="AI can audit payroll for anomalies, flag unusual changes, and generate payroll reports for management."
    features={[
      { label: "Automated Payroll Run",  description: "One-click monthly payroll with PAYE, pension, NHF computation" },
      { label: "Multi-entity Payroll",   description: "Separate payroll registers for each Page Group subsidiary" },
      { label: "Payslip Portal",         description: "Digital payslips delivered to employee self-service portal" },
      { label: "Pension Remittance",     description: "Automated PFA remittance schedules and compliance tracking" },
    ]} />;
}
