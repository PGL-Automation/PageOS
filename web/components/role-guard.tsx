"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { usePosition, roleFamily } from "@/lib/position";

type Family = ReturnType<typeof roleFamily>;

// Where each role family lands after login.
const ROLE_HOME: Record<Family, string> = {
  pm:         "/pm/overview",
  wm:         "/wm/dashboard",
  md:         "/dashboard",
  hr:         "/hr/dashboard",
  finance:    "/finance",
  compliance: "/compliance",
  default:    "/dashboard",
};

interface RoleGuardProps {
  /** Role families that may access the wrapped content. */
  allow: Family[];
  children: React.ReactNode;
}

/**
 * Client-side access guard. Wraps page content inside an AppLayout and
 * redirects the user to their own role home if they don't hold one of the
 * allowed role families.
 *
 * SECURITY: Demo mode does NOT bypass this guard. Role checks always apply
 * regardless of demo state, so only real (or demo-safe) role families
 * assigned to the user can access restricted pages.
 */
export function RoleGuard({ allow, children }: RoleGuardProps) {
  const router  = useRouter();
  const { primaryCode, isLoading } = usePosition();

  const family  = roleFamily(primaryCode);
  const allowed = allow.includes(family);

  useEffect(() => {
    if (isLoading) return;
    if (!allow.includes(roleFamily(primaryCode))) {
      router.replace(ROLE_HOME[roleFamily(primaryCode)]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, primaryCode]);

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pg-text-4)" }} />
      </div>
    );
  }

  // Render nothing while the redirect fires — avoids a flash of forbidden content.
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-3 text-center">
        <ShieldAlert className="w-10 h-10" style={{ color: "var(--pg-text-4)" }} />
        <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
