import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

import { ChevronDown } from '@/components/ui/icons';
import { useNavChrome } from '@/components/nav-chrome';
import PlacesGrid from '@/components/places-grid';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

// Watches a page's own scroll container. Hysteresis (enter >96px, exit
// <24px) keeps the bar/pill merge from flapping around the threshold.
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

// PageChrome — the page's secondary bar and its merged, scrolled state.
//
// Rest: a centered pill (title · page tabs · CTAs) in flow under the
// primary bar. Scrolled: BOTH bars collapse and one merged pill springs
// in — the title becomes a dropdown (staggered PlacesGrid of every
// destination), the page tabs stay as icons (labels animate off), the
// CTAs stay. Scroll back to top and the stacked bars restore.
export function PageChrome({
  title, navigation, actions,
}: {
  title: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
}) {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { scrolled } = useNavChrome();
  const [placesOpen, setPlacesOpen] = useState(false);

  useEffect(() => { setPlacesOpen(false); }, [pathname]);

  const tail = (
    <>
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
    </>
  );

  return (
    <>
      {/* Rest bar — in flow, collapses away on scroll. */}
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
            {tail}
          </header>
        </div>
      </motion.div>

      {/* Merged pill — fixed, springs in when scrolled. */}
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
          className="flex items-center gap-2 min-h-12 pl-1.5 pr-1.5 py-1 max-w-[min(94vw,720px)] rounded-full bg-[hsl(var(--surface-container-high))] border border-[hsl(var(--outline-variant))] shadow-[var(--m3-elev-3)]"
        >
          <Popover open={placesOpen} onOpenChange={setPlacesOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  tabIndex={scrolled ? undefined : -1}
                  className="h-9 pl-2.5 pr-1.5 shrink-0 inline-flex items-center gap-1 rounded-full hover:bg-[hsl(var(--on-surface)/0.08)] transition-colors"
                  title="All pages"
                  aria-label="All pages"
                >
                  <span className="serif text-sm font-semibold tracking-tight truncate max-w-[150px]">
                    {title}
                  </span>
                  <ChevronDown
                    className={cn('size-3.5 text-muted-foreground transition-transform duration-200', placesOpen && 'rotate-180')}
                  />
                </button>
              }
            />
            <PopoverContent align="start" sideOffset={12} className="w-[300px] p-2">
              <PlacesGrid
                pathname={pathname}
                onNavigate={(p) => { navigate(p); setPlacesOpen(false); }}
              />
            </PopoverContent>
          </Popover>
          {tail}
        </div>
      </motion.div>
    </>
  );
}

// PageShell — secondary chrome + scroll body. The page reports its scroll
// state through NavChromeContext (Layout collapses the primary bar off it).
export default function PageShell({
  title, actions, navigation,
  children, contentClassName, hideScrollbar = false,
}: {
  title: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  hideScrollbar?: boolean;
}) {
  const { setScrolled: reportScrolled } = useNavChrome();

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolled = useOwnScrolled(scrollRef, true);

  useEffect(() => {
    reportScrolled(scrolled);
    return () => reportScrolled(false);
  }, [scrolled, reportScrolled]);

  return (
    <div className="page-fade-in flex-1 flex flex-col min-h-0">
      <PageChrome title={title} navigation={navigation} actions={actions} />

      <div
        ref={scrollRef}
        className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain', hideScrollbar && 'no-scrollbar')}
      >
        <div className={contentClassName ?? 'max-w-6xl w-full mx-auto px-4 md:px-8 pt-5 md:pt-6 pb-28 md:pb-20 flex flex-col gap-6'}>
          {children}
        </div>
      </div>
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
  // In the merged pill (page scrolled) icon tabs shed their labels via an
  // animated max-width collapse. Tabs without icons keep text — an empty
  // pill would be unusable.
  const { scrolled } = useNavChrome();

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
          const labelHidden = scrolled && bare && !!Icon;

          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              aria-current={active ? 'page' : undefined}
              aria-pressed={active}
              aria-label={typeof option.label === 'string' ? option.label : undefined}
              title={labelHidden && typeof option.label === 'string' ? option.label : undefined}
              onClick={() => onChange(option.value)}
              className={cn(
                'relative rounded-[22px] inline-flex items-center justify-center px-2.5 sm:px-3 text-xs sm:text-sm font-medium whitespace-nowrap outline-none transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50',
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
              <span
                className={cn(
                  'relative z-10 overflow-hidden transition-[max-width,opacity,margin-left] duration-300 ease-[cubic-bezier(0.2,0,0,1)]',
                  Icon ? 'ml-1.5 sm:ml-2' : '',
                  labelHidden ? 'max-w-0 opacity-0 !ml-0' : 'max-w-[9rem] opacity-100',
                )}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
