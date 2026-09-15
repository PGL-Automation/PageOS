import { ReactNode } from "react";

// Parent /microsoft/layout.tsx already wraps in AppLayout — no double-wrap here.
export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
