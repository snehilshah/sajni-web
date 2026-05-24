// applyM3 — turn three seed hex colors into the full M3 token set the
// app uses (primary, secondary, tertiary, surface family, outlines,
// chart colors, sidebar, backdrop) and write them to the document root
// as HSL CSS variables for both the light and dark modes simultaneously.

import {
  argbFromHex,
  hexFromArgb,
  TonalPalette,
  Hct,
} from '@material/material-color-utilities';

export interface ThemeSeeds {
  primary: string;
  secondary: string;
  tertiary: string;
  neutral?: string;
}

// One M3 tonal palette per seed. Neutral is derived if missing: take
// the primary's hue and slam the chroma down to 6 so the surface family
// reads as a tinted grey rather than a saturated wash.
function palettes(seeds: ThemeSeeds) {
  const primary = TonalPalette.fromInt(argbFromHex(seeds.primary));
  const secondary = TonalPalette.fromInt(argbFromHex(seeds.secondary));
  const tertiary = TonalPalette.fromInt(argbFromHex(seeds.tertiary));
  let neutral: TonalPalette;
  if (seeds.neutral) {
    neutral = TonalPalette.fromInt(argbFromHex(seeds.neutral));
  } else {
    // Take primary hue but slam chroma down to 2 so the surface family
    // reads as near-pure grey. Higher chroma (was 6) tinted card
    // backgrounds noticeably "dull reddish/greenish" on warm/cool seeds.
    const h = Hct.fromInt(argbFromHex(seeds.primary)).hue;
    neutral = TonalPalette.fromHueAndChroma(h, 2);
  }
  // Neutral-variant carries slightly more chroma — used for outline
  // tokens where a hint of color is desirable. Cap at 4 to stay subtle.
  const neutralVariantHue = Hct.fromInt(argbFromHex(seeds.primary)).hue;
  const neutralVariant = TonalPalette.fromHueAndChroma(neutralVariantHue, 4);
  // Error is fixed across all themes — M3 reference red.
  const error = TonalPalette.fromHueAndChroma(25, 84);
  return { primary, secondary, tertiary, neutral, neutralVariant, error };
}

