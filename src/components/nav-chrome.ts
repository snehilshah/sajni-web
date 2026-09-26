import { createContext, useContext } from 'react';

import type { PixelIconName } from '@/components/ui/pixel-icon';

// The primary navigation destinations.
export const NAV_ITEMS: { path: string; label: string; icon: PixelIconName }[] = [
  { path: '/', label: 'Today', icon: 'home' },
  { path: '/notes', label: 'Notes', icon: 'pen-nib' },
  { path: '/memos', label: 'Memos', icon: 'notebook' },
  { path: '/journal', label: 'Journal', icon: 'book' },
  { path: '/tasks', label: 'Tasks', icon: 'check-list' },
  { path: '/habits', label: 'Habits', icon: 'fire' },
  { path: '/projects', label: 'Projects', icon: 'sparkles' },
  { path: '/media', label: 'Media', icon: 'video-camera' },
  { path: '/finance', label: 'Finance', icon: 'rupee' },
  { path: '/analytics', label: 'Analytics', icon: 'analytics' },
];

export function isActivePath(pathname: string, path: string): boolean {
  return path === '/'
    ? pathname === '/'
    : pathname === path || pathname.startsWith(path + '/');
}

// Coordination between the Layout chrome (primary icon pill) and the
// page's secondary bar. The page scroller reports `scrolled`; Layout
// collapses the primary bar and PageChrome swaps its rest bar for the
// merged pill (title dropdown · tab icons · CTAs).
export const NavChromeContext = createContext<{
  scrolled: boolean;
  setScrolled: (b: boolean) => void;
}>({ scrolled: false, setScrolled: () => {} });

export function useNavChrome() {
  return useContext(NavChromeContext);
}
