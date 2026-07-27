// Thin API client. In M0 it only hits the platform health endpoints; the
// typed, OpenAPI-generated client replaces hand-written calls as the API grows.
// Server components use API_URL (in-cluster, e.g. http://api:8080); browser
// code uses NEXT_PUBLIC_API_URL (e.g. http://localhost:8080).
const BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080";

export type Health = { status: string; db?: string };

export async function getReadiness(): Promise<Health> {
  const res = await fetch(`${BASE}/readyz`, { cache: "no-store" });
  return res.json();
}
