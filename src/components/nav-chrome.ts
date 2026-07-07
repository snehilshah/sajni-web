import { createContext, useContext } from 'react';

import type { PixelIconName } from '@/components/ui/pixel-icon';

// The 9 primary destinations (post-consolidation: Memos→Notes tab,
// Tags→Analytics tab, Chat→Projects tab). `key` matches
// /public/onboarding.json anchors.
export const NAV_ITEMS: { path: string; label: string; icon: PixelIconName; key: string }[] = [
  { path: '/', label: 'Today', icon: 'home', key: 'today' },
  { path: '/notes', label: 'Notes', icon: 'pen-nib', key: 'notes' },
  { path: '/journal', label: 'Journal', icon: 'book', key: 'journal' },
  { path: '/tasks', label: 'Tasks', icon: 'check-list', key: 'tasks' },
  { path: '/habits', label: 'Habits', icon: 'fire', key: 'habits' },
  { path: '/projects', label: 'Projects', icon: 'sparkles', key: 'thinking' },
  { path: '/media', label: 'Media', icon: 'video-camera', key: 'media' },
  { path: '/finance', label: 'Finance', icon: 'wallet', key: 'finance' },
  { path: '/analytics', label: 'Analytics', icon: 'analytics', key: 'analytics' },
];

export function isActivePath(pathname: string, path: string): boolean {
  return path === '/'
    ? pathname === '/'
    : pathname === path || pathname.startsWith(path + '/');
}

export function activeNavItem(pathname: string) {
  return NAV_ITEMS.find((i) => isActivePath(pathname, i.path)) ?? null;
}

// Scroll-merge coordination between the Layout chrome (primary icon bar)
// and the page's secondary bar (PageShell or a custom page). Whichever
// component owns the page scroller reports here; Layout collapses the
// primary bar and the reporter shows the condensed pill.
export const NavChromeContext = createContext<{
  scrolled: boolean;
  setScrolled: (b: boolean) => void;
}>({ scrolled: false, setScrolled: () => {} });

export function useNavChrome() {
  return useContext(NavChromeContext);
}
