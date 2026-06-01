// Minimal service worker — exists only to make Sajni installable as a WebAPK
// on Android Chrome so the manifest's `share_target` registers. It does NOT
// cache anything: Sajni is online-only and served from Vercel with hashed
// asset names, so a caching SW would only risk serving stale builds.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
// A present (but no-op) fetch handler satisfies installability across Chrome
// versions while letting the browser handle all networking normally.
self.addEventListener('fetch', () => {});
