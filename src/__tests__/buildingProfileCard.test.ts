/**
 * Tests for the pure helpers exported from src/components/BuildingProfileCard.tsx
 * (C1b UI wiring, 2026-09-03): fieldLabel, formatSuggestedValue, hasConflict,
 * buildProfileSummary. Pure helpers only — no React rendering, no Supabase.
 *
 * Why this file can safely import a .tsx component: BuildingProfileCard.tsx
 * defers its Supabase import (`await import("@/integrations/supabase/client")`
 * inside async handlers) instead of importing it at module top level. The
 * Supabase client module reads the bare `localStorage` global at construction
 * time, which does not exist under this repo's Vitest config
 * (environment: "node", see vitest.config.ts) — a top-level import would
 * throw before any test in this file could run. See the header comment in
 * BuildingProfileCard.tsx for the full explanation.
 */
import { describe, it, expect } from "vitest";
import {
  fieldLabel,
  formatSuggestedValue,
  hasConflict,
  buildProfileSummary,
} from "../components/BuildingProfileCard";

describe("fieldLabel", () => {
  it("returns the Arabic label for a known field", () => {
    expect(fieldLabel("occupancy_group", true)).toBe("تصنيف الإشغال");
    expect(fieldLabel("stories", true)).toBe("عدد الطوابق");
  });

  it("returns the English label for a known field", () => {
    expect(fieldLabel("occupancy_group", false)).toBe("Occupancy group");
    expect(fieldLabel("gross_area_m2", false)).toBe("Gross area");
  });

  it("falls back to the raw key for an unknown field, in either language", () => {
    expect(fieldLabel("not_a_real_field", true)).toBe("not_a_real_field");
    expect(fieldLabel("not_a_real_field", false)).toBe("not_a_real_field");
  });
});

describe("formatSuggestedValue", () => {
  it("renders a dash for null/undefined regardless of key", () => {
    expect(formatSuggestedValue("stories", null, true)).toBe("—");
    expect(formatSuggestedValue("stories", undefined, false)).toBe("—");
  });

  it("renders sprinklered as an Arabic yes/no phrase", () => {
    expect(formatSuggestedValue("sprinklered", true, true)).toBe("مرشات مركّبة");
    expect(formatSuggestedValue("sprinklered", false, true)).toBe("لا توجد مرشات");
  });

  it("renders sprinklered as an English yes/no phrase", () => {
    expect(formatSuggestedValue("sprinklered", true, false)).toBe("sprinklered");
    expect(formatSuggestedValue("sprinklered", false, false)).toBe("not sprinklered");
  });

  it("appends the meter unit to height_m", () => {
    expect(formatSuggestedValue("height_m", 12, true)).toBe("12 م");
    expect(formatSuggestedValue("height_m", 12, false)).toBe("12 m");
  });

  it("appends the square-meter unit to gross_area_m2", () => {
    expect(formatSuggestedValue("gross_area_m2", 500, true)).toBe("500 م²");
    expect(formatSuggestedValue("gross_area_m2", 500, false)).toBe("500 m²");
  });

  it("stringifies any other field plainly (no unit, no translation)", () => {
    expect(formatSuggestedValue("occupancy_group", "R-2", true)).toBe("R-2");
    expect(formatSuggestedValue("stories", 6, true)).toBe("6");
    expect(formatSuggestedValue("construction_type", "V-A", false)).toBe("V-A");
  });
});

describe("hasConflict", () => {
  it("is false when the current value is unset (undefined, null, or empty string)", () => {
    expect(hasConflict(undefined, "R-2")).toBe(false);
    expect(hasConflict(null, "R-2")).toBe(false);
    expect(hasConflict("", "R-2")).toBe(false);
  });

  it("is false when the current value already matches the suggestion", () => {
    expect(hasConflict("R-2", "R-2")).toBe(false);
    expect(hasConflict(6, 6)).toBe(false);
  });

  it("is true when a confirmed current value differs from the suggestion", () => {
    expect(hasConflict("R-1", "R-2")).toBe(true);
    expect(hasConflict(4, 6)).toBe(true);
    expect(hasConflict(true, false)).toBe(true);
  });
});

describe("buildProfileSummary", () => {
  it("returns an empty string for a null/undefined profile", () => {
    expect(buildProfileSummary(null, true)).toBe("");
    expect(buildProfileSummary(undefined, true)).toBe("");
  });

  it("returns an empty string for a profile with none of the summary fields set", () => {
    expect(buildProfileSummary({ name: "برج الرياض" }, true)).toBe("");
  });

  it("joins occupancy group, stories, and construction type in Arabic", () => {
    expect(buildProfileSummary({ occupancy_group: "R-2", stories: 6, construction_type: "V-A" }, true)).toBe(
      "R-2 · 6 طوابق · V-A",
    );
  });

  it("uses the English floors abbreviation in English", () => {
    expect(buildProfileSummary({ occupancy_group: "R-2", stories: 6, construction_type: "V-A" }, false)).toBe(
      "R-2 · 6 fl. · V-A",
    );
  });

  it("omits unset fields without leaving stray separators", () => {
    expect(buildProfileSummary({ occupancy_group: "B" }, true)).toBe("B");
    expect(buildProfileSummary({ stories: 3 }, true)).toBe("3 طوابق");
  });

  it("treats stories: 0 as set (ground floor only), not missing", () => {
    expect(buildProfileSummary({ occupancy_group: "B", stories: 0 }, true)).toBe("B · 0 طوابق");
  });
});
