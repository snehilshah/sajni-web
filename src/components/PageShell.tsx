import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

import { ChevronDown } from '@/components/ui/icons';
import { useNavChrome } from '@/components/nav-chrome';
import PlacesGrid from '@/components/places-grid';
import { MorphingPopover } from '@/components/motion/morphing-popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

// Content clearance for the floating chrome: pills are FIXED islands, so
// page scrollers pad their tops to start below them. Desktop stacks
// primary (safe+10, h48) + secondary (safe+66, h48); mobile has only the
// secondary on top (dock lives at the bottom).
export function chromeClearance(isMobile: boolean): string {
  return `calc(env(safe-area-inset-top, 0px) + ${isMobile ? 68 : 126}px)`;
}

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
        // Clamp: iOS/Android overscroll bounce reports negative scrollTop,
        // which can flap the state at the very top of the page.
        const y = Math.max(0, el.scrollTop);
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

const PILL_SPRING = { type: 'spring', stiffness: 380, damping: 30 } as const;

// PillSlot — one content block inside the pill. Explicit keyed entrance
// (remounts on merge/unmerge) so the cascade ALWAYS plays: title first,
// tabs, then actions. `layout` opts each slot into framer's scale
// correction, which stops icons squishing while the pill bounds-morphs.
function PillSlot({ order, className, children }: {
  order: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + order * 0.055, duration: 0.24, ease: [0.2, 0, 0, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// PageChrome — the page's secondary chrome. Both states are FIXED
// floating islands sharing one layoutId, so scrolling triggers a true
// morph: the rest pill travels up into the primary bar's spot (which
// fades away) and reshapes into the merged pill — title becomes the
// places dropdown (MorphingPopover), tab labels shed, CTAs stay. Scroll
// back and the same element morphs down again. Desktop merged pill runs
// compact (h-10); mobile keeps 48dp touch targets.
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
  const pillId = useId();

  useEffect(() => { setPlacesOpen(false); }, [pathname]);
  useEffect(() => { if (!scrolled) setPlacesOpen(false); }, [scrolled]);

  const divider = <span className="w-px h-5 shrink-0 bg-[hsl(var(--outline-variant))]" aria-hidden="true" />;
  const tail = (
    <>
      {navigation && (
        <>
          {divider}
          <PillSlot order={1} className="min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar">
            {navigation}
          </PillSlot>
        </>
      )}
      {actions ? (
        <>
          {divider}
          <PillSlot order={2} className="flex items-center gap-1.5 shrink-0">
            {actions}
          </PillSlot>
        </>
      ) : (
        <span className="w-1" aria-hidden="true" />
      )}
    </>
  );

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-3 md:px-4 pointer-events-none"
      style={{
        top: scrolled || isMobile
          ? 'calc(env(safe-area-inset-top, 0px) + 10px)'
          : 'calc(env(safe-area-inset-top, 0px) + 66px)',
      }}
    >
      {!scrolled ? (
        <motion.header
          key="rest"
          layoutId={pillId}
          transition={PILL_SPRING}
          className="pointer-events-auto flex items-center gap-2.5 min-h-12 max-w-[min(94vw,880px)] min-w-0 rounded-full bg-[hsl(var(--surface-container-low))] border border-[hsl(var(--outline-variant))] shadow-[var(--m3-elev-1)] pl-4 pr-1.5 py-1"
        >
          <PillSlot order={0} className="shrink-0">
            <h1 className="serif text-[15px] font-semibold tracking-tight whitespace-nowrap">
              {title}
            </h1>
          </PillSlot>
          {tail}
        </motion.header>
      ) : (
        <motion.div
          key="merged"
          layoutId={pillId}
          transition={PILL_SPRING}
          role="toolbar"
          aria-label="Page"
          className={cn(
            'pointer-events-auto flex items-center gap-2 pl-1 pr-1 py-1 max-w-[min(94vw,720px)] min-w-0 rounded-full bg-[hsl(var(--surface-container-high))] border border-[hsl(var(--outline-variant))] shadow-[var(--m3-elev-3)]',
            isMobile ? 'min-h-12 pl-1.5 pr-1.5' : 'min-h-10',
          )}
        >
          <PillSlot order={0} className="shrink-0">
            <MorphingPopover
              open={placesOpen}
              onOpenChange={setPlacesOpen}
              panelClassName="w-[300px] p-2"
              trigger={
                <button
                  type="button"
                  onClick={() => setPlacesOpen(true)}
                  className={cn(
                    'pl-2.5 pr-1.5 shrink-0 inline-flex items-center gap-1 rounded-full hover:bg-[hsl(var(--on-surface)/0.08)] transition-colors',
                    isMobile ? 'h-9' : 'h-8',
                  )}
                  title="All pages"
                  aria-label="All pages"
                >
                  <span className={cn('serif font-semibold tracking-tight truncate max-w-[150px]', isMobile ? 'text-sm' : 'text-[13px]')}>
                    {title}
                  </span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </button>
              }
            >
              <PlacesGrid
                pathname={pathname}
                onNavigate={(p) => { navigate(p); setPlacesOpen(false); }}
              />
            </MorphingPopover>
          </PillSlot>
          {tail}
        </motion.div>
      )}
    </div>
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
  const isMobile = useIsMobile();

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
        style={{ paddingTop: chromeClearance(isMobile) }}
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
  // pill would be unusable. Desktop merged pill runs compact (h-8) for
  // harmony with the shrunken chrome; mobile keeps 48dp-ish targets.
  const { scrolled } = useNavChrome();
  const isMobile = useIsMobile();
  const compact = scrolled && bare && !isMobile;

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
                'relative rounded-[22px] inline-flex items-center justify-center font-medium whitespace-nowrap outline-none transition-[color,background-color,height,padding] duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50',
                compact ? 'h-8 px-2 text-xs' : 'px-2.5 sm:px-3 text-xs sm:text-sm',
                bare ? (compact ? 'h-8' : 'h-9') : 'h-9 sm:h-10',
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
