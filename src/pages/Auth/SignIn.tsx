import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import Backdrop from '@/components/Backdrop';

type Step = 'choose' | 'code';
type OAuthBusy = 'google' | 'github' | null;

// Inline SVG marks — keep the bundle small + provider colours intact.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.79 2.72v2.26h2.9c1.69-1.56 2.67-3.86 2.67-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.06-3.72H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.94 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.28-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.98-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96L3.94 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.16-.89-1.16-.72-.49.06-.48.06-.48.8.06 1.23.82 1.23.82.71 1.22 1.87.87 2.33.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.74.54 1.49v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function SignIn() {
  const { beginOAuth, startEmail, verifyEmailCode } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Tracks which OAuth button is mid-redirect so we can show a spinner
  // — browser nav is async, so without this the click feels dead.
  const [oauthBusy, setOauthBusy] = useState<OAuthBusy>(null);

  function startOAuth(provider: 'google' | 'github') {
    if (oauthBusy) return;
    setOauthBusy(provider);
    beginOAuth(provider);
  }

  async function onRequestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError('Email is required.');
      return;
    }
    setSubmitting(true);
    try {
      // Name is not required up front: the server creates the user with
      // an empty name and falls back to the email local-part for
      // display. The user can set a proper name from Settings later.
      await startEmail(email.toLowerCase(), '');
      setStep('code');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setSubmitting(true);
    try {
      await verifyEmailCode(email.toLowerCase(), code);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong or expired code');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Backdrop />
      <div className="relative z-10 min-h-[100dvh] grid md:grid-cols-2">
        <div className="hidden md:flex flex-col justify-between p-12 border-r border-border">
          <div className="flex items-center gap-3">
            <span className="sajni-logo" aria-hidden="true" />
            <div>
              <div className="serif text-[20px] font-semibold leading-tight">sajni</div>
              <div className="mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">codex</div>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="serif text-5xl lg:text-6xl font-normal tracking-[-0.02em] leading-[1.05]">
              Notes, journal, tasks, habits.<br />
              <em className="text-muted-foreground">One quiet codex.</em>
            </h1>
            <div className="serif italic text-base text-muted-foreground mt-6 max-w-sm">
              A printer's specimen book for the second brain. Capture quickly. Reflect slowly.
            </div>
          </div>

          <div className="mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            ohmysajni.com
          </div>
        </div>

        <div className="flex items-center justify-center px-5 py-12 md:py-0">
          <div className="w-full max-w-sm">
            <div className="md:hidden mb-8 flex items-center gap-3">
              <span className="sajni-logo" aria-hidden="true" />
              <div>
                <div className="serif text-[18px] font-semibold leading-tight">sajni</div>
                <div className="mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">codex</div>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="serif text-3xl font-semibold tracking-tight">
                {step === 'choose' ? 'Step inside.' : 'Check your inbox.'}
              </h2>
              <p className="serif italic text-base text-muted-foreground mt-1">
                {step === 'choose'
                  ? 'Pick a sign-in. They all land in the same notebook.'
                  : `We sent a 6-digit code to ${email}.`}
              </p>
            </div>

            {step === 'choose' ? (
              <>
                <div className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => startOAuth('google')}
                    disabled={oauthBusy !== null}
                    className="h-12 justify-center gap-3 rounded-full"
                  >
                    {oauthBusy === 'google' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <GoogleMark />
                    )}
                    {oauthBusy === 'google' ? 'Opening Google…' : 'Continue with Google'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => startOAuth('github')}
                    disabled={oauthBusy !== null}
                    className="h-12 justify-center gap-3 rounded-full"
                  >
                    {oauthBusy === 'github' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <GitHubMark />
                    )}
                    {oauthBusy === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'}
                  </Button>
                </div>

                <div className="my-6 flex items-center gap-3 text-muted-foreground">
                  <span className="flex-1 h-px bg-border" />
                  <span className="mono text-[10px] uppercase tracking-[0.22em]">or email</span>
                  <span className="flex-1 h-px bg-border" />
                </div>

                <form onSubmit={onRequestCode} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={oauthBusy !== null}
                    />
                  </div>
                  {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {error}
                    </div>
                  )}
                  <Button
                    type="submit"
                    disabled={submitting || oauthBusy !== null}
                    className="w-full h-11 rounded-full"
                  >
                    {submitting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" /> Sending…
                      </span>
                    ) : (
                      'Email me a code'
                    )}
                  </Button>
                </form>
              </>
            ) : (
              <form onSubmit={onVerifyCode} className="space-y-5">
                <div className="space-y-3">
                  <Label className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    6-digit code
                  </Label>
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={setCode}
                    autoFocus
                  >
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={submitting || code.length !== 6}
                  className="w-full h-11 rounded-full"
                >
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Verifying…
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => { setStep('choose'); setError(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Use a different email or provider
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
