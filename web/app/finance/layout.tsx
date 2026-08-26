import { AppLayout } from "@/components/layout/app-layout";
import { RoleGuard } from "@/components/role-guard";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <RoleGuard allow={["finance", "md"]}>{children}</RoleGuard>
    </AppLayout>
  );
}
