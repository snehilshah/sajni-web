import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LogOut, Search, Settings, Sparkles, Loader2,
} from '@/components/ui/icons';
import { PixelIcon } from '@/components/ui/pixel-icon';
import { useAuth } from '@/auth/AuthContext';
import CommandPalette from '@/components/CommandPalette';
import AIChat from '@/components/AIChat';
import Backdrop from '@/components/Backdrop';
import Onboarding from '@/components/Onboarding';
import { NAV_ITEMS, NavChromeContext, isActivePath } from '@/components/nav-chrome';
import { useIsMobile } from '@/hooks/use-mobile';
import { useKeyboardOpen } from '@/hooks/use-keyboard-open';
import { useMode, useDensity, useTheme } from '@/hooks/useThemePrefs';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function initialsFor(email?: string | null): string {
  const s = (email || '').trim();
  if (!s) return '·';
  return s.split('@')[0].slice(0, 2).toUpperCase();
}

function Avatar({
  size = 36, ring = false, label, onClick,
}: { size?: number; ring?: boolean; label: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      onClick={onClick}
      className="relative shrink-0 inline-flex items-center justify-center font-serif font-medium text-primary-foreground"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        fontSize: Math.max(11, size * 0.40),
        letterSpacing: '0.02em',
        background:
          'radial-gradient(circle at 30% 28%, hsl(var(--tertiary)) 0%, transparent 55%), radial-gradient(circle at 70% 72%, hsl(var(--secondary)) 0%, transparent 55%), linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)) 55%, hsl(var(--tertiary)))',
        boxShadow: ring
          ? '0 0 0 2px hsl(var(--background)), 0 0 0 3px hsl(var(--primary)), 0 6px 14px -6px hsl(var(--primary) / 0.5)'
          : 'inset 0 1px 0 hsl(0 0% 100% / 0.22), 0 3px 8px -3px hsl(var(--primary) / 0.5)',
        cursor: onClick ? 'pointer' : 'default',
        border: 0,
      }}
    >
      <span className="relative z-[1]">{label}</span>
    </Tag>
  );
}

function MenuRow({
  icon: Icon, label, hint, onClick, danger, disabled, spinning,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  spinning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || spinning}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left rounded-xl transition-colors',
        danger ? 'text-destructive hover:bg-[hsl(var(--error-container))]' : 'text-foreground/90 hover:bg-[hsl(var(--on-surface)/0.08)]',
        (disabled || spinning) && 'opacity-50 cursor-not-allowed',
      )}
    >
      <Icon className={cn('size-4 shrink-0', spinning && 'animate-spin')} />
      <span className="flex-1">{label}</span>
      {hint && <span className="mono text-xs text-muted-foreground tracking-[0.05em]">{hint}</span>}
    </button>
  );
}

function UserMenuBody({
  email, onOpenCommand, onOpenChat, onSettings, onSignOut, onAction, signingOut,
}: {
  email: string;
  onOpenCommand: () => void;
  onOpenChat: () => void;
  onSettings: () => void;
  onSignOut: () => void;
  onAction?: () => void;
  signingOut: boolean;
}) {
  const runAction = (action: () => void) => () => {
    onAction?.();
    action();
  };

  return (
    <div className="p-1">
      <div className="px-3 pt-3 pb-2 flex items-center gap-3">
        <Avatar size={40} ring label={email.slice(0, 2).toUpperCase()} />
        <div className="min-w-0">
          <div className="serif text-sm font-semibold leading-tight truncate">{email}</div>
          <div className="mono text-xs uppercase tracking-[0.18em] text-muted-foreground mt-1">signed in</div>
        </div>
      </div>
      <div className="sajni-sep my-2" />
      <MenuRow icon={Search} label="Search" hint="⌘K" onClick={runAction(onOpenCommand)} />
      <MenuRow icon={Sparkles} label="Ask Sajni" onClick={runAction(onOpenChat)} />
      <div className="sajni-sep my-2" />
      <MenuRow icon={Settings} label="Settings" onClick={runAction(onSettings)} />
      <MenuRow icon={signingOut ? Loader2 : LogOut} label={signingOut ? 'Signing out…' : 'Sign out'} danger spinning={signingOut} onClick={runAction(onSignOut)} />
    </div>
  );
}

