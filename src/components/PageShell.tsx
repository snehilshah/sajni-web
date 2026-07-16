import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';

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

// PillSlot — one persistent content block inside the pill. `layout` keeps
// each section moving with the outer bounds without hiding or remounting
// it during the rest-to-reduced transition.
function PillSlot({ className, children }: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      layout
      transition={PILL_SPRING}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// PageChrome — one persistent fixed island. On scroll it travels into the
// primary bar's position while its bounds, title, tabs, and actions reduce
// together. Keeping one tree mounted avoids a blank frame before motion.
// Desktop runs compact (h-9); mobile keeps 48dp touch targets.
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
  useEffect(() => { if (!scrolled) setPlacesOpen(false); }, [scrolled]);

  const divider = <span className="w-px h-5 shrink-0 bg-[hsl(var(--outline-variant))]" aria-hidden="true" />;
  const tail = (
    <>
      {navigation && (
        <>
          {divider}
          <PillSlot className="min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar">
            {navigation}
          </PillSlot>
        </>
      )}
      {actions ? (
        <>
          {divider}
          <PillSlot
            className={cn(
              'flex items-center gap-1.5 shrink-0',
              scrolled && !isMobile && '[&_button]:h-8 [&_input]:h-8',
            )}
          >
            {actions}
          </PillSlot>
        </>
      ) : (
        <span className="w-1" aria-hidden="true" />
      )}
    </>
  );

  return (
    <motion.div
      initial={false}
      animate={{
        transform: scrolled && !isMobile ? 'translateY(-56px)' : 'translateY(0)',
      }}
      transition={PILL_SPRING}
      className="fixed inset-x-0 z-40 flex justify-center px-3 md:px-4 pointer-events-none"
      style={{
        top: isMobile
          ? 'calc(env(safe-area-inset-top, 0px) + 10px)'
          : 'calc(env(safe-area-inset-top, 0px) + 66px)',
      }}
    >
      <motion.header
        layout
        transition={PILL_SPRING}
        role={scrolled ? 'toolbar' : undefined}
        aria-label={scrolled ? 'Page' : undefined}
        className={cn(
          'pointer-events-auto flex items-center min-w-0 rounded-full bg-[hsl(var(--surface-container-low))] border border-[hsl(var(--outline-variant))] shadow-[var(--m3-elev-1)]',
          scrolled
            ? cn('gap-2 pl-1 pr-1 max-w-[min(94vw,720px)]', isMobile ? 'min-h-12 py-1 pl-1.5 pr-1.5' : 'min-h-9 py-0.5')
            : 'gap-2.5 min-h-12 max-w-[min(94vw,880px)] pl-4 pr-1.5 py-1',
        )}
      >
        <PillSlot className="shrink-0">
          <MorphingPopover
            open={placesOpen}
            onOpenChange={setPlacesOpen}
            panelClassName="w-[300px] p-2"
            trigger={
              <button
                type="button"
                disabled={!scrolled}
                onClick={() => setPlacesOpen(true)}
                role={scrolled ? undefined : 'heading'}
                aria-level={scrolled ? undefined : 1}
                title={scrolled ? 'All pages' : undefined}
                aria-label={scrolled ? 'All pages' : undefined}
                className={cn(
                  'shrink-0 inline-flex items-center rounded-full serif font-semibold tracking-tight whitespace-nowrap outline-none transition-[height,padding,gap,font-size,background-color] duration-300 ease-[cubic-bezier(0.2,0,0,1)]',
                  scrolled
                    ? cn('pl-2.5 pr-1.5 gap-1 hover:bg-[hsl(var(--on-surface)/0.08)]', isMobile ? 'h-9 text-sm' : 'h-8 text-[13px]')
                    : 'h-8 p-0 gap-0 text-[15px] cursor-default',
                )}
              >
                <span className="truncate max-w-[150px]">{title}</span>
                <motion.span
                  initial={false}
                  animate={{ width: scrolled ? 14 : 0, opacity: scrolled ? 1 : 0 }}
                  transition={PILL_SPRING}
                  className="overflow-hidden"
                  aria-hidden="true"
                >
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </motion.span>
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
      </motion.header>
    </motion.div>
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

      {/* stable-scrollbar reserves the scrollbar gutter so content doesn't
          shift sideways when a page grows tall enough to show the bar (e.g.
          expanding the missed-tasks banner). No gutter needed when the bar
          is hidden outright. */}
      <div
        ref={scrollRef}
        className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain', hideScrollbar ? 'no-scrollbar' : 'stable-scrollbar')}
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
  // pill would be unusable. Desktop merged controls run compact (h-8) for
  // harmony with the shrunken chrome; mobile keeps 48dp-ish targets.
  const { scrolled } = useNavChrome();
  const isMobile = useIsMobile();
  const compact = scrolled && bare && !isMobile;
  const reduceMotion = useReducedMotion();

  // Vercel-style hover indicator: one faint pill measured to the hovered
  // tab's rect and sprung between tabs, distinct from the active pill. It's
  // suppressed over the active tab so it never doubles up the solid pill.
  // `animate` distinguishes appearing from nothing (jump into place, only
  // the opacity fades in) from gliding between tabs (spring the position),
  // so it never slides in "from the air"; on leave it fades out in place.
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverRect, setHoverRect] = useState<
    { x: number; y: number; width: number; height: number; animate: boolean } | null
  >(null);
  const moveHoverTo = (el: HTMLElement) => {
    const wrap = trackRef.current;
    if (!wrap) return;
    const w = wrap.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    setHoverRect((prev) => ({
      x: b.left - w.left, y: b.top - w.top, width: b.width, height: b.height,
      animate: prev != null,
    }));
  };

  return (
    <nav aria-label={ariaLabel} className={cn('max-w-full min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar', className)}>
      <div
        ref={trackRef}
        onMouseLeave={() => setHoverRect(null)}
        className={cn(
          'relative flex w-max max-w-none mx-auto items-center gap-1',
          bare ? 'p-0.5' : 'rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] p-1',
        )}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-0 rounded-[22px] bg-[hsl(var(--on-surface)/0.07)]"
          initial={false}
          animate={hoverRect
            ? { opacity: 1, x: hoverRect.x, y: hoverRect.y, width: hoverRect.width, height: hoverRect.height }
            : { opacity: 0 }}
          transition={reduceMotion || !hoverRect?.animate
            ? { duration: 0, opacity: { duration: 0.15 } }
            : { type: 'spring', stiffness: 550, damping: 45, mass: 0.6, opacity: { duration: 0.15 } }}
        />
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
              onMouseEnter={(e) => (active || option.disabled ? setHoverRect(null) : moveHoverTo(e.currentTarget))}
              onFocus={(e) => (active || option.disabled ? setHoverRect(null) : moveHoverTo(e.currentTarget))}
              className={cn(
                'relative rounded-[22px] inline-flex items-center justify-center font-medium whitespace-nowrap outline-none transition-[color,height,padding] duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50',
                compact ? 'h-8 px-2 text-xs' : 'px-2.5 sm:px-3 text-xs sm:text-sm',
                bare ? (compact ? 'h-8' : 'h-9') : 'h-9 sm:h-10',
                active
                  ? 'text-[hsl(var(--on-secondary-container))]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {active && (
                <motion.span
                  layoutId={`pst-active-${groupId}`}
                  className="absolute inset-0 z-0 rounded-[22px] bg-[hsl(var(--secondary-container))] shadow-[var(--m3-elev-1)]"
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
