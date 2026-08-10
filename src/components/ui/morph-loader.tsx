// MorphLoader — Material 3 Expressive Shape-Morphing Loading Spinner

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { M3_SHAPES_DATA } from './m3-shapes-data';

type PathFn = (t: number) => string;
const HOLD_FRACTION = 0.35;
const MORPH_FRACTION = 1 - HOLD_FRACTION;
const EXPRESSIVE_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const interpolatorCache = new Map<string, PathFn>();

export type MorphSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
export type MorphTone = 'primary' | 'secondary' | 'tertiary';
export type MorphPreset = 'android16' | 'cookies' | 'polygons' | 'playful';

const SIZE_PX: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number> = {
  xs: 14,
  sm: 18,
  md: 28,
  lg: 44,
  xl: 64,
};

export const MORPH_PRESETS: Record<MorphPreset, string[]> = {
  android16: ['square', 'pentagon', 'hexagon', '4-sided-cookie', '7-sided-cookie', 'very-sun'],
  cookies: ['4-sided-cookie', '6-sided-cookie', '7-sided-cookie', '9-sided-cookie', '12-sided-cookie'],
  polygons: ['triangle', 'square', 'pentagon', 'hexagon'],
  playful: ['heart', '8-leaf-clover', 'flower', 'ghost-ish', 'gem', 'diamond', 'pill'],
};

export interface MorphLoaderProps {
  size?: MorphSize;
  tone?: MorphTone;
  preset?: MorphPreset;
  shapes?: string[];
  rotationStyle?: 'expressive' | 'linear' | 'none';
  duration?: number;
  mode?: 'fill' | 'stroke';
  strokeWidth?: number;
  className?: string;
}

function solveCubicBezier(x1: number, y1: number, x2: number, y2: number) {
  return function (x: number) {
    if (x === 0 || x === 1) return x;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const currentX =
        3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
      const derivativeX =
        3 * (1 - t) * (1 - t) * x1 +
        6 * (1 - t) * t * (x2 - x1) +
        3 * t * t * (1 - x2);
      if (Math.abs(currentX - x) < 1e-5 || Math.abs(derivativeX) < 1e-5) break;
      t -= (currentX - x) / derivativeX;
    }
    return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  };
}

const easeExpressive = solveCubicBezier(0.34, 1.56, 0.64, 1.0);

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function rotationKeyframes(shapeCount: number, rotationStyle: 'expressive' | 'linear') {
  if (rotationStyle === 'linear') {
    return [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(540deg)' },
    ];
  }

  const frames: Keyframe[] = [];
  for (let index = 0; index < shapeCount; index++) {
    frames.push({
      offset: index / shapeCount,
      transform: `rotate(${index * 90}deg)`,
      easing: 'linear',
    });
    frames.push({
      offset: (index + HOLD_FRACTION) / shapeCount,
      transform: `rotate(${index * 90 + 12}deg)`,
      easing: EXPRESSIVE_EASING,
    });
  }
  frames.push({ offset: 1, transform: `rotate(${shapeCount * 90}deg)` });
  return frames;
}