// ─── Primary island (desktop) ────────────────────────────────────────────
// Icon-only destinations in one floating pill, avatar at the trailing end.
// Collapses away on scroll — the page's merged pill (PageChrome) exposes
// every destination through its title dropdown while this is gone.
function PrimaryBar({
  pathname, scrolled, userMenuContent, initials, accountMenuOpen, setAccountMenuOpen,
}: {
  pathname: string;
  scrolled: boolean;
  userMenuContent: ReactNode;
  initials: string;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (open: boolean) => void;
}) {
  return (
    <motion.div
      initial={false}
      // Height-only collapse; the pill inside fades in AFTER the stacked
      // heights settle so it never visibly travels (see PageChrome).
      animate={{ height: scrolled ? 0 : 'auto' }}
      transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
      className="relative z-40 shrink-0 overflow-hidden"
      style={{ pointerEvents: scrolled ? 'none' : 'auto' }}
      aria-hidden={scrolled}
    >
      <motion.div
        initial={false}
        animate={{ opacity: scrolled ? 0 : 1 }}
        transition={scrolled
          ? { duration: 0.12, ease: [0.2, 0, 0, 1] }
          : { duration: 0.18, ease: [0.2, 0, 0, 1], delay: 0.22 }}
        className="flex justify-center px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
      >
        <nav
          className="flex items-center gap-0.5 h-12 px-1.5 rounded-full bg-[hsl(var(--surface-container-low))] border border-[hsl(var(--outline-variant))] shadow-[var(--m3-elev-1)]"
          aria-label="Primary"
        >
          {NAV_ITEMS.map(({ path, label, icon, key }) => {
            const isActive = isActivePath(pathname, path);
            return (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                data-onboarding-key={key}
                title={label}
                aria-label={label}
                className={cn(
                  'relative size-10 inline-flex items-center justify-center rounded-full transition-colors',
                  isActive
                    ? 'text-[hsl(var(--on-secondary-container))]'
                    : 'text-foreground/80 hover:bg-[hsl(var(--on-surface)/0.08)]',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="primary-active"
                    className="absolute inset-0 rounded-full bg-[hsl(var(--secondary-container))]"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <PixelIcon name={icon} solid={isActive} className="size-[19px] relative z-10" />
              </NavLink>
            );
          })}
          <span className="w-px h-5 mx-1 bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
          <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
            <DropdownMenuTrigger
              render={
                <button className="rounded-full mr-0.5" title="Account" aria-label="Account">
                  <Avatar size={30} label={initials} />
                </button>
              }
            />
            <DropdownMenuContent align="end" sideOffset={10} className="w-[280px]">
              {userMenuContent}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </motion.div>
    </motion.div>
  );
}

// ─── Corner search island (desktop) ──────────────────────────────────────
function SearchIsland({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      className="fixed z-50 hidden md:block"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: 16 }}
    >
      <button
        onClick={onOpen}
        className="h-12 px-4 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--surface-container-high))] border border-[hsl(var(--outline-variant))] shadow-[var(--m3-elev-2)] text-muted-foreground hover:bg-[hsl(var(--surface-container-highest))] transition-colors text-sm"
        title="Ask anything · ⌘K"
        aria-label="Ask anything"
      >
        <Search className="size-[18px]" />
        <span className="kbd hidden lg:inline">⌘K</span>
      </button>
    </div>
  );
}

