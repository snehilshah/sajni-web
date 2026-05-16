import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen, Target, Film, FileText, Hash, BarChart3,
  PanelLeftClose, PanelLeft, LogOut, Wallet, MessageSquare, Sparkles,
  Search, Settings, Loader2, Home, ListChecks, MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import CommandPalette from '@/components/CommandPalette';
import AIChat from '@/components/AIChat';
import Backdrop from '@/components/Backdrop';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMode, useDensity, useTheme } from '@/hooks/useThemePrefs';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SIDEBAR_KEY = 'sajni:sidebar-expanded';

const NAV_ITEMS = [
  { path: '/',          label: 'Today',    Icon: Home },
  { path: '/notes',     label: 'Notes',    Icon: FileText },
  { path: '/tasks',     label: 'Tasks',    Icon: ListChecks },
  { path: '/journal',   label: 'Journal',  Icon: BookOpen },
  { path: '/memos',     label: 'Memos',    Icon: Sparkles },
  { path: '/habits',    label: 'Habits',   Icon: Target },
  { path: '/media',     label: 'Media',    Icon: Film },
  { path: '/finance',   label: 'Finance',  Icon: Wallet },
  { path: '/tags',      label: 'Tags',     Icon: Hash },
  { path: '/analytics', label: 'Insights', Icon: BarChart3 },
] as const;

const PRIMARY_MOBILE = new Set(['/', '/notes', '/tasks', '/journal']);

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
      {hint && <span className="mono text-[10px] text-muted-foreground tracking-[0.05em]">{hint}</span>}
    </button>
  );
}

