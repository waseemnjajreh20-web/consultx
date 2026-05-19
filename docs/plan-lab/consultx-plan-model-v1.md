# ConsultX — ConsultXPlanModel v1

**Status:** Active — governs Phase 4 onward
**Date:** 2026-05-19
**Phase:** Plan Lab Phase 4
**Companion documents:** [`pascal-fast-integration-audit.md`](./pascal-fast-integration-audit.md), [`iframe-contract-v1.md`](./iframe-contract-v1.md), `postmessage-contract-v1.md` (Phase 5, planned)
**Scope:** Defines the ConsultX-owned data model for fire-safety plans. Any external editor (Pascal or otherwise) is mapped INTO this model by an adapter; the model never mirrors the external editor's native shape. Phases 5–8 build on top of these types.

---

## 0. One-Paragraph Summary

`ConsultXPlanModel` is the single source of truth on the ConsultX side for a fire-safety plan: geometry (walls, doors, openings, spaces, exits), fire-safety devices, code findings, evidence anchors, and overlay markers. All coordinates are 2D pairs in meters, in each floor's local space (origin top-left, X right-positive, Y down-positive, angles in degrees clockwise from +X). `version` is pinned to `"1.0.0"` as a literal type so adapter/consumer drift surfaces at compile time. The model carries an `metadata: Record<string, unknown>` escape hatch at every level so adapters can preserve unknown upstream fields without leaking them into typed surfaces.

---

## 1. Why Define This Now

Phase 6 will ship the Pascal adapter. Without a stable `ConsultXPlanModel` defined first, the adapter would mirror Pascal's scene shape — locking ConsultX into Pascal's data structure forever. Defining the model in Phase 4, before any Pascal data flows in, inverts the dependency: Pascal becomes a source that must conform to ConsultX, not a schema dictator. Future editors can be added by writing a second adapter against the same target.

The model is also the input shape for the Fire Safety Overlay (Phase 7), the typed `postMessage` exports (Phase 5), and the documented Analytical → overlay binding (Phase 8). It is the central type from this phase onward.

---

## 2. Coordinate System and Units

| Aspect | Convention | Why |
|---|---|---|
| Linear units | meters | SBC / NFPA codes use SI for fire safety calculations |
| Coordinate origin | top-left of each floor's bounding box | Matches web/screen rendering — no Y-flip when overlaying on a raster floor plan |
| X-axis | right-positive | Web convention |
| Y-axis | down-positive | Web convention; avoids Y-flip when rendering in HTML/SVG/Canvas |
| Angles | degrees, clockwise from +X axis | Matches screen-space math; consistent with door-swing visualizations |
| Floor levels | integer; ground = 0, basements negative, upper positive | Matches building convention; sortable for stairwell traversal |

Coordinate spaces are **per-floor local**. There is no global building coordinate system in v1 — each floor's origin sits at the top-left of its own bounding box. Cross-floor alignment is out of scope until a Phase that explicitly adds it.

When Pascal (or any external editor) emits a different convention, the adapter is responsible for translating into this convention. Adapters that cannot represent the shape (e.g. 3D walls) drop the unrepresentable component into `metadata` so nothing is silently lost.

---

## 3. Top-Level Shape

```ts
interface ConsultXPlanModel {
  version: "1.0.0";
  projectId: string;
  name?: string;
  floors: Floor[];
  findings: CodeFinding[];
  evidence: EvidenceAnchor[];
  reviewStatus: ReviewStatus;
  metadata: Record<string, unknown>;
}
```

| Field | Purpose |
|---|---|
| `version` | Literal `"1.0.0"` — a compile-time fence against drift. Future breaking versions bump this. |
| `projectId` | ConsultX-side opaque ID. Never sourced from the external editor. |
| `name` | Optional display name (typically the project / building name). |
| `floors` | All floor-level geometry and markers. Order is meaningful — typically ascending by `level`. |
| `findings` | Code-compliance findings at the project scope. Floor-scoped findings can carry a `metadata.floorId`. |
| `evidence` | Citations back to source documents. Centralized so anchors are deduplicated. |
| `reviewStatus` | Lifecycle state. Plan Lab transitions through these in later phases. |
| `metadata` | Unstructured escape hatch. Adapters use this for upstream fields not mapped to typed slots. |

`evidence` deliberately lives at the root: a single SBC clause may be cited by multiple findings on multiple floors. Centralizing it keeps the model normalized and audit-friendly.

---

## 4. Floor

```ts
interface Floor {
  id: string;
  name: string;
  level: number;
  bounds?: { width: number; height: number };
  spaces: Space[];
  walls: Wall[];
  doors: Door[];
  openings: Opening[];
  exits: Exit[];
  devices: FireSafetyDevice[];
  overlayMarkers: OverlayMarker[];
  metadata: Record<string, unknown>;
}
```

