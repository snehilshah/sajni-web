/**
 * M3 Expressive shape sprites + helpers.
 *
 *  <M3Shapes />            — mount once near app root; defines SVG clip-paths
 *                            used by .m3-shape-* utility classes.
 *  <M3CookieLoader />      — shape-morphing first-paint loader. Thin wrapper
 *                            around <MorphLoader />, which interpolates the
 *                            `d` attribute between curated M3 shapes.
 *  <M3LinearLoader />      — indeterminate linear progress bar.
 *  <CookieShape size={64}/> — decorative cookie blob you can place inline.
 */

import { MorphLoader, type MorphSize, type MorphTone } from './morph-loader';

export function M3Shapes() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {/* Legacy clip-paths kept so existing .m3-shape-* utilities still work. */}
        <clipPath id="m3-shape-cookie" clipPathUnits="objectBoundingBox">
          <path d="M0.5,0.02 C0.6,0.02 0.66,0.1 0.72,0.12 C0.78,0.14 0.88,0.1 0.92,0.18 C0.96,0.26 0.9,0.34 0.92,0.42 C0.94,0.5 1,0.56 0.96,0.66 C0.92,0.76 0.82,0.74 0.78,0.82 C0.74,0.9 0.78,0.96 0.68,0.96 C0.58,0.96 0.54,0.92 0.5,0.92 C0.46,0.92 0.42,0.96 0.32,0.96 C0.22,0.96 0.26,0.9 0.22,0.82 C0.18,0.74 0.08,0.76 0.04,0.66 C0,0.56 0.06,0.5 0.08,0.42 C0.1,0.34 0.04,0.26 0.08,0.18 C0.12,0.1 0.22,0.14 0.28,0.12 C0.34,0.1 0.4,0.02 0.5,0.02 Z" />
        </clipPath>
        <clipPath id="m3-shape-clover" clipPathUnits="objectBoundingBox">
          <path d="M0.5,0 C0.7,0 0.85,0.15 0.85,0.35 C0.95,0.35 1,0.5 1,0.5 C1,0.5 0.95,0.65 0.85,0.65 C0.85,0.85 0.7,1 0.5,1 C0.3,1 0.15,0.85 0.15,0.65 C0.05,0.65 0,0.5 0,0.5 C0,0.5 0.05,0.35 0.15,0.35 C0.15,0.15 0.3,0 0.5,0 Z" />
        </clipPath>
        <clipPath id="m3-shape-pentagon" clipPathUnits="objectBoundingBox">
          <path d="M0.5,0.04 C0.62,0.04 0.93,0.27 0.97,0.4 C1.01,0.53 0.8,0.96 0.68,0.96 C0.56,0.96 0.44,0.96 0.32,0.96 C0.2,0.96 -0.01,0.53 0.03,0.4 C0.07,0.27 0.38,0.04 0.5,0.04 Z" />
        </clipPath>
        <clipPath id="m3-shape-sunny" clipPathUnits="objectBoundingBox">
          <path d="M0.5,0 L0.58,0.1 L0.7,0.06 L0.74,0.18 L0.86,0.18 L0.84,0.3 L0.94,0.36 L0.88,0.46 L0.96,0.55 L0.86,0.62 L0.9,0.74 L0.78,0.76 L0.78,0.88 L0.66,0.86 L0.62,0.98 L0.5,0.92 L0.38,0.98 L0.34,0.86 L0.22,0.88 L0.22,0.76 L0.1,0.74 L0.14,0.62 L0.04,0.55 L0.12,0.46 L0.06,0.36 L0.16,0.3 L0.14,0.18 L0.26,0.18 L0.3,0.06 L0.42,0.1 Z" />
        </clipPath>
      </defs>
    </svg>
  );
}

export type CookieSize = MorphSize;
export type CookieTone = MorphTone;

/**
 * M3 Expressive shape-morphing loader. Identical to <MorphLoader />; kept
 * as a named export for legacy call sites.
 */
export const M3CookieLoader = MorphLoader;
export { MorphLoader };

export function M3LinearLoader({ className }: { className?: string }) {
  return <div className={`m3-linear-indeterminate ${className || ''}`.trim()} role="progressbar" aria-label="Loading" />;
}

/** Decorative cookie blob — used for first-paint placeholders and accents. */
export function CookieShape({
  size = 64, tone = 'primary', className,
}: {
  size?: number;
  tone?: CookieTone;
  className?: string;
}) {
  const colorVar = tone === 'tertiary' ? '--tertiary' : tone === 'secondary' ? '--secondary' : '--primary';
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: `hsl(var(${colorVar}))`,
        display: 'inline-block',
      }}
      className={`m3-shape-cookie ${className || ''}`.trim()}
    />
  );
}
