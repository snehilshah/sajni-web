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

const CHROME_TWEEN = { duration: 0.3, ease: [0.2, 0, 0, 1] } as const;

// The page column: max width + horizontal padding shared by the page header
// and the scroll body, so both sit on the same leading/trailing edges (the
// edge rule, DESIGN.md). Pages with a different body width pass their own.
export const PAGE_COLUMN = 'max-w-6xl px-4 md:px-8';

// PillSlot — one persistent content block inside the pill. Its children
// drive the flex layout directly so there is no second layout animation
// retargeting them while labels collapse.
function PillSlot({ className, children }: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

// PageChrome — one persistent fixed island. On scroll it travels into the
// primary bar's position while its bounds, title, tabs, and actions reduce
// together. Keeping one tree mounted avoids a blank frame before motion.
// Desktop runs compact (h-9); mobile keeps 48dp touch targets.
// At rest the header is a flat row on the page column's edges: title and
// tabs start on the leading edge, actions end on the trailing edge. Once the
// page scrolls it morphs into the compact centred pill (desktop: into the
// primary bar's slot) exactly as before.
export function PageChrome({
  title, leading, navigation, actions, columnClassName = PAGE_COLUMN,
}: {
  title: ReactNode;
  leading?: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
  /** Width + horizontal padding of the page body this header aligns to. */
  columnClassName?: string;
}) {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { scrolled } = useNavChrome();
  const [placesOpen, setPlacesOpen] = useState(false);

  useEffect(() => { setPlacesOpen(false); }, [pathname]);
  useEffect(() => { if (!scrolled) setPlacesOpen(false); }, [scrolled]);

  const divider = scrolled
    ? <span className="w-px h-5 shrink-0 bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
    : null;
  const tail = (
    <>
      {navigation && (
        <>
          {divider}
          <PillSlot className={cn('min-w-0 overflow-hidden', !scrolled && 'flex-1')}>
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
              !scrolled && 'ml-auto',
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
      transition={CHROME_TWEEN}
      className={cn(
        'fixed inset-x-0 z-40 flex pointer-events-none',
        scrolled ? 'justify-center px-3 md:px-4' : 'bg-[hsl(var(--background))]',
      )}
      style={{
        top: isMobile
          ? 'calc(env(safe-area-inset-top, 0px) + 10px)'
          : 'calc(env(safe-area-inset-top, 0px) + 66px)',
      }}
    >
      <motion.header
        layout
        transition={CHROME_TWEEN}
        role={scrolled ? 'toolbar' : undefined}
        aria-label={scrolled ? 'Page' : undefined}
        className={cn(
          'pointer-events-auto flex items-center min-w-0',
          scrolled
            ? cn(
                'rounded-full bg-[hsl(var(--surface-container-high))] shadow-[var(--m3-elev-1)] gap-2 pl-1 pr-1 max-w-[min(94vw,720px)]',
                isMobile ? 'min-h-12 py-1 pl-1.5 pr-1.5' : 'min-h-9 py-0.5',
              )
            : cn('w-full mx-auto gap-4 min-h-12', columnClassName),
        )}
      >
        {leading && (
          <PillSlot className="shrink-0 flex items-center">
            {leading}
          </PillSlot>
        )}
        <PillSlot className="shrink-0">
          <MorphingPopover
            open={placesOpen}
            onOpenChange={setPlacesOpen}
            panelClassName="w-[min(300px,calc(100vw-24px))] p-2"
            viewportPadding={12}
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
                  'shrink-0 inline-flex items-center rounded-full serif font-semibold tracking-tight whitespace-nowrap outline-none transition-colors',
                  scrolled
                    ? cn('pl-2.5 pr-1.5 gap-1 hover:bg-[hsl(var(--on-surface)/0.08)]', isMobile ? 'h-9 text-sm' : 'h-8 text-[13px]')
                    : 'h-9 p-0 gap-0 text-xl cursor-default',
                )}
              >
                <span className="truncate max-w-[150px]">{title}</span>
                {scrolled && <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />}
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
  title, leading, actions, navigation,
  children, contentClassName, columnClassName = PAGE_COLUMN, hideScrollbar = false,
}: {
  title: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  /** Width + horizontal padding shared by the header and the body. */
  columnClassName?: string;
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
      <PageChrome title={title} leading={leading} navigation={navigation} actions={actions} columnClassName={columnClassName} />

      {/* stable-scrollbar reserves the scrollbar gutter so content doesn't
          shift sideways when a page grows tall enough to show the bar (e.g.
          expanding the missed-tasks banner). No gutter needed when the bar
          is hidden outright. */}
      <div
        ref={scrollRef}
        className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain', hideScrollbar ? 'no-scrollbar' : 'stable-scrollbar')}
        style={{ paddingTop: chromeClearance(isMobile) }}
      >
        <div className={contentClassName ?? cn('w-full mx-auto pt-5 md:pt-6 pb-28 md:pb-20 flex flex-col gap-6', columnClassName)}>
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
  // highlight travels between options instead of blinking.
  const groupId = useId();
  // In the merged pill (page scrolled) every icon tab sheds its label in the
  // same render. The persistent icons then tween once to their new positions;
  // continuously animating each label's width forced repeated flex reflows
  // that looked like horizontal jitter. Tabs without icons keep text — an
  // empty pill would be unusable. Desktop merged controls run compact (h-8);
  // mobile keeps 48dp-ish targets.
  const { scrolled } = useNavChrome();
  const isMobile = useIsMobile();
  const compact = scrolled && bare && !isMobile;
  const reduceMotion = useReducedMotion();

  // Overflow edges: tabs never clip silently. When the row scrolls, the
  // overflowing end fades out, and the active tab is kept in view.
  const navRef = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => setEdges({
      start: el.scrollLeft > 1,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure); };
  }, []);
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [value, reduceMotion]);
  const fadeMask = edges.start || edges.end
    ? `linear-gradient(to right, ${edges.start ? 'transparent, black 24px' : 'black'}, ${edges.end ? 'black calc(100% - 24px), transparent' : 'black'})`
    : undefined;

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
    if (isMobile) return;
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
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className={cn('max-w-full min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar', className)}
      style={fadeMask ? { maskImage: fadeMask, WebkitMaskImage: fadeMask } : undefined}
    >
      <div
        ref={trackRef}
        onMouseLeave={() => setHoverRect(null)}
        className={cn(
          'relative flex w-max max-w-none items-center gap-1',
          !bare && 'mx-auto',
          bare ? 'p-0.5' : 'rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] p-1',
        )}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-0 rounded-[22px] bg-[hsl(var(--on-surface)/0.07)]"
          initial={false}
          animate={!isMobile && hoverRect
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
                'relative rounded-[22px] inline-flex items-center justify-center font-medium whitespace-nowrap outline-none transition-colors duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50',
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
                  transition={reduceMotion ? { duration: 0 } : CHROME_TWEEN}
                />
              )}
              {Icon && (
                <motion.span
                  layout="position"
                  className="relative z-10 shrink-0"
                  transition={reduceMotion ? { duration: 0 } : CHROME_TWEEN}
                >
                  <Icon className="size-3.5" />
                </motion.span>
              )}
              {!labelHidden && (
                <span
                  className={cn('relative z-10', Icon ? 'ml-1.5 sm:ml-2' : '')}
                >
                  {option.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
