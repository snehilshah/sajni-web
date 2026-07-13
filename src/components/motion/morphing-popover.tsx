import {
  useCallback, useEffect, useId, useRef,
  type CSSProperties, type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { cn } from '@/lib/utils';

// MorphingPopover — motion-primitives-style popover where the TRIGGER
// morphs into the floating panel (shared layoutId) instead of a detached
// panel popping in. Controlled: host owns `open`. Esc and outside-click
// close. Kept deliberately small: no focus trap, no portal — panels stay
// near their trigger inside the same stacking context.
export function MorphingPopover({
  open, onOpenChange, trigger, children,
  panelClassName, panelStyle, className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rendered while closed; the whole thing is the morph source. */
  trigger: ReactNode;
  /** Panel contents while open. */
  children: ReactNode;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  className?: string;
}) {
  const morphId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {/* Invisible trigger placeholder while open — holds the host row's
          layout steady so the pill doesn't reflow during the morph. */}
      {open && <div className="invisible" aria-hidden="true">{trigger}</div>}
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.div
            key="panel"
            layoutId={morphId}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn(
              'absolute top-0 left-0 z-50 rounded-3xl border border-[hsl(var(--outline-variant))] bg-popover text-popover-foreground shadow-[var(--m3-elev-3)] overflow-hidden',
              panelClassName,
            )}
            style={{
              ...panelStyle,
              transformOrigin: panelStyle?.transformOrigin ?? (panelStyle?.right != null ? 'top right' : 'top left'),
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.16, delay: 0.06 } }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
            >
              {children}
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key="trigger" layoutId={morphId} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
            {trigger}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
