import { useState, type SubmitEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import Backdrop from '@/components/Backdrop';

interface AuthFormProps {
  mode: 'login' | 'register';
}

export default function AuthForm({ mode }: AuthFormProps) {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === 'login' ? 'Welcome back.' : 'Begin the codex.';
  const subtitle = mode === 'login'
    ? 'Sign in to your second brain.'
    : 'Create an account to start writing.';
  const submitLabel = mode === 'login' ? 'Sign in' : 'Create account';
  const altPath = mode === 'login' ? '/register' : '/login';
  const altLabel = mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in';

  return (
    <>
      <Backdrop />
      <div className="relative z-10 min-h-[100dvh] grid md:grid-cols-2">
        {/* Hero left — Codex frontispiece */}
        <div className="hidden md:flex flex-col justify-between p-12 border-r border-border">
          <div className="flex items-center gap-3">
            <span className="sajni-orb" aria-hidden="true" />
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

        {/* Form right */}
        <div className="flex items-center justify-center px-5 py-12 md:py-0">
          <div className="w-full max-w-sm">
            {/* Mobile hero — compact */}
            <div className="md:hidden mb-8 flex items-center gap-3">
              <span className="sajni-orb" aria-hidden="true" />
              <div>
                <div className="serif text-[18px] font-semibold leading-tight">sajni</div>
                <div className="mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">codex</div>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="serif text-3xl font-semibold tracking-tight">{title}</h2>
              <p className="serif italic text-base text-muted-foreground mt-1">{subtitle}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                {mode === 'register' && <p className="text-[11px] text-muted-foreground">Minimum 8 characters.</p>}
              </div>
              {error && (
                <div className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Working…' : submitLabel}
              </Button>
            </form>
            <div className="mt-6 text-center">
              <Link to={altPath} className="text-xs text-muted-foreground hover:text-foreground border-b border-transparent hover:border-muted-foreground">
                {altLabel}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
