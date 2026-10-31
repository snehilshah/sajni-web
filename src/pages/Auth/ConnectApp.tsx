import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Backdrop from '@/components/Backdrop';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { M3CookieLoader } from '@/components/ui/shapes';
import { connectedApps, type ConnectRequest } from '@/api';
import { failureText } from '@/lib/errors';

// The OAuth consent page (/oauth/authorize): an outside assistant such as
// ChatGPT or Gemini asks to use Sajni over MCP. The API checks the request;
// this page only asks the user and sends the browser back to the app.
export default function ConnectApp() {
  const navigate = useNavigate();
  const query = window.location.search;
  const [req, setReq] = useState<ConnectRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [write, setWrite] = useState(true);
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    connectedApps.check(query)
      .then((r) => {
        if (r.redirect) {
          window.location.replace(r.redirect);
          return;
        }
        setReq(r);
        if (r.connected) setWrite(!!r.connected_write);
      })
      .catch((e: unknown) => setError(failureText(e)));
  }, [query]);

  async function decide(allow: boolean) {
    setBusy(allow ? 'allow' : 'deny');
    try {
      const { redirect } = await connectedApps.decide(query, allow, write);
      window.location.replace(redirect);
    } catch (e) {
      setError(failureText(e));
      setBusy(null);
    }
  }

  const name = req?.client_name || 'This app';
  return (
    <>
      <Backdrop />
      <main className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Link to="/" aria-label="Sajni home" className="mb-8 flex w-fit items-center gap-3 rounded-lg">
            <span className="sajni-logo" aria-hidden="true" />
            <span className="serif text-[18px] font-semibold leading-tight">sajni</span>
          </Link>

          {error ? (
            <div className="space-y-4">
              <h1 className="serif text-3xl font-semibold tracking-tight">Can't connect</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => navigate('/')}>Open Sajni</Button>
            </div>
          ) : !req ? (
            <div className="flex justify-center py-12">
              <M3CookieLoader size="xl" tone="primary" />
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h1 className="serif text-3xl font-semibold tracking-tight">Connect {name}?</h1>
                {req.client_host && (
                  <span className="chip mt-3 inline-flex text-xs">{req.client_host}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {name} will see your tasks, habits, journal, notes, memos, media and finance.
              </p>
              {req.write_requested && (
                <label className="flex items-center gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Allow changes</span>
                    <span className="block text-xs text-muted-foreground">
                      Add and edit tasks, memos, journal, transactions and more.
                    </span>
                  </span>
                  <Switch checked={write} onCheckedChange={setWrite} />
                </label>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="h-11 flex-1" disabled={busy !== null} onClick={() => decide(false)}>
                  {busy === 'deny' ? <M3CookieLoader size="xs" tone="primary" /> : 'Cancel'}
                </Button>
                <Button className="h-11 flex-1" disabled={busy !== null} onClick={() => decide(true)}>
                  {busy === 'allow' ? <M3CookieLoader size="xs" tone="primary" /> : 'Connect'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Remove it anytime in Settings → Connected apps.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
