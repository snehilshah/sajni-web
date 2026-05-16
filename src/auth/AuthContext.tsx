import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setAccessToken, getAccessToken, authFetch, API_BASE } from "./client";
import log from "../lib/logger";

export interface User {
  id: number;
  email: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

interface AuthResponse {
  access_token: string;
  user: User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, try to refresh — succeeds if a refresh cookie is present.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("not signed in");
        const data: AuthResponse = await res.json();
        if (cancelled) return;
        setAccessToken(data.access_token);
        setUser(data.user);
        log.info({ userId: data.user.id }, "session restored");
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitCreds = useCallback(
    async (
      path: "/auth/login" | "/auth/register",
      email: string,
      password: string,
    ) => {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      const data: AuthResponse = await res.json();
      setAccessToken(data.access_token);
      setUser(data.user);
      log.info({ userId: data.user.id }, path === "/auth/login" ? "login" : "register");
    },
    [],
  );

  const login = useCallback(
    (email: string, password: string) =>
      submitCreds("/auth/login", email, password),
    [submitCreds],
  );
  const register = useCallback(
    (email: string, password: string) =>
      submitCreds("/auth/register", email, password),
    [submitCreds],
  );

  const logout = useCallback(async () => {
    try {
      await authFetch("/auth/logout", { method: "POST" });
    } catch {
      // ignore — we clear local state regardless
    }
    log.info("logout");
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { getAccessToken };
