# ConsultX — Plan Lab Iframe Contract v1

**Status:** Active — governs Phase 3 onward
**Date:** 2026-05-19
**Phase:** Plan Lab Phase 3
**Companion documents:** [`pascal-fast-integration-audit.md`](./pascal-fast-integration-audit.md), `postmessage-contract-v1.md` (Phase 5, planned)
**Scope:** Defines the iframe sandbox attributes, origin pinning policy, and message-listener scaffolding that the Plan Lab page uses to host an external editor (Pascal or any compatible app). The contract is binding for every subsequent phase that interacts with the iframe.

---

## 0. One-Paragraph Summary

When `VITE_PLAN_LAB_IFRAME_URL` is set to a parseable URL and `VITE_PLAN_LAB_ENABLED=true`, the `/plan-lab` route (admin-only) renders the external app inside an iframe with strict sandbox attributes (`sandbox="allow-scripts allow-forms"`, no `allow-same-origin`, no `allow-top-navigation`, no `allow-popups`), `referrerPolicy="no-referrer"`, and `loading="lazy"`. A `window` `message` listener is mounted only while the iframe is present; it drops every event whose `event.origin` is not the exact origin derived from the iframe URL. In Phase 3 the listener does not parse payloads — it logs to `console.debug` when `import.meta.env.DEV` is true. Phase 5 will add structural validation and replace the bare log with typed message handling.

---

## 1. Activation Conditions

The iframe is mounted if and only if **all** of the following are true:

1. `import.meta.env.VITE_PLAN_LAB_ENABLED === "true"` (the runtime feature flag).
2. The current viewer is an admin per `useEntitlement().isAdmin`.
3. `planLabConfig.iframeUrl` is a non-empty string.
4. `planLabConfig.iframeOrigin` is non-null — i.e. `new URL(iframeUrl).origin` did not throw.

If condition 4 fails (the env var is set to a malformed URL), `planLabConfig` clears both `iframeUrl` and `iframeOrigin` to `null` and the page falls back to the Phase 2 empty state. This is a deliberate degradation — a broken iframe pointing at an unparseable value is strictly worse than a clean empty state.

---

## 2. Iframe Attributes

| Attribute | Value | Why |
|---|---|---|
| `src` | `planLabConfig.iframeUrl` | The trusted, env-set URL only |
| `title` | `"Plan Lab editor"` | A11y requirement; not surfaced to the user |
| `sandbox` | `"allow-scripts allow-forms"` | Minimum permissions for an interactive editor |
| `referrerPolicy` | `"no-referrer"` | The embedded app does not receive any URL/path info about the parent |
| `loading` | `"lazy"` | Reduces cost on accidental navigation away mid-page |
| `className` | `block w-full h-[calc(100vh-160px)] bg-background` | Fills the page below the compact header |

### 2.1 What `sandbox="allow-scripts allow-forms"` permits

- The embedded app may execute JavaScript.
- The embedded app may submit HTML forms within itself.

### 2.2 What `sandbox` deliberately denies

- **`allow-same-origin`** — denied. The iframe is treated as a unique origin separate from its source. This prevents the iframe from reading parent `document.cookie`, `localStorage`, or `sessionStorage`, even if its `src` is on the same origin as ConsultX. It also breaks any attempt by the iframe to elevate to the parent's auth context.
- **`allow-top-navigation`** — denied. The iframe cannot navigate the top-level browser window. A click on a link inside the iframe with `target="_top"` is silently blocked.
- **`allow-popups`** — denied. The iframe cannot open new windows.
- **`allow-modals`** — denied. The iframe cannot call `alert()`, `confirm()`, or `prompt()` against the parent context.
- **`allow-pointer-lock`** — denied.
- **`allow-orientation-lock`** — denied.

### 2.3 What may change in later phases

If a future phase needs `allow-popups` (for example, an external help link the iframe wants to open in a new tab), the sandbox extension must be added in a separate, named phase with a rationale section appended to this document. Sandbox attributes are append-only via amendment — never silently expanded.

---

## 3. Origin Pinning Policy

The single source of truth for the iframe's origin is `planLabConfig.iframeOrigin`, derived once at module load by:

```ts
new URL(import.meta.env.VITE_PLAN_LAB_IFRAME_URL).origin
```

A `URL` parsing failure clears the value to `null` and the iframe never mounts (see Section 1).

The page registers a single `window` `message` listener via `useEffect` while the iframe is mounted. Every event is filtered:

```ts
if (event.origin !== planLabConfig.iframeOrigin) return;
```

Notes on this comparison:

- The comparison is strict `===` on the entire `origin` string (scheme + host + port). A mismatch on any component drops the event.
- Foreign iframes, browser extensions, or other tabs that call `window.postMessage(..., "*")` do not pass the check.
- The check is the **first** action in the handler. No parsing, no logging, no side effect runs before origin is validated.