// ─── Bottom dock (mobile) ────────────────────────────────────────────────
// Always visible: nav must stay in thumb reach. Icons scroll horizontally
// when they overflow; search + avatar are pinned at the trailing edge.
function BottomDock({
  pathname, hidden, onOpenCommand, userMenuContent, initials, accountMenuOpen, setAccountMenuOpen,
}: {
  pathname: string;
  hidden: boolean;
  onOpenCommand: () => void;
  userMenuContent: ReactNode;
  initials: string;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (open: boolean) => void;
}) {
  return (
    <motion.div
      initial={false}
      // Slides fully off-screen while the keyboard is up so typing gets
      // the whole shortened viewport.
      animate={{ y: hidden ? 96 : 0, opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      className="fixed inset-x-0 z-50 md:hidden flex justify-center px-3 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
    >
      <nav
        className="pointer-events-auto flex items-center gap-0.5 h-14 max-w-full pl-1.5 pr-2 rounded-full bg-[hsl(var(--surface-container-high))] border border-[hsl(var(--outline-variant))] shadow-[var(--m3-elev-3)]"
        aria-label="Primary"
      >
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {NAV_ITEMS.map(({ path, label, icon }) => {
            const isActive = isActivePath(pathname, path);
            return (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                title={label}
                aria-label={label}
                className={cn(
                  'relative size-11 shrink-0 inline-flex items-center justify-center rounded-full transition-colors',
                  isActive
                    ? 'text-[hsl(var(--on-secondary-container))]'
                    : 'text-foreground/80 active:bg-[hsl(var(--on-surface)/0.08)]',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="dock-active"
                    className="absolute inset-1 rounded-full bg-[hsl(var(--secondary-container))]"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <PixelIcon name={icon} solid={isActive} className="size-[20px] relative z-10" />
              </NavLink>
            );
          })}
        </div>
        <span className="w-px h-5 mx-0.5 bg-[hsl(var(--outline-variant))] shrink-0" aria-hidden="true" />
        <button
          onClick={onOpenCommand}
          className="size-11 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground active:bg-[hsl(var(--on-surface)/0.08)] transition-colors"
          title="Ask anything"
          aria-label="Ask anything"
        >
          <Search className="size-[19px]" />
        </button>
        <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <DropdownMenuTrigger
            render={
              <button className="rounded-full shrink-0" title="Account" aria-label="Account">
                <Avatar size={30} label={initials} />
              </button>
            }
          />
          <DropdownMenuContent align="end" side="top" sideOffset={12} className="w-[280px]">
            {userMenuContent}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </motion.div>
  );
}

// ─── Layout root ────────────────────────────────────────────────────────
// Islands architecture: floating primary icon pill (desktop top / mobile
// bottom dock), page-owned secondary pill (PageShell), corner search
// island. On scroll the primary + secondary bars merge into one condensed
// pill — pages report scroll through NavChromeContext.
export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const keyboardOpen = useKeyboardOpen(isMobile);
  useMode();
  useDensity();
  useTheme();

  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { setScrolled(false); }, [location.pathname]);
  const chromeCtx = useMemo(() => ({ scrolled, setScrolled }), [scrolled]);

  useEffect(() => { setAccountMenuOpen(false); }, [location.pathname]);

  const email = user?.email || 'sign in';
  const initials = useMemo(() => initialsFor(user?.email), [user]);

  const openCommand = () => window.dispatchEvent(new CustomEvent('palette:open'));

  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await logout(); }
    finally { setSigningOut(false); }
  };

  const userMenuBody = (
    <UserMenuBody
      email={email}
      onOpenCommand={openCommand}
      onOpenChat={() => setAiChatOpen(true)}
      onSettings={() => navigate('/settings')}
      onSignOut={onSignOut}
      onAction={() => setAccountMenuOpen(false)}
      signingOut={signingOut}
    />
  );

  return (
    <>
      <Backdrop />

      <div className="relative z-10 flex flex-col h-[100dvh] overflow-hidden text-foreground">
        <SearchIsland onOpen={openCommand} />

        {!isMobile && (
          <PrimaryBar
            pathname={location.pathname}
            scrolled={scrolled}
            userMenuContent={userMenuBody}
            initials={initials}
            accountMenuOpen={accountMenuOpen}
            setAccountMenuOpen={setAccountMenuOpen}
          />
        )}

        <NavChromeContext.Provider value={chromeCtx}>
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
            <Outlet />
          </main>
        </NavChromeContext.Provider>

        {isMobile && (
          <BottomDock
            pathname={location.pathname}
            hidden={keyboardOpen}
            onOpenCommand={openCommand}
            userMenuContent={userMenuBody}
            initials={initials}
            accountMenuOpen={accountMenuOpen}
            setAccountMenuOpen={setAccountMenuOpen}
          />
        )}

        <CommandPalette />
        <AIChat open={aiChatOpen} onOpenChange={setAiChatOpen} />
        <Onboarding />
      </div>
    </>
  );
}
