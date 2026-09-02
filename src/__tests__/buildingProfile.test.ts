/**
 * Tests for src/lib/buildingProfile.ts (C1a, 2026-09-03).
 *
 * Covers: validation (enum + range checks), completeness scoring, the
 * conservative text extractor (positive extraction + true negatives — it
 * must never guess beyond an explicit marker), and the "معطيات المبنى"
 * prompt block (must be labelled as user-provided facts, never a code
 * source).
 */
import { describe, it, expect } from "vitest";
import {
  validateBuildingProfile,
  profileCompleteness,
  profileToPromptBlock,
  suggestProfileFromText,
  OCCUPANCY_GROUPS,
  CONSTRUCTION_TYPES,
  isOccupancyGroup,
  isConstructionType,
  type BuildingProfile,
} from "../lib/buildingProfile";

describe("OCCUPANCY_GROUPS / CONSTRUCTION_TYPES", () => {
  it("matches the SBC 201 list from the task spec exactly (26 occupancy groups, 9 construction types)", () => {
    expect(OCCUPANCY_GROUPS.length).toBe(26);
    expect(CONSTRUCTION_TYPES.length).toBe(9);
    expect(isOccupancyGroup("R-2")).toBe(true);
    expect(isOccupancyGroup("R")).toBe(false); // bare "R" is not a valid SBC group
    expect(isOccupancyGroup("A")).toBe(false); // bare "A" is not a valid SBC group
    expect(isConstructionType("V-B")).toBe(true);
    expect(isConstructionType("V")).toBe(false);
  });
});

describe("validateBuildingProfile", () => {
  it("rejects an unknown occupancy group with an Arabic message listing the valid SBC 201 values", () => {
    const r = validateBuildingProfile({ occupancy_group: "Z-9" } as any);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.some((e) => e.includes("Z-9"))).toBe(true);
    expect(r.errors.some((e) => e.includes("SBC 201"))).toBe(true);
    expect(r.value.occupancy_group).toBeUndefined();
  });

  it("rejects negative stories", () => {
    const r = validateBuildingProfile({ stories: -1 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("عدد الطوابق"))).toBe(true);
    expect(r.value.stories).toBeUndefined();
  });

  it("rejects a non-integer stories value", () => {
    const r = validateBuildingProfile({ stories: 3.5 });
    expect(r.ok).toBe(false);
  });

  it("rejects an unreasonably large stories value", () => {
    const r = validateBuildingProfile({ stories: 5000 });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown construction type", () => {
    const r = validateBuildingProfile({ construction_type: "X-Z" } as any);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("X-Z"))).toBe(true);
  });

  it("rejects negative height and negative area", () => {
    const rHeight = validateBuildingProfile({ height_m: -5 });
    expect(rHeight.ok).toBe(false);
    const rArea = validateBuildingProfile({ gross_area_m2: -100 });
    expect(rArea.ok).toBe(false);
  });

  it("rejects a malformed conversation_id", () => {
    const r = validateBuildingProfile({ conversation_id: "not-a-uuid" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("المحادثة"))).toBe(true);
  });

  it("accepts a fully valid profile edit and normalizes/trims it", () => {
    const r = validateBuildingProfile({
      conversation_id: "123e4567-e89b-12d3-a456-426614174000",
      name: "  Test Tower  ",
      occupancy_group: "B",
      stories: 6,
      height_m: 21,
      gross_area_m2: 1500,
      sprinklered: true,
      construction_type: "II-B",
      hazard_class: "Ordinary Hazard Group 1",
      occupant_load: 300,
      notes: "  test note  ",
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.value.name).toBe("Test Tower");
    expect(r.value.occupancy_group).toBe("B");
    expect(r.value.construction_type).toBe("II-B");
    expect(r.value.stories).toBe(6);
    expect(r.value.notes).toBe("test note");
  });

  it("allows explicitly clearing a field with null", () => {
    const r = validateBuildingProfile({ occupancy_group: null, height_m: null });
    expect(r.ok).toBe(true);
    expect(r.value.occupancy_group).toBeNull();
    expect(r.value.height_m).toBeNull();
  });

  it("rejects a name over the length limit", () => {
    const r = validateBuildingProfile({ name: "A".repeat(300) });
    expect(r.ok).toBe(false);
  });
});

describe("profileCompleteness", () => {
  it("scores an empty/missing profile as 0 with all 5 core fields missing", () => {
    const c = profileCompleteness(null);
    expect(c.score).toBe(0);
    expect(c.missing).toHaveLength(5);
    expect(c.missing).toEqual(
      expect.arrayContaining([
        "تصنيف الإشغال",
        "عدد الطوابق أو الارتفاع",
        "المساحة الإجمالية",
        "مرشات الحريق",
        "نوع الإنشاء",
      ]),
    );
  });

  it("scores a fully-specified profile as 1 with nothing missing", () => {
    const full: Partial<BuildingProfile> = {
      occupancy_group: "B",
      stories: 6,
      gross_area_m2: 1500,
      sprinklered: true,
      construction_type: "II-B",
    };
    const c = profileCompleteness(full);
    expect(c.score).toBe(1);
    expect(c.missing).toEqual([]);
  });

  it("treats height_m as satisfying the stories-or-height slot even without stories", () => {
    const c = profileCompleteness({ height_m: 21 });
    expect(c.missing).not.toContain("عدد الطوابق أو الارتفاع");
  });

  it("scores a partially-specified profile proportionally", () => {
    const c = profileCompleteness({ occupancy_group: "B", height_m: 21 });
    expect(c.score).toBeCloseTo(2 / 5);
    expect(c.missing).toHaveLength(3);
    expect(c.missing).not.toContain("تصنيف الإشغال");
    expect(c.missing).not.toContain("عدد الطوابق أو الارتفاع");
  });
});

