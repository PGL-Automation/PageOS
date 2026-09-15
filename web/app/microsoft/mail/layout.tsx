import { AppLayout } from "@/components/layout/app-layout";
import { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
