/**
 * Pascal scene → ConsultXPlanModel adapter (Phase 6 prototype).
 *
 * Converts a Pascal-like scene JSON into the ConsultX-owned data model. The
 * adapter is one-way (Pascal → ConsultX). Unknown node kinds are preserved
 * under `metadata.pascalUnknownNodes` (root) or `Floor.metadata.pascalSlabs`,
 * `pascalCeilings`, etc. — no upstream data is silently dropped.
 *
 * Pure module — no DOM, no side effects, no imports outside
 * `@/types/planLab`. Never throws; malformed input returns
 * `{ model: null, warnings: [...] }`.
 *
 * Pascal coordinate assumptions (documented in
 * docs/plan-lab/consultx-plan-model-v1.md Section 10):
 *   - Coordinates may be 2D `[x, y]` or 3D `[x, y, z]`. The adapter strips
 *     any trailing Z component.
 *   - Pascal's X/Y axes are taken to match ConsultX (X right-positive,
 *     Y down-positive). Future Pascal sessions that use a different
 *     convention will require a coordinate-system flag in this adapter.
 */
import type {
  ConsultXPlanModel,
  Door,
  Exit,
  FireSafetyDevice,
  FireSafetyDeviceKind,
  Floor,
  Geometry,
  Opening,
  OverlayMarker,
  Space,
  Wall,
} from "@/types/planLab";

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export interface ConvertResult {
  model: ConsultXPlanModel | null;
  warnings: string[];
}

export function convertPascalScene(input: unknown): ConvertResult {
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return {
      model: null,
      warnings: ["pascal scene must be a JSON object"],
    };
  }

  const rawNodes = input.nodes;
  if (!Array.isArray(rawNodes)) {
    return {
      model: null,
      warnings: ["pascal scene is missing the `nodes` array"],
    };
  }

  const projectId =
    typeof input.id === "string"
      ? input.id
      : typeof input.projectId === "string"
      ? input.projectId
      : "pascal-import";

  const projectName =
    typeof input.name === "string" ? input.name : undefined;

  // --- First pass: build a Floor for every Level node. ---------------------
  const levelById = new Map<string, Floor>();
  const orderedLevels: Floor[] = [];
  const rootUnknownNodes: unknown[] = [];
  const rootRoofs: unknown[] = [];

  for (const node of rawNodes) {
    if (!isRecord(node) || typeof node.type !== "string") {
      warnings.push("dropped node without a string `type` field");
      rootUnknownNodes.push(node);
      continue;
    }
    if (node.type === "Level") {
      const id = stringField(node.id);
      if (id === null) {
        warnings.push("dropped Level node without an `id`");
        continue;
      }
      if (levelById.has(id)) {
        warnings.push(`duplicate Level id "${id}" — keeping first occurrence`);
        continue;
      }
      const floor: Floor = {
        id,
        name: stringField(node.name) ?? id,
        level: numberField(node.index) ?? numberField(node.level) ?? 0,
        bounds: undefined,
        spaces: [],
        walls: [],
        doors: [],
        openings: [],
        exits: [],
        devices: [],
        overlayMarkers: [],
        metadata: {},
      };
      const elevation = numberField(node.elevation);
      if (elevation !== null) floor.metadata.pascalElevation = elevation;
      levelById.set(id, floor);
      orderedLevels.push(floor);
    }
  }

  // If Pascal omitted Level nodes entirely, synthesize a single default floor
  // so the rest of the scene has somewhere to land.
  if (orderedLevels.length === 0) {
    const synth: Floor = {
      id: "pascal-default-level",
      name: "Default",
      level: 0,
      bounds: undefined,
      spaces: [],
      walls: [],
      doors: [],
      openings: [],
      exits: [],
      devices: [],
      overlayMarkers: [],
      metadata: { synthetic: true },
    };
    levelById.set(synth.id, synth);
    orderedLevels.push(synth);
    warnings.push(
      "no Level nodes found — created synthetic 'pascal-default-level' floor"
    );
  }

  const defaultFloor = orderedLevels[0];

  // --- Second pass: route every non-Level node to its floor or metadata. ---
  for (const node of rawNodes) {
    if (!isRecord(node) || typeof node.type !== "string") {
      // Already reported and bucketed in pass one.
      continue;
    }
    switch (node.type) {
      case "Level":
        // Already processed.
        break;
      case "Wall":
        routeWall(node, levelById, defaultFloor, warnings);
        break;
      case "Door":
        routeDoor(node, levelById, defaultFloor, warnings);
        break;
      case "Window":
        routeWindow(node, levelById, defaultFloor, warnings);
        break;
      case "Zone":
        routeZone(node, levelById, defaultFloor, warnings);
        break;
      case "Slab":
        routeFloorMetadata(node, "pascalSlabs", levelById, defaultFloor);
        break;
      case "Ceiling":
        routeFloorMetadata(node, "pascalCeilings", levelById, defaultFloor);
        break;
      case "Roof":
        rootRoofs.push(node);
        break;
      case "Item":
        routeItem(node, levelById, defaultFloor, warnings);
        break;
      default:
        rootUnknownNodes.push(node);
        warnings.push(`unknown Pascal node type "${node.type}" preserved in metadata`);
        break;
    }
  }

  const metadata: Record<string, unknown> = {};
  if (rootUnknownNodes.length > 0) metadata.pascalUnknownNodes = rootUnknownNodes;
  if (rootRoofs.length > 0) metadata.pascalRoofs = rootRoofs;
  if (projectName !== undefined) metadata.pascalProjectName = projectName;

  const model: ConsultXPlanModel = {
    version: "1.0.0",
    projectId,
    name: projectName,
    floors: orderedLevels,
    findings: [],
    evidence: [],
    reviewStatus: "draft",
    metadata,
  };

  return { model, warnings };
}

