# R16 — Mobile Deployment State Audit

**Date:** 2026-05-06  
**Task:** TASK 1 — Production Deployment State Audit

---

## 1. Git Status

```
Branch: claude/jolly-haibt-602657
Working tree: clean
Ahead of origin/main: 8 commits
```

## 2. Branch Merge Status

**B2 commits are NOT merged into main.**

`git branch -r --contains cbe8694` → only `origin/claude/jolly-haibt-602657`

All 4 required B2 commits are missing from `origin/main`:

| Commit | Description | In main? |
|--------|-------------|----------|
| `cbe8694` | feat(advisory): integrate semantic brain runtime behind flags | ❌ |
| `9dcf293` | docs(advisory): add B2 closeout doc | ❌ |
| `eb02b89` | docs(brain): record B2 runtime package upload | ❌ |
| `7f3b648` | docs(brain): record advisory brain fast-track enablement | ❌ |

## 3. HEAD on main

```
3be8214 fix(advisory): non-code intent gate — bypass retrieval for greetings
```

main is at `3be8214` — predates all B2 code.

## 4. Vercel Production Deployment

Vercel deploys from `main`. Since B2 commits are not in main, Vercel production does NOT have the B2 TypeScript source files in its build. However:

- **B2 is 100% backend** — all B2 modules are Supabase edge function code, not frontend code
- **Frontend (React/Vite) has NO B2 code** — no `thinking_ux_emitter.ts` consumer in `src/`
- Vercel not deploying B2 branch has **zero effect** on B2 behavior

Vercel production headers for `/`:
```
HTTP/1.1 307 Temporary Redirect
Cache-Control: public, max-age=0, must-revalidate
```
→ Safe. No stale HTML risk.

## 5. Frontend — Dynamic Thinking UX

**The frontend has NO handler for backend thinking events.**

Grep of `src/` for `thinking|ThinkingEvent|isDynamicThinking`:
- `ChatInterface.tsx`: loading stages are timer-based (`connecting → thinking → writing`)
- Static translations: `"جاري التفكير..."` (line 909)
- No SSE event type consumed other than `choices?.[0]?.delta?.content`

**Root Cause Finding:** `_thinkingEventsB2` is built in the edge function but **never emitted to the SSE stream**. Even if emitted, the frontend has no consumer to display them. The "thinking" display on mobile is purely a timer-driven frontend state machine, not driven by any backend content.

## 6. Service Worker Cache

`public/sw.js` CACHE_NAME: `'consultx-v2'` (static, never bumped)  
Fetch strategy: **network-first** (`fetch().catch(() => caches.match())`)  
Supabase/function calls: **bypassed entirely** from SW scope  
`skipWaiting()` + `clients.claim()`: active — new SW activates immediately

**The service worker is NOT causing stale content on mobile.** Mobile devices with network access always get fresh content.

---

## Summary

| Check | Result |
|-------|--------|
| Branch merged to main | ❌ NO (8 commits ahead) |
| B2 commits in main | ❌ NO |
| HEAD on main | `3be8214` |
| Vercel serves B2 code | ❌ NO (B2 is backend-only — not relevant) |
| Frontend has B2 consumer code | ❌ NO (not needed — B2 is edge-only) |
| SW causing mobile stale content | ❌ NO (network-first strategy) |
| B2 deployed to edge function | ✅ YES (v146, all modules present) |

**Root cause of "mobile doesn't reflect new behavior":**
Dynamic Thinking events are built by the edge function but never written to the SSE response stream. The mobile device receives the same timer-based thinking UI it always had.
