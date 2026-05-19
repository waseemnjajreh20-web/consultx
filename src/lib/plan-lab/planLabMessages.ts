/**
 * Plan Lab — typed postMessage protocol.
 *
 * Defines the discriminated union of messages exchanged between ConsultX
 * (parent) and the embedded editor iframe. Provides per-type structural
 * validators and a single top-level `parsePlanLabMessage(unknown)` entry
 * point that returns the typed message on success or `null` on failure.
 *
 * Pure module — no DOM access, no side effects, no imports outside
 * `@/types/planLab`. Origin pinning is the caller's responsibility and runs
 * BEFORE this module is invoked (see `docs/plan-lab/iframe-contract-v1.md`
 * Section 3 for the policy and `src/pages/PlanLab.tsx` for the call site).
 *
 * Phase 5 does only top-level structural validation of `ConsultXPlanModel`
 * payloads (version, projectId, the four array fields, reviewStatus enum,
 * metadata is an object). Deep validation of every floor/space/wall is the
 * adapter's job in Phase 6 — by the time a model reaches `postMessage`, the
 * sender is assumed to have produced a well-formed structure.
 */
import type {
  ConsultXPlanModel,
  ReviewStatus,
} from "@/types/planLab";

// ---------------------------------------------------------------------------
// Discriminated message types.
// ---------------------------------------------------------------------------

export type PlanLabMessageType =
  | "PLAN_LAB_READY"
  | "PLAN_MODEL_EXPORT"
  | "PLAN_MODEL_IMPORT"
  | "SELECTION_CHANGED"
  | "OVERLAY_MARKER_CLICKED"
  | "ERROR";

/** iframe → parent: emitted once the editor has finished bootstrapping. */
export interface PlanLabReadyMessage {
  type: "PLAN_LAB_READY";
  payload: { version: string };
}

/** iframe → parent: editor exports its current state as a plan model. */
export interface PlanModelExportMessage {
  type: "PLAN_MODEL_EXPORT";
  payload: { model: ConsultXPlanModel };
}

/** parent → iframe: parent pushes a model into the editor. Not sent in Phase 5. */
export interface PlanModelImportMessage {
  type: "PLAN_MODEL_IMPORT";
  payload: { model: ConsultXPlanModel };
}

/** iframe → parent: editor selection changed. */
export interface SelectionChangedMessage {
  type: "SELECTION_CHANGED";
  payload: { selectedIds: string[] };
}

/** iframe → parent: an overlay marker was clicked inside the editor. */
export interface OverlayMarkerClickedMessage {
  type: "OVERLAY_MARKER_CLICKED";
  payload: { markerId: string };
}

/** iframe → parent: editor signalled an internal error. */
export interface ErrorMessage {
  type: "ERROR";
  payload: { code: string; message: string };
}

export type PlanLabMessage =
  | PlanLabReadyMessage
  | PlanModelExportMessage
  | PlanModelImportMessage
  | SelectionChangedMessage
  | OverlayMarkerClickedMessage
  | ErrorMessage;

// ---------------------------------------------------------------------------
// Internal predicates.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

const REVIEW_STATUSES: readonly ReviewStatus[] = [
  "draft",
  "in_review",
  "accepted",
  "rejected",
];

/**
 * Top-level structural check on a `ConsultXPlanModel`. Verifies the version
 * literal, the presence and shape of the top-level fields, and that the
 * review status is one of the four allowed values. Does NOT recurse into
 * floor / wall / door geometry — those are the adapter's responsibility.
 */
export function isConsultXPlanModelShallow(
  value: unknown
): value is ConsultXPlanModel {
  if (!isRecord(value)) return false;
  if (value.version !== "1.0.0") return false;
  if (typeof value.projectId !== "string") return false;
  if (!Array.isArray(value.floors)) return false;
  if (!Array.isArray(value.findings)) return false;
  if (!Array.isArray(value.evidence)) return false;
  if (typeof value.reviewStatus !== "string") return false;
  if (!REVIEW_STATUSES.includes(value.reviewStatus as ReviewStatus)) return false;
  if (!isRecord(value.metadata)) return false;
  return true;
}

function hasEnvelope(value: unknown, type: PlanLabMessageType): value is { type: PlanLabMessageType; payload: Record<string, unknown> } {
  if (!isRecord(value)) return false;
  if (value.type !== type) return false;
  if (!isRecord(value.payload)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Per-message validators.
// ---------------------------------------------------------------------------

export function isPlanLabReady(value: unknown): value is PlanLabReadyMessage {
  if (!hasEnvelope(value, "PLAN_LAB_READY")) return false;
  return typeof value.payload.version === "string";
}

export function isPlanModelExport(
  value: unknown
): value is PlanModelExportMessage {
  if (!hasEnvelope(value, "PLAN_MODEL_EXPORT")) return false;
  return isConsultXPlanModelShallow(value.payload.model);
}

export function isPlanModelImport(
  value: unknown
): value is PlanModelImportMessage {
  if (!hasEnvelope(value, "PLAN_MODEL_IMPORT")) return false;
  return isConsultXPlanModelShallow(value.payload.model);
}

export function isSelectionChanged(
  value: unknown
): value is SelectionChangedMessage {
  if (!hasEnvelope(value, "SELECTION_CHANGED")) return false;
  return isStringArray(value.payload.selectedIds);
}

export function isOverlayMarkerClicked(
  value: unknown
): value is OverlayMarkerClickedMessage {
  if (!hasEnvelope(value, "OVERLAY_MARKER_CLICKED")) return false;
  return typeof value.payload.markerId === "string";
}

export function isErrorMessage(value: unknown): value is ErrorMessage {
  if (!hasEnvelope(value, "ERROR")) return false;
  return (
    typeof value.payload.code === "string" &&
    typeof value.payload.message === "string"
  );
}

// ---------------------------------------------------------------------------
// Top-level entry point.
// ---------------------------------------------------------------------------

/**
 * Parse an opaque `MessageEvent.data` into a typed `PlanLabMessage`, or null
 * if the input is malformed or its `type` is unknown.
 *
 * Designed for direct use in a `window.addEventListener("message", ...)`
 * handler AFTER the caller has filtered on `event.origin`. Returning null
 * is the only failure mode — this function never throws.
 */
export function parsePlanLabMessage(data: unknown): PlanLabMessage | null {
  if (!isRecord(data)) return null;
  const rawType = data.type;
  if (typeof rawType !== "string") return null;
  switch (rawType) {
    case "PLAN_LAB_READY":
      return isPlanLabReady(data) ? data : null;
    case "PLAN_MODEL_EXPORT":
      return isPlanModelExport(data) ? data : null;
    case "PLAN_MODEL_IMPORT":
      return isPlanModelImport(data) ? data : null;
    case "SELECTION_CHANGED":
      return isSelectionChanged(data) ? data : null;
    case "OVERLAY_MARKER_CLICKED":
      return isOverlayMarkerClicked(data) ? data : null;
    case "ERROR":
      return isErrorMessage(data) ? data : null;
    default:
      return null;
  }
}
