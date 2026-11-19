/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

// Safe update: a new worker waits until the page asks for it (SKIP_WAITING from the menu or map banner).
// There is deliberately no automatic skipWaiting, so an update can never swap code under a running mission.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') void self.skipWaiting();
});
// Take over pages that have no worker yet (first install). Updates still wait, as above.
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// The editor and wiki are their own pages, so offline navigation to them must not fall back to the game.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/editor\.html$/, /wiki\.html$/] }));

// Cache visited portraits, townart, and loadscreens lazily without bloating the initial precache.
registerRoute(
  ({ url }) => /\.(?:jpg|jpeg|webp)$/i.test(url.pathname) || (url.pathname.includes('/townart/') && /\.png$/i.test(url.pathname)),
  new CacheFirst({ cacheName: 'thornvael-media-v1' }),
);

// Unit sprite atlases are loaded on demand per mission and cached lazily instead of upfront precache.
registerRoute(
  ({ url }) => url.pathname.includes('/sprites/') && /\.(?:png|json)$/i.test(url.pathname),
  new CacheFirst({ cacheName: 'thornvael-sprites-v1' }),
);

// Sounds are not precached: they come from the chapter cache (see offline.ts) or runtime cache, else the network.
// Return a clean 503 offline response instead of rejecting inside respondWith (prevents WebKit "Load failed" errors).
registerRoute(
  ({ url }) => url.pathname.endsWith('.m4a'),
  async ({ request }) => {
    const hit = await caches.match(request.url);
    if (hit) return hit;
    try {
      const res = await fetch(request);
      if (res.status === 200) {
        const cache = await caches.open('thornvael-audio-v1');
        void cache.put(request.url, res.clone()).catch(() => undefined);
      }
      return res;
    } catch {
      return new Response(null, { status: 503, statusText: 'Offline' });
    }
  },
);
