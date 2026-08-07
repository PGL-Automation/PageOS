"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { usePosition, roleFamily } from "@/lib/position";

export default function HRLayout({ children }: { children: React.ReactNode }) {
  const { primaryCode, isLoading, isDemoMode } = usePosition();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    // Demo mode allows any role to preview HR pages.
    if (isDemoMode) return;
    const family = roleFamily(primaryCode);
    if (family !== "hr" && family !== "md") {
      router.replace("/dashboard");
    }
  }, [primaryCode, isLoading, isDemoMode, router]);

  return <AppLayout>{children}</AppLayout>;
}
