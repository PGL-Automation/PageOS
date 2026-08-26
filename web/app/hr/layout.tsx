import { AppLayout } from "@/components/layout/app-layout";
import { RoleGuard } from "@/components/role-guard";

export default function HRLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <RoleGuard allow={["hr", "md"]}>{children}</RoleGuard>
    </AppLayout>
  );
}
