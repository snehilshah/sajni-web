import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Sun, BookOpen, CheckSquare, Target, Film, FileText, Hash, BarChart3,
  PanelLeftClose, PanelLeft, Moon, LogOut, Wallet, MessageSquare, Sparkles,
  Search, Layers, Loader2, Bell, Settings,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import CommandPalette from '@/components/CommandPalette';
import AIChat from '@/components/AIChat';

// One nav order, two presentations. Mobile picks 4 primary items + More;
// desktop shows the rail with everything.
const NAV_ITEMS = [
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

// Right-handed thumbs reach the right side — keep the most-used four
// there. "More" is in the rightmost slot for one-thumb expansion.
const MOBILE_PRIMARY = new Set(['/memos', '/journal', '/', '/tasks']);

const SIDEBAR_KEY = 'sajni:sidebar-expanded';
const THEME_KEY = 'sajni:theme';

function useIsMobile() {
  const [m, setM] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const on = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

function initialsFor(email?: string | null, name?: string | null): string {
  const s = (name || email || '').trim();
  if (!s) return '·';
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  // From email — first two letters of the local-part.
  return s.split('@')[0].slice(0, 2).toUpperCase();
}

// Gradient + grain avatar — same look as the design's sage/amber orb,
// with the user's initials punched in.
function Avatar({
  size = 36, ring = false, label, onClick,
}: {
  size?: number;
  ring?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={onClick ? 'Account' : undefined}
      aria-label={onClick ? 'Account' : undefined}
      className="relative shrink-0 inline-flex items-center justify-center font-serif font-semibold text-primary-foreground"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        fontSize: Math.max(11, size * 0.38),
        letterSpacing: '0.02em',
        background:
          'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)) 60%, hsl(var(--secondary)))',
        boxShadow: ring
          ? '0 0 0 2px hsl(var(--background)), 0 0 0 3px hsl(var(--primary) / 0.4), 0 6px 18px -6px hsl(var(--primary) / 0.6)'
          : 'inset 0 1px 0 hsl(0 0% 100% / 0.18), 0 4px 12px -4px hsl(var(--primary) / 0.5)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span className="relative z-[1]">{label}</span>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full pointer-events-none opacity-50 mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/></svg>\")",
        }}
      />
    </button>
  );
}

interface MenuProps {
  isMobile: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  onOpenCommand: () => void;
  email: string;
  initials: string;
}

function UserMenu({ isMobile, onClose, theme, setTheme, onOpenCommand, email, initials }: MenuProps) {
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      // logout navigates away; if it fails, reset so the user can retry.
      setSigningOut(false);
      onClose();
    }
  };

  const ThemeIcon = theme === 'dark' ? Sun : Moon;
  const themeLabel = theme === 'dark' ? 'Light mode' : 'Dark mode';

  const content = (
    <>
      <div className="flex items-center gap-3 px-1 pt-1 pb-3">
        <Avatar size={42} ring label={initials} />
        <div className="min-w-0">
          <div className="serif text-[15px] font-semibold leading-tight truncate">{email}</div>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
            Signed in
          </div>
        </div>
      </div>
      <div className="sajni-sep mb-1.5" />
      <MenuRow
        icon={ThemeIcon}
        label={themeLabel}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
      <MenuRow
        icon={Search}
        label="Search"
        hint="⌘K"
        onClick={() => { onClose(); onOpenCommand(); }}
      />
      <MenuRow icon={Bell} label="Notifications" disabled />
      <MenuRow icon={Settings} label="Account settings" disabled />
      <div className="sajni-sep my-1.5" />
      <MenuRow
        icon={signingOut ? Loader2 : LogOut}
        label={signingOut ? 'Signing out…' : 'Sign out'}
        danger
        spinning={signingOut}
        onClick={onSignOut}
      />
    </>
  );

  if (isMobile) {
    return (
      <>
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-[50] bg-foreground/30 backdrop-blur-[2px] fade-in"
          onClick={onClose}
        />
        <motion.div
          role="dialog"
          aria-label="Account menu"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          className="fixed left-0 right-0 bottom-0 z-[51] rounded-t-[22px] glass-strong px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom,0px))]"
          style={{ boxShadow: '0 -10px 40px -10px rgba(0,0,0,0.25)' }}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
          {content}
        </motion.div>
      </>
    );
  }

  return (
    <>
      <button
        aria-label="Close menu"
        className="fixed inset-0 z-[60]"
        onClick={onClose}
      />
      <div
        className="fixed bottom-[14px] left-[14px] z-[61] w-[260px] rounded-[14px] glass-strong p-3 fade-in"
        style={{ boxShadow: '0 20px 60px -16px rgba(0,0,0,0.35)' }}
      >
        {content}
      </div>
    </>
  );
}

