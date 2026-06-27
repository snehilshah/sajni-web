import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { M3CookieLoader } from '@/components/ui/shapes';

// OAuthDone is the landing page for both Google + GitHub callbacks. The
// API issues a 302 to `/auth/done?linked=<provider>#access=<token>`; we
// read the fragment (never sent to servers / logs), hand it to the auth
// context, then navigate to /. The refresh cookie is already in place
// from the API callback's Set-Cookie response.
export default function OAuthDone() {
  const navigate = useNavigate();
  const { hydrateFromAccessToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // React 19 / StrictMode runs effects twice in dev. The second pass
  // would see an already-cleared fragment and show "no access token".
  // A ref-guard makes the effect idempotent.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const fragment = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(fragment);
    const token = params.get('access');
    const linked = new URLSearchParams(window.location.search).get('linked');
    if (!token) {
      setError('No access token in callback');
      return;
    }
    // Clear both fragment + query so the token doesn't linger.
    window.history.replaceState(null, '', '/auth/done');
    hydrateFromAccessToken(token)
      .then(() => {
        if (linked) {
          toast.success(`Linked ${linked} to your account`);
        }
        navigate('/', { replace: true });
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Sign-in failed'),
      );
  }, [hydrateFromAccessToken, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-muted-foreground">
      {error ? (
        <>
          <div className="serif text-base text-destructive">{error}</div>
          <button
            onClick={() => navigate('/signin', { replace: true })}
            className="mono text-xs uppercase tracking-[0.22em] underline"
          >
            try again
          </button>
        </>
      ) : (
        <>
          <M3CookieLoader size="xl" tone="primary" />
        </>
      )}
    </div>
  );
}
