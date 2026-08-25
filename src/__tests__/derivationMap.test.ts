/**
 * Tests for supabase/functions/fire-safety-chat/derivationMap.ts (P6).
 *
 * Subject: the ADVISORY_QUERY_DERIVATION_ENABLED flag, the shape and chapter
 * membership of every curated DERIVATION_MAP entry, and deriveTargetSections'
 * ordering/dedup/cap contract.
 *
 * derivationMap.ts is pure (no Deno APIs, no I/O) and is imported and
 * executed directly here — the same pattern retrievalPolicy.test.ts and
 * chapterVolumeMap.test.ts use for their sibling modules.
 *
 * The chapter sets below are embedded as an independent fixture (from the
 * digest's measured chapter census, chapterIndex.ts's own header comment),
 * not imported from chapterIndex.ts — so this test cross-checks
 * DERIVATION_MAP's section numbers against the digest directly rather than
 * against whatever chapterIndex.ts happens to say today.
 */
import { describe, it, expect } from "vitest";
import {
  DERIVATION_FLAG_ENV,
  DERIVATION_MAP,
  deriveTargetSections,
  isDerivationEnabled,
} from "../../supabase/functions/fire-safety-chat/derivationMap.ts";

/** Env reader stub: exactly the shape of Deno.env.get. */
const envOf = (map: Record<string, string>) => (k: string) => map[k];

// SBC 201: chapters 1-33, 35 (34 RESERVED).
const SBC201_CHAPTERS = new Set<number>([
  ...Array.from({ length: 33 }, (_, i) => i + 1), // 1..33
  35,
]);

// SBC 801: chapters 1-12, 20-39, 50-67 (52 RESERVED), 80. 13-19, 40-49,
// 68-79 DO NOT EXIST.
const SBC801_CHAPTERS = new Set<number>([
  ...Array.from({ length: 12 }, (_, i) => i + 1), // 1..12
  ...Array.from({ length: 20 }, (_, i) => i + 20), // 20..39
  ...Array.from({ length: 18 }, (_, i) => i + 50).filter((n) => n !== 52), // 50..67 minus 52
  80,
]);

const SECTION_REGEX = /^[0-9]{3,4}(\.[0-9]+)*$/;

// SBC/IBC-style section numbers encode their chapter as the leading digits
// divided by 100 — "903.2" is chapter 9, "1020.1" is chapter 10, "508" is
// chapter 5. The substring before the first dot is NOT the chapter (e.g.
// "1020" is not chapter 1020); it must be floor-divided by 100.
function leadingChapter(section: string): number {
  const leadingNumber = Number(section.split(".")[0]);
  return Math.floor(leadingNumber / 100);
}

// ===========================================================================
// 1. FLAG — default OFF, exact string "1" only
// ===========================================================================
describe("ADVISORY_QUERY_DERIVATION_ENABLED flag", () => {
  it("is OFF when the variable is unset", () => {
    expect(isDerivationEnabled(envOf({}))).toBe(false);
  });

  it.each(["", "0", "2", "true", "TRUE", "yes", " 1", "1 "])(
    'is OFF for the value %j — only the exact string "1" enables it',
    (value) => {
      expect(isDerivationEnabled(envOf({ [DERIVATION_FLAG_ENV]: value }))).toBe(false);
    },
  );

  it('is ON only for the exact string "1"', () => {
    expect(isDerivationEnabled(envOf({ [DERIVATION_FLAG_ENV]: "1" }))).toBe(true);
  });

  it("uses the exact env var name ADVISORY_QUERY_DERIVATION_ENABLED", () => {
    expect(DERIVATION_FLAG_ENV).toBe("ADVISORY_QUERY_DERIVATION_ENABLED");
  });
});

