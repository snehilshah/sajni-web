import { useLayoutEffect, useRef } from 'react';

import { useFinancePrivacy } from './useFinancePrivacy';
import { formatMoney } from './utils';

interface AnimatedMoneyProps {
  value: number;
  currency?: string;
  duration?: number;
  className?: string;
}

// Count-up for headline figures only. Text is updated directly so animation
// frames do not trigger React renders. The invisible final value reserves the
// full width up front, preventing adjacent content from shifting as digits grow.
export function AnimatedMoney({
  value,
  currency = 'INR',
  duration = 520,
  className = '',
}: AnimatedMoneyProps) {
  const valueRef = useRef(0);
  const textRef = useRef<HTMLSpanElement>(null);
  const privacy = useFinancePrivacy();
  const finalText = formatMoney(value, currency, privacy);

  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (privacy) {
      // Keep the real value out of the DOM and reset only the visual baseline.
      // Revealing privacy can then count from zero without remounting any tab.
      valueRef.current = 0;
      node.textContent = finalText;
      return;
    }
    if (reducedMotion || !Number.isFinite(value)) {
      valueRef.current = value;
      node.textContent = finalText;
      return;
    }

    const from = valueRef.current;
    if (Object.is(from, value)) {
      node.textContent = finalText;
      return;
    }

    let frame = 0;
    let startedAt: number | null = null;
    let displayedText = '';

    const tick = (now: number) => {
      startedAt ??= now;
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const displayedValue = from + (value - from) * eased;
      const nextText = progress === 1 ? finalText : formatMoney(displayedValue, currency, false);

      if (nextText !== displayedText) {
        node.textContent = nextText;
        displayedText = nextText;
      }
      valueRef.current = displayedValue;

      if (progress < 1) frame = requestAnimationFrame(tick);
      else valueRef.current = value;
    };

    node.textContent = formatMoney(from, currency, false);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [currency, duration, finalText, privacy, value]);

  return (
    <span className={`inline-grid align-baseline ${className}`}>
      <span className="sr-only">{finalText}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">{finalText}</span>
      <span ref={textRef} aria-hidden className="col-start-1 row-start-1">{finalText}</span>
    </span>
  );
}
