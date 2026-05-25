import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import Backdrop from '@/components/Backdrop';

// LinkChallenge handles the "provider returned an unverified email that
// matches an existing account" path. The API queued a TOTP code via
// Resend; we collect the code and POST it through the normal email
// verify endpoint, which finalizes the auth_identity row.
export default function LinkChallenge() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmailCode } = useAuth();

  const email = params.get('email') || '';
  const provider = params.get('provider') || '';

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) navigate('/signin', { replace: true });
  }, [email, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setSubmitting(true);
    try {
      await verifyEmailCode(email, code);
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
      <div className="relative z-10 min-h-[100dvh] flex items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h2 className="serif text-3xl font-semibold tracking-tight">Confirm it's you.</h2>
            <p className="serif italic text-base text-muted-foreground mt-1">
              {provider
                ? `${provider[0].toUpperCase() + provider.slice(1)} couldn't confirm your email is verified. We sent a code to ${email} so we can link this sign-in safely.`
                : `We sent a code to ${email}.`}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
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
            <Button type="submit" disabled={submitting || code.length !== 6} className="w-full h-11 rounded-full">
              {submitting ? 'Linking…' : 'Link account'}
            </Button>
            <button
              type="button"
              onClick={() => navigate('/signin', { replace: true })}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
