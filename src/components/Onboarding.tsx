import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface Step {
  key: string;
  title: string;
  blurb: string;
  /** Reserved — currently unused since we anchor by data-onboarding-key. */
  icon?: string;
}

interface OnboardingDoc {
  version: number;
  steps: Step[];
}

interface Anchor {
  rect: DOMRect;
  /** Which side of the anchor the bubble sits on. */
  side: 'right' | 'top' | 'bottom';
}

const BUBBLE_WIDTH = 320;
const GAP = 14;
const VIEWPORT_PAD = 16;

// Resolves an anchor for a step. Centered modal (anchor=null) is used
// when the step's key has no matching DOM element — i.e. the welcome
// and "all set" intros, plus any mobile fallback.
function findAnchor(key: string): Anchor | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-onboarding-key="${key}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  // Anchors in the top command bar (nav position "top") hug the viewport
  // top edge — drop the bubble BELOW them. Sidebar-rail anchors (nav
  // position "left") sit lower, so they keep the old behaviour: bubble to
  // the right on desktop, above on narrow viewports.
  if (rect.top < 80) {
    return { rect, side: 'bottom' };
  }
  const isNarrow = window.innerWidth < 768;
  return { rect, side: isNarrow ? 'top' : 'right' };
}

// computePosition turns an Anchor into top/left CSS values, clamped to
// the viewport so the bubble never escapes off-screen.
function computePosition(anchor: Anchor | null): React.CSSProperties {
  if (!anchor) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }
  const { rect, side } = anchor;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (side === 'right') {
    const left = Math.min(rect.right + GAP, vw - BUBBLE_WIDTH - VIEWPORT_PAD);
    const desiredTop = rect.top + rect.height / 2;
    const top = Math.max(
      VIEWPORT_PAD,
      Math.min(vh - 200 - VIEWPORT_PAD, desiredTop - 60),
    );
    return { top, left, transform: 'none' };
  }
  if (side === 'bottom') {
    const top = Math.min(rect.bottom + GAP, vh - 200 - VIEWPORT_PAD);
    const left = Math.max(
      VIEWPORT_PAD,
      Math.min(
        vw - BUBBLE_WIDTH - VIEWPORT_PAD,
        rect.left + rect.width / 2 - BUBBLE_WIDTH / 2,
      ),
    );
    return { top, left, transform: 'none' };
  }
  // top
  const top = Math.max(VIEWPORT_PAD, rect.top - GAP - 220);
  const left = Math.max(
    VIEWPORT_PAD,
    Math.min(
      vw - BUBBLE_WIDTH - VIEWPORT_PAD,
      rect.left + rect.width / 2 - BUBBLE_WIDTH / 2,
    ),
  );
  return { top, left, transform: 'none' };
}

// Spotlight is the dim/blur layer with a transparent hole around the
// anchored element. Drawn via two stacked elements so the cutout stays
// crisp and animates with the anchor.
function Spotlight({ anchor }: { anchor: Anchor | null }) {
  if (!anchor) {
    return (
      <div
        className="fixed inset-0 z-[90] bg-[hsl(var(--surface)/0.92)] supports-backdrop-filter:backdrop-blur-md"
        aria-hidden="true"
      />
    );
  }
  const { rect } = anchor;
  const pad = 6;
  const ringStyle: React.CSSProperties = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  return (
    <>
      {/* Full-screen dim — pointer-events on so clicks outside the
          bubble are absorbed (and don't accidentally trigger nav). */}
      <div
        className="fixed inset-0 z-[90] bg-foreground/45 supports-backdrop-filter:backdrop-blur-[2px]"
        aria-hidden="true"
      />
      {/* The "hole": a transparent rounded rect that punches through
          the dim by way of a thick ring + matching background. */}
      <div
        className="fixed z-[91] rounded-3xl ring-[9999px] ring-foreground/0 pointer-events-none"
        aria-hidden="true"
        style={{
          ...ringStyle,
          boxShadow:
            '0 0 0 9999px hsl(var(--foreground) / 0.0), 0 0 0 4px hsl(var(--primary) / 0.6), 0 12px 30px -6px hsl(var(--primary) / 0.45)',
        }}
      />
    </>
  );
}

