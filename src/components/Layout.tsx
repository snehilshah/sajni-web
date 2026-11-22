import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import { lazyPage, prefetchPages } from '@/lib/lazyPage';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { LogOut, Search, Settings, Sparkles, Loader2, BookOpen, History } from '@/components/ui/icons';
import { PixelIcon } from '@/components/ui/pixel-icon';
import { useAuth, type User } from '@/auth/AuthContext';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import type { ChatOpenDetail, ChatOpenRequest } from '@/components/AIChat';
import Backdrop from '@/components/Backdrop';
import { NAV_ITEMS, NavChromeContext, isActivePath } from '@/components/nav-chrome';
import { placeHref, rememberPlace } from '@/lib/sessionState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useKeyboardOpen } from '@/hooks/use-keyboard-open';
import { cn } from '@/lib/utils';
import { readDockWidth, saveDockWidth, useDockMode } from '@/lib/chatDock';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const CommandPalette = lazyPage(() => import('@/components/CommandPalette'));
const AIChat = lazyPage(() => import('@/components/AIChat'));

function MenuRow({
  icon: Icon,
  label,
  hint,
  onClick,
  danger,
  disabled,
  spinning,
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
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
        danger
          ? 'text-destructive hover:bg-[hsl(var(--error-container))]'
          : 'text-foreground/90 hover:bg-[hsl(var(--on-surface)/0.08)]',
        (disabled || spinning) && 'cursor-not-allowed opacity-50',
      )}
    >
      <Icon className={cn('size-4 shrink-0', spinning && 'animate-spin')} />
      <span className="flex-1">{label}</span>
      {hint && <span className="mono text-xs tracking-[0.05em] text-muted-foreground">{hint}</span>}
    </button>
  );
}

function UserMenuBody({
  user,
  onOpenCommand,
  onOpenChat,
  onSettings,
  onDocs,
  onChangelog,
  onSignOut,
  onAction,
  signingOut,
}: {
  user: User;
  onOpenCommand: () => void;
  onOpenChat: () => void;
  onSettings: () => void;
  onDocs: () => void;
  onChangelog: () => void;
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
      <div className="flex items-center gap-3.5 px-3 pt-3 pb-2">
        <ProfileAvatar user={user} size={64} />
        <div className="min-w-0">
          <div className="serif truncate text-sm leading-tight font-semibold">{user.name || 'Sajni user'}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{user.email}</div>
        </div>
      </div>
      <div className="sajni-sep my-2" />
      <MenuRow icon={Search} label="Search" hint="⌘K" onClick={runAction(onOpenCommand)} />
      <MenuRow icon={Sparkles} label="Ask Sajni" onClick={runAction(onOpenChat)} />
      <div className="sajni-sep my-2" />
      <MenuRow icon={Settings} label="Settings" onClick={runAction(onSettings)} />
      <MenuRow icon={BookOpen} label="Field guide" hint="/docs" onClick={runAction(onDocs)} />
      <MenuRow icon={History} label="What's new" hint="/changelog" onClick={runAction(onChangelog)} />
      <MenuRow
        icon={signingOut ? Loader2 : LogOut}
        label={signingOut ? 'Signing out…' : 'Sign out'}
        danger
        spinning={signingOut}
        onClick={runAction(onSignOut)}
      />
    </div>
  );
}

