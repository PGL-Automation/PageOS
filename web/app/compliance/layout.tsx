"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { usePosition, roleFamily } from "@/lib/position";

export default function ComplianceLayout({ children }: { children: React.ReactNode }) {
  const { primaryCode, isLoading, isDemoMode } = usePosition();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || isDemoMode) return;
    const family = roleFamily(primaryCode);
    // Only compliance officers and group admins/MDs may access this section.
    if (family !== "compliance" && family !== "md") {
      router.replace("/dashboard");
    }
  }, [primaryCode, isLoading, isDemoMode, router]);

  return <AppLayout>{children}</AppLayout>;
}
