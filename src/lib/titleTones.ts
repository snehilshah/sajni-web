import type { CSSProperties } from 'react';

/**
 * A media title's own colours, made from its poster's main colour (the API's
 * `poster_color`, "#rrggbb"). Same recipe as Android's `titleTones`: a soft
 * container in the poster's hue with dark text, and a deeper accent for its
 * buttons and progress; dark mode flips the tones. Returned as CSS variables
 * (`--tt-*` for light, `--tt-*-d` for dark) so classes pick per theme:
 * `bg-[var(--tt-container)] dark:bg-[var(--tt-container-d)]`.
 */
export function titleToneVars(hex: string | undefined): CSSProperties {
  const hsl = hexToHsl(hex);
  if (!hsl) {
    const theme = {
      accent: 'hsl(var(--primary))',
      onAccent: 'hsl(var(--on-primary))',
      container: 'hsl(var(--secondary-container))',
      onContainer: 'hsl(var(--on-secondary-container))',
    };
    return vars(theme, theme);
  }
  const [h, s] = hsl;
  const tone = (sat: number, light: number) =>
    `hsl(${h.toFixed(1)} ${(Math.min(1, Math.max(0, sat)) * 100).toFixed(1)}% ${(light * 100).toFixed(1)}%)`;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return vars(
    {
      accent: tone(clamp(s, 0.35, 0.75), 0.33),
      onAccent: '#fff',
      container: tone(Math.min(s, 0.6), 0.9),
      onContainer: tone(Math.min(s, 0.6), 0.13),
    },
    {
      accent: tone(clamp(s, 0.35, 0.75), 0.76),
      onAccent: tone(0.5, 0.12),
      container: tone(Math.min(s, 0.4), 0.21),
      onContainer: tone(Math.min(s, 0.35), 0.91),
    },
  );
}

type Tones = { accent: string; onAccent: string; container: string; onContainer: string };

function vars(light: Tones, dark: Tones): CSSProperties {
  return {
    '--tt-accent': light.accent,
    '--tt-on-accent': light.onAccent,
    '--tt-container': light.container,
    '--tt-on-container': light.onContainer,
    '--tt-accent-d': dark.accent,
    '--tt-on-accent-d': dark.onAccent,
    '--tt-container-d': dark.container,
    '--tt-on-container-d': dark.onContainer,
  } as CSSProperties;
}

/** Hue (degrees) and saturation (0–1) of "#rrggbb"; null when it isn't one. */
function hexToHsl(hex: string | undefined): [number, number] | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s];
}

/** Tailwind classes reading the tone variables, light and dark. */
export const tt = {
  container: 'bg-[var(--tt-container)] dark:bg-[var(--tt-container-d)]',
  onContainer: 'text-[var(--tt-on-container)] dark:text-[var(--tt-on-container-d)]',
  accentBg: 'bg-[var(--tt-accent)] dark:bg-[var(--tt-accent-d)]',
  onAccent: 'text-[var(--tt-on-accent)] dark:text-[var(--tt-on-accent-d)]',
  accentText: 'text-[var(--tt-accent)] dark:text-[var(--tt-accent-d)]',
  accentBorder: 'border-[var(--tt-accent)] dark:border-[var(--tt-accent-d)]',
};
