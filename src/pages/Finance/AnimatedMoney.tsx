import { useLayoutEffect, useRef } from 'react';

import { useFinancePrivacy } from './useFinancePrivacy';
import { formatMoney, moneyParts, MONEY_MASK } from './utils';

interface AnimatedMoneyProps {
  value: number;
  currency?: string;
  duration?: number;
  className?: string;
}

// Count-up for headline figures only, typeset like `Money` (muted ₹, lighter
// paise). Text is updated directly so animation frames do not trigger React
// renders. The invisible final value reserves the full width up front,
// preventing adjacent content from shifting as digits grow.
export function AnimatedMoney({
  value,
  currency = 'INR',
  duration = 520,
  className = '',
}: AnimatedMoneyProps) {
  const valueRef = useRef(0);
  const signRef = useRef<HTMLSpanElement>(null);
  const wholeRef = useRef<HTMLSpanElement>(null);
  const fracRef = useRef<HTMLSpanElement>(null);
  const privacy = useFinancePrivacy();
  const finalText = formatMoney(value, currency, privacy);
  const final = moneyParts(value, currency, privacy);
  const finalSign = final?.sign ?? '';
  const finalWhole = final?.whole ?? MONEY_MASK;
  const finalFrac = final?.fraction ?? '';

  useLayoutEffect(() => {
    const nodes = [signRef.current, wholeRef.current, fracRef.current];
    if (nodes.some((node) => !node)) return;
    const paint = (...texts: string[]) => texts.forEach((text, i) => {
      if (nodes[i]!.textContent !== text) nodes[i]!.textContent = text;
    });
    const paintValue = (v: number) => {
      const parts = moneyParts(v, currency, false);
      if (parts) paint(parts.sign, parts.whole, parts.fraction);
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (privacy) {
      // Keep the real value out of the DOM and reset only the visual baseline.
      // Revealing privacy can then count from zero without remounting any tab.
      valueRef.current = 0;
      paint(finalSign, finalWhole, finalFrac);
      return;
    }
    if (reducedMotion || !Number.isFinite(value) || Object.is(valueRef.current, value)) {
      valueRef.current = value;
      paint(finalSign, finalWhole, finalFrac);
      return;
    }

    const from = valueRef.current;
    let frame = 0;
    let startedAt: number | null = null;

    const tick = (now: number) => {
      startedAt ??= now;
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const displayedValue = from + (value - from) * eased;
      if (progress === 1) paint(finalSign, finalWhole, finalFrac);
      else paintValue(displayedValue);
      valueRef.current = displayedValue;

      if (progress < 1) frame = requestAnimationFrame(tick);
      else valueRef.current = value;
    };

    paintValue(from);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [currency, duration, finalSign, finalWhole, finalFrac, privacy, value]);

  const symbol = final && <span className="money-symbol">{final.symbol}</span>;
  return (
    <span className={`money inline-grid align-baseline ${className}`}>
      <span className="sr-only">{finalText}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {finalSign}{symbol}{finalWhole}<span className="money-fraction">{finalFrac}</span>
      </span>
      <span aria-hidden className="col-start-1 row-start-1">
        <span ref={signRef}>{finalSign}</span>
        {symbol}
        <span ref={wholeRef}>{finalWhole}</span>
        <span ref={fracRef} className="money-fraction">{finalFrac}</span>
      </span>
    </span>
  );
}