- `level: 0` is the ground floor. Negative values are basements (`-1` is first basement). Positive values are upper floors.
- `bounds` is optional; when present, it is the axis-aligned bounding box of the floor in meters. Adapters that lack this should leave it undefined rather than emit a zero-bounds rectangle.
- `overlayMarkers` are floor-scoped. A device on a wall on floor 2 has its marker in `floors[?].overlayMarkers` where `floors[?].level === 2`.

---

## 5. Geometry Primitives

```ts
type GeometryKind = "point" | "polyline" | "polygon";

interface Geometry {
  kind: GeometryKind;
  coords: number[][];
}
```

| Kind | `coords` shape | Notes |
|---|---|---|
| `point` | exactly 1 pair `[[x, y]]` | Used for single-position devices, door reference points |
| `polyline` | ≥ 2 pairs `[[x1,y1],[x2,y2],...]` | Open path; used for walls and egress paths |
| `polygon` | ≥ 3 pairs `[[x1,y1],[x2,y2],[x3,y3],...]` | Closing edge implicit; used for space outlines |

The looser `number[][]` shape (rather than `[number, number][]`) is intentional. Upstream editors sometimes emit 3D coordinates; adapters strip the trailing Z component during conversion rather than encoding the strip in the type system.

---

## 6. Architectural Objects

### 6.1 Space

```ts
interface Space {
  id: string;
  name?: string;
  kind?: string;  // free-form in v1: "office" | "corridor" | "stair" | ...
  area?: number;  // m²
  geometry: Geometry;  // polygon
  metadata: Record<string, unknown>;
}
```

`kind` is a free string in v1. The AHJ-standard space taxonomy is large and inconsistent across SBC editions; pinning it to an enum now would force premature decisions. A future minor version may tighten it once a survey across drawings is complete.

### 6.2 Wall

```ts
interface Wall {
  id: string;
  geometry: Geometry;     // polyline
  thickness?: number;     // meters
  rating?: string;        // e.g. "1HR", "2HR"
  metadata: Record<string, unknown>;
}
```

`rating` is a string because upstream conventions vary (`"1HR"`, `"60 min"`, `"FR60"`, etc.). The adapter normalizes upstream values into ConsultX's canonical form when one is established.

### 6.3 Door, Opening, Exit

```ts
interface Door {
  id: string;
  geometry: Geometry;
  width?: number;     // meters
  swing?: number;     // degrees, clockwise from +X
  rating?: string;
  isExit?: boolean;
  metadata: Record<string, unknown>;
}

interface Opening {
  id: string;
  geometry: Geometry;
  kind?: string;      // "window" | "vent" | "shaft" | "penetration"
  metadata: Record<string, unknown>;
}

interface Exit {
  id: string;
  geometry: Geometry;
  kind: "emergency" | "primary" | "secondary";
  pathId?: string;
  metadata: Record<string, unknown>;
}
```

Doors and Exits are distinct on purpose: not every door is an exit, and not every exit is a door (some are stair landings or roof hatches).

### 6.4 FireSafetyDevice

```ts
interface FireSafetyDevice {
  id: string;
  kind: string;     // tightened in Phase 7 to overlay category union
  geometry: Geometry;  // typically point
  spec?: string;
  metadata: Record<string, unknown>;
}
```

`kind` is loose in Phase 4 and narrowed in Phase 7 to: `fire_alarm_detector | manual_call_point | alarm_bell | fire_extinguisher | fire_hose_cabinet | emergency_exit | egress_path | warning | code_finding`.

---

## 7. Findings and Evidence

### 7.1 EvidenceAnchor

```ts
interface EvidenceAnchor {
  id: string;
  sourceFile: string;
  page?: number;       // 1-indexed
  sectionId?: string;  // e.g. "SBC 801 Section 903.2.1"
  snippet?: string;    // verbatim text excerpt
}
```

Anchors are referenced by ID from findings and overlay markers. Centralizing them at the model root deduplicates citations across floors and findings — one SBC clause appears once in `evidence[]` and is referenced by many `anchorIds`.

The symbol convention from the project's memory applies: cite as `"Section 903.2.1"` (English) or `"القسم 903.2.1"` (Arabic). Never `§`. Adapters must rewrite upstream `§` characters to `"Section "` during conversion.

### 7.2 CodeFinding

```ts
type CodeFindingSeverity = "info" | "warning" | "violation";

interface CodeFinding {
  id: string;
  code: string;        // "SBC 801" | "NFPA 72" | ...
  clauseRef: string;   // "Section 903.2.1"
  severity: CodeFindingSeverity;
  message: string;
  anchorIds: string[];
}
```

`anchorIds` must reference IDs that exist in `evidence[]`. Validation of that referential integrity is the adapter's job in Phase 6.

