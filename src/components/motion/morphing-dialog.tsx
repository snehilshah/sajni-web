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
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 z-10 size-8 inline-flex items-center justify-center rounded-full bg-secondary text-foreground/80 hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
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
  const ref = useRef<HTMLDivElement>(null);
  const [isPresent, safeToRemove] = usePresence();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !sourceRect) return;

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
    const animation = el.animate(
      isPresent ? [from, to] : [to, from],
      {
        duration: isPresent ? 320 : 250,
        easing: isPresent ? 'cubic-bezier(0.2, 0, 0, 1)' : 'cubic-bezier(0.4, 0, 1, 1)',
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
      layoutId={sourceRect ? undefined : layoutId}
      initial={sourceRect || layoutId ? undefined : { opacity: 0, scale: 0.96, y: 10 }}
      animate={sourceRect || layoutId ? undefined : { opacity: 1, scale: 1, y: 0 }}
      exit={sourceRect || layoutId ? undefined : { opacity: 0, scale: 0.97, y: 6 }}
      transition={{ type: 'spring', stiffness: 340, damping: 32 }}
      style={{ transformOrigin: '0 0' }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
