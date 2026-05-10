import { useState, type SubmitEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

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

	const title = mode === 'login' ? 'Welcome back' : 'Create your account';
	const submitLabel = mode === 'login' ? 'Sign in' : 'Create account';
	const altPath = mode === 'login' ? '/register' : '/login';
	const altLabel = mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in';

	return (
		<div className="min-h-screen flex items-center justify-center bg-background px-4">
			<div className="w-full max-w-sm">
				<div className="mb-8 text-center">
					<div className="mx-auto mb-3 size-10 rounded-md bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-serif font-semibold text-base">
						S
					</div>
					<h1 className="font-serif text-2xl font-semibold tracking-tight">{title}</h1>
					<p className="mt-1 text-xs text-muted-foreground tracking-widest uppercase">Sajni · second brain</p>
				</div>
				<form onSubmit={onSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
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
						<Label htmlFor="password">Password</Label>
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
						<div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
							{error}
						</div>
					)}
					<Button type="submit" disabled={submitting} className="w-full">
						{submitting ? 'Working…' : submitLabel}
					</Button>
				</form>
				<div className="mt-6 text-center">
					<Link to={altPath} className="text-xs text-muted-foreground hover:text-foreground">
						{altLabel}
					</Link>
				</div>
			</div>
		</div>
	);
}
