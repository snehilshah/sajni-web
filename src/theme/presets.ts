// Built-in theme presets. A preset is either a set of M3 seeds (the palette
// is derived by buildPalette — the same engine AI themes use) or a complete
// hand-authored hex palette for themes with a canonical spec (Gruvbox), where
// tonal derivation can't reproduce the real colors. Both resolve to the same
// `AppliedTheme`, so swatches, avatar, and painted CSS always agree.
//
// The stylesheet is compiled at build time (vite.config.ts →
// `virtual:theme-presets.css`) and shipped as a render-blocking <link>, so no
// runtime code ever paints presets and first paint is always correct.

import { buildPalette, fromHex, paletteCss, paletteSwatches, type AppliedTheme, type HexPalette, type ThemeSeeds } from './applyM3';

export type PresetId =
  | 'marine'
  | 'powerpuff'
  | 'gruvbox'
  | 'peach'
  | 'mauve';

export const DEFAULT_PRESET: PresetId = 'marine';

export interface ThemePreset {
  id: PresetId;
  label: string;
  emoji: string;
  palette: AppliedTheme;
}

const seeded = (seeds: ThemeSeeds) => buildPalette(seeds);

// Gruvbox (morhetz/gruvbox). Light uses the "faded" accents and dark the
// "bright" ones — the spec's own pairing for each background. Containers are
// accent-tinted backgrounds. Every text/fill pair clears WCAG AA (4.5:1),
// outlines clear 3:1 on every surface they sit on.
const GRUVBOX_LIGHT: HexPalette = {
  primary: '#076678',
  'on-primary': '#fbf1c7',
  'primary-container': '#c8dcd4',
  'on-primary-container': '#0b3a44',
  secondary: '#8f5902',
  'on-secondary': '#fbf1c7',
  'secondary-container': '#f6d99a',
  'on-secondary-container': '#4a2f02',
  tertiary: '#8f3f71',
  'on-tertiary': '#fbf1c7',
  'tertiary-container': '#efcfd6',
  'on-tertiary-container': '#4d1a3b',
  error: '#9d0006',
  'on-error': '#fbf1c7',
  'error-container': '#f6c9bb',
  'on-error-container': '#5a0a05',
  surface: '#fbf1c7',
  'surface-dim': '#ebdbb2',
  'surface-bright': '#f9f5d7',
  'surface-container-lowest': '#fffbe8',
  'surface-container-low': '#f6ebc1',
  'surface-container': '#f2e5bc',
  'surface-container-high': '#ebdbb2',
  'surface-container-highest': '#e3d2a8',
  'on-surface': '#3c3836',
  'on-surface-variant': '#5a524c',
  outline: '#928374',
  'outline-variant': '#bdae93',
  scrim: '#000000',
  'inverse-surface': '#3c3836',
  'inverse-on-surface': '#fbf1c7',
  'inverse-primary': '#83a598',
  'color-complete': '#66620d',
  'color-waiting': '#af3a03',
};

const GRUVBOX_DARK: HexPalette = {
  primary: '#83a598',
  'on-primary': '#1d2021',
  'primary-container': '#2f4640',
  'on-primary-container': '#c8dcd4',
  secondary: '#fabd2f',
  'on-secondary': '#1d2021',
  'secondary-container': '#5a4516',
  'on-secondary-container': '#fbe3a6',
  tertiary: '#d3869b',
  'on-tertiary': '#1d2021',
  'tertiary-container': '#57343f',
  'on-tertiary-container': '#f5d3dc',
  error: '#fd7a64',
  'on-error': '#1d2021',
  'error-container': '#6b1e17',
  'on-error-container': '#fdd3c9',
  surface: '#282828',
  'surface-dim': '#1d2021',
  'surface-bright': '#45403d',
  'surface-container-lowest': '#1d2021',
  'surface-container-low': '#32302f',
  'surface-container': '#3c3836',
  'surface-container-high': '#45403d',
  'surface-container-highest': '#504945',
  'on-surface': '#ebdbb2',
  'on-surface-variant': '#d5c4a1',
  outline: '#928374',
  'outline-variant': '#665c54',
  scrim: '#000000',
  'inverse-surface': '#ebdbb2',
  'inverse-on-surface': '#282828',
  'inverse-primary': '#076678',
  'color-complete': '#b8bb26',
  'color-waiting': '#fe8019',
};

export const PRESETS: ThemePreset[] = [
  {
    id: 'marine',
    label: 'Marine',
    emoji: '🌊',
    palette: seeded({ primary: '#1F7A8C', secondary: '#3E6B99', tertiary: '#2E8B6B' }),
  },
  {
    id: 'powerpuff',
    label: 'PowerPuff',
    emoji: '🎀',
    palette: seeded({ primary: '#eb6f92', secondary: '#C693EC', tertiary: '#ebbcba' }),
  },
  {
    id: 'gruvbox',
    label: 'Gruvbox',
    emoji: '🍂',
    palette: fromHex({ light: GRUVBOX_LIGHT, dark: GRUVBOX_DARK }),
  },
  {
    id: 'peach',
    label: 'Peach',
    emoji: '🍑',
    palette: seeded({ primary: '#D7897F', secondary: '#F9B95C', tertiary: '#96C7B3' }),
  },
  {
    id: 'mauve',
    label: 'Mauve',
    emoji: '🔮',
    palette: seeded({ primary: '#191724', secondary: '#e0def4', tertiary: '#eb6f92' }),
  },
];

// Picker metadata for the Settings theme row.
export const THEMES: { id: PresetId; label: string; emoji: string }[] =
  PRESETS.map((p) => ({ id: p.id, label: p.label, emoji: p.emoji }));

const VALID = new Set<string>(PRESETS.map((p) => p.id));

// A stored id is used only if it's a current preset; anything else snaps to
// the default. No alias table — themes are final.
export function normalizePreset(id: string | null | undefined): PresetId {
  if (id && VALID.has(id)) return id as PresetId;
  return DEFAULT_PRESET;
}

export function getPreset(id: string | null | undefined): ThemePreset {
  const norm = normalizePreset(id);
  return PRESETS.find((p) => p.id === norm) ?? PRESETS[0];
}

export function presetSwatches(id: PresetId, mode: 'light' | 'dark' = 'light'): string[] {
  return paletteSwatches(getPreset(id).palette, mode);
}

// presetStylesheet compiles every preset (build time only). The default is
// also emitted under `:where(:root)` (0-0-0 specificity) so an unknown or
// missing data-theme still paints a complete palette without competing with
// any real preset selector. Only M3 base tokens are written; shadcn aliases
// in index.css are var() references and re-resolve automatically.
export function presetStylesheet(): string {
  const fallback = getPreset(DEFAULT_PRESET).palette;
  const block = (m: AppliedTheme['light']) =>
    Object.entries(m).map(([k, v]) => `--${k}:${v}`).join(';');
  return [
    `:where(:root){${block(fallback.light)}}`,
    `:where(:root[data-mode="dark"]){${block(fallback.dark)}}`,
    ...PRESETS.map((p) => paletteCss(`[data-theme="${p.id}"]`, p.palette)),
  ].join('\n');
}
