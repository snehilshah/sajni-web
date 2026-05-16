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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
      className="relative shrink-0 inline-flex items-center justify-center font-serif italic text-primary-foreground"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        fontSize: Math.max(11, size * 0.42),
        letterSpacing: '0.02em',
        background:
          'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)) 60%, hsl(var(--primary) / 0.7))',
        boxShadow: ring
          ? '0 0 0 2px hsl(var(--background)), 0 0 0 3px hsl(var(--foreground)), 0 6px 14px -6px hsl(var(--foreground) / 0.5)'
          : 'inset 0 1px 0 hsl(0 0% 100% / 0.18), 0 3px 8px -3px hsl(var(--primary) / 0.5)',
        cursor: onClick ? 'pointer' : 'default',
        border: 0,
      }}
    >
      <span className="relative z-[1]">{label}</span>
    </Tag>
  );
}

// ─── Shared menu body ───────────────────────────────────────────────────
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
        'w-full flex items-center gap-3 px-2.5 py-2 text-[13px] text-left transition-colors',
        danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground/85 hover:bg-foreground/5',
        (disabled || spinning) && 'opacity-50 cursor-not-allowed',
      )}
    >
      <Icon className={cn('size-[15px] shrink-0', spinning && 'animate-spin')} />
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
        <Avatar size={36} ring label={email.slice(0, 2).toUpperCase()} />
        <div className="min-w-0">
          <div className="serif text-[14px] font-semibold leading-tight truncate">{email}</div>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">signed in</div>
        </div>
      </div>
      <div className="sajni-sep my-1.5" />
      <MenuRow icon={Search} label="Search" hint="⌘K" onClick={onOpenCommand} />
      <MenuRow icon={Sparkles} label="Ask Sajni" onClick={onOpenChat} />
      <div className="sajni-sep my-1.5" />
      <MenuRow icon={Settings} label="Settings" onClick={onSettings} />
      <MenuRow icon={signingOut ? Loader2 : LogOut} label={signingOut ? 'Signing out…' : 'Sign out'} danger spinning={signingOut} onClick={onSignOut} />
    </div>
  );
}

