# ConsultX — Plan Lab postMessage Contract v1

**Status:** Active — governs Phase 5 onward
**Date:** 2026-05-19
**Phase:** Plan Lab Phase 5
**Companion documents:** [`iframe-contract-v1.md`](./iframe-contract-v1.md), [`consultx-plan-model-v1.md`](./consultx-plan-model-v1.md)
**Scope:** Defines the typed message protocol between ConsultX (parent) and the embedded editor iframe. The protocol is six event types, a strict envelope shape, and a single `parsePlanLabMessage(unknown)` entry point that returns either the typed message or `null`. Phase 5 wires this into the runtime listener; payload processing beyond logging is deferred to subsequent phases.

---

## 0. One-Paragraph Summary

Every message between parent and iframe is an object of shape `{ type: PlanLabMessageType, payload: { ... } }`. Six types are defined: `PLAN_LAB_READY`, `PLAN_MODEL_EXPORT`, `PLAN_MODEL_IMPORT`, `SELECTION_CHANGED`, `OVERLAY_MARKER_CLICKED`, `ERROR`. The parent runs `parsePlanLabMessage(event.data)` after the origin pin from the iframe contract. The parser returns `null` for any unknown `type`, missing field, or wrong-shaped payload; valid messages return a narrowed type that consumers can switch on. In Phase 5 the parent only listens — `PLAN_MODEL_IMPORT` (parent → iframe) is defined but not yet emitted.

---

## 1. Envelope

```ts
{
  type: PlanLabMessageType,  // one of the six string literals
  payload: { /* per-type */ }
}
```

Rules:

- The top-level value must be a non-null, non-array object.
- The `type` field must be one of the six known string literals.
- The `payload` field must be a non-null, non-array object.
- Unknown extra fields at the top level are **ignored** but do not invalidate the message.
- Unknown extra fields inside `payload` are **ignored** but do not invalidate the message.

The "extra fields ignored" rule is intentional. It lets future, additive payload extensions ship without breaking older consumers. Removing or renaming a required field is a breaking change.

---

## 2. Message Types

### 2.1 `PLAN_LAB_READY` (iframe → parent)

Emitted once after the editor finishes bootstrapping. The parent uses this to know it can safely send `PLAN_MODEL_IMPORT`.

```ts
{
  type: "PLAN_LAB_READY",
  payload: { version: string }
}
```

`payload.version` is the editor's own version string — not the ConsultXPlanModel version. The parent does not enforce a particular value yet; future phases may.

### 2.2 `PLAN_MODEL_EXPORT` (iframe → parent)

The editor pushes its current scene to the parent as a `ConsultXPlanModel`.

```ts
{
  type: "PLAN_MODEL_EXPORT",
  payload: { model: ConsultXPlanModel }
}
```

Validation: the parent runs `isConsultXPlanModelShallow(payload.model)` — checks `version === "1.0.0"`, `projectId` is a string, the three array fields are arrays, `reviewStatus` is one of the four allowed values, and `metadata` is an object. Deep validation of geometry, findings, and per-floor content is **not** done in Phase 5 — the sender is trusted by the time the message arrives.

### 2.3 `PLAN_MODEL_IMPORT` (parent → iframe)

Parent pushes a model into the editor. Not emitted in Phase 5; the type is defined now so Phase 6+ adapters can target it.

```ts
{
  type: "PLAN_MODEL_IMPORT",
  payload: { model: ConsultXPlanModel }
}
```

Validation symmetric to `PLAN_MODEL_EXPORT`. If/when the parent sends this, the iframe is responsible for its own structural validation on receipt.

### 2.4 `SELECTION_CHANGED` (iframe → parent)

The editor's current selection changed. `selectedIds` is the canonical list of currently-selected entity IDs (walls, doors, markers, etc. — the editor decides what's selectable). An empty array means nothing is selected.

```ts
{
  type: "SELECTION_CHANGED",
  payload: { selectedIds: string[] }
}
```

### 2.5 `OVERLAY_MARKER_CLICKED` (iframe → parent)

A specific overlay marker was clicked. Future phases will surface a detail panel on the parent side keyed by `markerId`.

```ts
{
  type: "OVERLAY_MARKER_CLICKED",
  payload: { markerId: string }
}
```

### 2.6 `ERROR` (iframe → parent)

The editor signalled an internal error. The parent logs and may surface a banner in future phases.

```ts
{
  type: "ERROR",
  payload: { code: string, message: string }
}
```

`code` is a short machine-readable identifier (e.g. `"E_LOAD_FAILED"`); `message` is human-readable.

---

## 3. Validation Module

[`src/lib/plan-lab/planLabMessages.ts`](../../src/lib/plan-lab/planLabMessages.ts) is the single source of truth for parsing. Its public surface:

- `type PlanLabMessageType` — union of the six string literals.
- One interface per message (`PlanLabReadyMessage`, `PlanModelExportMessage`, …).
- `type PlanLabMessage` — discriminated union over `type`.
- Six per-type guard predicates: `isPlanLabReady`, `isPlanModelExport`, `isPlanModelImport`, `isSelectionChanged`, `isOverlayMarkerClicked`, `isErrorMessage`.
- One top-level entry point: `parsePlanLabMessage(data: unknown): PlanLabMessage | null`.
- One shallow model validator: `isConsultXPlanModelShallow(value: unknown): value is ConsultXPlanModel`.

All functions are pure, side-effect-free, never throw. The module has no DOM access and no imports outside `@/types/planLab`.

Consumers should use `parsePlanLabMessage` first and switch on the result's `type` field. Direct calls to the per-type predicates are supported for testing.

---

## 4. Origin Pinning Comes First

Before any message reaches `parsePlanLabMessage`, the listener in [src/pages/PlanLab.tsx](../../src/pages/PlanLab.tsx) checks:

```ts
if (event.origin !== origin) return;  // origin from planLabConfig.iframeOrigin
```

This is the policy from [`iframe-contract-v1.md`](./iframe-contract-v1.md) Section 3 and is the **first** action in the handler. The parser is invoked only after this check passes. A foreign origin therefore cannot trigger validation, logging, or any downstream side effect — its message is dropped silently before it is even inspected.

---

## 5. Logging Policy

When `planLabConfig.devLogging` is true (`import.meta.env.DEV === true`):

- Valid message → `console.debug("[PlanLab/postMessage] <TYPE>", payload)`.
- Invalid message (parser returned `null`) → `console.warn("[PlanLab/postMessage] dropped malformed or unknown-type message", { origin, data })`.

When `devLogging` is false (production builds):

- The parser still runs (cheap, pure).
- Nothing is logged.
- The message is dropped silently (valid messages too — Phase 5 does no real processing).

Phase 6+ may replace the per-type `console.debug` with concrete handlers (e.g. updating React state on `SELECTION_CHANGED`). The validation step does not change — `parsePlanLabMessage` remains the only entry point.

---

## 6. Threat Model Notes

| Threat | Mitigation |
|---|---|
| Foreign window posts crafted messages | Origin pin rejects before parsing |
| Iframe sends malformed payload to crash parent | Parser returns `null`; handler proceeds to "log warning and drop"; never throws |
| Iframe sends a `type` that the parent has no handler for | `parsePlanLabMessage` returns `null` on unknown `type`; no handler runs |
| Iframe sends a `ConsultXPlanModel` with the wrong `version` | `isConsultXPlanModelShallow` rejects on `version !== "1.0.0"` |
| Iframe sends a `reviewStatus` not in the four allowed values | Validator rejects |
| Iframe sends extra unknown fields | Ignored (forward-compatibility rule) |
| A future contributor inverts the validation order | Code review against this document; validation **after** origin pin is part of the contract |

---

## 7. Forward Compatibility

Additive changes (new optional fields, new message types) are non-breaking and require:

1. A new interface in `planLabMessages.ts`.
2. A new branch in the `parsePlanLabMessage` switch.
3. A new section in this document.
4. No bump of the `version` literal in `ConsultXPlanModel` (which is independent of message protocol versioning).

Breaking changes (removing or renaming a field, changing a payload shape, removing a message type) require a v2 of this contract with a migration document.

---

## 8. Verification Checklist (Phase 5 PASS)

1. `parsePlanLabMessage` is exported from `src/lib/plan-lab/planLabMessages.ts` along with the six per-type guards and `isConsultXPlanModelShallow`.
2. With `VITE_PLAN_LAB_IFRAME_URL` set, [src/pages/PlanLab.tsx](../../src/pages/PlanLab.tsx) calls `parsePlanLabMessage` inside the `message` handler, after the origin pin, and before any logging.
3. Manual cases (verifiable in dev console by pasting `window.postMessage(payload, location.origin)` after temporarily relaxing the origin check — for testing only):
   - `{ type: "FOO" }` → parser returns `null` → warn logged.
   - `{ type: "PLAN_LAB_READY" }` → parser returns `null` (no `payload`).
   - `{ type: "PLAN_LAB_READY", payload: {} }` → parser returns `null` (missing `version`).
   - `{ type: "PLAN_LAB_READY", payload: { version: "0.1" } }` → parser returns the typed message → debug logged.
4. `npx tsc --noEmit` returns zero errors.
5. `npm run build` succeeds.
6. `git diff -- package.json package-lock.json` is empty.

---

## 9. Files Owned by This Contract

- [src/lib/plan-lab/planLabMessages.ts](../../src/lib/plan-lab/planLabMessages.ts) — the validators and parser
- [src/pages/PlanLab.tsx](../../src/pages/PlanLab.tsx) — the runtime call site (Phase 5 wires it in)
- This document — semantic specification

No other file is touched by Phase 5.
