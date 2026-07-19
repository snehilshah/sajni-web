import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, usePresence } from 'framer-motion';

import { X } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

// MorphingDialog — modal surface that GROWS out of a source element when
// `layoutId` matches an always-mounted motion element (poster card, "New"
// button), and shrinks back into it on close. Without a matching source
// it falls back to a quiet scale/fade. Esc + backdrop click close.
//
// Deliberately lean: no portal (fixed positioning is enough here), no
// focus trap. Backdrop + panel share z-50 so body-portaled Selects
// (appended later in the DOM) still paint above the panel.
export interface MorphSourceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function MorphingDialog({
  open, onClose, onCloseComplete, layoutId, sourceRect, className, children, ariaLabel,
  showClose = true,
}: {
  open: boolean;
  onClose: () => void;
  onCloseComplete?: () => void;
  /** Shared layoutId of the morph source; omit for scale/fade fallback. */
  layoutId?: string;
  /** Viewport rect captured from the clicked source. Used when layoutId is unstable. */
  sourceRect?: MorphSourceRect;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
  /** Pass false when the dialog has its own footer Cancel — one close CTA only. */
  showClose?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence onExitComplete={onCloseComplete}>
      {open && (
        <>
          <motion.div
            key="md-backdrop"
            className="fixed inset-0 z-50 bg-foreground/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <MorphPanel
            key="md-panel"
            layoutId={layoutId}
            sourceRect={sourceRect}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className={cn(
              'fixed z-50 flex flex-col gap-0 overflow-hidden rounded-[28px] border border-[hsl(var(--outline-variant))] bg-popover text-popover-foreground shadow-2xl',
              className,
            )}
          >
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 z-10 size-8 inline-flex items-center justify-center rounded-full bg-secondary text-foreground/80 hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
            {children}
          </MorphPanel>
        </>
      )}
    </AnimatePresence>
  );
}

function MorphPanel({
  sourceRect, layoutId, className, children, ...props
}: React.ComponentProps<typeof motion.div> & {
  sourceRect?: MorphSourceRect;
}) {
  if (sourceRect) {
    return (
      <RectMorphPanel
        sourceRect={sourceRect}
        className={className}
        {...props}
      >
        {children}
      </RectMorphPanel>
    );
  }

  return (
    <motion.div
      layoutId={layoutId}
      initial={layoutId ? undefined : { opacity: 0, transform: 'translateY(10px) scale(0.96)' }}
      animate={layoutId ? undefined : { opacity: 1, transform: 'translateY(0) scale(1)' }}
      exit={layoutId ? undefined : { opacity: 0, transform: 'translateY(6px) scale(0.97)' }}
      transition={{ type: 'spring', stiffness: 340, damping: 32 }}
      style={{ transformOrigin: '0 0' }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

function RectMorphPanel({
  sourceRect, className, children, ...props
}: React.ComponentProps<typeof motion.div> & {
  sourceRect: MorphSourceRect;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isPresent, safeToRemove] = usePresence();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const final = el.getBoundingClientRect();
    if (!final.width || !final.height) return;

    el.style.transformOrigin = '0 0';
    const dx = sourceRect.left - final.left;
    const dy = sourceRect.top - final.top;
    const sx = Math.max(0.02, sourceRect.width / final.width);
    const sy = Math.max(0.02, sourceRect.height / final.height);
    const sourceRadius = Math.min(28, Math.max(12, Math.min(sourceRect.width, sourceRect.height) / 8));
    const from = {
      opacity: 0.92,
      transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
      borderRadius: `${sourceRadius}px`,
    };
    const to = {
      opacity: 1,
      transform: 'translate(0, 0) scale(1, 1)',
      borderRadius: '28px',
    };
    // Close ENDs at the source rect but fully faded, so the panel crossfades
    // into the poster sitting underneath. Ending at `from`'s 0.92 opacity
    // hard-cut a near-opaque mini-dialog straight to the poster — the flash.
    const closeTo = { ...from, opacity: 0 };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reducedFrom = { opacity: 0 };
    const reducedTo = { opacity: 1 };
    // Open pops out with a snappy decelerate; close eases back into the poster
    // with the slower, gentler Material standard curve so the shrink reads as a
    // deliberate settle rather than a quick snap.
    const animation = el.animate(
      reducedMotion
        ? (isPresent ? [reducedFrom, reducedTo] : [reducedTo, reducedFrom])
        : (isPresent ? [from, to] : [to, closeTo]),
      {
        duration: reducedMotion ? 150 : (isPresent ? 320 : 420),
        easing: isPresent ? 'cubic-bezier(0.23, 1, 0.32, 1)' : 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'both',
      },
    );
    if (!isPresent) {
      animation.finished.finally(() => safeToRemove?.());
    }
    return () => animation.cancel();
  }, [isPresent, safeToRemove, sourceRect]);

  return (
    <motion.div
      ref={ref}
      initial={undefined}
      animate={undefined}
      exit={undefined}
      transition={{ type: 'spring', stiffness: 340, damping: 32 }}
      style={{ transformOrigin: '0 0' }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
