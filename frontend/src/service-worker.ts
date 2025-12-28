/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<unknown>;
};

const APP_SHELL_URL = '/index.html';

self.addEventListener('message', (event) => {
  const data = event.data as any;
  if (data?.type === 'SKIP_WAITING' || data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const appShellStrategy = new StaleWhileRevalidate({
  cacheName: 'app-shell',
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 }),
  ],
});

registerRoute(
  new NavigationRoute(
    async ({ event }) => {
      try {
        const response = await appShellStrategy.handle({
          event,
          request: new Request(APP_SHELL_URL, { cache: 'reload' }),
        });
        if (response) return response;
      } catch { }

      const precached = await matchPrecache(APP_SHELL_URL);
      if (precached) return precached;

      return fetch(APP_SHELL_URL);
    },
    {
      denylist: [/^\/api(\/|$)/, /\/[^/?]+\.[^/]+$/],
    }
  )
);

registerRoute(
  ({ url, request }) =>
    request.method === 'GET' && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/v1/')),
  new NetworkFirst({
    cacheName: 'api-get',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 }),
      {
        cacheWillUpdate: async ({ request, response }) => {
          if (!response || response.status !== 200) return null;
          if (request.headers.has('Authorization')) return null;
          if (request.credentials === 'include') return null;
          const requestUrl = new URL(request.url);
          if (requestUrl.origin === self.location.origin && request.credentials !== 'omit') return null;
          const cacheControl = response.headers.get('Cache-Control') ?? '';
          if (/no-store/i.test(cacheControl)) return null;
          if (/private/i.test(cacheControl)) return null;
          return response;
        },
      },
    ],
  }),
  'GET'
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-styles',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  }),
  'GET'
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
  'GET'
);