// ─── Dock icon — macOS-style proximity magnification ─────────────────────
// `pointerX` carries the pointer's clientX while it's over the dock
// (Infinity when it leaves); each icon springs its slot WIDTH by distance
// and scales its glyph to match. Subtle by design: +8px at dead centre,
// felt more than seen. Height and the active/hover circles stay at `base`:
// growing them swelled the circles into the pill's edges, so the bar
// seemed to bob up and down under the pointer.
function DockNavIcon({
  pointerX,
  path,
  label,
  icon,
  isActive,
  base,
  max,
  activeLayoutId,
  hovered = false,
  hoverLayoutId,
  onHover,
}: {
  pointerX: MotionValue<number>;
  path: string;
  label: string;
  icon: Parameters<typeof PixelIcon>[0]['name'];
  isActive: boolean;
  base: number;
  max: number;
  activeLayoutId: string;
  /** True when this icon is the one being hovered — renders the shared
      hover circle here so framer slides it over from the previous icon. */
  hovered?: boolean;
  hoverLayoutId?: string;
  onHover?: () => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const distance = useTransform(pointerX, (x) => {
    const b = ref.current?.getBoundingClientRect();
    return b ? x - (b.left + b.width / 2) : Infinity;
  });
  const size = useSpring(useTransform(distance, [-96, 0, 96], [base, max, base]), {
    mass: 0.1,
    stiffness: 220,
    damping: 16,
  });
  const iconScale = useTransform(size, (s) => s / base);
  // A fixed base-sized circle centred in the (wider) slot.
  const circle = { width: base, left: '50%', marginLeft: -base / 2 };

  return (
    <NavLink
      ref={ref}
      // The space's last page this session (lib/sessionState); its start
      // when you're already in it.
      to={isActive ? path : placeHref(path, '')}
      end={path === '/'}
      title={label}
      aria-label={label}
      onMouseEnter={onHover}
      onFocus={onHover}
      className="flex shrink-0 items-center justify-center"
    >
      <motion.span
        style={{ width: size, height: base }}
        className={cn(
          'relative inline-flex items-center justify-center rounded-full transition-colors',
          isActive
            ? 'text-[hsl(var(--on-secondary-container))]'
            : 'text-foreground/80 active:bg-[hsl(var(--on-surface)/0.08)]',
        )}
      >
        {isActive && (
          <motion.span
            layoutId={activeLayoutId}
            style={circle}
            className="absolute inset-y-0 rounded-full bg-[hsl(var(--secondary-container))]"
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
        {/* Shared-element hover circle, centred on the icon; the shared
            layoutId makes framer slide it here from whichever icon had it
            last. */}
        {!isActive && hovered && hoverLayoutId && (
          <motion.span
            layoutId={hoverLayoutId}
            style={circle}
            className="absolute inset-y-0 z-0 rounded-full bg-[hsl(var(--on-surface)/0.08)]"
            transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.6 }}
          />
        )}
        <motion.span style={{ scale: iconScale }} className="relative z-10 inline-flex">
          <PixelIcon name={icon} solid={isActive} className={base >= 44 ? 'size-[20px]' : 'size-[19px]'} />
        </motion.span>
      </motion.span>
    </NavLink>
  );
}

// ─── Primary island (desktop) ────────────────────────────────────────────
// Icon-only destinations in one FIXED floating pill — content (and page
// sidebars) run underneath to the viewport top. Slides up + fades when
// the page scrolls; the merged pill (PageChrome) morphs into its place.
function PrimaryBar({
  pathname,
  scrolled,
  onOpenCommand,
  userMenuContent,
  user,
  accountMenuOpen,
  setAccountMenuOpen,
  chatDocked,
  onCloseChat,
}: {
  pathname: string;
  scrolled: boolean;
  onOpenCommand: () => void;
  /** Sajni is docked open: its button shows on and closes it. */
  chatDocked: boolean;
  onCloseChat: () => void;
  userMenuContent: ReactNode;
  user: User;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (open: boolean) => void;
}) {
  const pointerX = useMotionValue(Infinity);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  // The hover circle uses a shared layoutId so it SLIDES between icons. But
  // framer remembers a layoutId's last box across unmount, which makes it
  // "fly in" from there when it reappears. So we bump `session` (→ a fresh
  // layoutId) every time the circle appears from nothing — a brand-new id
  // has no prior box, so it mounts in place. It stays stable while visibly
  // moving icon→icon, and unmounting on leave hides it in place.
  const [session, setSession] = useState(0);
  const enterIcon = (path: string) => {
    const curVisible = hoveredPath != null && !isActivePath(pathname, hoveredPath);
    const nextVisible = !isActivePath(pathname, path);
    if (nextVisible && !curVisible) setSession((s) => s + 1);
    setHoveredPath(path);
  };
  return (
    <motion.div
      initial={false}
      animate={{ transform: scrolled ? 'translateY(-88px)' : 'translateY(0)', opacity: scrolled ? 0 : 1 }}
      transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 transition-[right] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
      data-dock-chrome
      // --dock-inset: docked Sajni's width, so the pill centres over the page left.
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)', right: 'var(--dock-inset, 0px)' }}
      aria-hidden={scrolled}
    >
      <nav
        onMouseMove={(e) => pointerX.set(e.clientX)}
        onMouseLeave={() => {
          pointerX.set(Infinity);
          setHoveredPath(null);
        }}
        className={cn(
          'flex h-12 items-center gap-0.5 rounded-full border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] px-1.5 shadow-[var(--m3-elev-1)]',
          scrolled ? 'pointer-events-none' : 'pointer-events-auto',
        )}
        aria-label="Primary"
      >
        {NAV_ITEMS.map(({ path, label, icon }) => (
          <DockNavIcon
            key={path}
            pointerX={pointerX}
            path={path}
            label={label}
            icon={icon}
            isActive={isActivePath(pathname, path)}
            base={40}
            max={48}
            activeLayoutId="primary-active"
            hovered={hoveredPath === path}
            hoverLayoutId={`primary-hover-${session}`}
            onHover={() => enterIcon(path)}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
        {/* Search and Sajni live in the pill: nothing floats over the page. */}
        <button
          onClick={onOpenCommand}
          className="inline-flex size-10 items-center justify-center rounded-full text-foreground/80 transition-colors outline-none hover:bg-[hsl(var(--on-surface)/0.08)] focus-visible:ring-2 focus-visible:ring-ring/45"
          title="Search · ⌘K"
          aria-label="Search"
        >
          <Search className="size-[18px]" />
        </button>
        <button
          onClick={() => (chatDocked ? onCloseChat() : window.dispatchEvent(new CustomEvent('chat:open')))}
          className={cn(
            'inline-flex size-10 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
            chatDocked
              ? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]'
              : 'text-foreground/80 hover:bg-[hsl(var(--on-surface)/0.08)]',
          )}
          title={chatDocked ? 'Close Sajni' : 'Ask Sajni'}
          aria-label={chatDocked ? 'Close Sajni' : 'Ask Sajni'}
          aria-pressed={chatDocked}
        >
          <Sparkles className="size-[18px]" />
        </button>
        <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <DropdownMenuTrigger
            render={
              <button
                className="mr-0.5 inline-flex size-10 items-center justify-center rounded-full transition-colors outline-none hover:bg-[hsl(var(--on-surface)/0.08)] focus-visible:ring-2 focus-visible:ring-ring/45 active:scale-[0.96]"
                title="Account"
                aria-label="Account"
              >
                <ProfileAvatar user={user} size={32} view="nav" />
              </button>
            }
          />
          <DropdownMenuContent align="end" sideOffset={10} className="w-[300px]">
            {userMenuContent}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </motion.div>
  );
}

// ─── Bottom dock (mobile) ────────────────────────────────────────────────
// Always visible: nav must stay in thumb reach. Icons scroll horizontally
// when they overflow; search + avatar are pinned at the trailing edge.
/** Pixels of the layout viewport hidden under browser chrome at the bottom
 *  (a bottom URL bar that overlays instead of resizing). Zero when the
 *  browser resizes the viewport, zoomed in, or the keyboard is the cause. */
function useBottomOcclusion() {
  const [px, setPx] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const gap = window.innerHeight - (vv.height + vv.offsetTop);
      // > 160px is the on-screen keyboard (the dock hides for that anyway).
      setPx(vv.scale > 1.01 || gap < 1 || gap > 160 ? 0 : Math.round(gap));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return px;
}

function BottomDock({
  pathname,
  hidden,
  onOpenCommand,
  userMenuContent,
  user,
  accountMenuOpen,
  setAccountMenuOpen,
}: {
  pathname: string;
  hidden: boolean;
  onOpenCommand: () => void;
  userMenuContent: ReactNode;
  user: User;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (open: boolean) => void;
}) {
  const pointerX = useMotionValue(Infinity);
  const occluded = useBottomOcclusion();
  return (
    <motion.div
      initial={false}
      // Slides fully off-screen while the keyboard is up so typing gets
      // the whole shortened viewport.
      animate={{ transform: hidden ? 'translateY(96px)' : 'translateY(0)', opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      // Anchored to the 100dvh shell (absolute), not the layout viewport
      // (fixed): a bottom URL bar shrinks dvh as it slides in, so the dock
      // rides above it instead of being covered. `occluded` covers browsers
      // that overlay their bar without resizing the viewport.
      className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-3 md:hidden"
      style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${10 + occluded}px)` }}
    >
      <nav
        className="pointer-events-auto flex h-14 max-w-full items-center gap-0.5 rounded-full border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-high))] pr-2 pl-1.5 shadow-[var(--m3-elev-3)]"
        aria-label="Primary"
      >
        <div
          className="no-scrollbar flex items-center gap-0.5 overflow-x-auto"
          // Magnify under the thumb while sliding across; settle on lift.
          onTouchMove={(e) => pointerX.set(e.touches[0]?.clientX ?? Infinity)}
          onTouchEnd={() => pointerX.set(Infinity)}
          onTouchCancel={() => pointerX.set(Infinity)}
        >
          {NAV_ITEMS.map(({ path, label, icon }) => (
            <DockNavIcon
              key={path}
              pointerX={pointerX}
              path={path}
              label={label}
              icon={icon}
              isActive={isActivePath(pathname, path)}
              base={44}
              max={52}
              activeLayoutId="dock-active"
            />
          ))}
        </div>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('chat:open'))}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] transition-transform active:scale-[0.96]"
          title="Ask Sajni"
          aria-label="Ask Sajni"
        >
          <Sparkles className="size-[19px]" />
        </button>
        <button
          onClick={onOpenCommand}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-[hsl(var(--on-surface)/0.08)]"
          title="Ask anything"
          aria-label="Ask anything"
        >
          <Search className="size-[19px]" />
        </button>
        <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <DropdownMenuTrigger
            render={
              <button
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45 active:scale-[0.96] active:bg-[hsl(var(--on-surface)/0.08)]"
                title="Account"
                aria-label="Account"
              >
                <ProfileAvatar user={user} size={32} view="nav" />
              </button>
            }
          />
          <DropdownMenuContent align="end" side="top" sideOffset={12} className="w-[300px]">
            {userMenuContent}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </motion.div>
  );
}

// ─── Layout root ────────────────────────────────────────────────────────
// Islands architecture: floating primary icon pill (desktop top, with
// search + Sajni; mobile bottom dock), page-owned secondary pill (PageShell). On scroll the primary + secondary bars merge into one condensed
// pill — pages report scroll through NavChromeContext.
export default function Layout() {
  const location = useLocation();
  useEffect(() => {
    rememberPlace(location.pathname, location.search);
  }, [location.pathname, location.search]);
  // Signed in: fetch every screen's chunk once idle (lib/lazyPage).
  useEffect(() => {
    prefetchPages();
  }, []);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const keyboardOpen = useKeyboardOpen(isMobile);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [chatOpenRequest, setChatOpenRequest] = useState<ChatOpenRequest | null>(null);
  const dockMode = useDockMode();
  const [dockWidth, setDockWidth] = useState(readDockWidth);
  useEffect(() => {
    saveDockWidth(dockWidth);
  }, [dockWidth]);
  const docked = aiChatOpen && dockMode !== 'sheet';
  // Page-wide fixed chrome (nav pill, page header, toasts) keeps clear of a
  // panel that pushes the page aside.
  const dockInset = docked && dockMode === 'push' ? dockWidth : 0;
  useEffect(() => {
    document.documentElement.style.setProperty('--dock-inset', `${dockInset}px`);
  }, [dockInset]);
  const [accountMenuState, setAccountMenuState] = useState({ pathname: location.pathname, open: false });
  const [signingOut, setSigningOut] = useState(false);

  const [scrollState, setScrollState] = useState({ pathname: location.pathname, scrolled: false });
  const scrolled = scrollState.pathname === location.pathname && scrollState.scrolled;
  const setScrolled = useCallback<Dispatch<SetStateAction<boolean>>>(
    (next) => {
      setScrollState((previous) => {
        const current = previous.pathname === location.pathname ? previous.scrolled : false;
        const value = typeof next === 'function' ? next(current) : next;
        if (previous.pathname === location.pathname && previous.scrolled === value) return previous;
        return { pathname: location.pathname, scrolled: value };
      });
    },
    [location.pathname],
  );
  // Calm is per page too: leaving the page drops it.
  const [calmState, setCalmState] = useState({ pathname: location.pathname, calm: false });
  const calm = calmState.pathname === location.pathname && calmState.calm;
  const setCalm = useCallback(
    (value: boolean) => {
      setCalmState((previous) =>
        previous.pathname === location.pathname && previous.calm === value
          ? previous
          : { pathname: location.pathname, calm: value },
      );
    },
    [location.pathname],
  );
  const chromeCtx = useMemo(() => ({ scrolled, setScrolled, calm, setCalm }), [scrolled, setScrolled, calm, setCalm]);

  const accountMenuOpen = accountMenuState.pathname === location.pathname && accountMenuState.open;
  const setAccountMenuOpen = useCallback(
    (open: boolean) => {
      setAccountMenuState({ pathname: location.pathname, open });
    },
    [location.pathname],
  );

  const setAIChatOpen = useCallback((open: boolean) => {
    setAiChatOpen(open);
    if (!open) setChatOpenRequest(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      } else if (event.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };
    const onPaletteOpen = () => setCommandPaletteOpen(true);
    const onChatOpen = (event: Event) => {
      setAiChatOpen(true);
      setChatOpenRequest({
        id: Date.now(),
        detail: (event as CustomEvent<ChatOpenDetail>).detail ?? {},
      });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('palette:open', onPaletteOpen);
    window.addEventListener('chat:open', onChatOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('palette:open', onPaletteOpen);
      window.removeEventListener('chat:open', onChatOpen);
    };
  }, []);

  const openCommand = () => setCommandPaletteOpen(true);

  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  if (!user) return null;

  const userMenuBody = (
    <UserMenuBody
      user={user}
      onOpenCommand={openCommand}
      onOpenChat={() => {
        setChatOpenRequest(null);
        setAiChatOpen(true);
      }}
      onSettings={() => navigate('/settings')}
      onDocs={() => navigate('/docs')}
      onChangelog={() => navigate('/changelog')}
      onSignOut={onSignOut}
      onAction={() => setAccountMenuOpen(false)}
      signingOut={signingOut}
    />
  );

  return (
    <>
      <Backdrop />

      <div className="relative z-10 flex h-[100dvh] flex-col overflow-hidden text-foreground">
        {!isMobile && (
          <PrimaryBar
            pathname={location.pathname}
            scrolled={scrolled || calm}
            onOpenCommand={openCommand}
            userMenuContent={userMenuBody}
            user={user}
            accountMenuOpen={accountMenuOpen}
            setAccountMenuOpen={setAccountMenuOpen}
            chatDocked={docked}
            onCloseChat={() => setAIChatOpen(false)}
          />
        )}

        {/* The page and, on desktop, Sajni docked beside it. */}
        <div className="relative flex min-h-0 flex-1">
          <NavChromeContext.Provider value={chromeCtx}>
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {/* Per page: a page that fails keeps the nav usable; navigating resets it. */}
              <ErrorBoundary key={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </main>
          </NavChromeContext.Provider>
          <AnimatePresence initial={false}>
            {aiChatOpen && (
              <ErrorBoundary key="sajni" fallback={null}>
                <Suspense fallback={null}>
                  <AIChat
                    open
                    onOpenChange={setAIChatOpen}
                    openRequest={chatOpenRequest}
                    dock={
                      dockMode === 'sheet' ? undefined : { mode: dockMode, width: dockWidth, onResize: setDockWidth }
                    }
                  />
                </Suspense>
              </ErrorBoundary>
            )}
          </AnimatePresence>
        </div>

        {isMobile && (
          <BottomDock
            pathname={location.pathname}
            hidden={keyboardOpen || calm}
            onOpenCommand={openCommand}
            userMenuContent={userMenuBody}
            user={user}
            accountMenuOpen={accountMenuOpen}
            setAccountMenuOpen={setAccountMenuOpen}
          />
        )}

        {commandPaletteOpen && (
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <CommandPalette onOpenChange={setCommandPaletteOpen} />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </>
  );
}
