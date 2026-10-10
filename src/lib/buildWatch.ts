import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { BUILD_ID, deployedBuild } from './chunkReload';

// Notices a new deploy before it can break this tab. Checks /version.json when
// the app comes back to the foreground and on page changes (at most once a
// minute). Once a newer build is out, the next page change is a full load of
// that page, so the user lands on the new build at a moment they chose,
// never mid-edit.
const MIN_GAP_MS = 60_000;
let stale = false;
let lastCheck = 0;

function check() {
  if (stale || BUILD_ID === 'dev' || Date.now() - lastCheck < MIN_GAP_MS) return;
  lastCheck = Date.now();
  void deployedBuild().then((deployed) => {
    if (deployed !== null && deployed !== BUILD_ID) stale = true;
  });
}

/** Mount once inside the router. */
export function BuildWatcher() {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    // The router already moved to `pathname`; reloading loads it fresh.
    if (stale) window.location.reload();
    else check();
  }, [pathname]);

  return null;
}