function MenuRow({
  icon: Icon, label, hint, danger, disabled, spinning, onClick,
}: {
  icon: any;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  spinning?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || spinning}
      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-[10px] text-[13.5px] font-medium text-left transition-colors
        ${danger ? 'text-destructive' : 'text-foreground/85'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-foreground/5'}`}
    >
      <Icon className={`size-[15px] ${spinning ? 'animate-spin' : ''}`} />
      <span className="flex-1">{label}</span>
      {hint && (
        <span className="mono text-[10px] text-muted-foreground tracking-[0.05em]">{hint}</span>
      )}
    </button>
  );
}

// Desktop rail — no brand mark; user lives at the bottom.
function DesktopRail({
  expanded, setExpanded, onOpenCommand, onOpenChat, onOpenUserMenu, email, initials, pathname,
}: {
  expanded: boolean;
  setExpanded: (b: boolean) => void;
  onOpenCommand: () => void;
  onOpenChat: () => void;
  onOpenUserMenu: () => void;
  email: string;
  initials: string;
  pathname: string;
}) {
  const w = expanded ? 216 : 64;
  return (
    <aside
      className="h-screen sticky top-0 flex flex-col py-4 px-2.5 shrink-0 glass z-30"
      style={{ width: w, transition: 'width 240ms cubic-bezier(.22,.61,.36,1)' }}
    >
      {/* Ask anything — primary action up top */}
      {(() => {
        const trigger = (
          <button
            onClick={onOpenCommand}
            className={`mb-3 flex items-center gap-2.5 h-9 rounded-[10px] border border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/80 transition-colors w-full ${expanded ? 'px-2.5' : 'justify-center'}`}
            title="Search · ⌘K"
            aria-label="Search"
          >
            <Search className="size-3.5 shrink-0" />
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

      {/* Ask Sajni */}
      {(() => {
        const trigger = (
          <button
            onClick={onOpenChat}
            className={`mb-3 flex items-center gap-2.5 h-9 rounded-[10px] text-[13px] text-muted-foreground hover:bg-foreground/5 transition-colors ${expanded ? 'px-2.5' : 'justify-center'}`}
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
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.path === '/'
            ? pathname === '/'
            : pathname === item.path || pathname.startsWith(item.path + '/');

          const link = (
            <NavLink
              to={item.path}
              end={item.path === '/'}
              className={`relative flex items-center gap-3 h-[38px] rounded-[10px] text-[13px] font-medium transition-colors active:scale-[0.97] tap-highlight-none
                ${expanded ? 'px-3' : 'justify-center'}
                ${isActive ? 'text-primary-foreground' : 'text-foreground/80 hover:bg-foreground/5'}`}
            >
              {isActive && (
                <motion.span
                  layoutId="rail-active-pill"
                  className="absolute inset-0 rounded-[10px] bg-primary -z-0 shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.6)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className="size-[15px] shrink-0 relative z-10" />
              {expanded && <span className="truncate relative z-10">{item.label}</span>}
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

      {/* User identity + collapse toggle */}
      <div className="mt-2 pt-2.5 border-t border-border/50">
        {expanded ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenUserMenu}
              className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 rounded-[10px] text-left hover:bg-foreground/5 transition-colors"
              title="Account"
            >
              <Avatar size={30} label={initials} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold leading-tight truncate">{email}</div>
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground mt-0.5">
                  Account
                </div>
              </div>
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="size-[30px] rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0"
              title="Collapse"
            >
              <PanelLeftClose className="size-[14px]" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Avatar size={30} label={initials} onClick={onOpenUserMenu} />
            <button
              onClick={() => setExpanded(true)}
              className="size-[30px] rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
              title="Expand"
            >
              <PanelLeft className="size-[14px]" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// Mobile bottom tab bar.
function MobileTabBar({
  pathname, onMore,
}: {
  pathname: string;
  onMore: () => void;
}) {
  const primary = NAV_ITEMS.filter((i) => MOBILE_PRIMARY.has(i.path));
  return (
    <nav
      aria-label="Primary"
      className="fixed left-0 right-0 bottom-0 z-30 grid grid-cols-5 items-stretch px-2 backdrop-blur-[22px] saturate-[1.2] border-t border-border/70"
      style={{
        background: 'color-mix(in oklch, hsl(var(--card)) 82%, transparent)',
        height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {primary.map((item) => {
        const Icon = item.icon;
        const isActive = item.path === '/'
          ? pathname === '/'
          : pathname === item.path || pathname.startsWith(item.path + '/');
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className="relative flex flex-col items-center justify-center gap-[3px] py-1.5 transition-colors text-muted-foreground aria-[current=page]:text-primary"
            aria-selected={isActive}
          >
            <motion.span
              className="absolute top-1.5 w-[18px] h-[3px] rounded-full bg-primary"
              animate={{ opacity: isActive ? 1 : 0 }}
              transition={{ duration: 0.2 }}
            />
            <Icon className="size-5" />
            <span className="text-[10.5px] font-medium leading-none">{item.label}</span>
          </NavLink>
        );
      })}
      <button
        onClick={onMore}
        className="relative flex flex-col items-center justify-center gap-[3px] py-1.5 text-muted-foreground"
        aria-label="More"
      >
        <Layers className="size-5" />
        <span className="text-[10.5px] font-medium leading-none">More</span>
      </button>
    </nav>
  );
}

function MoreSheet({
  pathname, items, onClose, onOpenCommand, onOpenChat,
}: {
  pathname: string;
  items: typeof NAV_ITEMS;
  onClose: () => void;
  onOpenCommand: () => void;
  onOpenChat: () => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <button
        aria-label="Close"
        className="fixed inset-0 z-[50] bg-foreground/30 backdrop-blur-[2px] fade-in"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-label="More"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
        className="fixed left-0 right-0 bottom-0 z-[51] rounded-t-[22px] glass-strong px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom,0px))]"
        style={{ boxShadow: '0 -10px 40px -10px rgba(0,0,0,0.25)' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => { onClose(); onOpenCommand(); }}
            className="flex-1 h-10 rounded-[10px] inline-flex items-center justify-center gap-2 border border-border/60 bg-muted/40 text-[13px]"
          >
            <Search className="size-3.5" /> Search
          </button>
          <button
            onClick={() => { onClose(); onOpenChat(); }}
            className="flex-1 h-10 rounded-[10px] inline-flex items-center justify-center gap-2 bg-primary/15 text-primary text-[13px]"
          >
            <Sparkles className="size-3.5" /> Ask Sajni
          </button>
        </div>

        <div className="mono text-[10.5px] tracking-[0.22em] uppercase text-muted-foreground px-1 pb-2">
          More places
        </div>
        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
            return (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); onClose(); }}
                className={`flex flex-col items-center justify-center gap-2 px-1.5 py-4 rounded-xl text-[12px] font-medium transition-colors
                  ${isActive
                    ? 'bg-primary/15 border border-primary/40 text-primary'
                    : 'bg-muted/40 border border-border/60 text-foreground/85'}`}
              >
                <Icon className="size-5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}

export default function Layout() {
  const location = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) !== '0'; } catch { return true; }
  });
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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

  // Close mobile menus on route change.
  useEffect(() => {
    setMoreOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  // Esc closes overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMoreOpen(false); setUserMenuOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const email = user?.email || 'sign in';
  const initials = useMemo(() => initialsFor(user?.email, null), [user]);

  const overflowItems = NAV_ITEMS.filter((i) => !MOBILE_PRIMARY.has(i.path));

  const openCommand = () => window.dispatchEvent(new CustomEvent('palette:open'));

  return (
    <>
      <div className="sajni-mesh" aria-hidden="true" />

      <div className="relative z-10 flex min-h-[100dvh] text-foreground">
        {!isMobile && (
          <DesktopRail
            expanded={expanded}
            setExpanded={setExpanded}
            onOpenCommand={openCommand}
            onOpenChat={() => setAiChatOpen(true)}
            onOpenUserMenu={() => setUserMenuOpen(true)}
            email={email}
            initials={initials}
            pathname={location.pathname}
          />
        )}

        <main
          className="flex-1 min-w-0 min-h-[100dvh] flex flex-col"
          style={
            isMobile
              ? { paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }
              : undefined
          }
        >
          <Outlet />
        </main>

        {isMobile && (
          <>
            {/* Floating top-right avatar */}
            <div
              className="fixed right-3.5 z-40"
              style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))' }}
            >
              <Avatar size={40} ring label={initials} onClick={() => setUserMenuOpen(true)} />
            </div>
            <MobileTabBar pathname={location.pathname} onMore={() => setMoreOpen(true)} />
          </>
        )}

        <AnimatePresence>
          {moreOpen && (
            <MoreSheet
              pathname={location.pathname}
              items={overflowItems}
              onClose={() => setMoreOpen(false)}
              onOpenCommand={openCommand}
              onOpenChat={() => setAiChatOpen(true)}
            />
          )}
          {userMenuOpen && (
            <UserMenu
              isMobile={isMobile}
              onClose={() => setUserMenuOpen(false)}
              theme={theme}
              setTheme={setTheme}
              onOpenCommand={openCommand}
              email={email}
              initials={initials}
            />
          )}
        </AnimatePresence>

        <CommandPalette />
        <AIChat open={aiChatOpen} onOpenChange={setAiChatOpen} />
      </div>
    </>
  );
}
