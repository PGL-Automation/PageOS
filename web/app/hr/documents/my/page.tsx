// This page moved to /my-documents so all employee roles can access it
// without being blocked by the HR role guard on /hr/layout.tsx.
import { redirect } from "next/navigation";

export default function RedirectMyDocuments() {
  redirect("/my-documents");
}
