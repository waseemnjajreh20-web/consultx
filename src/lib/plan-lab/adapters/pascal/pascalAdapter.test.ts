/**
 * Tests for `convertPascalScene`. Uses Node's built-in `node:test` runner +
 * `node:assert`. No new dev dependency added to the repo.
 *
 * Run with one of:
 *   - `npx tsx --test src/lib/plan-lab/adapters/pascal/pascalAdapter.test.ts`
 *     (requires `tsx` — not currently installed)
 *   - `node --test --experimental-strip-types src/lib/.../pascalAdapter.test.ts`
 *     (Node ≥ 22.6 with type stripping)
 *   - Vitest (when added) — picks up `*.test.ts` files automatically.
 *
 * The file type-checks under the repo's existing `tsc --noEmit` setup because
 * `@types/node@22` ships the `node:test` and `node:assert` declarations and
 * the project's tsconfig does not restrict `types`.
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { convertPascalScene } from "./pascalAdapter";

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__"
);

function loadFixture(name: string): unknown {
  const raw = readFileSync(path.join(FIXTURES_DIR, name), "utf8");
  return JSON.parse(raw);
}

describe("convertPascalScene — happy path (minimal-scene.json)", () => {
  const scene = loadFixture("minimal-scene.json");
  const { model, warnings } = convertPascalScene(scene);

  it("returns a non-null model", () => {
    assert.ok(model !== null);
  });

  it("emits zero warnings on a clean scene", () => {
    assert.deepStrictEqual(warnings, []);
  });

  it("pins the model version to 1.0.0", () => {
    assert.equal(model?.version, "1.0.0");
  });

  it("preserves the project id and name from the scene root", () => {
    assert.equal(model?.projectId, "proj-min-001");
    assert.equal(model?.name, "Minimal Pascal Scene");
  });

  it("starts in draft review status", () => {
    assert.equal(model?.reviewStatus, "draft");
  });

  it("creates exactly one floor", () => {
    assert.equal(model?.floors.length, 1);
    assert.equal(model?.floors[0].id, "lvl-ground");
    assert.equal(model?.floors[0].name, "Ground Floor");
    assert.equal(model?.floors[0].level, 0);
  });

  it("strips Z from Wall coordinates and preserves thickness/rating", () => {
    const wall = model?.floors[0].walls[0];
    assert.ok(wall);
    assert.equal(wall.id, "w-001");
    assert.deepStrictEqual(wall.geometry, {
      kind: "polyline",
      coords: [[0, 0], [5, 0]],
    });
    assert.equal(wall.thickness, 0.2);
    assert.equal(wall.rating, "1HR");
  });

  it("creates a Door and, because isExit is true, a paired Exit", () => {
    const floor = model?.floors[0];
    assert.equal(floor?.doors.length, 1);
    assert.equal(floor?.doors[0].id, "d-001");
    assert.equal(floor?.doors[0].isExit, true);
    assert.equal(floor?.doors[0].width, 0.9);
    assert.equal(floor?.doors[0].swing, 90);
    assert.equal(floor?.exits.length, 1);
    assert.equal(floor?.exits[0].metadata.sourceDoorId, "d-001");
  });

  it("converts a Zone to a Space (polygon)", () => {
    const space = model?.floors[0].spaces[0];
    assert.ok(space);
    assert.equal(space.id, "z-001");
    assert.equal(space.name, "Reception");
    assert.equal(space.kind, "lobby");
    assert.equal(space.geometry.kind, "polygon");
    assert.equal(space.area, 20);
  });

  it("maps a known Item kind to a FireSafetyDevice and an overlay marker", () => {
    const floor = model?.floors[0];
    assert.equal(floor?.devices.length, 1);
    assert.equal(floor?.devices[0].kind, "fire_extinguisher");
    assert.equal(floor?.devices[0].spec, "ABC 6kg");
    assert.equal(floor?.overlayMarkers.length, 1);
    assert.equal(floor?.overlayMarkers[0].kind, "fire_extinguisher");
    assert.equal(floor?.overlayMarkers[0].metadata.sourceItemId, "i-001");
  });
});

describe("convertPascalScene — degraded path (missing-fields-scene.json)", () => {
  const scene = loadFixture("missing-fields-scene.json");
  const { model, warnings } = convertPascalScene(scene);

  it("still returns a non-null model so partial data is recovered", () => {
    assert.ok(model !== null);
  });

  it("emits warnings for every dropped or unmapped node", () => {
    assert.ok(warnings.length >= 5, `expected ≥5 warnings, got ${warnings.length}`);
  });

  it("falls back to a synthetic projectId when the scene root has none", () => {
    assert.equal(model?.projectId, "pascal-import");
  });

  it("drops the Wall without an id and the Wall with too few points", () => {
    assert.equal(model?.floors[0].walls.length, 0);
  });

  it("drops the Door without a position", () => {
    assert.equal(model?.floors[0].doors.length, 0);
  });

  it("drops the Zone with too few polygon points", () => {
    assert.equal(model?.floors[0].spaces.length, 0);
  });

  it("preserves Items with unknown or missing kind under pascalItems", () => {
    const pascalItems = model?.floors[0].metadata.pascalItems;
    assert.ok(Array.isArray(pascalItems));
    assert.equal(pascalItems?.length, 2);
  });
});

describe("convertPascalScene — unknown nodes (unknown-node-scene.json)", () => {
  const scene = loadFixture("unknown-node-scene.json");
  const { model, warnings } = convertPascalScene(scene);

  it("preserves unknown node kinds under metadata.pascalUnknownNodes", () => {
    const unknown = model?.metadata.pascalUnknownNodes;
    assert.ok(Array.isArray(unknown));
    const types = (unknown as Array<{ type: string }>).map((n) => n.type);
    assert.ok(types.includes("MysteryNode"));
    assert.ok(types.includes("AnotherMystery"));
  });

  it("routes Slab to the floor metadata", () => {
    const slabs = model?.floors[0].metadata.pascalSlabs;
    assert.ok(Array.isArray(slabs));
    assert.equal(slabs?.length, 1);
  });

  it("routes Ceiling to the floor metadata", () => {
    const ceilings = model?.floors[0].metadata.pascalCeilings;
    assert.ok(Array.isArray(ceilings));
    assert.equal(ceilings?.length, 1);
  });

  it("routes Roof to the root metadata", () => {
    const roofs = model?.metadata.pascalRoofs;
    assert.ok(Array.isArray(roofs));
    assert.equal(roofs?.length, 1);
  });

  it("warns about each unknown top-level node type", () => {
    const warned = warnings.filter((w) => w.includes("unknown Pascal node type"));
    assert.ok(warned.length >= 2);
  });
});

describe("convertPascalScene — malformed input", () => {
  it("null → model:null + warning", () => {
    const { model, warnings } = convertPascalScene(null);
    assert.equal(model, null);
    assert.ok(warnings.length > 0);
  });

  it("undefined → model:null + warning", () => {
    const { model, warnings } = convertPascalScene(undefined);
    assert.equal(model, null);
    assert.ok(warnings.length > 0);
  });

  it("primitive → model:null + warning", () => {
    assert.equal(convertPascalScene("hello").model, null);
    assert.equal(convertPascalScene(42).model, null);
    assert.equal(convertPascalScene(true).model, null);
  });

  it("array → model:null + warning", () => {
    const { model } = convertPascalScene([{ type: "Level", id: "x" }]);
    assert.equal(model, null);
  });

  it("object missing nodes array → model:null + warning", () => {
    const { model, warnings } = convertPascalScene({ name: "no nodes" });
    assert.equal(model, null);
    assert.ok(warnings.some((w) => w.includes("nodes")));
  });

  it("synthesizes a default floor when no Level nodes are present", () => {
    const { model, warnings } = convertPascalScene({
      nodes: [
        { type: "Wall", id: "w-loose", points: [[0, 0], [1, 0]] },
      ],
    });
    assert.ok(model !== null);
    assert.equal(model?.floors.length, 1);
    assert.equal(model?.floors[0].id, "pascal-default-level");
    assert.ok(warnings.some((w) => w.includes("synthetic")));
  });
});

describe("convertPascalScene — isolation guarantees", () => {
  it("does not throw on any of the documented inputs", () => {
    assert.doesNotThrow(() => convertPascalScene(null));
    assert.doesNotThrow(() => convertPascalScene({}));
    assert.doesNotThrow(() => convertPascalScene({ nodes: [null, "x", 42] }));
  });
});
