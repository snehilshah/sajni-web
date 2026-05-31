// Built-in theme presets. Each is just a set of M3 seeds; the full token
// set (light + dark) is derived from them via buildPalette — the same
// engine the AI-generated themes use. Single source of truth: change a
// seed here and both the swatch preview and the applied colors update.
//
// Presets are applied through the proven `data-theme` + `data-mode` CSS
// cascade (see presetStylesheet, injected by ThemeProvider) rather than
// inline vars, so the Settings light/dark toggle keeps flipping them.

import { buildPalette, type ThemeSeeds } from './applyM3';

export type PresetId =
  | 'marine'
  | 'powerpuff'
  | 'gruvbox'
  | 'peach'
  | 'mauve';

export interface ThemePreset {
  id: PresetId;
  label: string;
  emoji: string;
  seeds: ThemeSeeds;
}

export const PRESETS: ThemePreset[] = [
  {
    id: 'marine',
    label: 'Marine',
    emoji: '🌊',
    seeds: { primary: '#1F7A8C', secondary: '#3E6B99', tertiary: '#2E8B6B' },
  },
  {
    id: 'powerpuff',
    label: 'PowerPuff',
    emoji: '🎀',
    seeds: { primary: '#eb6f92', secondary: '#C693EC', tertiary: '#ebbcba' },
  },
  {
    id: 'gruvbox',
    label: 'Gruvbox',
    emoji: '🍂',
    seeds: { primary: '#A9B665', secondary: '#D8A657', tertiary: '#D3869B' },
  },
  {
    id: 'peach',
    label: 'Peach',
    emoji: '🍑',
    seeds: { primary: '#D7897F', secondary: '#F9B95C', tertiary: '#96C7B3' },
  },
  {
    id: 'mauve',
    label: 'Mauve',
    emoji: '🔮',
    seeds: { primary: '#191724', secondary: '#e0def4', tertiary: '#eb6f92' },
  },
];

const VALID = new Set<string>(PRESETS.map((p) => p.id));

// Use a stored theme id only if it's a current preset; anything else — a
// removed theme, a legacy id, or junk — falls back to marine. Themes are
// final, so there's no alias migration: valid choices are kept as-is,
// unknown ones snap to marine.
export function normalizePreset(id: string | null | undefined): PresetId {
  if (id && VALID.has(id)) return id as PresetId;
  return 'marine';
}

export function getPreset(id: string | null | undefined): ThemePreset {
  const norm = normalizePreset(id);
  return PRESETS.find((p) => p.id === norm) ?? PRESETS[0];
}

// presetStylesheet emits one CSS block per preset for light + dark. Only the
// M3 base tokens are written; the shadcn aliases (--background, --card, …)
// live in index.css as var() references and re-resolve automatically once
// the base tokens are overridden.
export function presetStylesheet(): string {
  return PRESETS.map((p) => {
    const pal = buildPalette(p.seeds);
    const block = (m: Record<string, string>) =>
      Object.entries(m)
        .map(([k, v]) => `--${k}:${v}`)
        .join(';');
    return (
      `[data-theme="${p.id}"]{${block(pal.light)}}` +
      `[data-theme="${p.id}"][data-mode="dark"]{${block(pal.dark)}}`
    );
  }).join('\n');
}
