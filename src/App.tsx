import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import TodayPage from './pages/TodayPage';
import MemosPage from './pages/MemosPage';
import JournalPage from './pages/JournalPage';
import TasksPage from './pages/TasksPage';
import HabitsPage from './pages/HabitsPage';
import MediaPage from './pages/MediaPage';
import NotesPage from './pages/NotesPage';
import TagsPage from './pages/TagsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import FinancePage from './pages/Finance/FinancePage';
import LoginPage from './pages/Auth/Login';
import RegisterPage from './pages/Auth/Register';
import { AuthProvider, useAuth } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

// Redirects already-authenticated users away from /login and /register.
function PublicOnly({ children }: { children: React.ReactNode }) {
	const { user, loading } = useAuth();
	if (loading) return null;
	if (user) return <Navigate to="/" replace />;
	return <>{children}</>;
}

export default function App() {
	return (
		<AuthProvider>
			<TooltipProvider>
				<Toaster richColors closeButton position="bottom-right" />
				{/* prettier-ignore */}
				<Routes>
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/" element={<TodayPage />} />
            <Route path="/memos" element={<MemosPage />} />
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
          </Route>
        </Routes>
			</TooltipProvider>
		</AuthProvider>
	);
}
