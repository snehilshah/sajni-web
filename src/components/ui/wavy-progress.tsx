import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

// M3 Expressive linear progress: the filled track is a living sine wave,
// the remaining track is a flat hairline with the spec's stop dot at the
// far end. `active` drifts the wave sideways (pure CSS transform on a
// path drawn wider than the clip window — no per-frame JS). At 100% the
// wave settles into a flat, calm line.
//
// The viewBox width tracks the element's real pixel width (measured via
// ResizeObserver), so WAVELEN is a constant 20 CSS pixels no matter how
// long the bar is — a full-row bar gets more waves, not stretched ones.
const VIEW_H = 12;
const MID = VIEW_H / 2;
const WAVELEN = 20;
const AMP = 3.2;

function sinePath(width: number): string {
  const pts: string[] = [`M 0 ${MID}`];
  for (let x = 2; x <= width; x += 2) {
    const y = MID + AMP * Math.sin((x / WAVELEN) * Math.PI * 2);
    pts.push(`L ${x} ${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

export function WavyProgress({
  value, height = 12, active = false, className, label, marker = true,
}: {
  /** 0–100 */
  value: number;
  height?: number;
  /** Drift the wave (in-progress feel). Static when false. */
  active?: boolean;
  className?: string;
  label?: string;
  /** Rounded tick riding the wave head at the current position. */
  marker?: boolean;
}) {
  const clipId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setW(Math.round(entries[0].contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pct = Math.max(0, Math.min(100, value));
  const done = pct >= 100;
  const fill = (pct / 100) * w;
  const gap = 5;

  // One extra wavelength beyond the clip window so the drift loop
  // (translateX by -WAVELEN) never exposes a bare edge.
  const waveD = useMemo(() => (w > 0 ? sinePath(w + WAVELEN) : ''), [w]);

  return (
    // Fixed wrapper height so the first (pre-measure) frame doesn't shift layout.
    <div ref={wrapRef} className={cn('relative min-w-0', className)} style={{ height }}>
    {w > 0 && (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${w} ${VIEW_H}`}
      preserveAspectRatio="none"
      className="block overflow-visible"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="-2" width={Math.max(fill, 0)} height={VIEW_H + 4} rx={MID} />
        </clipPath>
      </defs>

      {/* Filled track — wavy while in flight, flat once complete. */}
      {done ? (
        <line
          x1="1.5" y1={MID} x2={w - 1.5} y2={MID}
          stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round"
        />
      ) : (
        <>
          {fill > 1 && (
            <g clipPath={`url(#${clipId})`}>
              <path
                d={waveD}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeLinecap="round"
                className={active ? 'sajni-wave-drift' : undefined}
              />
            </g>
          )}
          {/* Remaining track + M3 stop indicator. */}
          {fill + gap < w - 4 && (
            <line
              x1={Math.max(fill + gap, 2)} y1={MID} x2={w - 6} y2={MID}
              stroke="hsl(var(--outline-variant))" strokeWidth="3" strokeLinecap="round"
            />
          )}
          <circle cx={w - 2} cy={MID} r="2" fill="hsl(var(--primary))" />
        </>
      )}
    </svg>
    )}
    {/* Head tick — a slider-style handle at the live position. Rendered
        in CSS pixels (not viewBox units) so it never stretches with the
        bar's width. */}
    {marker && !done && pct > 1 && (
      <span
        aria-hidden="true"
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[4px] rounded-full bg-[hsl(var(--primary))] shadow-[0_0_0_2.5px_hsl(var(--surface-container-low))]"
        style={{ left: `${pct}%`, height: height + 6 }}
      />
    )}
    </div>
  );
}
