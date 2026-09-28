// Built-in theme presets. A preset is either a set of M3 seeds (the palette
// is derived by buildPalette — the same engine AI themes use) or a complete
// hand-authored hex palette for themes with a canonical spec (Gruvbox Material), where
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

// Gruvbox Material (sainnhe/gruvbox-material, "medium" background, "material"
// foreground). Surfaces and foregrounds are the spec values verbatim; dark
// containers are its visual-selection tints. The spec's accents are tuned for
// code on bg0, so where one falls short of WCAG AA as a UI role it is shifted
// in lightness only (hue/saturation kept) — noted inline as `spec → tuned`.
// Every text/fill pair clears 4.5:1; outlines clear 3:1 on surfaces they sit on.
const GRUVBOX_LIGHT: HexPalette = {
  primary: '#426c75', //                 blue   #45707a → AA
  'on-primary': '#fbf1c7',
  'primary-container': '#d6e0cf',
  'on-primary-container': '#2a454b',
  secondary: '#8d5907', //               yellow #b47109 → AA
  'on-secondary': '#fbf1c7',
  'secondary-container': '#f5dca6',
  'on-secondary-container': '#5a3a05',
  tertiary: '#885675', //                purple #945e80 → AA
  'on-tertiary': '#fbf1c7',
  'tertiary-container': '#f0d4d9',
  'on-tertiary-container': '#4f2c42',
  error: '#b23d3d', //                   red    #c14a4a → AA
  'on-error': '#fbf1c7',
  'error-container': '#f6d0bd',
  'on-error-container': '#6a1f1f',
  surface: '#fbf1c7', //                 bg0
  'surface-dim': '#f2e5bc', //           bg_dim
  'surface-bright': '#f9f5d7', //        bg0 (hard)
  'surface-container-lowest': '#f9f5d7',
  'surface-container-low': '#f4e8be', // bg1
  'surface-container': '#f2e5bc', //     bg2
  'surface-container-high': '#eee0b7', // bg3
  'surface-container-highest': '#e5d5ad', // bg4
  'on-surface': '#654735', //            fg0
  'on-surface-variant': '#645a51', //    grey2  #7c6f64 → AA
  outline: '#8a7b6c', //                 grey1  #928374 → 3:1
  'outline-variant': '#a89984', //       grey0
  scrim: '#000000',
  'inverse-surface': '#45403d',
  'inverse-on-surface': '#fbf1c7',
  'inverse-primary': '#7daea3',
  'color-complete': '#606b29', //        green  #6c782e → AA
  'color-waiting': '#a34f08', //         orange #c35e0a → AA
};

const GRUVBOX_DARK: HexPalette = {
  primary: '#7daea3', //                 blue
  'on-primary': '#1b1b1b',
  'primary-container': '#374141', //     bg_visual_blue
  'on-primary-container': '#b8d4cc',
  secondary: '#d8a657', //               yellow
  'on-secondary': '#1b1b1b',
  'secondary-container': '#4f422e', //   bg_visual_yellow
  'on-secondary-container': '#ecd3a6',
  tertiary: '#d3869b', //                purple
  'on-tertiary': '#1b1b1b',
  'tertiary-container': '#4a3540',
  'on-tertiary-container': '#efc9d3',
  error: '#ec766f', //                   red    #ea6962 → AA on cards
  'on-error': '#1b1b1b',
  'error-container': '#4c3432', //       bg_visual_red
  'on-error-container': '#f5c2bd',
  surface: '#282828', //                 bg0
  'surface-dim': '#1b1b1b', //           bg_dim
  'surface-bright': '#45403d', //        bg3
  'surface-container-lowest': '#1b1b1b',
  'surface-container-low': '#32302f', // bg1
  'surface-container': '#3a3735', //     bg_statusline2
  'surface-container-high': '#45403d', // bg3
  'surface-container-highest': '#504945', // bg_statusline3
  'on-surface': '#d4be98', //            fg0
  'on-surface-variant': '#c5baac', //    grey2  #a89984 → AA on dialogs
  outline: '#928374', //                 grey1
  'outline-variant': '#5a524c', //       bg5
  scrim: '#000000',
  'inverse-surface': '#d4be98',
  'inverse-on-surface': '#282828',
  'inverse-primary': '#45707a',
  'color-complete': '#a9b665', //        green
  'color-waiting': '#e78a4e', //         orange
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
