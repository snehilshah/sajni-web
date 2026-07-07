import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

import { Search } from '@/components/ui/icons';
import { PixelIcon, type PixelIconName } from '@/components/ui/pixel-icon';
import { activeNavItem, useNavChrome } from '@/components/nav-chrome';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

// Watches a page's own scroll container. Hysteresis (enter >96px, exit
// <24px) keeps the bars/pill morph from flapping around the threshold.
export function useOwnScrolled(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setScrolled(false);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = el.scrollTop;
        setScrolled((prev) => (prev ? y > 24 : y > 96));
      });
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, enabled]);

  return scrolled;
}

// Condensed pill — the merged, scrolled state of primary + secondary bars:
// active nav icon (desktop) · page title · active tab · key CTAs. Tapping
// the pill body scrolls back to top, which re-expands both bars.
export function CondensedPill({
  title, scrolled, icon, tabLabel, actions, onTap,
}: {
  title: ReactNode;
  scrolled: boolean;
  icon?: PixelIconName;
  tabLabel?: ReactNode;
  actions?: ReactNode;
  onTap?: () => void;
}) {
  return (
    <motion.div
      className="fixed z-50 left-1/2"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        x: '-50%',
        pointerEvents: scrolled ? 'auto' : 'none',
      }}
      initial={false}
      animate={scrolled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -14, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      aria-hidden={!scrolled}
    >
      <div
        role="toolbar"
        aria-label="Page"
        onClick={onTap}
        className={cn(
          'flex items-center gap-2 h-12 pl-3.5 pr-1.5 max-w-[min(94vw,600px)] rounded-full bg-[hsl(var(--surface-container-high))] border border-[hsl(var(--outline-variant))] shadow-[var(--m3-elev-3)]',
          onTap && 'cursor-pointer',
        )}
        title={onTap ? 'Back to top' : undefined}
      >
        {icon && (
          <PixelIcon name={icon} solid className="hidden md:block size-[18px] shrink-0 text-muted-foreground" />
        )}
        <span className="serif text-sm font-semibold tracking-tight truncate max-w-[160px]">
          {title}
        </span>
        {tabLabel && (
          <span className="shrink-0 inline-flex items-center h-7 px-2.5 rounded-full bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] text-xs font-medium">
            {tabLabel}
          </span>
        )}
        {actions ? (
          <>
            <span className="w-px h-5 mx-0.5 bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
            <div className="flex items-center gap-1 min-w-0">{actions}</div>
          </>
        ) : (
          <span className="w-1.5" aria-hidden="true" />
        )}
      </div>
    </motion.div>
  );
}