function UserMenuBody({
  email, onOpenCommand, onOpenChat, onSettings, onSignOut, signingOut,
}: {
  email: string;
  onOpenCommand: () => void;
  onOpenChat: () => void;
  onSettings: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  return (
    <div className="p-1">
      <div className="px-3 pt-3 pb-2 flex items-center gap-3">
        <Avatar size={40} ring label={email.slice(0, 2).toUpperCase()} />
        <div className="min-w-0">
          <div className="serif text-sm font-semibold leading-tight truncate">{email}</div>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">signed in</div>
        </div>
      </div>
      <div className="sajni-sep my-2" />
      <MenuRow icon={Search} label="Search" hint="⌘K" onClick={onOpenCommand} />
      <MenuRow icon={Sparkles} label="Ask Sajni" onClick={onOpenChat} />
      <div className="sajni-sep my-2" />
      <MenuRow icon={Settings} label="Settings" onClick={onSettings} />
      <MenuRow icon={signingOut ? Loader2 : LogOut} label={signingOut ? 'Signing out…' : 'Sign out'} danger spinning={signingOut} onClick={onSignOut} />
    </div>
  );
}

// ─── Desktop rail (≥768px) ──────────────────────────────────────────────
// IMPORTANT: NavLinks are always mounted (never conditionally wrapped).
// Conditional wrappers were re-mounting NavLink on every collapse/expand
// toggle, which restarted page-fade-in / layoutId animations.
function DesktopRail({
  expanded, setExpanded, onOpenCommand, onOpenChat, userMenuContent, initials, pathname,
}: {
  expanded: boolean;
  setExpanded: (b: boolean) => void;
  onOpenCommand: () => void;
  onOpenChat: () => void;
  userMenuContent: ReactNode;
  initials: string;
  pathname: string;
}) {
  const w = expanded ? 232 : 76;
  return (
    <aside
      className="hidden md:flex h-[100dvh] sticky top-0 flex-col py-4 px-3 shrink-0 bg-[hsl(var(--surface-container-low))] border-r border-[hsl(var(--outline-variant))] z-30"
      style={{ width: w, transition: 'width 280ms cubic-bezier(0.2, 0, 0, 1)' }}
    >
      {/* Brand removed from rail — shown at bottom of SettingsPage instead. */}

      <button
        onClick={onOpenCommand}
        className={cn(
          'mb-2 h-11 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--surface-container))] text-muted-foreground hover:bg-[hsl(var(--surface-container-high))] transition-colors text-sm',
          expanded ? 'px-3.5' : 'w-11 justify-center self-center',
        )}
        title="Ask anything · ⌘K"
        aria-label="Ask anything"
      >
        <Search className="size-[18px] shrink-0" />
        {expanded && (
          <>
            <span className="flex-1 text-left">Ask anything</span>
            <span className="kbd">⌘K</span>
          </>
        )}
      </button>

      <button
        onClick={onOpenChat}
        className={cn(
          'mb-4 h-11 inline-flex items-center gap-2 rounded-full text-sm text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.06)] transition-colors',
          expanded ? 'px-3.5' : 'w-11 justify-center self-center',
        )}
        aria-label="Ask Sajni"
      >
        <MessageSquare className="size-[18px] shrink-0" />
        {expanded && (
          <>
            <span className="flex-1 text-left">Ask Sajni</span>
            <span className="mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))] rounded-full inline-flex items-center gap-1">
              <Sparkles className="size-2.5" /> AI
            </span>
          </>
        )}
      </button>

      {expanded && (
        <div className="mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground px-3 mb-1 mt-1">
          places
        </div>
      )}

      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto pr-0.5">
        {NAV_ITEMS.map(({ path, label, Icon }) => {
          const isActive = path === '/'
            ? pathname === '/'
            : pathname === path || pathname.startsWith(path + '/');
          return (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              title={!expanded ? label : undefined}
              className={cn(
                'relative flex items-center h-11 rounded-full text-sm font-medium transition-colors',
                expanded ? 'gap-3 px-3.5' : 'w-11 justify-center self-center',
                isActive
                  ? 'text-[hsl(var(--on-secondary-container))]'
                  : 'text-foreground/85 hover:bg-[hsl(var(--on-surface)/0.06)]',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="rail-active"
                  className="absolute inset-0 rounded-full bg-[hsl(var(--secondary-container))] -z-0"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className="size-[18px] shrink-0 relative z-10" strokeWidth={isActive ? 2.2 : 1.7} />
              {expanded && (
                <span className="truncate relative z-10">{label}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-2 pt-3 border-t border-[hsl(var(--outline-variant))]">
        {expanded ? (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 rounded-full text-left hover:bg-[hsl(var(--on-surface)/0.06)] transition-colors"
                    title="Account"
                  >
                    <Avatar size={28} label={initials} />
                    <div className="min-w-0 flex-1">
                      <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">account</div>
                    </div>
                  </button>
                }
              />
              <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-[280px]">
                {userMenuContent}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => setExpanded(false)}
              className="size-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.06)] transition-colors shrink-0"
              title="Collapse"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<button className="rounded-full"><Avatar size={32} label={initials} /></button>} />
              <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-[280px]">
                {userMenuContent}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => setExpanded(true)}
              className="size-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.06)] transition-colors"
              title="Expand"
            >
              <PanelLeft className="size-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Bottom tabbar (<768px) — M3 NavigationBar style ────────────────────
function TabbarMobile({ onMoreClick, pathname }: { onMoreClick: () => void; pathname: string }) {
  const tabs = NAV_ITEMS.filter((i) => PRIMARY_MOBILE.has(i.path));
  return (
    <nav className="tabbar md:hidden" aria-label="Primary">
      {tabs.map(({ path, label, Icon }) => {
        const isActive = path === '/'
          ? pathname === '/'
          : pathname === path || pathname.startsWith(path + '/');
        return (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            aria-selected={isActive}
            className={cn(
              'group relative flex flex-col items-center justify-center gap-1 px-1 py-2',
              'text-[10px] tracking-[0.02em] font-medium',
              isActive ? 'text-[hsl(var(--on-secondary-container))]' : 'text-muted-foreground',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'relative inline-flex items-center justify-center h-8 w-16 rounded-full transition-[background-color] duration-200',
                isActive ? 'bg-[hsl(var(--secondary-container))]' : 'bg-transparent',
              )}
            >
              <Icon className="size-[22px]" strokeWidth={isActive ? 2 : 1.6} />
            </span>
            <span>{label}</span>
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        className="flex flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] tracking-[0.02em] font-medium text-muted-foreground"
      >
        <span className="relative inline-flex items-center justify-center h-8 w-16 rounded-full">
          <MoreHorizontal className="size-[22px]" strokeWidth={1.6} />
        </span>
        <span>More</span>
      </button>
    </nav>
  );
}

// ─── Layout root ────────────────────────────────────────────────────────
export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  useMode();
  useDensity();
  useTheme();

  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) !== '0'; } catch { return true; }
  });
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, expanded ? '1' : '0'); } catch {}
  }, [expanded]);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const email = user?.email || 'sign in';
  const initials = useMemo(() => initialsFor(user?.email), [user]);

  const overflowItems = NAV_ITEMS.filter((i) => !PRIMARY_MOBILE.has(i.path));
  const openCommand = () => window.dispatchEvent(new CustomEvent('palette:open'));

  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await logout(); }
    finally {
      setSigningOut(false);
      setMoreOpen(false);
    }
  };

  const goSettings = () => navigate('/settings');

  const userMenuBody = (
    <UserMenuBody
      email={email}
      onOpenCommand={openCommand}
      onOpenChat={() => setAiChatOpen(true)}
      onSettings={goSettings}
      onSignOut={onSignOut}
      signingOut={signingOut}
    />
  );

  return (
    <>
      <Backdrop />

      <div className="relative z-10 flex min-h-[100dvh] text-foreground">
        <DesktopRail
          expanded={expanded}
          setExpanded={setExpanded}
          onOpenCommand={openCommand}
          onOpenChat={() => setAiChatOpen(true)}
          userMenuContent={userMenuBody}
          initials={initials}
          pathname={location.pathname}
        />

        <main
          className="flex-1 min-w-0 min-h-[100dvh] flex flex-col"
          style={
            isMobile
              ? { paddingBottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px))' }
              : undefined
          }
        >
          <Outlet />
        </main>

        {isMobile && (
          <>
            <TabbarMobile pathname={location.pathname} onMoreClick={() => setMoreOpen(true)} />

            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetContent
                side="bottom"
                className="max-h-[92dvh] overflow-y-auto px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
              >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[hsl(var(--outline))]" aria-hidden="true" />

                <div className="flex items-center gap-3 px-3 pb-3">
                  <Avatar size={44} ring label={initials} />
                  <div className="min-w-0">
                    <div className="serif text-base font-semibold leading-tight truncate">{email}</div>
                    <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">signed in</div>
                  </div>
                </div>

                <div className="flex gap-2 px-3 mb-4">
                  <button
                    onClick={() => { setMoreOpen(false); openCommand(); }}
                    className="flex-1 h-12 inline-flex items-center justify-center gap-2 rounded-full bg-[hsl(var(--surface-container-high))] text-sm font-medium"
                  >
                    <Search className="size-4" /> Search
                  </button>
                  <button
                    onClick={() => { setMoreOpen(false); setAiChatOpen(true); }}
                    className="flex-1 h-12 inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground text-sm font-medium"
                  >
                    <Sparkles className="size-4" /> Ask Sajni
                  </button>
                </div>

                <div className="px-3">
                  <div className="mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground pb-2">places</div>
                  <div className="grid grid-cols-3 gap-2">
                    {overflowItems.map(({ path, label, Icon }) => {
                      const isActive = location.pathname === path || location.pathname.startsWith(path + '/');
                      return (
                        <button
                          key={path}
                          onClick={() => { navigate(path); setMoreOpen(false); }}
                          className={cn(
                            'flex flex-col items-center justify-center gap-2 px-1.5 py-4 text-xs font-medium rounded-2xl transition-colors',
                            isActive
                              ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                              : 'bg-[hsl(var(--surface-container))] text-foreground/85 hover:bg-[hsl(var(--surface-container-high))]',
                          )}
                        >
                          <Icon className="size-5" strokeWidth={isActive ? 2 : 1.7} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sajni-sep my-4" />

                <div className="px-3 flex items-center gap-2">
                  <button
                    onClick={() => { setMoreOpen(false); goSettings(); }}
                    className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-full bg-[hsl(var(--surface-container-high))] text-sm font-medium"
                  >
                    <Settings className="size-4" /> Settings
                  </button>
                  <button
                    onClick={onSignOut}
                    disabled={signingOut}
                    className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-full bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))] text-sm font-medium disabled:opacity-50"
                  >
                    {signingOut ? <M3CookieLoader size="sm" tone="primary" className="!bg-[hsl(var(--on-error-container))]" /> : <LogOut className="size-4" />}
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}

        <CommandPalette />
        <AIChat open={aiChatOpen} onOpenChange={setAiChatOpen} />
      </div>
    </>
  );
}