If the iframe is unmounted, the listener is removed by `useEffect`'s cleanup. There is no listener active while the page is in the empty state or while a non-admin/anonymous/flag-off viewer is present.

---

## 4. Logging Policy

In Phase 3, when the origin check passes, the handler logs to `console.debug` only when `planLabConfig.devLogging` is true — which mirrors `import.meta.env.DEV`. Production builds emit nothing.

The logged structure is:

```ts
console.debug("[PlanLab/postMessage]", { origin: event.origin, data: event.data });
```

Why `console.debug` and not `console.log`:

- `console.debug` is filtered out by default in Chrome DevTools, so it does not pollute the console for engineers who are not currently working on Plan Lab.
- It still appears with the "Verbose" filter enabled, so a Plan Lab developer can opt in.
- `console.warn` and `console.error` are reserved for actual problems (malformed messages in Phase 5, etc.).

Phase 5 will replace this bare log with structured handling driven by typed validators in `planLabMessages.ts`. The dev-only gate remains in place.

---

## 5. What This Contract Does Not Yet Allow

The following are out of scope for Phase 3 and require a named subsequent phase:

- **Parent → iframe messages.** Phase 3 does not yet call `iframe.contentWindow.postMessage(...)` anywhere. Phase 5 introduces the `PLAN_MODEL_IMPORT` direction.
- **Backend persistence.** Nothing in the iframe layer reaches Supabase, edge functions, or any storage. Plan Lab is purely client-side in every phase.
- **Multi-iframe layouts.** One iframe at a time. There is no mechanism to mount multiple Pascal sessions in parallel.
- **Drag-and-drop into the iframe.** Not supported. Files dropped on the iframe area fall through to default browser handling.
- **Clipboard bridging.** Not supported. The iframe's clipboard is its own.
- **Authentication propagation.** ConsultX session/JWT is not forwarded to the iframe in any phase. The iframe runs as an unauthenticated, anonymous origin from the parent's perspective.

If any future requirement needs one of the above, document it as a phase amendment and update this contract in lockstep.

---

## 6. Threat Model Notes

| Threat | Mitigation |
|---|---|
| A foreign window posts crafted messages pretending to be the iframe | Origin check rejects every event not from the pinned origin |
| The iframe's app is compromised and tries to read the parent's localStorage / cookies | `sandbox` without `allow-same-origin` blocks all parent-state access |
| The iframe's app tries to navigate the user away to a phishing site | `allow-top-navigation` is denied; top-level navigation from within the iframe is silently blocked |
| A malformed env value causes a broken iframe state in production | `URL` parse failure clears both `iframeUrl` and `iframeOrigin`; the page falls back to the empty state |
| Dev logging leaks payload contents in production | Logging is gated on `planLabConfig.devLogging` which mirrors `import.meta.env.DEV` (false in production builds) |
| A reviewer adds `allow-same-origin` "to make it work" later | This contract names that attribute as explicitly denied; any change requires a phase amendment with a rationale section |

---

## 7. Verification Checklist (Phase 3 PASS)

1. With `VITE_PLAN_LAB_IFRAME_URL` unset → the empty state from Phase 2 renders; the DOM contains no `<iframe>` element under `/plan-lab`; no `message` listener is registered (verifiable via DevTools "Event Listeners" panel on `window`).
2. With `VITE_PLAN_LAB_IFRAME_URL=https://example.test/pascal` → an `<iframe>` is mounted with `sandbox="allow-scripts allow-forms"`, `referrerPolicy="no-referrer"`, and `src` equal to the env value; a `message` listener is registered on `window` while the iframe is mounted; navigating away from `/plan-lab` removes the listener.
3. From an unrelated tab, calling `window.opener?.postMessage("test", "*")` (or any cross-origin `postMessage`) produces no `console.debug` entry — the event is dropped.
4. With `VITE_PLAN_LAB_IFRAME_URL=not a url` → `URL` parsing fails inside `planLabConfig`; `iframeUrl` and `iframeOrigin` both become `null`; the page renders the empty state.
5. `npx tsc --noEmit` returns zero errors. `npm run build` succeeds. `git diff -- package.json package-lock.json` is empty.

---

## 8. Files Owned by This Contract

- [src/lib/plan-lab/planLabConfig.ts](../../src/lib/plan-lab/planLabConfig.ts) — resolves `iframeUrl` and `iframeOrigin`
- [src/types/planLab.ts](../../src/types/planLab.ts) — `PlanLabFeatureFlag` shape
- [src/pages/PlanLab.tsx](../../src/pages/PlanLab.tsx) — mounts the iframe, registers and tears down the `message` listener

No other file is touched by Phase 3.
