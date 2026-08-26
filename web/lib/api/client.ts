import createClient from "openapi-fetch";
import type { paths } from "./types";

export const api = createClient<paths>({
  baseUrl: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081"}/api/v1`,
  credentials: "include",
});
