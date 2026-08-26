import { AppLayout } from "@/components/layout/app-layout";

// All authenticated staff can access their own leave portal.
export default function LeaveLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
