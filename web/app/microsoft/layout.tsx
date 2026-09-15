import { AppLayout } from "@/components/layout/app-layout";
import { ReactNode } from "react";
import { redirect } from "next/navigation";

// Microsoft 365 is disabled on the dev environment (app.pageos.org).
// All /microsoft/* routes redirect to dashboard on dev.
export default function MicrosoftLayout({ children }: { children: ReactNode }) {
  if (process.env.NEXT_PUBLIC_APP_ENV === "dev") {
    redirect("/dashboard");
  }
  return <AppLayout>{children}</AppLayout>;
}
