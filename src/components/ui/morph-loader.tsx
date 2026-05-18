// MorphLoader — true SVG `d` interpolation between M3 expressive shapes,
// the way Android's MaterialShapeMorph does it. Flubber computes a single
// smooth tween between any two path strings (rebuilding control points
// as needed) and we drive `t` with rAF.

import { useEffect, useRef, useState } from 'react';
// Flubber has no first-party types — we declare just the slice we use.
 
// @ts-expect-error - flubber ships no types
import { interpolate } from 'flubber';

// Curated M3 shape set — sourced from sajni-design/m3-shapes via raw imports.
import shape12Cookie from '@/assets/m3-shapes/12-sided-cookie.svg?raw';
import shape7Cookie from '@/assets/m3-shapes/7-sided-cookie.svg?raw';
import shape8Clover from '@/assets/m3-shapes/8-leaf-clover.svg?raw';
import shapeSoftBurst from '@/assets/m3-shapes/soft-burst.svg?raw';
import shapeFlower from '@/assets/m3-shapes/flower.svg?raw';
import shapePentagon from '@/assets/m3-shapes/pentagon.svg?raw';
import shapeHexagon from '@/assets/m3-shapes/hexagon.svg?raw';
import shapeGem from '@/assets/m3-shapes/gem.svg?raw';
import shapeVerySun from '@/assets/m3-shapes/very-sun.svg?raw';

function extractPathD(svg: string): string {
  const m = svg.match(/d="([^"]+)"/);
  return m ? m[1] : '';
}

const MORPH_SHAPES: string[] = [
  extractPathD(shape8Clover),
  extractPathD(shapeFlower),
  extractPathD(shape7Cookie),
  extractPathD(shapeSoftBurst),
  extractPathD(shape12Cookie),
  extractPathD(shapeVerySun),
  extractPathD(shapeGem),
  extractPathD(shapeHexagon),
  extractPathD(shapePentagon),
].filter(Boolean);

export type MorphSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type MorphTone = 'primary' | 'secondary' | 'tertiary';

const SIZE_PX: Record<MorphSize, number> = {
  xs: 14, sm: 18, md: 28, lg: 44, xl: 64,
};

// One full morph step (px → next shape) in ms. Total loop = STEP × shapes.
const STEP_MS = 700;
// Rotation period in ms — slow continuous spin, independent of morphing.
const SPIN_MS = 2800;

export interface MorphLoaderProps {
  size?: MorphSize;
  tone?: MorphTone;
  className?: string;
}

export function MorphLoader({ size = 'md', tone = 'primary', className }: MorphLoaderProps) {
  const px = SIZE_PX[size];
  const colorVar = tone === 'tertiary' ? '--tertiary'
                : tone === 'secondary' ? '--secondary'
                : '--primary';
  const [d, setD] = useState<string>(MORPH_SHAPES[0]);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const interpRef = useRef<((t: number) => string) | null>(null);
  const indexRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || MORPH_SHAPES.length < 2) return;

    const nextInterp = () => {
      const from = MORPH_SHAPES[indexRef.current];
      indexRef.current = (indexRef.current + 1) % MORPH_SHAPES.length;
      const to = MORPH_SHAPES[indexRef.current];
      // maxSegmentLength keeps the tween smooth on detailed shapes; lower
      // values = more interpolation points = smoother but heavier.
      interpRef.current = interpolate(from, to, { maxSegmentLength: 6 });
      startRef.current = performance.now();
    };

    nextInterp();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / STEP_MS);
      // easeInOut quad — matches Material's standard motion curve.
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      if (interpRef.current) setD(interpRef.current(eased));
      if (t >= 1) {
        nextInterp();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <span
      role="status"
      aria-label="Loading"
      className={`morph-loader ${className || ''}`.trim()}
      style={{
        width: px,
        height: px,
        color: `hsl(var(${colorVar}))`,
        display: 'inline-block',
        animation: `morphLoaderSpin ${SPIN_MS}ms linear infinite`,
        transformOrigin: '50% 50%',
      }}
    >
      <svg
        viewBox="0 0 380 380"
        width={px}
        height={px}
        aria-hidden="true"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <path d={d} fill="currentColor" />
      </svg>
    </span>
  );
}
