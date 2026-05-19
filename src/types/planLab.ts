/**
 * Plan Lab — type module.
 *
 * Owns the runtime feature-flag state types AND the ConsultX-side data model
 * (`ConsultXPlanModel`). Any external editor (Pascal or otherwise) is mapped
 * INTO this model by an adapter; the model is the single source of truth on
 * the ConsultX side. Nothing in this file imports from outside the module.
 *
 * Coordinate / unit conventions are documented in
 * `docs/plan-lab/consultx-plan-model-v1.md`. Summary: linear units are meters,
 * the floor coordinate origin is the top-left of the floor bounding box, X is
 * right-positive, Y is down-positive, and angles are degrees clockwise from
 * the +X axis.
 *
 * Phase 7 will tighten `OverlayMarker.kind` and `OverlayMarker.evidenceStatus`
 * into discriminated unions. Phase 4 ships placeholder string types so the
 * model compiles independently of overlay work.
 */

/**
 * Discriminant state returned by the runtime gate. Used by PlanLab.tsx to
 * decide what to render. Designed so that "leak existence" is impossible:
 * `disabled`, `anonymous`, and `non_admin` all map to the same 404 render.
 */
export type PlanLabFlagState =
  | "loading"
  | "disabled"
  | "anonymous"
  | "non_admin"
  | "enabled";

/**
 * Resolved runtime feature-flag shape. Populated once at module load by
 * planLabConfig.ts.
 */
export interface PlanLabFeatureFlag {
  /** True when VITE_PLAN_LAB_ENABLED === "true" (string comparison). */
  enabled: boolean;
  /** Pascal/editor URL when set and parseable, otherwise null. */
  iframeUrl: string | null;
  /**
   * Origin derived from `iframeUrl` via `new URL(iframeUrl).origin`. Null when
   * `iframeUrl` is null or when the URL fails to parse. Used as the strict
   * pin for postMessage origin checks — any event whose `origin` does not
   * exactly equal this value is dropped.
   */
  iframeOrigin: string | null;
  /** True only when import.meta.env.DEV is true. */
  devLogging: boolean;
}

// ---------------------------------------------------------------------------
// ConsultXPlanModel — Phase 4 data contract.
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a plan model on the ConsultX side. The Pascal/external
 * editor never sets this directly — engineers and head-of-department
 * reviewers transition through these states inside Plan Lab (in later phases).
 */
export type ReviewStatus = "draft" | "in_review" | "accepted" | "rejected";

/**
 * Geometry primitive. All coordinates are 2D pairs `[x, y]` in meters, in the
 * floor's local coordinate space (origin top-left, X right-positive,
 * Y down-positive).
 *
 *   - `point`     → exactly 1 coordinate pair
 *   - `polyline`  → ≥ 2 coordinate pairs, open
 *   - `polygon`   → ≥ 3 coordinate pairs, closing edge implicit
 *
 * The looser `number[][]` shape (vs. `[number, number][]`) is intentional —
 * it matches the JSON-on-the-wire shape from external editors that may emit
 * 3D coordinates with a trailing Z component the adapter strips.
 */
export type GeometryKind = "point" | "polyline" | "polygon";

export interface Geometry {
  kind: GeometryKind;
  coords: number[][];
}

/**
 * A citation back to a source document (SBC clause, manufacturer data sheet,
 * AHJ letter, etc.). Code findings and overlay markers may reference one or
 * more anchors via `anchorIds`. Anchors live at the top level of the model so
 * they can be deduplicated across findings and floors.
 */
export interface EvidenceAnchor {
  id: string;
  sourceFile: string;
  /** 1-indexed page number when the source is paginated. */
  page?: number;
  /** Stable clause/section id, e.g. "SBC 801 Section 903.2.1". */
  sectionId?: string;
  /** Verbatim text excerpt (English or Arabic). */
  snippet?: string;
}