---

## 8. Overlay Markers (Phase 4 Placeholder)

```ts
interface OverlayMarker {
  id: string;
  kind: string;              // narrowed in Phase 7
  position: number[];        // [x, y] in floor-local meters
  evidenceStatus?: string;   // narrowed in Phase 7
  anchorIds?: string[];
  label?: string;
  metadata: Record<string, unknown>;
}
```

`kind` and `evidenceStatus` are loose strings in Phase 4 so adapters can emit markers without depending on the overlay vocabulary. Phase 7 tightens both to discriminated unions:

- `kind` → 9 fire-safety categories.
- `evidenceStatus` → `visible_only | source_backed | inferred | missing | conflict`.

The transition is non-breaking for data: Phase 7's narrow strings remain valid Phase 4 strings. It is breaking for new data: any string outside the Phase 7 unions will fail to compile in adapters and consumers once Phase 7 lands.

---

## 9. Review Lifecycle

```ts
type ReviewStatus = "draft" | "in_review" | "accepted" | "rejected";
```

- `draft` — model exists, not submitted for review.
- `in_review` — submitted; engineer is reviewing.
- `accepted` — engineer accepted; plan can advance in the case workflow.
- `rejected` — engineer rejected; plan needs revision.

Plan Lab does not transition through these states in Phases 1–7. Phase 8+ may wire them into the Enterprise case-review workflow — but only after explicit design.

---

## 10. Mapping Pascal → ConsultXPlanModel

Phase 6 implements the actual adapter. This section is forward-looking — the mapping below documents the *intent*. The adapter's tests will pin the actual contract.

| Pascal node kind (likely) | ConsultX target | Notes |
|---|---|---|
| `Level` | `Floor` | One Pascal Level becomes one ConsultX Floor. Level number from Pascal's elevation/index. |
| `Wall` | `Wall` (polyline) | Strip Z from coordinates; preserve thickness. |
| `Zone` | `Space` (polygon) | Pascal's "zone" → ConsultX's "space". |
| `Door` | `Door` (point or polyline) | Reference position from Pascal door anchor; swing angle preserved. |
| `Window` | `Opening` with `kind="window"` | |
| `Slab` | dropped into `Floor.metadata.pascalSlabs` | Floor slab geometry is not currently part of the typed model. |
| `Ceiling` | dropped into `Floor.metadata.pascalCeilings` | |
| `Roof` | dropped into top-level `metadata.pascalRoofs` | |
| `Item` | `FireSafetyDevice` if mappable, else `metadata.pascalItems` | Discrimination by Pascal item type. |
| (unknown) | preserved at the most-local `metadata.pascalUnknownNodes` | No silent loss. |

The adapter is **lossless for known kinds and preservation-only for unknowns**. Round-tripping (ConsultX → Pascal) is not in scope for any current phase.

---

## 11. What This Contract Does Not Decide

- **Persistence.** No phase 1–8 stores a `ConsultXPlanModel` anywhere. When persistence is added, it will live behind its own contract document.
- **Versioning.** The single literal `"1.0.0"` is a fence against drift, not a roadmap. Breaking changes will introduce v2 with a migration document.
- **Round-tripping.** ConsultX → Pascal direction is out of scope. The adapter is one-way (Pascal → ConsultX).
- **3D / BIM extension.** v1 is strictly 2D. Adding Z requires a v2.
- **Multi-building scope.** v1 is one building's plan, organized by floor. Site / campus extensions are future-only.
- **Internationalization.** Strings (names, kinds, messages) are language-agnostic in the type system. Display-time AR/EN selection is the consumer's responsibility.

---

## 12. Verification Checklist (Phase 4 PASS)

1. `src/types/planLab.ts` exports all of: `ReviewStatus`, `GeometryKind`, `Geometry`, `EvidenceAnchor`, `Space`, `Wall`, `Door`, `Opening`, `ExitKind`, `Exit`, `FireSafetyDevice`, `CodeFindingSeverity`, `CodeFinding`, `OverlayMarker`, `Floor`, `ConsultXPlanModel` (and the pre-existing `PlanLabFlagState`, `PlanLabFeatureFlag`).
2. `npx tsc --noEmit` returns zero errors across the whole repo. The new types do not break any existing consumer because they have no current consumers — but the build must remain green.
3. `git status --porcelain` lists `src/types/planLab.ts` (modified, untracked-dir parent) and `docs/plan-lab/consultx-plan-model-v1.md` (new) as the only changes for Phase 4.
4. No new dependency added.
5. No file outside `src/types/planLab.ts` and `docs/plan-lab/` modified.

---

## 13. Files Owned by This Contract

- [src/types/planLab.ts](../../src/types/planLab.ts) — type declarations
- This document — semantic specification

No other file is touched by Phase 4.
