import { AppLayout } from "@/components/layout/app-layout";
import { RoleGuard } from "@/components/role-guard";

export default function MDLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <RoleGuard allow={["md"]}>{children}</RoleGuard>
    </AppLayout>
  );
}