export function MorphLoader({
  size = 'md',
  tone = 'primary',
  preset = 'android16',
  shapes,
  rotationStyle = 'expressive',
  duration,
  mode = 'fill',
  strokeWidth = 14,
  className,
}: MorphLoaderProps) {
  const px = typeof size === 'number' ? size : SIZE_PX[size] || SIZE_PX.md;
  const colorVar =
    tone === 'tertiary' ? '--tertiary' : tone === 'secondary' ? '--secondary' : '--primary';
  const activeShapes = shapes && shapes.length > 0 ? shapes : MORPH_PRESETS[preset] || MORPH_PRESETS.android16;
  const validShapes = activeShapes.filter((shape) => shape in M3_SHAPES_DATA);
  const shapeKey = (validShapes.length > 0 ? validShapes : ['square']).join('|');
  const shapeList = useMemo(() => shapeKey.split('|'), [shapeKey]);
  const durSec = duration || shapeList.length * 0.65;
  const cycleSec = durSec / shapeList.length;
  // Start at the morph boundary instead of spending the first ~230 ms on an
  // almost-invisible square hold. It is the same loop, just a useful phase.
  const phaseOffsetMs = cycleSec * HOLD_FRACTION * 1000;
  // Keep roughly 1.25 display pixels between interpolation points. Small
  // spinners no longer calculate thousands of sub-pixel path coordinates.
  const maxSegmentLength = Math.max(5, Math.min(24, Math.round(475 / Math.max(px, 1))));
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    prefersReducedMotion,
    () => true,
  );
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Rotation is handled by the browser animation engine, so it begins as soon
  // as the loader paints and does not compete with path interpolation in JS.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || reducedMotion || rotationStyle === 'none') return;

    const animation = svg.animate(rotationKeyframes(shapeList.length, rotationStyle), {
      duration: durSec * 1000,
      iterations: Infinity,
    });
    animation.currentTime = phaseOffsetMs;
    return () => animation.cancel();
  }, [durSec, phaseOffsetMs, reducedMotion, rotationStyle, shapeList.length]);

  // Flubber is loaded after the first paint instead of blocking the startup
  // bundle. Its compiled transitions are cached for every later loader.
  useEffect(() => {
    if (reducedMotion || shapeList.length < 2) return;

    let cancelled = false;
    let animId = 0;
    let holdTimer = 0;
    const startedAt = performance.now() - phaseOffsetMs;

    void import('flubber').then(({ default: flubber }) => {
      if (cancelled) return;

      const interpolators = shapeList.map((shape, index) => {
        const nextShape = shapeList[(index + 1) % shapeList.length];
        const cacheKey = `${shape}>${nextShape}@${maxSegmentLength}`;
        const cached = interpolatorCache.get(cacheKey);
        if (cached) return cached;

        try {
          const compiled = flubber.interpolate(
            M3_SHAPES_DATA[shape],
            M3_SHAPES_DATA[nextShape],
            { maxSegmentLength },
          );
          interpolatorCache.set(cacheKey, compiled);
          return compiled;
        } catch {
          return () => M3_SHAPES_DATA[shape];
        }
      });

      let lastHeldShape = -1;
      const tick = (now: number) => {
        if (cancelled) return;
        const progress = ((now - startedAt) / 1000 % durSec) / durSec;
        const shapeProgress = progress * shapeList.length;
        const index = Math.floor(shapeProgress);
        const fraction = shapeProgress - index;

        if (fraction < HOLD_FRACTION) {
          if (lastHeldShape !== index) {
            pathRef.current?.setAttribute('d', M3_SHAPES_DATA[shapeList[index]]);
            lastHeldShape = index;
          }
          // The path is static during the hold; wake up when morphing resumes.
          const remainingHoldMs = (HOLD_FRACTION - fraction) * cycleSec * 1000;
          holdTimer = window.setTimeout(() => {
            animId = requestAnimationFrame(tick);
          }, remainingHoldMs);
          return;
        }

        lastHeldShape = -1;
        const morphProgress = (fraction - HOLD_FRACTION) / MORPH_FRACTION;
        pathRef.current?.setAttribute('d', interpolators[index](easeExpressive(morphProgress)));
        animId = requestAnimationFrame(tick);
      };

      animId = requestAnimationFrame(tick);
    }).catch(() => {
      // Rotation remains a useful loader if the deferred morph chunk fails.
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      window.clearTimeout(holdTimer);
    };
  }, [cycleSec, durSec, maxSegmentLength, phaseOffsetMs, reducedMotion, shapeList]);

  const isStroke = mode === 'stroke';
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`morph-loader ${className || ''}`.trim()}
      style={{
        width: px,
        height: px,
        minWidth: px,
        maxWidth: px,
        minHeight: px,
        maxHeight: px,
        flex: `0 0 ${px}px`,
        color: `hsl(var(${colorVar}))`,
        display: 'inline-block',
        lineHeight: 0,
      }}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 380 380"
        width={px}
        height={px}
        aria-hidden="true"
        style={{
          display: 'block',
          overflow: 'visible',
          transformOrigin: 'center',
          transform: rotationStyle === 'none'
            ? undefined
            : rotationStyle === 'linear'
              ? `rotate(${(HOLD_FRACTION / shapeList.length) * 540}deg)`
              : 'rotate(12deg)',
        }}
      >
        <g>
          <path
            ref={pathRef}
            d={M3_SHAPES_DATA[shapeList[0]]}
            fill={isStroke ? 'none' : 'currentColor'}
            stroke={isStroke ? 'currentColor' : 'none'}
            strokeWidth={isStroke ? strokeWidth : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </span>
  );
}