// Onboarding is the first-run product tour. Steps come from
// /onboarding.json so copy can be tweaked without redeploying. Each
// step targets a sidebar nav element via data-onboarding-key — when
// no anchor exists (welcome / done / mobile overflow items) the
// bubble centers itself like a modal.
export default function Onboarding() {
  const { user, markOnboarded } = useAuth();
  const isMobile = useIsMobile();
  const [doc, setDoc] = useState<OnboardingDoc | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [closing, setClosing] = useState(false);
  const visible = !!user && user.onboarded_at === null && !closing;

  useEffect(() => {
    if (!visible || doc) return;
    fetch('/onboarding.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OnboardingDoc | null) => setDoc(d))
      .catch(() => setDoc(null));
  }, [visible, doc]);

  const steps = doc?.steps ?? [];
  const step = steps[stepIdx];
  const isLast = step ? stepIdx === steps.length - 1 : false;

  // Recompute the anchor every render so it tracks layout shifts
  // (sidebar collapsing, theme animations, etc.). For position, we
  // also re-run on resize/scroll.
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const refresh = useCallback(() => {
    if (!step) return;
    setAnchor(findAnchor(step.key));
  }, [step]);

  useLayoutEffect(() => {
    refresh();
  }, [refresh, stepIdx]);

  useEffect(() => {
    if (!visible) return;
    const handler = () => refresh();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    // Sidebar width transition is 280ms — re-measure once after it
    // finishes so the bubble lands in the correct spot.
    const t = setTimeout(handler, 320);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
      clearTimeout(t);
    };
  }, [visible, refresh]);

  const finish = useMemo(
    () => async () => {
      setClosing(true);
      try {
        await markOnboarded();
      } catch {
        // Server fault shouldn't trap the user behind the tour. Next
        // session restore will re-trigger if onboarded_at is still null.
      }
    },
    [markOnboarded],
  );

  if (!visible || !doc || !step) return null;

  const pos = computePosition(anchor);
  const total = steps.length;

  // Mobile: the desktop spotlight/bubble has nothing to anchor to (the
  // nav rail is md+ only) and its centered fallback blanketed the whole
  // screen. Render a compact bottom sheet instead — content stays
  // visible above a light scrim, steps swipe through with the buttons.
  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 z-[90] bg-[hsl(var(--scrim)/0.45)]"
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={step.title}
          className="fixed inset-x-0 bottom-0 z-[100] rounded-t-[28px] bg-[hsl(var(--surface-container-high))] shadow-[var(--m3-elev-4)] px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        >
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              {stepIdx + 1} / {total}
            </span>
            <button
              type="button"
              onClick={finish}
              className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 -mr-2"
            >
              Skip
            </button>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">{step.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.blurb}</p>

          <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === stepIdx ? 'w-5 bg-[hsl(var(--primary))]' : 'w-1.5 bg-[hsl(var(--outline-variant))]',
                )}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={stepIdx === 0}
              onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            >
              Back
            </Button>
            {isLast ? (
              <Button type="button" onClick={finish} className="rounded-full">
                Open Sajni
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
                className="rounded-full"
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Spotlight anchor={anchor} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        className={cn(
          'fixed z-[100] rounded-3xl bg-[hsl(var(--surface-container-high))] shadow-[var(--m3-elev-3)] p-6',
          'transition-[top,left] duration-200 ease-out',
        )}
        style={{ width: BUBBLE_WIDTH, ...pos }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
            {stepIdx + 1} / {total}
          </span>
          <button
            type="button"
            onClick={finish}
            className="mono text-xs uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
          >
            skip
          </button>
        </div>

        <h2 className="serif text-xl font-semibold tracking-tight">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {step.blurb}
        </p>

        {/* Progress dots */}
        <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === stepIdx
                  ? 'w-5 bg-[hsl(var(--primary))]'
                  : 'w-1.5 bg-[hsl(var(--outline-variant))]',
              )}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          >
            Back
          </Button>
          {isLast ? (
            <Button type="button" size="sm" onClick={finish} className="rounded-full">
              Open Sajni
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
              className="rounded-full"
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
