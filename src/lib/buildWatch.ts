import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { BUILD_ID, deployedBuild } from './chunkReload';

// Notices a new deploy. Checks /version.json when the app comes back to the
// foreground or gets focus, when the network returns, on page changes and
// every 2 minutes while visible (at most once a minute; the file is tiny and
// CDN-cached). Once a newer build is out it says so, once, with a Reload button;
// it never reloads by itself. The running tab keeps working meanwhile: every
// page chunk was prefetched at start (lazyPage.ts).
const MIN_GAP_MS = 60_000;
const POLL_MS = 2 * 60_000;
let announced = false;
let lastCheck = 0;

function check() {
  if (announced || BUILD_ID === 'dev' || Date.now() - lastCheck < MIN_GAP_MS) return;
  lastCheck = Date.now();
  void deployedBuild().then((deployed) => {
    if (announced || deployed === null || deployed === BUILD_ID) return;
    announced = true;
    toast('A new version of Sajni is ready', {
      id: 'sajni-update',
      description: 'Reload when you’re ready to update.',
      duration: Infinity,
      action: { label: 'Reload', onClick: () => window.location.reload() },
    });
  });
}

/** Mount once inside the router. */
export function BuildWatcher() {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    // A desktop PWA window stays "visible" behind other windows; focus is
    // the moment you come back to it.
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    const poll = window.setInterval(onVisible, POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    check();
  }, [pathname]);

  return null;
}
