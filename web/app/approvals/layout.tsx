"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { RoleGuard } from "@/components/role-guard";

export default function ApprovalsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <RoleGuard allow={["finance", "finops", "md", "wm", "hr", "compliance", "default"]}>
        {children}
      </RoleGuard>
    </AppLayout>
  );
}