// ─── Desktop rail (≥768px) ──────────────────────────────────────────────
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
  const w = expanded ? 224 : 64;
  return (
    <aside
      className="hidden md:flex h-[100dvh] sticky top-0 flex-col py-4 px-2.5 shrink-0 glass z-30"
      style={{ width: w, transition: 'width 240ms cubic-bezier(.22,.61,.36,1)' }}
    >
      <div className={cn('flex items-center mb-4 px-1', expanded ? 'gap-2.5' : 'justify-center')}>
        <span className="sajni-orb" aria-hidden="true" />
        {expanded && (
          <div className="min-w-0">
            <div className="serif text-[15px] font-semibold leading-tight">sajni</div>
            <div className="mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">codex</div>
          </div>
        )}
      </div>

      <button
        onClick={onOpenCommand}
        className={cn(
          'mb-2 h-9 inline-flex items-center gap-2 border border-border bg-card/40 text-muted-foreground hover:bg-card/80 transition-colors text-[13px]',
          expanded ? 'px-2.5' : 'justify-center w-9 self-center',
        )}
        title="Ask anything · ⌘K"
        aria-label="Ask anything"
      >
        <Search className="size-3.5 shrink-0" />
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
          'mb-3 h-9 inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:bg-foreground/5 transition-colors',
          expanded ? 'px-2.5' : 'justify-center w-9 self-center',
        )}
        aria-label="Ask Sajni"
      >
        <MessageSquare className="size-3.5 shrink-0" />
        {expanded && (
          <>
            <span className="flex-1 text-left">Ask Sajni</span>
            <span className="mono text-[9px] uppercase tracking-wider px-1 py-0.5 bg-primary/15 text-primary inline-flex items-center gap-1">
              <Sparkles className="size-2.5" /> AI
            </span>
          </>
        )}
      </button>

      {expanded && (
        <div className="mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground px-2 mb-1">
          places
        </div>
      )}

      <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto pr-0.5">
        {NAV_ITEMS.map(({ path, label, Icon }) => {
          const isActive = path === '/'
            ? pathname === '/'
            : pathname === path || pathname.startsWith(path + '/');

          const link = (
            <NavLink
              to={path}
              end={path === '/'}
              className={cn(
                'relative flex items-center gap-3 h-[34px] text-[13px] font-normal transition-colors',
                expanded ? 'px-3' : 'justify-center',
                isActive ? 'text-primary-foreground' : 'text-foreground/80 hover:bg-foreground/5',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="rail-active"
                  className="absolute inset-0 bg-primary -z-0"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className="size-[15px] shrink-0 relative z-10" />
              {expanded && <span className="truncate relative z-10">{label}</span>}
            </NavLink>
          );

          if (expanded) return <div key={path}>{link}</div>;
          return (
            <Tooltip key={path}>
              <TooltipTrigger render={link} />
              <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="mt-2 pt-2.5 border-t border-border">
        {expanded ? (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 text-left hover:bg-foreground/5 transition-colors"
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
              className="size-[28px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0"
              title="Collapse"
            >
              <PanelLeftClose className="size-[14px]" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<button><Avatar size={28} label={initials} /></button>} />
              <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-[280px]">
                {userMenuContent}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => setExpanded(true)}
              className="size-[28px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
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

// ─── Bottom tabbar (<768px) ─────────────────────────────────────────────
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
              'group relative flex flex-col items-center justify-center gap-1 px-1 py-1.5',
              'text-[10px] uppercase tracking-[0.12em] font-mono',
              'border-r border-border last:border-r-0',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-7 bg-primary transition-opacity',
                isActive ? 'opacity-100' : 'opacity-0',
              )}
            />
            <Icon className="size-[18px]" strokeWidth={1.5} />
            <span>{label}</span>
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        className="flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] uppercase tracking-[0.12em] font-mono text-muted-foreground"
      >
        <MoreHorizontal className="size-[18px]" strokeWidth={1.5} />
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
                className="max-h-[92dvh] overflow-y-auto border-t border-border bg-popover px-2 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
              >
                <div className="mx-auto mb-3 h-[3px] w-9 bg-muted-foreground/35" aria-hidden="true" />

                {/* Account header — avatar + email up top */}
                <div className="flex items-center gap-3 px-3 pb-3">
                  <Avatar size={40} ring label={initials} />
                  <div className="min-w-0">
                    <div className="serif text-[15px] font-semibold leading-tight truncate">{email}</div>
                    <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">signed in</div>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex gap-2 px-3 mb-3">
                  <button
                    onClick={() => { setMoreOpen(false); openCommand(); }}
                    className="flex-1 h-10 inline-flex items-center justify-center gap-2 border border-border bg-card/40 text-[13px]"
                  >
                    <Search className="size-3.5" /> Search
                  </button>
                  <button
                    onClick={() => { setMoreOpen(false); setAiChatOpen(true); }}
                    className="flex-1 h-10 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground text-[13px]"
                  >
                    <Sparkles className="size-3.5" /> Ask Sajni
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
                            'flex flex-col items-center justify-center gap-2 px-1.5 py-4 text-[12px] font-normal border transition-colors',
                            isActive
                              ? 'bg-primary/15 border-primary/40 text-primary'
                              : 'bg-card/40 border-border text-foreground/85 hover:bg-card/80',
                          )}
                        >
                          <Icon className="size-5" />
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
                    className="flex-1 h-10 inline-flex items-center justify-center gap-2 border border-border bg-card/40 text-[13px]"
                  >
                    <Settings className="size-3.5" /> Settings
                  </button>
                  <button
                    onClick={onSignOut}
                    disabled={signingOut}
                    className="flex-1 h-10 inline-flex items-center justify-center gap-2 border border-destructive/30 bg-destructive/10 text-destructive text-[13px] disabled:opacity-50"
                  >
                    {signingOut ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
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
