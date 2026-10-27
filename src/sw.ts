/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

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

// The editor is its own page, so offline navigation to it must not fall back to the game.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/editor\.html$/] }));

// Sounds are not precached: they come from the chapter cache (see offline.ts), else the network.
registerRoute(
  ({ url }) => url.pathname.endsWith('.m4a'),
  async ({ request }) => (await caches.match(request.url)) ?? fetch(request),
);
