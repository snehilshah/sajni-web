import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Sun, BookOpen, CheckSquare, Target, Film, FileText, Hash,
  BarChart3, Menu, X, PanelLeftClose, PanelLeft, Moon, LogOut, Wallet,
  MessageSquare, Sparkles,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import CommandPalette from '@/components/CommandPalette';
import AIChat from '@/components/AIChat';

// Today is the home; Memos sits below Journal — same nav order as the design.
const navItems = [
  { path: '/', label: 'Today', icon: Sun },
  { path: '/memos', label: 'Memos', icon: Sparkles },
  { path: '/journal', label: 'Journal', icon: BookOpen },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare },
  { path: '/habits', label: 'Habits', icon: Target },
  { path: '/notes', label: 'Notes', icon: FileText },
  { path: '/media', label: 'Media', icon: Film },
  { path: '/finance', label: 'Finance', icon: Wallet },
  { path: '/tags', label: 'Tags', icon: Hash },
  { path: '/analytics', label: 'Insights', icon: BarChart3 },
];

const SIDEBAR_KEY = 'sajni:sidebar-expanded';
const THEME_KEY = 'sajni:theme';

export default function Layout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) !== '0'; } catch { return true; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch { return 'light'; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, expanded ? '1' : '0'); } catch {}
  }, [expanded]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <>
      {/* Atmospheric backdrop — sits behind everything else. */}
      <div className="sajni-mesh" aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen text-foreground">
        {/* Mobile menu button — sits inside the safe-area inset, with a
            solid background so it never visually clashes with content
            behind it. Hidden when the sidebar drawer is open (the
            sidebar's own X button is what closes it). */}
        {!mobileOpen && (
          <button
            className="md:hidden fixed top-3 left-3 z-50 size-10 rounded-lg flex items-center justify-center bg-card border border-border shadow-sm text-foreground"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        )}

        <aside
          className={`
            ${expanded ? 'w-[216px]' : 'w-16'}
            h-screen flex flex-col py-4 px-2.5 shrink-0
            transition-[width] duration-200 ease-out
            fixed md:sticky top-0 z-40
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            md:glass
            bg-sidebar md:bg-transparent
            border-r border-border md:border-r-0
            shadow-2xl md:shadow-none
          `}
        >
          {/* Mobile-only close button (in-rail, near the top) */}
          {mobileOpen && (
            <button
              className="md:hidden absolute top-3 right-3 size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
          )}
          {/* Brand — orb + name */}
          <div className={`flex items-center gap-2.5 px-1.5 mb-3.5 ${expanded ? '' : 'justify-center'}`}>
            <div className="sajni-orb" />
            {expanded && (
              <div className="overflow-hidden">
                <div className="serif text-[17px] font-semibold leading-tight tracking-tight">Sajni</div>
                <div className="mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mt-0.5">second brain</div>
              </div>
            )}
          </div>

          {/* Search trigger — "Ask anything" pill (⌘K). */}
          {(() => {
            const trigger = (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('palette:open'))}
                className={`group flex items-center gap-2.5 mb-3.5 ${expanded ? 'px-2.5' : 'justify-center'} h-9 rounded-lg border border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/80 transition-colors w-full`}
                title="Search · ⌘K"
                aria-label="Search"
              >
                <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="7" cy="7" r="5" /><path d="M14 14L11 11" strokeLinecap="round" />
                </svg>
                {expanded && (
                  <>
                    <span className="flex-1 text-left text-[13px]">Ask anything</span>
                    <kbd className="mono text-[10px] px-1.5 py-px rounded border border-border/60 bg-background/40">⌘K</kbd>
                  </>
                )}
              </button>
            );
            if (expanded) return trigger;
            return (
              <Tooltip>
                <TooltipTrigger render={trigger} />
                <TooltipContent side="right" className="text-xs">Ask anything · ⌘K</TooltipContent>
              </Tooltip>
            );
          })()}

          {/* AI sidebar chat trigger */}
          {(() => {
            const trigger = (
              <button
                onClick={() => setAiChatOpen(true)}
                className={`group flex items-center gap-2.5 mb-3 ${expanded ? 'px-2.5' : 'justify-center'} h-9 rounded-lg text-[13px] text-muted-foreground hover:bg-muted/60 transition-colors`}
                title="Ask Sajni"
                aria-label="Ask Sajni"
              >
                <MessageSquare className="size-3.5 shrink-0" />
                {expanded && (
                  <>
                    <span className="flex-1 text-left">Ask Sajni</span>
                    <span className="mono text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-primary/15 text-primary inline-flex items-center gap-1">
                      <Sparkles className="size-2.5" /> AI
                    </span>
                  </>
                )}
              </button>
            );
            if (expanded) return trigger;
            return (
              <Tooltip>
                <TooltipTrigger render={trigger} />
                <TooltipContent side="right" className="text-xs">Ask Sajni · AI</TooltipContent>
              </Tooltip>
            );
          })()}

          {/* Nav */}
          <nav className="flex flex-col gap-0.5 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === '/'
                ? location.pathname === '/'
                : location.pathname === item.path || location.pathname.startsWith(item.path + '/');

              const link = (
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={`flex items-center gap-3 ${expanded ? 'px-3' : 'justify-center'} h-[38px] rounded-md text-[13px] font-medium tap-highlight-none
                    ${isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/80 hover:bg-foreground/5'}`}
                >
                  <Icon className="size-[15px] shrink-0" />
                  {expanded && <span className="truncate">{item.label}</span>}
                </NavLink>
              );

              if (expanded) return <div key={item.path}>{link}</div>;
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger render={link} />
                  <TooltipContent side="right" className="text-xs">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </nav>

          {/* Footer controls */}
          {expanded && user && (
            <div className="mb-1 px-2 text-[10px] text-muted-foreground/80 truncate" title={user.email}>
              {user.email}
            </div>
          )}
          <div className={`mt-2 flex items-center ${expanded ? 'justify-between' : 'flex-col gap-1'}`}>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="size-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="size-[15px]" /> : <Moon className="size-[15px]" />}
            </button>
            <button
              onClick={() => { void logout(); }}
              className="size-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-[15px]" />
            </button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="hidden md:flex size-9 rounded-lg items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
              aria-label="Toggle sidebar"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <PanelLeftClose className="size-[15px]" /> : <PanelLeft className="size-[15px]" />}
            </button>
          </div>
        </aside>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-30 md:hidden" onClick={() => setMobileOpen(false)} />
        )}

        <main className="flex-1 min-w-0 min-h-screen flex flex-col">
          <Outlet />
        </main>

        <CommandPalette />
        <AIChat open={aiChatOpen} onOpenChange={setAiChatOpen} />
      </div>
    </>
  );
}
