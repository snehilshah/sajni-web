// MorphLoader — Material 3 Expressive Shape-Morphing Loading Spinner
// Rebuilt to use runtime flubber interpolation and direct DOM manipulation
// for 100% robust, smooth 60fps/120fps hardware-accelerated animations
// across all browsers, bypassing SMIL limitations.

import { useEffect, useRef } from 'react';
import pkg from 'flubber';
import { M3_SHAPES_DATA } from './m3-shapes-data';

const { interpolate } = pkg;

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

// Default shape sequences for presets
export const MORPH_PRESETS: Record<MorphPreset, string[]> = {
  android16: ['circle', 'square', 'pentagon', 'hexagon', '4-sided-cookie', '7-sided-cookie', 'very-sun'],
  cookies: ['4-sided-cookie', '6-sided-cookie', '7-sided-cookie', '9-sided-cookie', '12-sided-cookie'],
  polygons: ['circle', 'triangle', 'square', 'pentagon', 'hexagon'],
  playful: ['heart', '8-leaf-clover', 'flower', 'ghost-ish', 'gem', 'diamond', 'pill'],
};

export interface MorphLoaderProps {
  /** Size preset ('xs' to 'xl') or a custom width/height in pixels */
  size?: MorphSize;
  /** HSL color tone matching the design theme */
  tone?: MorphTone;
  /** Shape preset sequence */
  preset?: MorphPreset;
  /** Custom list of shape names from the 25 SVG assets */
  shapes?: string[];
  /** Easing style for rotation. 'expressive' uses synchronized bouncy spring steps */
  rotationStyle?: 'expressive' | 'linear' | 'none';
  /** Total animation loop duration in seconds */
  duration?: number;
  /** Render mode: solid fill or outline stroke */
  mode?: 'fill' | 'stroke';
  /** Stroke width in pixels (only applies in 'stroke' mode) */
  strokeWidth?: number;
  /** Additional CSS class names */
  className?: string;
}

// Cubic bezier solver for springy expressive easing (0.34, 1.56, 0.64, 1.0)
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
      if (Math.abs(currentX - x) < 1e-5) break;
      if (Math.abs(derivativeX) < 1e-5) break;
      t -= (currentX - x) / derivativeX;
    }
    return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  };
}

const easeExpressive = solveCubicBezier(0.34, 1.56, 0.64, 1.0);

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
  // Determine pixel size
  const px = typeof size === 'number' ? size : SIZE_PX[size] || SIZE_PX.md;

  // HSL Color variable map
  const colorVar =
    tone === 'tertiary' ? '--tertiary' : tone === 'secondary' ? '--secondary' : '--primary';

  // Pick shape list
  const activeShapes = shapes && shapes.length > 0 ? shapes : MORPH_PRESETS[preset] || MORPH_PRESETS.android16;
  const validShapes = activeShapes.filter((s) => s in M3_SHAPES_DATA);
  const shapeList = validShapes.length > 0 ? validShapes : ['circle'];

  const durSec = duration || shapeList.length * 0.65;

  // DOM Refs for high-performance direct manipulation (flawless 60/120fps)
  const pathRef = useRef<SVGPathElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const interpolatorsRef = useRef<any[]>([]);

  // 1. Pre-compile interpolators on shape list change
  useEffect(() => {
    const S = shapeList.length;
    const list: any[] = [];
    for (let i = 0; i < S; i++) {
      try {
        const fromPath = M3_SHAPES_DATA[shapeList[i]];
        const toPath = M3_SHAPES_DATA[shapeList[(i + 1) % S]];
        // We use maxSegmentLength: 5 for optimal performance/smoothness balance
        list.push(interpolate(fromPath, toPath, { maxSegmentLength: 5 }));
      } catch (err) {
        console.error('Error compiling flubber transition:', err);
        list.push(() => M3_SHAPES_DATA[shapeList[i]]);
      }
    }
    interpolatorsRef.current = list;
  }, [shapeList]);

  // 2. High-performance requestAnimationFrame loop
  useEffect(() => {
    let animId: number;
    const t0 = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const progress = (elapsed % durSec) / durSec; // 0 to 1

      const S = shapeList.length;
      const shapeProgress = progress * S;
      const i = Math.floor(shapeProgress); // active shape index
      const f = shapeProgress - i; // progress within this shape cycle (0 to 1)

      // A. Path Morphing Calculation
      let currentD = M3_SHAPES_DATA[shapeList[i]];
      if (interpolatorsRef.current[i]) {
        if (f < 0.35) {
          // Hold phase (first 35% of cycle duration)
          currentD = M3_SHAPES_DATA[shapeList[i]];
        } else {
          // Morph phase (remaining 65% of cycle duration)
          const morphT = (f - 0.35) / 0.65;
          const easedT = easeExpressive(morphT);
          currentD = interpolatorsRef.current[i](easedT);
        }
      }

      // Update Path DOM directly
      if (pathRef.current) {
        pathRef.current.setAttribute('d', currentD);
      }

      // B. Rotation Transform Calculation
      let angle = 0;
      if (rotationStyle === 'expressive') {
        const angleStart = i * 90;
        if (f < 0.35) {
          // Slowly drift 12 degrees during hold
          const holdT = f / 0.35;
          angle = angleStart + holdT * 12;
        } else {
          // Bouncy spring step to the next 90-degree milestone
          const morphT = (f - 0.35) / 0.65;
          const easedT = easeExpressive(morphT);
          angle = angleStart + 12 + easedT * 78;
        }
      } else if (rotationStyle === 'linear') {
        angle = (progress * 360 * 1.5) % 360;
      }

      // Update Group DOM directly
      if (groupRef.current) {
        if (rotationStyle !== 'none') {
          groupRef.current.setAttribute('transform', `rotate(${angle.toFixed(2)} 190 190)`);
        } else {
          groupRef.current.removeAttribute('transform');
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [shapeList, durSec, rotationStyle]);

  // Styles for stroke/fill modes
  const isStroke = mode === 'stroke';
  const fillAttr = isStroke ? 'none' : 'currentColor';
  const strokeAttr = isStroke ? 'currentColor' : 'none';

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
      }}
    >
      <svg
        viewBox="0 0 380 380"
        width={px}
        height={px}
        aria-hidden="true"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <g ref={groupRef}>
          <path
            ref={pathRef}
            d={M3_SHAPES_DATA[shapeList[0]]}
            fill={fillAttr}
            stroke={strokeAttr}
            strokeWidth={isStroke ? strokeWidth : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </span>
  );
}
