import { AppLayout } from "@/components/layout/app-layout";
import { RoleGuard } from "@/components/role-guard";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <RoleGuard allow={["wm", "md"]}>{children}</RoleGuard>
    </AppLayout>
  );
}
