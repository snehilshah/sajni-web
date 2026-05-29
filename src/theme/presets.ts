// Built-in theme presets. Each is just a set of M3 seeds; the full token
// set (light + dark) is derived from them via buildPalette — the same
// engine the AI-generated themes use. Single source of truth: change a
// seed here and both the swatch preview and the applied colors update.
//
// Presets are applied through the proven `data-theme` + `data-mode` CSS
// cascade (see presetStylesheet, injected by ThemeProvider) rather than
// inline vars, so the Settings light/dark toggle keeps flipping them.

import { buildPalette, type ThemeSeeds } from './applyM3';

export type PresetId = 'marine' | 'terracotta' | 'barbie' | 'powerpuff';

export interface ThemePreset {
  id: PresetId;
  label: string;
  emoji: string;
  seeds: ThemeSeeds;
}

// Marine + Terracotta refined as seeds (was hand-authored CSS). Barbie +
// Powerpuff seeded from barbie.hex / powerpuff.hex at the repo root.
export const PRESETS: ThemePreset[] = [
  // No `neutral` seed on purpose: the surface family then derives from the
  // primary hue (see applyM3 palettes()), so the page background carries a
  // visible hint of the accent instead of reading as flat grey.
  {
    id: 'marine',
    label: 'Marine',
    emoji: '🌊',
    // Cool sage-teal primary, slate-blue secondary, sea-green tertiary.
    seeds: { primary: '#1F7A8C', secondary: '#3E6B99', tertiary: '#2E8B6B' },
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    emoji: '🌅',
    // Warm clay primary, ochre secondary, olive-green tertiary.
    seeds: { primary: '#C0552E', secondary: '#B5832F', tertiary: '#3E9173' },
  },
  {
    id: 'barbie',
    label: 'Barbie',
    emoji: '🎀',
    // barbie.hex: pink primary, orchid secondary, soft-gold tertiary.
    seeds: { primary: '#FF9FD6', secondary: '#C693EC', tertiary: '#F1DAA5' },
  },
  {
    id: 'powerpuff',
    label: 'Powerpuff',
    emoji: '💥',
    // powerpuff.hex: hot magenta primary, bubblegum secondary, ruby tertiary.
    seeds: { primary: '#FF007F', secondary: '#FF66B2', tertiary: '#E0115F' },
  },
];

const VALID = new Set<string>(PRESETS.map((p) => p.id));

// Normalize a stored theme id, migrating the legacy ids ('default'→marine,
// 'warm'→terracotta) and falling back to marine for anything unknown.
export function normalizePreset(id: string | null | undefined): PresetId {
  if (id === 'default') return 'marine';
  if (id === 'warm') return 'terracotta';
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
