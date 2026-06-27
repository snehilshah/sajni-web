import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
// Pages are lazy route-level chunks so heavy per-page deps (recharts,
// tiptap, markdown) stay out of the boot bundle.
const TodayPage = lazy(() => import('./pages/TodayPage'));
const MemosPage = lazy(() => import('./pages/MemosPage'));
const ThinkingPage = lazy(() => import('./pages/ThinkingPage'));
const ThinkingProjectPage = lazy(() => import('./pages/ThinkingProjectPage'));
const JournalPage = lazy(() => import('./pages/JournalPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const HabitsPage = lazy(() => import('./pages/HabitsPage'));
const MediaPage = lazy(() => import('./pages/MediaPage'));
const NotesPage = lazy(() => import('./pages/NotesPage'));
const TagsPage = lazy(() => import('./pages/TagsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const FinancePage = lazy(() => import('./pages/Finance/FinancePage'));
const ShareCapturePage = lazy(() => import('./pages/Finance/ShareCapturePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SignInPage = lazy(() => import('./pages/Auth/SignIn'));
const OAuthDonePage = lazy(() => import('./pages/Auth/OAuthDone'));
const LinkChallengePage = lazy(() => import('./pages/Auth/LinkChallenge'));
import { AuthProvider, useAuth } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { TaskDetailProvider } from '@/components/tasks/TaskDetailProvider';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmRoot } from '@/lib/confirm';
import { M3Shapes, M3CookieLoader } from '@/components/ui/shapes';
import TweaksPanel from '@/components/TweaksPanel';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

// Redirects already-authenticated users away from /signin.
function PublicOnly({ children }: { children: React.ReactNode }) {
	const { user, loading } = useAuth();
	if (loading) return null;
	if (user) return <Navigate to="/" replace />;
	return <>{children}</>;
}

function AppLoader() {
	return (
		<div className="flex h-dvh items-center justify-center text-muted-foreground">
			<M3CookieLoader size="xl" tone="primary" />
		</div>
	);
}

export default function App() {
	return (
		<AuthProvider>
			<ThemeProvider>
			<TooltipProvider>
			<TaskDetailProvider>
				<M3Shapes />
				<Toaster richColors closeButton position="bottom-right" />
				<ConfirmRoot />
				<TweaksPanel />
				{/* prettier-ignore */}
				<Suspense fallback={<AppLoader />}>
				<Routes>
          <Route path="/signin" element={<PublicOnly><SignInPage /></PublicOnly>} />
          {/* Legacy paths fold into /signin so old bookmarks still work. */}
          <Route path="/login" element={<Navigate to="/signin" replace />} />
          <Route path="/register" element={<Navigate to="/signin" replace />} />
          {/* OAuth callback handoff (token in URL fragment). */}
          <Route path="/auth/done" element={<OAuthDonePage />} />
          {/* TOTP-link challenge after an unverified-email provider collision. */}
          <Route path="/auth/link" element={<LinkChallengePage />} />
          {/* PWA share target — captures a shared UPI message; gates auth itself
              (outside RequireAuth) so the shared text survives a login bounce. */}
          <Route path="/share-target" element={<ShareCapturePage />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/" element={<TodayPage />} />
            <Route path="/memos" element={<MemosPage />} />
            <Route path="/thinking" element={<ThinkingPage />} />
            <Route path="/thinking/:id" element={<ThinkingProjectPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/habits" element={<HabitsPage />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/finance" element={<FinancePage />} />
            <Route path="/finance/:tab" element={<FinancePage />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/tags/:tag" element={<TagsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            {/* Insights merged into Analytics as a tab. */}
            <Route path="/insights" element={<Navigate to="/analytics?tab=insights" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
				</Suspense>
      <Analytics />
      <SpeedInsights />
			</TaskDetailProvider>
			</TooltipProvider>
			</ThemeProvider>
		</AuthProvider>
	);
}
