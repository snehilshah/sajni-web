import { useId } from 'react';

import { cn } from '@/lib/utils';

// M3 Expressive linear progress: the filled track is a living sine wave,
// the remaining track is a flat hairline with the spec's stop dot at the
// far end. `active` drifts the wave sideways (pure CSS transform on a
// path drawn wider than the clip window — no per-frame JS). At 100% the
// wave settles into a flat, calm line.
//
// Geometry lives in a fixed 200×12 viewBox stretched with
// preserveAspectRatio="none"; the wave just elongates with width, which
// keeps it smooth at any size.
const VIEW_W = 200;
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

// One extra wavelength beyond the widest possible fill so the drift loop
// (translateX by -WAVELEN) never exposes a bare edge.
const WAVE_D = sinePath(VIEW_W + WAVELEN);

export function WavyProgress({
  value, height = 10, active = false, className, label,
}: {
  /** 0–100 */
  value: number;
  height?: number;
  /** Drift the wave (in-progress feel). Static when false. */
  active?: boolean;
  className?: string;
  label?: string;
}) {
  const clipId = useId();
  const pct = Math.max(0, Math.min(100, value));
  const fill = (pct / 100) * VIEW_W;
  const done = pct >= 100;
  const gap = 5;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={cn('block overflow-visible', className)}
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
          x1="1.5" y1={MID} x2={VIEW_W - 1.5} y2={MID}
          stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round"
        />
      ) : (
        <>
          {fill > 1 && (
            <g clipPath={`url(#${clipId})`}>
              <path
                d={WAVE_D}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeLinecap="round"
                className={active ? 'sajni-wave-drift' : undefined}
              />
            </g>
          )}
          {/* Remaining track + M3 stop indicator. */}
          {fill + gap < VIEW_W - 4 && (
            <line
              x1={Math.max(fill + gap, 2)} y1={MID} x2={VIEW_W - 6} y2={MID}
              stroke="hsl(var(--outline-variant))" strokeWidth="3" strokeLinecap="round"
            />
          )}
          <circle cx={VIEW_W - 2} cy={MID} r="2" fill="hsl(var(--primary))" />
        </>
      )}
    </svg>
  );
}
