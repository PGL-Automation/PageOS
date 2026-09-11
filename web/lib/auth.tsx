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

    // Only load subsidiaries the user actually belongs to.
    // SECURITY: We do NOT fall back to enumerating all subsidiaries — a user
    // with no assignments should see an empty list, not the full org structure.
    try {
      const res = await fetch(`${baseUrl}/api/v1/org/me/subsidiaries`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json() as object[];
        subs = (json ?? []).map(normalizeSubsidiary);
      }
    } catch { /* network error — leave subs empty */ }

    // Always set subsidiaries (even if empty) so the UI can show an appropriate
    // empty state rather than appearing to still be loading.
    setSubsidiaries(subs);
    if (subs.length > 0) {
      const saved = typeof window !== "undefined" ? localStorage.getItem("pageos_subsidiary_id") : null;
      const found = saved ? subs.find(s => s.ID === saved) : null;
      setSubsidiaryState(found ?? subs[0]);
    } else {
      setSubsidiaryState(null);
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
    // Clear all pageos_* localStorage keys so no stale role/subsidiary data
    // persists across sessions (prevents privilege escalation via cached state).
    if (typeof window !== "undefined") {
      localStorage.removeItem("pageos_view_as");
      localStorage.removeItem("pageos_demo_role");
      localStorage.removeItem("pageos_subsidiary_id");
      // Remove all per-subsidiary position keys (pageos_position_<subsidiary_id>)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("pageos_position_")) keysToRemove.push(key);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
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
