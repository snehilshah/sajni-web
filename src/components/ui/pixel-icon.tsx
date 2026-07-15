// PixelIcon — HackerNoon Pixel Icon Library glyphs with an outline→solid
// toggle. Each name maps to a `regular` (outline) and a `-solid` (filled) SVG;
// pass `solid` to switch. Rendered inline (fill=currentColor, 24×24) exactly
// like the pixelarticons shim, so it themes + sizes via `size-*`/className.
//
// This is the one source of truth for the "selected item gets a solid icon"
// behavior: any surface with a selected/active state renders
// `<PixelIcon name=… solid={selected} />`. To add an icon, drop two imports
// (regular + solid) and one REGISTRY entry.
import { forwardRef, createElement, useMemo, type SVGProps } from 'react';

import _r_home from '@hackernoon/pixel-icon-library/icons/SVG/regular/home.svg?raw';
import _s_home from '@hackernoon/pixel-icon-library/icons/SVG/solid/home-solid.svg?raw';
import _r_notebook from '@hackernoon/pixel-icon-library/icons/SVG/regular/notebook.svg?raw';
import _s_notebook from '@hackernoon/pixel-icon-library/icons/SVG/solid/notebook-solid.svg?raw';
import _r_sparkles from '@hackernoon/pixel-icon-library/icons/SVG/regular/sparkles.svg?raw';
import _s_sparkles from '@hackernoon/pixel-icon-library/icons/SVG/solid/sparkles-solid.svg?raw';
import _r_book from '@hackernoon/pixel-icon-library/icons/SVG/regular/book.svg?raw';
import _s_book from '@hackernoon/pixel-icon-library/icons/SVG/solid/book-solid.svg?raw';
import _r_checklist from '@hackernoon/pixel-icon-library/icons/SVG/regular/check-list.svg?raw';
import _s_checklist from '@hackernoon/pixel-icon-library/icons/SVG/solid/check-list-solid.svg?raw';
import _r_fire from '@hackernoon/pixel-icon-library/icons/SVG/regular/fire.svg?raw';
import _s_fire from '@hackernoon/pixel-icon-library/icons/SVG/solid/fire-solid.svg?raw';
import _r_pennib from '@hackernoon/pixel-icon-library/icons/SVG/regular/pen-nib.svg?raw';
import _s_pennib from '@hackernoon/pixel-icon-library/icons/SVG/solid/pen-nib-solid.svg?raw';
import _r_video from '@hackernoon/pixel-icon-library/icons/SVG/regular/video-camera.svg?raw';
import _s_video from '@hackernoon/pixel-icon-library/icons/SVG/solid/video-camera-solid.svg?raw';
import _r_wallet from '@hackernoon/pixel-icon-library/icons/SVG/regular/wallet.svg?raw';
import _s_wallet from '@hackernoon/pixel-icon-library/icons/SVG/solid/wallet-solid.svg?raw';
import _r_rupee from '@/assets/icons/rupee.svg?raw';
import _s_rupee from '@/assets/icons/rupee-solid.svg?raw';
import _r_hashtag from '@hackernoon/pixel-icon-library/icons/SVG/regular/hashtag.svg?raw';
import _s_hashtag from '@hackernoon/pixel-icon-library/icons/SVG/solid/hashtag-solid.svg?raw';
import _r_analytics from '@hackernoon/pixel-icon-library/icons/SVG/regular/analytics.svg?raw';
import _s_analytics from '@hackernoon/pixel-icon-library/icons/SVG/solid/analytics-solid.svg?raw';

const REGISTRY = {
  home: [_r_home, _s_home],
  notebook: [_r_notebook, _s_notebook],
  sparkles: [_r_sparkles, _s_sparkles],
  book: [_r_book, _s_book],
  'check-list': [_r_checklist, _s_checklist],
  fire: [_r_fire, _s_fire],
  'pen-nib': [_r_pennib, _s_pennib],
  'video-camera': [_r_video, _s_video],
  wallet: [_r_wallet, _s_wallet],
  rupee: [_r_rupee, _s_rupee],
  hashtag: [_r_hashtag, _s_hashtag],
  analytics: [_r_analytics, _s_analytics],
} as const satisfies Record<string, readonly [string, string]>;

export type PixelIconName = keyof typeof REGISTRY;

const strip = (s: string) => s.replace(/<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');

interface PixelIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: PixelIconName;
  /** Render the filled (solid) glyph — use for the active/selected state. */
  solid?: boolean;
  size?: number | string;
}

export const PixelIcon = forwardRef<SVGSVGElement, PixelIconProps>(
  ({ name, solid = false, size = 24, children: _children, ...props }, ref) => {
    const inner = useMemo(() => strip(REGISTRY[name][solid ? 1 : 0]), [name, solid]);
    return createElement('svg', {
      ref, width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor',
      ...props, dangerouslySetInnerHTML: { __html: inner },
    });
  },
);
PixelIcon.displayName = 'PixelIcon';
