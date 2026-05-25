import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import TodayPage from './pages/TodayPage';
import MemosPage from './pages/MemosPage';
import ThinkingPage from './pages/ThinkingPage';
import ThinkingProjectPage from './pages/ThinkingProjectPage';
import JournalPage from './pages/JournalPage';
import TasksPage from './pages/TasksPage';
import HabitsPage from './pages/HabitsPage';
import MediaPage from './pages/MediaPage';
import NotesPage from './pages/NotesPage';
import TagsPage from './pages/TagsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import InsightsPage from './pages/InsightsPage';
import FinancePage from './pages/Finance/FinancePage';
import SettingsPage from './pages/SettingsPage';
import SignInPage from './pages/Auth/SignIn';
import OAuthDonePage from './pages/Auth/OAuthDone';
import LinkChallengePage from './pages/Auth/LinkChallenge';
import { AuthProvider, useAuth } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { M3Shapes } from '@/components/ui/shapes';
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

export default function App() {
	return (
		<AuthProvider>
			<ThemeProvider>
			<TooltipProvider>
				<M3Shapes />
				<Toaster richColors closeButton position="bottom-right" />
				<TweaksPanel />
				{/* prettier-ignore */}
				<Routes>
          <Route path="/signin" element={<PublicOnly><SignInPage /></PublicOnly>} />
          {/* Legacy paths fold into /signin so old bookmarks still work. */}
          <Route path="/login" element={<Navigate to="/signin" replace />} />
          <Route path="/register" element={<Navigate to="/signin" replace />} />
          {/* OAuth callback handoff (token in URL fragment). */}
          <Route path="/auth/done" element={<OAuthDonePage />} />
          {/* TOTP-link challenge after an unverified-email provider collision. */}
          <Route path="/auth/link" element={<LinkChallengePage />} />
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
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      <Analytics />
      <SpeedInsights />
			</TooltipProvider>
			</ThemeProvider>
		</AuthProvider>
	);
}