describe("profileToPromptBlock", () => {
  it("returns an empty string for a null/empty profile (nothing to inject)", () => {
    expect(profileToPromptBlock(null)).toBe("");
    expect(profileToPromptBlock({})).toBe("");
  });

  it("labels the Arabic block as 'معطيات المبنى' and explicitly NOT a code source", () => {
    const block = profileToPromptBlock({ occupancy_group: "B", stories: 4 }, "ar");
    expect(block.startsWith("معطيات المبنى")).toBe(true);
    expect(block).toContain("ليست نصاً من الكود");
    expect(block).toContain("تصنيف الإشغال: B");
    expect(block).toContain("عدد الطوابق: 4");
  });

  it("labels the English block as building data and explicitly NOT a code source", () => {
    const block = profileToPromptBlock({ occupancy_group: "B", stories: 4 }, "en");
    expect(block).toContain("NOT a code source");
    expect(block).toContain("Occupancy group: B");
    expect(block).toContain("Stories: 4");
  });

  it("never emits the section-sign symbol", () => {
    const block = profileToPromptBlock(
      { occupancy_group: "B", construction_type: "II-B", notes: "test" },
      "ar",
    );
    expect(block).not.toContain("§");
  });
});

describe("suggestProfileFromText — conservative extraction", () => {
  it("extracts stories, generic residential occupancy, and sprinklered from one Arabic sentence", () => {
    const r = suggestProfileFromText("المبنى 6 طوابق ومبنى سكني به مرشات");
    expect(r.stories).toBe(6);
    expect(r.occupancy_group).toBe("R-2");
    expect(r.sprinklered).toBe(true);
    expect(r.height_m).toBeUndefined();
    expect(r.construction_type).toBeUndefined();
  });

  it("extracts height in meters from 'ارتفاع 21 م'", () => {
    const r = suggestProfileFromText("ارتفاع المبنى 21 م");
    expect(r.height_m).toBe(21);
    expect(r.stories).toBeUndefined();
    expect(r.occupancy_group).toBeUndefined();
  });

  it("extracts a negative sprinkler mention ('بدون مرشات') as sprinklered: false", () => {
    const r = suggestProfileFromText("المبنى بدون مرشات");
    expect(r.sprinklered).toBe(false);
  });

  it("extracts hotel occupancy as R-1 (specific keyword, not the generic residential default)", () => {
    const r = suggestProfileFromText("هذا فندق بارتفاع 30 م");
    expect(r.occupancy_group).toBe("R-1");
    expect(r.height_m).toBe(30);
  });

  it("extracts an explicit construction-type mention", () => {
    const r = suggestProfileFromText("نوع الإنشاء II-B للمبنى");
    expect(r.construction_type).toBe("II-B");
  });

  it("extracts gross area with an explicit unit marker", () => {
    const r = suggestProfileFromText("مساحة المبنى الإجمالية 500 م2");
    expect(r.gross_area_m2).toBe(500);
  });

  it("extracts occupant load only behind an explicit anchor phrase", () => {
    const r = suggestProfileFromText("عدد الشاغلين 150");
    expect(r.occupant_load).toBe(150);
  });

  it("suppresses the generic residential default on an explicit negation", () => {
    const r = suggestProfileFromText("هذا المبنى غير سكني");
    expect(r.occupancy_group).toBeUndefined();
  });

  it("handles bilingual (English) mentions", () => {
    const r = suggestProfileFromText("The building is a hospital with 8 floors and no sprinklers.");
    expect(r.stories).toBe(8);
    expect(r.occupancy_group).toBe("I-2");
    expect(r.sprinklered).toBe(false);
  });

  it("never guesses a bare number as stories without an explicit unit word", () => {
    const r = suggestProfileFromText("اشتريت 6 كتب لمشروعي");
    expect(r.stories).toBeUndefined();
    expect(Object.keys(r)).toHaveLength(0);
  });

  it("produces no false positives on unrelated code-question text", () => {
    const r = suggestProfileFromText("ما هي متطلبات السلالم في كود البناء؟");
    expect(Object.keys(r)).toHaveLength(0);
  });

  it("returns an empty object for empty/null input", () => {
    expect(Object.keys(suggestProfileFromText(""))).toHaveLength(0);
    expect(Object.keys(suggestProfileFromText(null))).toHaveLength(0);
    expect(Object.keys(suggestProfileFromText(undefined))).toHaveLength(0);
  });
});