// ---------------------------------------------------------------------------
// Helpers — purely internal.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strip2D(coords: unknown): number[][] | null {
  if (!Array.isArray(coords)) return null;
  const out: number[][] = [];
  for (const point of coords) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const x = point[0];
    const y = point[1];
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([x, y]);
  }
  return out;
}

function getFloor(
  node: Record<string, unknown>,
  levelById: Map<string, Floor>,
  defaultFloor: Floor
): Floor {
  const lvlId = stringField(node.levelId) ?? stringField(node.level);
  if (lvlId !== null) {
    const found = levelById.get(lvlId);
    if (found) return found;
  }
  return defaultFloor;
}

function appendFloorMeta(
  floor: Floor,
  bucket: string,
  node: unknown
): void {
  const existing = floor.metadata[bucket];
  if (Array.isArray(existing)) {
    existing.push(node);
  } else {
    floor.metadata[bucket] = [node];
  }
}

// ---------------------------------------------------------------------------
// Per-node converters.
// ---------------------------------------------------------------------------

function routeWall(
  node: Record<string, unknown>,
  levelById: Map<string, Floor>,
  defaultFloor: Floor,
  warnings: string[]
): void {
  const id = stringField(node.id);
  if (id === null) {
    warnings.push("dropped Wall without an `id`");
    return;
  }
  const points = strip2D(node.points);
  if (points === null || points.length < 2) {
    warnings.push(`dropped Wall "${id}" — invalid or insufficient \`points\``);
    return;
  }
  const geometry: Geometry = { kind: "polyline", coords: points };
  const wall: Wall = {
    id,
    geometry,
    thickness: numberField(node.thickness) ?? undefined,
    rating: stringField(node.rating) ?? undefined,
    metadata: {},
  };
  getFloor(node, levelById, defaultFloor).walls.push(wall);
}

function routeDoor(
  node: Record<string, unknown>,
  levelById: Map<string, Floor>,
  defaultFloor: Floor,
  warnings: string[]
): void {
  const id = stringField(node.id);
  if (id === null) {
    warnings.push("dropped Door without an `id`");
    return;
  }
  const position = strip2D([node.position]);
  if (position === null) {
    warnings.push(`dropped Door "${id}" — invalid \`position\``);
    return;
  }
  const geometry: Geometry = { kind: "point", coords: position };
  const isExit = node.isExit === true || node.exit === true;
  const door: Door = {
    id,
    geometry,
    width: numberField(node.width) ?? undefined,
    swing: numberField(node.swing) ?? undefined,
    rating: stringField(node.rating) ?? undefined,
    isExit: isExit || undefined,
    metadata: {},
  };
  const floor = getFloor(node, levelById, defaultFloor);
  floor.doors.push(door);

  if (isExit) {
    const exit: Exit = {
      id: `${id}-exit`,
      geometry,
      kind: "primary",
      metadata: { sourceDoorId: id },
    };
    floor.exits.push(exit);
  }
}

