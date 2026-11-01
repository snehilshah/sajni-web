import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { routeCommitted, track } from './telemetry';

/** Records route changes for the diagnostics trail. Mount once inside the router. */
export function TelemetryRoute() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    track('nav', { p: (pathname + search).slice(0, 200) });
    routeCommitted(pathname);
  }, [pathname, search]);
  return null;
}