/**
 * Architectural enclosure — office, corridor, stairwell, etc. The `kind` is a
 * free-form string in v1 of the model; future versions may tighten it to an
 * enum once the AHJ taxonomy is settled.
 */
export interface Space {
  id: string;
  name?: string;
  kind?: string;
  /** Computed or imported floor area in square meters. */
  area?: number;
  geometry: Geometry;
  metadata: Record<string, unknown>;
}

/**
 * A wall segment. Polyline geometry. Optional fire rating string (e.g. "1HR",
 * "2HR") — kept as string in v1 to absorb upstream variability.
 */
export interface Wall {
  id: string;
  geometry: Geometry;
  /** Wall thickness in meters. */
  thickness?: number;
  rating?: string;
  metadata: Record<string, unknown>;
}

/**
 * A door. Geometry is the hinge point or a 2-point span. `swing` is the
 * opening angle in degrees clockwise from the +X axis. `isExit` flags doors
 * that count toward egress capacity — overlay computations may later
 * cross-check this against the `Exit` list.
 */
export interface Door {
  id: string;
  geometry: Geometry;
  /** Clear opening width in meters. */
  width?: number;
  /** Opening angle in degrees, clockwise from +X axis. */
  swing?: number;
  rating?: string;
  isExit?: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Non-door openings — windows, vents, shafts, equipment penetrations.
 * Distinguished from `Door` because most code clauses treat them as separate
 * compliance categories.
 */
export interface Opening {
  id: string;
  geometry: Geometry;
  /** e.g. "window", "vent", "shaft", "penetration". */
  kind?: string;
  metadata: Record<string, unknown>;
}

/**
 * An egress exit. Either a single point (the exit door's reference position)
 * or a polyline (the full egress path). `kind` distinguishes the exit
 * category in code terms.
 */
export type ExitKind = "emergency" | "primary" | "secondary";

export interface Exit {
  id: string;
  geometry: Geometry;
  kind: ExitKind;
  /** Optional ref to a separate egress-path geometry if the path is not encoded inline. */
  pathId?: string;
  metadata: Record<string, unknown>;
}

/**
 * Subset of overlay categories that correspond to physical fire-safety
 * hardware (vs. semantic markers like `warning`, `egress_path`, or
 * `code_finding`). A `FireSafetyDevice` represents an actual installed
 * device — its `kind` must be one of these six values.
 */
export type FireSafetyDeviceKind =
  | "fire_alarm_detector"
  | "manual_call_point"
  | "alarm_bell"
  | "fire_extinguisher"
  | "fire_hose_cabinet"
  | "emergency_exit";

export interface FireSafetyDevice {
  id: string;
  kind: FireSafetyDeviceKind;
  geometry: Geometry;
  /** Optional rating/spec metadata absorbed from the source. */
  spec?: string;
  metadata: Record<string, unknown>;
}

/**
 * Severity of a code-compliance finding. The Analytical-mode runtime is the
 * eventual source of these; Phase 8 documents the mapping.
 */
export type CodeFindingSeverity = "info" | "warning" | "violation";

export interface CodeFinding {
  id: string;
  /** Code body, e.g. "SBC 801", "NFPA 72". */
  code: string;
  /** Clause / section reference, e.g. "Section 903.2.1". */
  clauseRef: string;
  severity: CodeFindingSeverity;
  message: string;
  /** References to `EvidenceAnchor.id` at the model root. */
  anchorIds: string[];
}

/**
 * The full set of 9 fire-safety overlay categories. Six map 1:1 to
 * `FireSafetyDeviceKind` (physical hardware); the remaining three are
 * semantic markers without a physical device counterpart.
 */
export type OverlayCategory =
  | FireSafetyDeviceKind
  | "egress_path"
  | "warning"
  | "code_finding";

/**
 * Provenance of an overlay marker. Used to colour-code the legend and (in a
 * future phase) drive review priorities.
 *
 *   - `visible_only`  — directly visible in the source drawing, no citation
 *   - `source_backed` — visible AND cited to a code clause / data sheet
 *   - `inferred`      — derived by ConsultX (Analytical) from indirect evidence
 *   - `missing`       — expected per code but absent from the drawing
 *   - `conflict`      — sources disagree about presence / location / type
 */
export type EvidenceStatus =
  | "visible_only"
  | "source_backed"
  | "inferred"
  | "missing"
  | "conflict";

/**
 * Common shape shared by every overlay marker variant. Variant-specific
 * fields are added in the per-kind interfaces below.
 */
interface OverlayMarkerBase {
  id: string;
  /** 2D position in floor-local meters. */
  position: number[];
  evidenceStatus: EvidenceStatus;
  /** References to `EvidenceAnchor.id` at the model root. */
  anchorIds?: string[];
  /** Optional human-readable label (AR or EN). */
  label?: string;
  metadata: Record<string, unknown>;
}

export interface FireAlarmDetectorMarker extends OverlayMarkerBase {
  kind: "fire_alarm_detector";
}
export interface ManualCallPointMarker extends OverlayMarkerBase {
  kind: "manual_call_point";
}
export interface AlarmBellMarker extends OverlayMarkerBase {
  kind: "alarm_bell";
}
export interface FireExtinguisherMarker extends OverlayMarkerBase {
  kind: "fire_extinguisher";
}
export interface FireHoseCabinetMarker extends OverlayMarkerBase {
  kind: "fire_hose_cabinet";
}
export interface EmergencyExitMarker extends OverlayMarkerBase {
  kind: "emergency_exit";
}
/**
 * An egress path carries a polyline route in addition to the anchor `position`
 * (which is typically the path's starting point or a label anchor).
 */
export interface EgressPathMarker extends OverlayMarkerBase {
  kind: "egress_path";
  /** Polyline route, ≥ 2 points, in floor-local meters. */
  path: number[][];
}
export interface WarningMarker extends OverlayMarkerBase {
  kind: "warning";
  /** Optional severity hint. Reuses CodeFindingSeverity vocabulary. */
  severity?: CodeFindingSeverity;
}
/**
 * A marker that surfaces a `CodeFinding` on the plan. The `findingId` should
 * reference an entry in `ConsultXPlanModel.findings`.
 */
export interface CodeFindingMarker extends OverlayMarkerBase {
  kind: "code_finding";
  findingId?: string;
}

export type OverlayMarker =
  | FireAlarmDetectorMarker
  | ManualCallPointMarker
  | AlarmBellMarker
  | FireExtinguisherMarker
  | FireHoseCabinetMarker
  | EmergencyExitMarker
  | EgressPathMarker
  | WarningMarker
  | CodeFindingMarker;

/**
 * A single floor / level. Holds all geometry and overlay markers placed in
 * its local coordinate space. The `level` integer follows the convention:
 * ground = 0, basements negative, upper floors positive.
 */
export interface Floor {
  id: string;
  name: string;
  level: number;
  /** Optional axis-aligned bounding box in meters. */
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

/**
 * ConsultX-owned representation of a fire-safety plan. The top-level shape is
 * deliberately small — most domain content lives under `floors[*]`. Evidence
 * anchors live at the root so they can be deduplicated and audited across
 * findings, markers, and floors.
 *
 * `version` is pinned to the literal `"1.0.0"` so a type-level mismatch flags
 * out-of-date adapters or consumers at compile time.
 */
export interface ConsultXPlanModel {
  version: "1.0.0";
  projectId: string;
  name?: string;
  floors: Floor[];
  findings: CodeFinding[];
  evidence: EvidenceAnchor[];
  reviewStatus: ReviewStatus;
  /** Free-form escape hatch — adapters preserve unknown-but-named upstream fields here (e.g., `metadata.pascalUnknownNodes`). */
  metadata: Record<string, unknown>;
}
