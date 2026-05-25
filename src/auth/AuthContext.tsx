import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { setAccessToken, getAccessToken, authFetch, API_BASE, refreshSession } from "./client";
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
  // Tracks whether OAuthDone / LinkChallenge / SignIn already populated the
  // session via setUser(). If a hydrated session exists, a *failing*
  // background refresh must NOT clobber it back to null — otherwise the
  // dev StrictMode double-mount, or any transient refresh hiccup, knocks
  // a freshly-signed-in user out of their session.
  const hydratedRef = useRef(false);
  const setUserSafe = useCallback((u: User | null) => {
    if (u) hydratedRef.current = true;
    setUser(u);
  }, []);

  // On mount, try to refresh — succeeds if a refresh cookie is present.
  //
  // Two important guards:
  //
  //  1. Routes that own their own session handoff (`/auth/done` reads the
  //     fragment access token; `/auth/link` finalizes a TOTP-linked
  //     identity) MUST NOT race against this background refresh. Refresh
  //     tokens are single-use rotating server-side: two concurrent calls
  //     with the same cookie cause one to 401 and the server's response
  //     deletes the cookie, taking the just-issued session down with it.
  //
  //  2. `refreshSession()` shares an inflight Promise across callers, so
  //     React 19 StrictMode's double-mount only fires one network call.
  useEffect(() => {
    const path = window.location.pathname;
    if (path === "/auth/done" || path === "/auth/link") {
      // Those pages will call hydrateFromAccessToken / verifyEmailCode
      // themselves and set the session. Just clear the loading flag so
      // RequireAuth doesn't keep showing the loader forever.
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const data = await refreshSession();
      if (cancelled) return;
      if (data) {
        setAccessToken(data.access_token);
        setUserSafe(data.user);
        log.info({ userId: data.user.id }, "session restored");
      } else if (!hydratedRef.current) {
        // Only clobber when nobody else has hydrated a session in
        // parallel. Without this guard a transiently-failed refresh
        // would log out a freshly-signed-in user.
        setAccessToken(null);
        setUser(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setUserSafe]);

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
    setUserSafe(data.user);
    log.info({ userId: data.user.id }, "email-totp sign-in");
  }, [setUserSafe]);

  const beginOAuth = useCallback((provider: "google" | "github") => {
    // OAuth start needs to come from a top-level navigation so the
    // provider's cookies (state, anti-CSRF) attach correctly. Using
    // fetch would swallow the 302 redirect chain.
    window.location.href = `${API_BASE}/auth/${provider}/start`;
  }, []);

  const hydrateFromAccessToken = useCallback(async (token: string) => {
    setAccessToken(token);
    // Mark hydrated *before* the network call so a parallel background
    // refresh failure can't clobber the freshly-set token mid-flight.
    hydratedRef.current = true;
    const res = await authFetch("/auth/me");
    if (!res.ok) {
      setAccessToken(null);
      hydratedRef.current = false;
      throw new Error("session handoff failed");
    }
    const me: User = await res.json();
    setUserSafe(me);
    log.info({ userId: me.id }, "oauth handoff");
  }, [setUserSafe]);

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
    hydratedRef.current = false;
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
