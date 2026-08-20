import { useEffect, useMemo, useState } from 'react';

import type { User } from '@/auth/AuthContext';
import { cn } from '@/lib/utils';
import { previewSwatches } from '@/theme/applyM3';
import { getPreset } from '@/theme/presets';
import { useTheme } from '@/theme/ThemeProvider';

const avatarCache = new Map<string, Promise<string>>();
const MAX_CACHE_ENTRIES = 32;
let rendererPromise: ReturnType<typeof loadRenderer> | null = null;

type AvatarView = 'nav' | 'full';

function loadRenderer() {
  return Promise.all([
    import('@dicebear/core'),
    import('@dicebear/styles/voxel-art.json'),
  ]).then(([{ Avatar, Style }, { default: definition }]) => ({
    Avatar,
    style: new Style(definition),
  }));
}

function avatarDataUri(seed: string, colors: readonly string[], view: AvatarView): Promise<string> {
  const colorKey = colors.join(':');
  const key = `${seed}:${colorKey}:${view}`;
  const cached = avatarCache.get(key);
  if (cached) return cached;

  rendererPromise ??= loadRenderer();
  const avatar = rendererPromise.then(({ Avatar, style }) => new Avatar(style, {
    seed,
    // Slow enough to stay peripheral in the persistent nav. Voxel Art wraps
    // its blink/stretch CSS in prefers-reduced-motion: no-preference.
    animationVariant: 'slow',
    animationProbability: 100,
    // DiceBear v10's library accepts hex colors without the leading '#'.
    shirtColor: colors[0].slice(1),
    pantsColor: colors[1].slice(1),
    ...(view === 'nav' ? { scale: 1.8, translateY: 32 } : {}),
  }).toDataUri());

  if (avatarCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = avatarCache.keys().next().value;
    if (oldest) avatarCache.delete(oldest);
  }
  avatarCache.set(key, avatar);
  void avatar.catch(() => avatarCache.delete(key));
  return avatar;
}

export function ProfileAvatar({
  user,
  size,
  view = 'full',
  className,
}: {
  user: Pick<User, 'id' | 'avatar_revision'>;
  size: number;
  view?: AvatarView;
  className?: string;
}) {
  const { active, preset, mode } = useTheme();
  const seeds = active?.seeds ?? getPreset(preset).seeds;
  const avatarMode = active?.mode_pref === 'light' || active?.mode_pref === 'dark'
    ? active.mode_pref
    : mode;
  const colors = useMemo(
    () => previewSwatches(seeds, avatarMode),
    [avatarMode, seeds.primary, seeds.secondary, seeds.tertiary, seeds.neutral],
  );
  const [src, setSrc] = useState('');

  useEffect(() => {
    let current = true;
    void avatarDataUri(`${user.id}:${user.avatar_revision ?? 0}`, colors, view)
      .then((next) => { if (current) setSrc(next); })
      .catch(() => { if (current) setSrc(''); });
    return () => { current = false; };
  }, [colors, user.avatar_revision, user.id, view]);

  return (
    <span
      className={cn(
        'relative isolate inline-flex shrink-0 overflow-hidden border border-[hsl(var(--outline-variant))] bg-[hsl(var(--primary-container))] shadow-[var(--m3-elev-1)]',
        view === 'nav' ? 'rounded-full' : 'rounded-[24%]',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {src && (
        <img
          src={src}
          alt=""
          draggable={false}
          className="block size-full select-none animate-in fade-in duration-200"
        />
      )}
    </span>
  );
}