// hexFromTone → "h s% l%" so we can drop it straight into a CSS var
// referenced like `hsl(var(--primary))`.
function hslFromTone(p: TonalPalette, tone: number): string {
  return hexToHsl(hexFromArgb(p.tone(tone)));
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// M3 token → tonal-palette + tone for light + dark modes. Values follow
// the canonical Material 3 specification.
type Pal = ReturnType<typeof palettes>;
type Plan = (p: Pal) => { light: string; dark: string };
const tokens: Record<string, Plan> = {
  // Primary
  primary:                   (p) => mode(p.primary, 40, 80),
  'on-primary':              (p) => mode(p.primary, 100, 20),
  'primary-container':       (p) => mode(p.primary, 90, 30),
  'on-primary-container':    (p) => mode(p.primary, 10, 90),
  // Secondary
  secondary:                 (p) => mode(p.secondary, 40, 80),
  'on-secondary':            (p) => mode(p.secondary, 100, 20),
  'secondary-container':     (p) => mode(p.secondary, 90, 30),
  'on-secondary-container':  (p) => mode(p.secondary, 10, 90),
  // Tertiary
  tertiary:                  (p) => mode(p.tertiary, 40, 80),
  'on-tertiary':             (p) => mode(p.tertiary, 100, 20),
  'tertiary-container':      (p) => mode(p.tertiary, 90, 30),
  'on-tertiary-container':   (p) => mode(p.tertiary, 10, 90),
  // Error
  error:                     (p) => mode(p.error, 40, 80),
  'on-error':                (p) => mode(p.error, 100, 20),
  'error-container':         (p) => mode(p.error, 90, 30),
  'on-error-container':      (p) => mode(p.error, 10, 90),
  // Surface family
  surface:                   (p) => mode(p.neutral, 98, 6),
  'surface-dim':             (p) => mode(p.neutral, 87, 6),
  'surface-bright':          (p) => mode(p.neutral, 98, 24),
  'surface-container-lowest':(p) => mode(p.neutral, 100, 4),
  'surface-container-low':   (p) => mode(p.neutral, 96, 10),
  'surface-container':       (p) => mode(p.neutral, 94, 12),
  'surface-container-high':  (p) => mode(p.neutral, 92, 17),
  'surface-container-highest': (p) => mode(p.neutral, 90, 22),
  'on-surface':              (p) => mode(p.neutral, 10, 90),
  'on-surface-variant':      (p) => mode(p.neutralVariant, 30, 80),
  outline:                   (p) => mode(p.neutralVariant, 50, 60),
  'outline-variant':         (p) => mode(p.neutralVariant, 80, 30),
  scrim:                     (p) => mode(p.neutral, 0, 0),
  'inverse-surface':         (p) => mode(p.neutral, 20, 90),
  'inverse-on-surface':      (p) => mode(p.neutral, 95, 20),
  'inverse-primary':         (p) => mode(p.primary, 80, 40),
  // Backdrop washes (faint primary/secondary/tertiary in their light tones).
  'backdrop-blob-1':         (p) => mode(p.primary, 92, 24),
  'backdrop-blob-2':         (p) => mode(p.secondary, 92, 22),
  'backdrop-blob-3':         (p) => mode(p.tertiary, 92, 22),
  'backdrop-blob-4':         (p) => mode(p.neutralVariant, 94, 18),
  'backdrop-blob-5':         (p) => mode(p.neutral, 98, 8),
  // Status accents — bias toward tertiary (calm) and secondary (cool).
  'color-complete':          (p) => mode(p.tertiary, 38, 66),
  'color-waiting':           (p) => mode(p.secondary, 44, 68),
  // Media tints (legacy 5-color palette used by chips/charts).
  m1: (p) => mode(p.primary, 86, 24),
  m2: (p) => mode(p.secondary, 86, 24),
  m3: (p) => mode(p.tertiary, 84, 22),
  m4: (p) => mode(p.neutralVariant, 86, 22),
  m5: (p) => mode(p.neutral, 88, 22),
};

function mode(p: TonalPalette, lightTone: number, darkTone: number) {
  return { light: hslFromTone(p, lightTone), dark: hslFromTone(p, darkTone) };
}

export interface AppliedTheme {
  light: Record<string, string>;
  dark: Record<string, string>;
}

// build returns the resolved HSL strings for both modes, but does NOT
// touch the DOM. Useful for previews + the settings panel swatches.
export function buildPalette(seeds: ThemeSeeds): AppliedTheme {
  const pal = palettes(seeds);
  const out: AppliedTheme = { light: {}, dark: {} };
  for (const [name, plan] of Object.entries(tokens)) {
    const m = plan(pal);
    out.light[name] = m.light;
    out.dark[name] = m.dark;
  }
  return out;
}

// applyM3 writes the resolved palette to documentElement as CSS vars.
// The existing index.css default sheet acts as the fallback if no theme
// is active; once we set inline vars they override the stylesheet.
export function applyM3(seeds: ThemeSeeds, mode: 'light' | 'dark' = 'light') {
  const palette = buildPalette(seeds);
  const map = mode === 'dark' ? palette.dark : palette.light;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(map)) {
    root.style.setProperty('--' + name, value);
  }
  root.setAttribute('data-mode', mode);
  root.setAttribute('data-theme', 'custom');
}

// resetM3 strips the inline vars so the stylesheet defaults win again.
export function resetM3() {
  const root = document.documentElement;
  for (const name of Object.keys(tokens)) {
    root.style.removeProperty('--' + name);
  }
  root.removeAttribute('data-theme');
}

// previewSwatches gives the settings UI a small array of representative
// colors for a theme card without applying it globally.
export function previewSwatches(seeds: ThemeSeeds, mode: 'light' | 'dark' = 'light'): string[] {
  const p = palettes(seeds);
  const tone = mode === 'dark' ? 80 : 40;
  return [
    hexFromArgb(p.primary.tone(tone)),
    hexFromArgb(p.secondary.tone(tone)),
    hexFromArgb(p.tertiary.tone(tone)),
    hexFromArgb(p.neutral.tone(mode === 'dark' ? 12 : 94)),
  ];
}
