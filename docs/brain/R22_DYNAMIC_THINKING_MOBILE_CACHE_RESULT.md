# R22 — Dynamic Thinking Mobile Cache Result

**Date:** 2026-05-07  
**Task:** TASK 4 — Mobile Cache / Deploy Fix

---

## Service Worker Status

| Location | Cache version |
|----------|--------------|
| `public/sw.js` in this branch | `consultx-v3` ✅ |
| `origin/main` (Vercel-deployed) | `consultx-v2` ❌ |

SW v3 was bumped in commit `b03744e` (R18). It is in this branch but not yet deployed to Vercel.

---

## How SW v3 Fixes Mobile Cache

When the merged frontend deploys:
1. Vercel serves new `sw.js` with `CACHE_NAME = 'consultx-v3'`
2. Mobile browser fetches new SW during next visit
3. SW `activate` event deletes all caches except `consultx-v3`
4. Mobile now runs fresh JS bundle — `thinking_status` handler present ✅

---

## index.html Cache Strategy

`index.html` is served by Vercel with `Cache-Control: no-cache` (Vercel SPA default). Mobile browsers re-fetch it on every navigation. Once the new SW activates, the new bundle loads automatically.

---

## No Additional SW Bump Needed

The SW version was already bumped to v3 in R18. **No change required for R22.**

---

## Mobile Fix Path

After merge → Vercel deploy:
1. User opens the app → browser fetches new `sw.js`
2. New SW activates (on next tab/background) → clears v2 cache
3. Fresh JS bundle (with thinking_status handler + guard fix) loads
4. Dynamic thinking messages appear on next Advisory question

If a user has a stale SW they can do a hard refresh (Ctrl+Shift+R / pull-down-to-reload on mobile). SW v3 will handle it automatically within 24h at most.

---

## Verdict

No mobile-specific fix required. The existing SW v3 + Vercel deploy from merge handles it.
