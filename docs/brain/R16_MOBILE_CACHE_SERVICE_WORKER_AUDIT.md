# R16 — Mobile Cache / Service Worker Audit

**Date:** 2026-05-06  
**Task:** TASK 3 — Mobile Frontend Cache / Service Worker Audit

---

## 1. Service Worker File

`public/sw.js` — full contents:

```javascript
const CACHE_NAME = 'consultx-v2';
const PRECACHE_URLS = ['/', '/index.html', '/workspace', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
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
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
```

## 2. Cache Strategy Analysis

| Aspect | Value | Risk |
|--------|-------|------|
| Fetch strategy | Network-first (network → cache fallback) | NONE — mobile gets fresh content when online |
| CACHE_NAME | `'consultx-v2'` (hardcoded, never bumped) | LOW — only affects offline fallback |
| Supabase URLs bypassed | ✅ — SW returns early for supabase/functions | NONE — API calls always hit network |
| `skipWaiting()` | ✅ set — new SW activates immediately on install | NONE |
| `clients.claim()` | ✅ set — new SW takes control of all clients | NONE |
| Old cache cleanup | ✅ — `activate` event deletes all non-current caches | NONE |

## 3. Can index.html Stay Cached on Mobile?

**No.** The fetch handler is:
```javascript
fetch(event.request).catch(() => caches.match(event.request))
```

This always tries network first. The cache is only used as an offline fallback when the network request fails. A mobile device with network connectivity will always receive the latest `index.html` from Vercel.

## 4. Vercel Headers for index.html

```
Cache-Control: public, max-age=0, must-revalidate
```

This means the browser must revalidate `index.html` on every load (max-age=0). No stale HTML will persist in the browser's HTTP cache.

## 5. Bundle JS/CSS Caching

Vite generates content-hashed asset filenames (e.g. `index-abc123.js`). Old bundles with old hashes are unreachable by new HTML. No cache poisoning risk.

## 6. Service Worker Versioning

The CACHE_NAME `'consultx-v2'` is hardcoded and never changes. However, since B2 has **no frontend changes** (all B2 modules are edge function code), there is no need to bump the cache version. The frontend bundle has not changed since B2 was added.

## 7. Supabase URLs Bypassed

The SW fetch handler returns early for any URL containing `supabase` or `/functions/`. All Advisory Brain calls go directly to the Supabase edge function, bypassing the SW cache entirely. ✅

## 8. Finding — SW is NOT the Mobile Problem

The service worker is correctly implemented for this app's needs. It is network-first, bypasses all API calls, cleans old caches on activation, and has `skipWaiting`/`clients.claim`. The mobile device receiving stale content is not possible under normal network conditions.

## 9. Fix Decision

**No fix required.** The service worker is not contributing to the mobile issue.

The mobile issue is caused by the edge function's thinking events never being emitted (backend implementation gap), not by any frontend cache or SW problem.

---

## Verdict

| Check | Result |
|-------|--------|
| Fetch strategy | Network-first ✅ |
| Supabase URLs bypassed | ✅ |
| skipWaiting / clients.claim | ✅ |
| index.html can be stale on mobile | ❌ NO |
| Old bundle served on mobile | ❌ NO (content-hashed assets) |
| Cache bump needed | ❌ NOT NEEDED (no frontend changes in B2) |
| SW fix applied | NONE — no fix required |
