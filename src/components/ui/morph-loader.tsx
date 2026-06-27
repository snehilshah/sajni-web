// MorphLoader — Material 3 Expressive Shape-Morphing Loading Spinner

import { useEffect, useRef } from 'react';
import pkg from 'flubber';
import { M3_SHAPES_DATA } from './m3-shapes-data';

const { interpolate } = pkg;

type PathFn = (t: number) => string;

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
  const shapeList = validShapes.length > 0 ? validShapes : ['square'];
  const durSec = duration || shapeList.length * 0.65;
  const pathRef = useRef<SVGPathElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const interpolatorsRef = useRef<PathFn[]>([]);

  useEffect(() => {
    const list: PathFn[] = [];
    for (let i = 0; i < shapeList.length; i++) {
      try {
        list.push(interpolate(
          M3_SHAPES_DATA[shapeList[i]],
          M3_SHAPES_DATA[shapeList[(i + 1) % shapeList.length]],
          { maxSegmentLength: 5 },
        ));
      } catch {
        list.push(() => M3_SHAPES_DATA[shapeList[i]]);
      }
    }
    interpolatorsRef.current = list;
  }, [shapeList]);

  useEffect(() => {
    let animId: number;
    const startedAt = performance.now();

    const tick = () => {
      const progress = ((performance.now() - startedAt) / 1000 % durSec) / durSec;
      const shapeProgress = progress * shapeList.length;
      const index = Math.floor(shapeProgress);
      const fraction = shapeProgress - index;
      let path = M3_SHAPES_DATA[shapeList[index]];

      if (interpolatorsRef.current[index] && fraction >= 0.35) {
        path = interpolatorsRef.current[index](easeExpressive((fraction - 0.35) / 0.65));
      }
      pathRef.current?.setAttribute('d', path);

      if (rotationStyle === 'none') {
        groupRef.current?.removeAttribute('transform');
      } else {
        let angle: number;
        if (rotationStyle === 'linear') {
          angle = (progress * 360 * 1.5) % 360;
        } else {
          const start = index * 90;
          angle = fraction < 0.35
            ? start + (fraction / 0.35) * 12
            : start + 12 + easeExpressive((fraction - 0.35) / 0.65) * 78;
        }
        groupRef.current?.setAttribute('transform', `rotate(${angle.toFixed(2)} 190 190)`);
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [shapeList, durSec, rotationStyle]);

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