// ===========================================================================
// 2. DERIVATION_MAP shape and chapter-membership self-validation
// ===========================================================================
describe("DERIVATION_MAP curated data", () => {
  it("has a modest, defensible entry count (15-25)", () => {
    expect(DERIVATION_MAP.length).toBeGreaterThanOrEqual(15);
    expect(DERIVATION_MAP.length).toBeLessThanOrEqual(25);
  });

  it("every entry has at least one questionType and one targetSection", () => {
    for (const entry of DERIVATION_MAP) {
      expect(entry.questionTypes.length).toBeGreaterThan(0);
      expect(entry.targetSections.length).toBeGreaterThan(0);
    }
  });

  it("every entry carries a one-line why for each targetSection", () => {
    for (const entry of DERIVATION_MAP) {
      for (const target of entry.targetSections) {
        expect(typeof target.why).toBe("string");
        expect(target.why.length).toBeGreaterThan(10);
        expect(target.why.includes("\n")).toBe(false);
      }
    }
  });

  it("every targetSections.section matches the dotted section-number shape", () => {
    for (const entry of DERIVATION_MAP) {
      for (const target of entry.targetSections) {
        expect(target.section).toMatch(SECTION_REGEX);
      }
    }
  });

  it("every targetSections.section's leading chapter exists in its own code's chapter set", () => {
    const offenders: string[] = [];
    for (const entry of DERIVATION_MAP) {
      for (const target of entry.targetSections) {
        const chapter = leadingChapter(target.section);
        const chapterSet = target.code === "SBC201" ? SBC201_CHAPTERS : SBC801_CHAPTERS;
        if (!chapterSet.has(chapter)) {
          offenders.push(`${target.code} ${target.section} (chapter ${chapter})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses only SBC201 or SBC801 as the code", () => {
    for (const entry of DERIVATION_MAP) {
      for (const target of entry.targetSections) {
        expect(["SBC201", "SBC801"]).toContain(target.code);
      }
    }
  });

  it("contains the CONFIRMED Group M sections with the code volume the source tree attributes them to", () => {
    const m = DERIVATION_MAP.find((e) => e.occupancy === "M");
    expect(m).toBeDefined();
    const pairs = m!.targetSections.map((t) => `${t.code}:${t.section}`);
    // group-m-fire-protection.json source_refs: sbc-201-section-309 and
    // sbc-801-section-{903.2.7, 903.2.7.1, 903.2.7.2, 907.2.7, 907.2.7.1};
    // Section 402 is named there as "SBC 201 Section 402".
    expect(pairs).toEqual(
      expect.arrayContaining([
        "SBC201:309",
        "SBC201:402",
        "SBC801:903.2.7",
        "SBC801:903.2.7.1",
        "SBC801:903.2.7.2",
        "SBC801:907.2.7",
        "SBC801:907.2.7.1",
      ]),
    );
  });

  it("files every chapter-9 and chapter-10 section under SBC801, as the repo's decision-tree corpus does", () => {
    // Both codes have a chapter 9 and a chapter 10 (chapterIndex.ts), so a
    // section number alone does not identify the volume. Every source_ref in
    // sprinkler-required-decision.json, egress-design-checklist.json and
    // group-m-fire-protection.json that names a 9xx or 10xx section is an
    // "sbc-801-..." id. An earlier draft filed these under SBC201 while citing
    // those same trees as CONFIRMED; this test pins the corrected attribution.
    const offenders: string[] = [];
    for (const entry of DERIVATION_MAP) {
      for (const target of entry.targetSections) {
        const chapter = leadingChapter(target.section);
        if ((chapter === 9 || chapter === 10) && target.code !== "SBC801") {
          offenders.push(`${target.code} ${target.section}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("files every chapter-3, chapter-4 and chapter-5 section under SBC201", () => {
    // Mirror of the check above: sbc-201-section-302 / sbc-201-section-309 and
    // promptContract's "SBC 201 Section 403.1" anchor the low chapters to the
    // general building code.
    const offenders: string[] = [];
    for (const entry of DERIVATION_MAP) {
      for (const target of entry.targetSections) {
        const chapter = leadingChapter(target.section);
        if (chapter >= 3 && chapter <= 5 && target.code !== "SBC201") {
          offenders.push(`${target.code} ${target.section}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses the per-occupancy sprinkler trigger subsections confirmed by sprinkler-required-decision.json", () => {
    // relation ids rel-sbc801-903-2-<n>-<category>-trigger.
    const expected: Record<string, string> = {
      A: "903.2.1",
      E: "903.2.3",
      F: "903.2.4",
      H: "903.2.5",
      I: "903.2.6",
      M: "903.2.7",
      R: "903.2.8",
      S: "903.2.9",
    };
    for (const [occupancy, section] of Object.entries(expected)) {
      const entry = DERIVATION_MAP.find((e) => e.occupancy === occupancy);
      expect(entry, `no entry for occupancy ${occupancy}`).toBeDefined();
      const pairs = entry!.targetSections.map((t) => `${t.code}:${t.section}`);
      expect(pairs, `occupancy ${occupancy}`).toContain(`SBC801:${section}`);
    }
    // That corpus lists no Group B occupancy trigger subsection, so Group B
    // must point at the parent rather than guess a child.
    const b = DERIVATION_MAP.find((e) => e.occupancy === "B")!;
    const bPairs = b.targetSections.map((t) => `${t.code}:${t.section}`);
    expect(bPairs).toContain("SBC801:903.2");
    expect(bPairs.some((p) => /^SBC801:903\.2\.\d/.test(p))).toBe(false);
  });

  it("never states a requirement or a numeric threshold in a why — these are retrieval hints only", () => {
    // A `why` exists to justify PULLING a section into context. The moment it
    // says what the code requires, or quotes a value, it becomes an
    // uncitable pseudo-source that the model may repeat to a user.
    const bannedPhrases = [
      "is required",
      "are required",
      "shall ",
      "must be",
      "requires ",
      "triggered when",
      "applies when",
      "near-universally",
      "typically trigger",
    ];
    // Any bare number that is not part of a section reference: a rating, a
    // dimension, an area, a count.
    const numericAssertion = /\b\d+(\.\d+)?\s*(m2|m²|mm|m\b|hour|hours|ft|persons)/i;

    const offenders: string[] = [];
    for (const entry of DERIVATION_MAP) {
      for (const target of entry.targetSections) {
        const why = target.why.toLowerCase();
        for (const phrase of bannedPhrases) {
          if (why.includes(phrase)) offenders.push(`${target.code} ${target.section}: "${phrase}"`);
        }
        if (numericAssertion.test(target.why)) {
          offenders.push(`${target.code} ${target.section}: numeric value asserted`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every why is framed as a reason to retrieve, and names its provenance", () => {
    for (const entry of DERIVATION_MAP) {
      for (const target of entry.targetSections) {
        const why = target.why.toLowerCase();
        expect(why, `${target.code} ${target.section}`).toContain("retrieve");
        // Either it cites a source, or it says out loud that it does not have one.
        const citesSource =
          why.includes(".json") || why.includes("promptcontract") || why.includes("chapter index");
        const admitsUnconfirmed = why.includes("not independently confirmed") || why.includes("not confirmed");
        expect(citesSource || admitsUnconfirmed, `${target.code} ${target.section}`).toBe(true);
      }
    }
  });

  it("has at least one wildcard ('*') entry", () => {
    expect(DERIVATION_MAP.some((e) => e.occupancy === "*")).toBe(true);
  });
});

// ===========================================================================
// 3. deriveTargetSections
// ===========================================================================
describe("deriveTargetSections", () => {
  it("returns occupancy-specific sections before wildcard sections", () => {
    const result = deriveTargetSections({ occupancy_group: "M", question_type: "specific_code_question" });
    expect(result.length).toBeGreaterThan(0);

    const mSections = new Set(
      DERIVATION_MAP.find((e) => e.occupancy === "M")!.targetSections.map((t) => t.section),
    );
    const firstWildcardIndex = result.findIndex((r) => !mSections.has(r.section));
    const lastMIndex = (() => {
      for (let i = result.length - 1; i >= 0; i--) {
        if (mSections.has(result[i].section)) return i;
      }
      return -1;
    })();

    if (firstWildcardIndex !== -1 && lastMIndex !== -1) {
      expect(lastMIndex).toBeLessThan(firstWildcardIndex);
    } else {
      // All 8 slots were filled by Group M's own (larger) targetSections list —
      // still consistent with "occupancy-specific first".
      expect(lastMIndex).not.toBe(-1);
    }
  });

  it("dedups by code+section, keeping the first why encountered", () => {
    // DERIVATION_MAP's curated entries deliberately don't overlap each other
    // (see the header comment), so exercise the dedup path directly: mutate
    // the real exported array with two entries that collide on the same
    // code+section, call the real function, then restore the original array.
    const originalLength = DERIVATION_MAP.length;
    DERIVATION_MAP.push(
      {
        occupancy: "*",
        questionTypes: ["__dedup_probe__"],
        targetSections: [{ code: "SBC201", section: "999", why: "first why wins" }],
      },
      {
        occupancy: "*",
        questionTypes: ["__dedup_probe__"],
        targetSections: [{ code: "SBC201", section: "999", why: "second why loses" }],
      },
    );
    try {
      const result = deriveTargetSections({ question_type: "__dedup_probe__" });
      const matches = result.filter((r) => r.code === "SBC201" && r.section === "999");
      expect(matches.length).toBe(1);
      expect(matches[0].why).toBe("first why wins");
    } finally {
      DERIVATION_MAP.length = originalLength;
    }
  });

  it("regression: no two curated entries currently collide on the same code+section for any single question_type", () => {
    // A softer, data-driven companion to the probe test above: for every
    // question_type in the taxonomy, the real curated data should never need
    // the dedup path (each key appears in the raw candidate list at most once
    // before dedup even runs) — a change that breaks this is worth a second
    // look, even though dedup itself would still make the output correct.
    const allQuestionTypes = new Set(DERIVATION_MAP.flatMap((e) => e.questionTypes));
    for (const qt of allQuestionTypes) {
      for (const occ of [undefined, "A", "B", "E", "F", "H", "I", "M", "R", "S"]) {
        const result = deriveTargetSections({ occupancy_group: occ, question_type: qt });
        const keys = result.map((r) => `${r.code}:${r.section}`);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it("caps the result at 8 sections", () => {
    const result = deriveTargetSections({ occupancy_group: "M", question_type: "specific_code_question" });
    expect(result.length).toBeLessThanOrEqual(8);

    const broad = deriveTargetSections({ occupancy_group: "I", question_type: "non_compliance_investigation" });
    expect(broad.length).toBeLessThanOrEqual(8);
  });

  it("is deterministic for the same input", () => {
    const a = deriveTargetSections({ occupancy_group: "I", question_type: "specific_code_question" });
    const b = deriveTargetSections({ occupancy_group: "I", question_type: "specific_code_question" });
    expect(a).toEqual(b);
  });

  it("returns each matched entry's own sections in ascending numeric order", () => {
    // Ordering is by entry priority (occupancy-specific, then wildcard, each
    // in DERIVATION_MAP declaration order), NOT a single global numeric sort
    // across entry boundaries — only within one entry's own contribution.
    // The "I" entry has 4 sections, well under the cap of 8, and is the only
    // exact match for occupancy_group "I", so it occupies exactly the first
    // 4 slots of the result.
    const iEntry = DERIVATION_MAP.find((e) => e.occupancy === "I")!;
    const n = iEntry.targetSections.length;
    const result = deriveTargetSections({ occupancy_group: "I", question_type: "specific_code_question" });
    const ownSlice = result.slice(0, n);

    const expected = new Set(iEntry.targetSections.map((t) => `${t.code}:${t.section}`));
    const actual = new Set(ownSlice.map((r) => `${r.code}:${r.section}`));
    expect(actual).toEqual(expected);

    for (let i = 1; i < ownSlice.length; i++) {
      const prev = ownSlice[i - 1].section.split(".").map(Number);
      const cur = ownSlice[i].section.split(".").map(Number);
      const len = Math.max(prev.length, cur.length);
      let cmp = 0;
      for (let j = 0; j < len; j++) {
        const pv = prev[j] ?? 0;
        const cv = cur[j] ?? 0;
        if (pv !== cv) {
          cmp = pv - cv;
          break;
        }
      }
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });

  it("still returns wildcard matches when occupancy_group is unknown/undefined", () => {
    const result = deriveTargetSections({ question_type: "specific_code_question" });
    expect(result.length).toBeGreaterThan(0);
  });

  it("still returns wildcard matches for an occupancy group that matches no curated entry", () => {
    const result = deriveTargetSections({ occupancy_group: "Z-9", question_type: "specific_code_question" });
    expect(result.length).toBeGreaterThan(0);
    // None of these came from an occupancy-specific entry, since none exists for "Z".
    const occupancySpecificSections = new Set(
      DERIVATION_MAP.filter((e) => e.occupancy !== "*").flatMap((e) => e.targetSections.map((t) => t.section)),
    );
    for (const r of result) {
      const fromWildcardOnly = DERIVATION_MAP.filter((e) => e.occupancy === "*").some((e) =>
        e.targetSections.some((t) => t.section === r.section && t.code === r.code),
      );
      expect(fromWildcardOnly || !occupancySpecificSections.has(r.section)).toBe(true);
    }
  });

  it("returns empty for an unknown question_type with no matching wildcard entry", () => {
    const result = deriveTargetSections({ occupancy_group: "M", question_type: "totally_unknown_type" });
    expect(result).toEqual([]);
  });

  it("returns empty for general_information, which no curated entry lists", () => {
    const result = deriveTargetSections({ occupancy_group: "M", question_type: "general_information" });
    expect(result).toEqual([]);
  });

  it("occupancy subgroup 'I-2' matches the bare 'I' entry", () => {
    const bare = deriveTargetSections({ occupancy_group: "I", question_type: "occupancy_classification_query" });
    const sub = deriveTargetSections({ occupancy_group: "I-2", question_type: "occupancy_classification_query" });
    expect(sub.length).toBeGreaterThan(0);
    expect(sub).toEqual(bare);
  });

  it("does not cross-match an unrelated occupancy letter (e.g. 'IS' does not match 'I')", () => {
    const result = deriveTargetSections({ occupancy_group: "IS", question_type: "occupancy_classification_query" });
    // "IS" is not "I", and does not start with "I-", so only wildcard matches (if any) should appear.
    const iEntrySections = new Set(
      DERIVATION_MAP.find((e) => e.occupancy === "I")!.targetSections.map((t) => t.section),
    );
    for (const r of result) {
      expect(iEntrySections.has(r.section) && r.code === "SBC201").toBe(false);
    }
  });
});
