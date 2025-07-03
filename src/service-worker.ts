// Minimal service worker without workbox dependencies
// TODO: Add workbox dependencies and restore full functionality

// Skip waiting and claim clients immediately
(self as any).skipWaiting();
(self as any).clients.claim();

// Basic cache name
const CACHE_NAME = 'grassroots-pwa-v1';

// Install event - basic setup
self.addEventListener('install', (event: any) => {
  console.log('Service Worker installing');
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => {
      console.log('Cache opened');
    })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event: any) => {
  console.log('Service Worker activating');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - basic network-first strategy
self.addEventListener('fetch', (event: any) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
