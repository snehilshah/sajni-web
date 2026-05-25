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

export interface IdentityRef {
  provider: "google" | "github" | "email";
}

export interface User {
  /** UUIDv7 string. */
  id: string;
  email: string;
  name: string;
  /** RFC3339; null until the first-time walkthrough is finished. */
  onboarded_at: string | null;
  /** Linked sign-in methods. */
  identities: IdentityRef[];
  /** RFC3339. Present while the account is in the 7-day soft-delete grace. */
  deleted_at?: string | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Send a TOTP code to the email. Caller proceeds to the verify step. */
  startEmail: (email: string, name: string) => Promise<void>;
  /** Consume the TOTP and sign in. Sets the session. */
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  /** Browser navigation to the provider consent screen. */
  beginOAuth: (provider: "google" | "github") => void;
  /** Re-fetches /auth/me; useful after onboarding finishes. */
  refreshUser: () => Promise<void>;
  /** Mark walkthrough complete on the server and locally. */
  markOnboarded: () => Promise<void>;
  /** Update the user's display name. */
  updateName: (name: string) => Promise<void>;
  /** Set the session after a callback handoff (OAuthDone). */
  hydrateFromAccessToken: (token: string) => Promise<void>;
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

  const refreshUser = useCallback(async () => {
    const res = await authFetch("/auth/me");
    if (!res.ok) return;
    const me: User = await res.json();
    setUser(me);
  }, []);

  const startEmail = useCallback(async (email: string, name: string) => {
    const res = await fetch(`${API_BASE}/auth/email/start`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const res = await fetch(`${API_BASE}/auth/email/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    const data: AuthResponse = await res.json();
    setAccessToken(data.access_token);
    setUser(data.user);
    log.info({ userId: data.user.id }, "email-totp sign-in");
  }, []);

  const beginOAuth = useCallback((provider: "google" | "github") => {
    // OAuth start needs to come from a top-level navigation so the
    // provider's cookies (state, anti-CSRF) attach correctly. Using
    // fetch would swallow the 302 redirect chain.
    window.location.href = `${API_BASE}/auth/${provider}/start`;
  }, []);

  const hydrateFromAccessToken = useCallback(async (token: string) => {
    setAccessToken(token);
    const res = await authFetch("/auth/me");
    if (!res.ok) {
      setAccessToken(null);
      throw new Error("session handoff failed");
    }
    const me: User = await res.json();
    setUser(me);
    log.info({ userId: me.id }, "oauth handoff");
  }, []);

  const markOnboarded = useCallback(async () => {
    const res = await authFetch("/auth/onboarded", { method: "POST" });
    if (!res.ok) throw new Error("could not save onboarding");
    setUser((prev) =>
      prev ? { ...prev, onboarded_at: new Date().toISOString() } : prev,
    );
  }, []);

  const updateName = useCallback(async (name: string) => {
    const res = await authFetch("/auth/profile", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    const me: User = await res.json();
    setUser(me);
  }, []);

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
    () => ({
      user,
      loading,
      startEmail,
      verifyEmailCode,
      beginOAuth,
      refreshUser,
      markOnboarded,
      updateName,
      hydrateFromAccessToken,
      logout,
    }),
    [
      user,
      loading,
      startEmail,
      verifyEmailCode,
      beginOAuth,
      refreshUser,
      markOnboarded,
      updateName,
      hydrateFromAccessToken,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { getAccessToken };
