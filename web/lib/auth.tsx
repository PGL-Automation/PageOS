"use client";

import {
  createContext, useContext, useEffect, useState, useCallback, ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "./api/client";
import { components } from "./api/types";

type User = components["schemas"]["User"];
type Subsidiary = components["schemas"]["Subsidiary"];

interface AuthState {
  user: User | null;
  subsidiary: Subsidiary | null;
  subsidiaries: Subsidiary[];
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  setSubsidiary: (s: Subsidiary) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [subsidiary, setSubsidiaryState] = useState<Subsidiary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The org module returns lowercase JSON field names (id, code, name) but the
  // TypeScript Subsidiary type has uppercase (ID, Code, Name). Normalize here
  // so the rest of the app can use s.ID and s.Name reliably.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function normalizeSubsidiary(raw: any): Subsidiary {
    return {
      ID:     raw.ID     ?? raw.id     ?? "",
      Code:   raw.Code   ?? raw.code   ?? "",
      Name:   raw.Name   ?? raw.name   ?? "",
      Status: raw.Status ?? raw.status ?? "",
    } as Subsidiary;
  }

  const loadSubsidiaries = useCallback(async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";
    let subs: Subsidiary[] = [];

    // Prefer /org/me/subsidiaries — returns only subsidiaries the user belongs to.
    try {
      const res = await fetch(`${baseUrl}/api/v1/org/me/subsidiaries`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json() as object[];
        subs = (json ?? []).map(normalizeSubsidiary);
      }
    } catch { /* network error — fall through */ }

    // Fallback: if no assignments found, show all subsidiaries so UI isn't blank.
    if (subs.length === 0) {
      const res2 = await fetch(`${baseUrl}/api/v1/org/subsidiaries`, { credentials: "include" });
      if (res2.ok) {
        const json2 = await res2.json() as object[];
        subs = (json2 ?? []).map(normalizeSubsidiary);
      }
    }

    if (subs.length > 0) {
      setSubsidiaries(subs);
      const saved = typeof window !== "undefined" ? localStorage.getItem("pageos_subsidiary_id") : null;
      const found = saved ? subs.find(s => s.ID === saved) : null;
      setSubsidiaryState(found ?? subs[0]);
    }
  }, []);

  // On mount: verify session via /auth/me
  useEffect(() => {
    async function init() {
      const { data } = await api.GET("/auth/me");
      if (data) {
        setUser(data);
        await loadSubsidiaries();
      } else if (!pathname.startsWith("/login")) {
        router.replace("/login");
      }
      setIsLoading(false);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect to login when user is cleared (after logout)
  useEffect(() => {
    if (!isLoading && !user && !pathname.startsWith("/login")) {
      router.replace("/login");
    }
  }, [user, isLoading, pathname, router]);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await api.POST("/auth/login", {
      body: { email, password },
    });
    if (error || !data) throw new Error("Invalid email or password");
    setUser(data);
    await loadSubsidiaries();
    router.push("/dashboard");
  }, [loadSubsidiaries, router]);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await api.POST("/auth/register", {
      body: { email, password, display_name: displayName },
    });
    if (error || !data) throw new Error("Registration failed — email may already be in use");
    // Auto-login after register
    await login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    await api.POST("/auth/logout", {});
    setUser(null);
    setSubsidiaryState(null);
    setSubsidiaries([]);
    router.replace("/login");
  }, [router]);

  const setSubsidiary = useCallback((s: Subsidiary) => {
    setSubsidiaryState(s);
    if (typeof window !== "undefined") localStorage.setItem("pageos_subsidiary_id", s.ID);
  }, []);

  return (
    <AuthContext.Provider value={{ user, subsidiary, subsidiaries, isLoading, login, register, logout, setSubsidiary }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
