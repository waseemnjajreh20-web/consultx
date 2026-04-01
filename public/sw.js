const CACHE_NAME = 'consultx-v2';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/workspace',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Network-first for API/supabase calls
  if (event.request.url.includes('supabase') || event.request.url.includes('/functions/')) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