// PageShell — the page's secondary bar + scroll body, islands edition.
// Secondary bar is a centered floating pill: title · page tabs · CTA
// slots. On scroll it collapses together with Layout's primary bar
// (reported through NavChromeContext) and CondensedPill takes over.
export default function PageShell({
  title, actions, navigation, islandTitle, islandActions, activeTabLabel,
  children, contentClassName, hideScrollbar = false,
  /** Deprecated — captions were dropped in the islands rework. */
  caption, subtitle, headerClassName,
}: {
  title: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  /** Short label for the condensed pill; falls back to `title`. */
  islandTitle?: ReactNode;
  /** Compact key CTAs for the condensed pill (primary action, view switch). */
  islandActions?: ReactNode;
  /** Active page-tab label shown as a chip in the condensed pill. */
  activeTabLabel?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  hideScrollbar?: boolean;
  caption?: ReactNode;
  subtitle?: ReactNode;
  headerClassName?: string;
}) {
  void caption; void subtitle; void headerClassName;
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const { setScrolled: reportScrolled } = useNavChrome();

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolled = useOwnScrolled(scrollRef, true);

  useEffect(() => {
    reportScrolled(scrolled);
    return () => reportScrolled(false);
  }, [scrolled, reportScrolled]);

  const navIcon = activeNavItem(pathname)?.icon;
  const scrollToTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <div className="page-fade-in flex-1 flex flex-col min-h-0">
      <motion.div
        initial={false}
        animate={{ height: scrolled ? 0 : 'auto', opacity: scrolled ? 0 : 1 }}
        transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
        className="relative z-20 shrink-0 overflow-hidden"
        style={{ pointerEvents: scrolled ? 'none' : 'auto' }}
        aria-hidden={scrolled}
      >
        <div
          className="flex justify-center px-3 md:px-4 pb-2"
          style={isMobile
            ? { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }
            : { paddingTop: 2 }}
        >
          <header className="flex items-center gap-2.5 min-h-12 max-w-full min-w-0 rounded-full bg-[hsl(var(--surface-container-low))] border border-[hsl(var(--outline-variant))] shadow-[var(--m3-elev-1)] pl-4 pr-1.5 py-1">
            <h1 className="serif text-[15px] font-semibold tracking-tight whitespace-nowrap shrink-0">
              {title}
            </h1>
            {navigation && (
              <>
                <span className="w-px h-5 shrink-0 bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
                <div className="min-w-0 overflow-x-auto no-scrollbar">{navigation}</div>
              </>
            )}
            {actions ? (
              <>
                <span className="w-px h-5 shrink-0 bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
                <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
              </>
            ) : (
              <span className="w-1" aria-hidden="true" />
            )}
          </header>
        </div>
      </motion.div>

      <div
        ref={scrollRef}
        className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain', hideScrollbar && 'no-scrollbar')}
      >
        <div className={contentClassName ?? 'max-w-6xl w-full mx-auto px-4 md:px-8 pt-5 md:pt-6 pb-28 md:pb-20 flex flex-col gap-6'}>
          {children}
        </div>
      </div>

      <CondensedPill
        title={islandTitle ?? title}
        scrolled={scrolled}
        icon={navIcon}
        tabLabel={activeTabLabel}
        actions={islandActions}
        onTap={scrollToTop}
      />
    </div>
  );
}

export interface PageShellTabOption<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export function PageShellTabs<V extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  bare = false,
}: {
  value: V;
  options: readonly PageShellTabOption<V>[];
  onChange: (value: V) => void;
  ariaLabel: string;
  className?: string;
  /** Bare = no bordered container; for embedding inside the secondary pill. */
  bare?: boolean;
}) {
  // Shared-element active pill: one layoutId per tabs instance so the
  // highlight springs between options instead of blinking.
  const groupId = useId();

  return (
    <nav aria-label={ariaLabel} className={cn('max-w-full min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar', className)}>
      <div
        className={cn(
          'flex w-max max-w-none mx-auto items-center gap-1',
          bare ? 'p-0.5' : 'rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] p-1',
        )}
      >
        {options.map((option) => {
          const Icon = option.icon;
          const active = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              aria-current={active ? 'page' : undefined}
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'relative rounded-[22px] inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 text-xs sm:text-sm font-medium whitespace-nowrap outline-none transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50',
                bare ? 'h-9' : 'h-9 sm:h-10',
                active
                  ? 'text-[hsl(var(--on-secondary-container))]'
                  : 'text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground',
              )}
            >
              {active && (
                <motion.span
                  layoutId={`pst-active-${groupId}`}
                  className="absolute inset-0 rounded-[22px] bg-[hsl(var(--secondary-container))] shadow-[var(--m3-elev-1)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              {Icon && <Icon className="size-3.5 shrink-0 relative z-10" />}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// Compact icon button for the condensed pill — 36px round target.
// stopPropagation so taps don't trigger the pill's scroll-to-top.
export function IslandAction({
  icon: Icon, label, onClick, active,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn(
        'size-9 shrink-0 inline-flex items-center justify-center rounded-full transition-colors',
        active
          ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
          : 'text-foreground/80 hover:bg-[hsl(var(--on-surface)/0.08)]',
      )}
      title={label}
      aria-label={label}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}

// Legacy alias — TodayPage renders the condensed pill directly.
export function PageIsland({
  title, actions, scrolled, icon,
}: {
  title: ReactNode;
  actions?: ReactNode;
  scrolled: boolean;
  icon?: PixelIconName;
}) {
  return <CondensedPill title={title} scrolled={scrolled} icon={icon} actions={actions} />;
}

// Re-export so pages can open the palette from island contexts.
export function SearchAction() {
  return (
    <IslandAction
      icon={Search}
      label="Ask anything · ⌘K"
      onClick={() => window.dispatchEvent(new CustomEvent('palette:open'))}
    />
  );
}