function routeWindow(
  node: Record<string, unknown>,
  levelById: Map<string, Floor>,
  defaultFloor: Floor,
  warnings: string[]
): void {
  const id = stringField(node.id);
  if (id === null) {
    warnings.push("dropped Window without an `id`");
    return;
  }
  const position = strip2D([node.position]);
  if (position === null) {
    warnings.push(`dropped Window "${id}" — invalid \`position\``);
    return;
  }
  const opening: Opening = {
    id,
    geometry: { kind: "point", coords: position },
    kind: "window",
    metadata: {},
  };
  getFloor(node, levelById, defaultFloor).openings.push(opening);
}

function routeZone(
  node: Record<string, unknown>,
  levelById: Map<string, Floor>,
  defaultFloor: Floor,
  warnings: string[]
): void {
  const id = stringField(node.id);
  if (id === null) {
    warnings.push("dropped Zone without an `id`");
    return;
  }
  const polygon = strip2D(node.polygon);
  if (polygon === null || polygon.length < 3) {
    warnings.push(`dropped Zone "${id}" — invalid or insufficient \`polygon\``);
    return;
  }
  const space: Space = {
    id,
    name: stringField(node.name) ?? undefined,
    kind: stringField(node.kind) ?? undefined,
    area: numberField(node.area) ?? undefined,
    geometry: { kind: "polygon", coords: polygon },
    metadata: {},
  };
  getFloor(node, levelById, defaultFloor).spaces.push(space);
}

function routeFloorMetadata(
  node: Record<string, unknown>,
  bucket: string,
  levelById: Map<string, Floor>,
  defaultFloor: Floor
): void {
  appendFloorMeta(getFloor(node, levelById, defaultFloor), bucket, node);
}

// Known fire-safety item kinds the adapter can map to FireSafetyDevice today.
const ITEM_KIND_TO_DEVICE: Record<string, FireSafetyDeviceKind> = {
  FireExtinguisher: "fire_extinguisher",
  FireHoseCabinet: "fire_hose_cabinet",
  SmokeDetector: "fire_alarm_detector",
  HeatDetector: "fire_alarm_detector",
  ManualCallPoint: "manual_call_point",
  AlarmBell: "alarm_bell",
  EmergencyExit: "emergency_exit",
};

function routeItem(
  node: Record<string, unknown>,
  levelById: Map<string, Floor>,
  defaultFloor: Floor,
  warnings: string[]
): void {
  const id = stringField(node.id);
  if (id === null) {
    warnings.push("dropped Item without an `id`");
    return;
  }
  const itemKind = stringField(node.kind);
  const mappedKind = itemKind !== null ? ITEM_KIND_TO_DEVICE[itemKind] : undefined;

  if (mappedKind === undefined) {
    // Unknown Item kind — preserve under floor metadata, do not synthesize a device.
    const floor = getFloor(node, levelById, defaultFloor);
    appendFloorMeta(floor, "pascalItems", node);
    if (itemKind === null) {
      warnings.push(`Item "${id}" had no \`kind\` field; preserved in pascalItems`);
    } else {
      warnings.push(
        `Item "${id}" of kind "${itemKind}" not mapped to a FireSafetyDevice; preserved in pascalItems`
      );
    }
    return;
  }

  const position = strip2D([node.position]);
  if (position === null) {
    warnings.push(`dropped Item "${id}" — invalid \`position\``);
    return;
  }

  const device: FireSafetyDevice = {
    id,
    kind: mappedKind,
    geometry: { kind: "point", coords: position },
    spec: stringField(node.spec) ?? undefined,
    metadata: { pascalKind: itemKind },
  };
  const floor = getFloor(node, levelById, defaultFloor);
  floor.devices.push(device);

  // Also emit an overlay marker so Phase 7's legend has something to display
  // once the iframe pushes a model into the parent. Adapter-emitted markers
  // are sourced from directly visible Pascal nodes, hence `visible_only`.
  const marker: OverlayMarker = {
    id: `${id}-marker`,
    kind: mappedKind,
    position: position[0],
    evidenceStatus: "visible_only",
    label: stringField(node.label) ?? undefined,
    metadata: { sourceItemId: id },
  };
  floor.overlayMarkers.push(marker);
}
