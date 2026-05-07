# R19 — Mobile UX Deploy Result

**Date:** 2026-05-07  
**Sprint:** R19 Mobile Advisory UX Polish

---

## Frontend Changes — Deployed via Vercel

R19 changed only frontend files:
- `src/components/ChatInterface.tsx`
- `src/components/SourcePanel.tsx`
- `src/components/ChatMarkdownRenderer.tsx`

### Git Push

```
git push origin main
→ eb3de39..65b1804  main -> main
```

Two commits pushed:
1. `5f85e21` — fix(advisory): stabilize advisory mode after Gemini 503 (R25)
2. `65b1804` — fix(advisory): polish mobile advisory UX (R19)

Vercel is configured with GitHub auto-deploy from main branch.

---

## Build Output

```
dist/assets/ChatInterface-CTvhjiv8.js    578.71 kB (gzip: 174.37 kB)
```

New content hash `CTvhjiv8` (was `BSYRQ396` from R23).  
All R19 changes are present in this bundle.

---

## Edge Function — No Change

`fire-safety-chat` edge function was NOT redeployed in R19.  
The R25 Gemini 503 fix was already deployed separately before R19.

---

## Service Worker

The existing service worker uses cache key `consultx-v3`.  
Vercel deploy generates new content-hashed filenames.  
The SW will serve the new `ChatInterface-CTvhjiv8.js` for all users on next navigation.

Users with old SW cache (`consultx-v3`) will:
1. Serve old bundle from cache on first visit
2. SW background fetches new bundle
3. On next page load: new bundle (`CTvhjiv8`) served

No SW version bump needed for this incremental update.

---

## Production URLs

- App: `https://consultx.app`
- Edge function: `https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat`
