/**
 * Tests for the fire-safety-chat P5 source-signal formatters (sourceSignals.ts).
 *
 * supabase/functions/fire-safety-chat/sourceSignals.ts is pure (no Deno APIs,
 * no I/O) and is imported and executed directly here — the same pattern
 * retrievalPolicy.test.ts and contextBudget.test.ts use.
 *
 * Two things are guarded:
 *   1. The `__sbc_table__::SBC-XXX::<table_id>` sentinel grammar exactly
 *      matches src/utils/sourceMetadata.ts's parser regex
 *      `^__sbc_table__::(SBC-(?:201|801))::(.+)$` (~line 119) — a drift on
 *      either side silently stops structured-table sources from rendering
 *      in SourcePanel.
 *   2. The external-refs honesty block: dedup by standard_ref (falling back
 *      to `standard`), the 5-line cap, and the exact negative-phrased
 *      wording containing the mandated anchor phrase.
 */
import { describe, it, expect } from "vitest";
import {
  buildTableSourceSignals,
  EXTERNAL_REF_ANCHOR_PHRASE,
  EXTERNAL_REFS_MAX_LINES,
  formatExternalRefsBlock,
  formatTableSentinel,
  normalizeTableSourceCode,
  type ExternalRefRow,
  type StructuredTableSourceRow,
} from "../../supabase/functions/fire-safety-chat/sourceSignals.ts";

// The exact parser regex from src/utils/sourceMetadata.ts (~line 119),
// duplicated here (not imported — that file lives in a different tsconfig
// project) so a change to either side's grammar fails this test.
const FRONTEND_SENTINEL_RX = /^__sbc_table__::(SBC-(?:201|801))::(.+)$/;

describe("normalizeTableSourceCode", () => {
  it("normalises the DB's space-separated form", () => {
    expect(normalizeTableSourceCode("SBC 201")).toBe("SBC-201");
    expect(normalizeTableSourceCode("SBC 801")).toBe("SBC-801");
  });

  it("also accepts an already-hyphenated or bare-concatenated form", () => {
    expect(normalizeTableSourceCode("SBC-201")).toBe("SBC-201");
    expect(normalizeTableSourceCode("SBC201")).toBe("SBC-201");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeTableSourceCode("  sbc 801  ")).toBe("SBC-801");
  });

  it("returns null for null, undefined, empty, and unrecognised values", () => {
    expect(normalizeTableSourceCode(null)).toBeNull();
    expect(normalizeTableSourceCode(undefined)).toBeNull();
    expect(normalizeTableSourceCode("")).toBeNull();
    expect(normalizeTableSourceCode("SBC 999")).toBeNull();
    expect(normalizeTableSourceCode("IBC 2021")).toBeNull();
  });
});

describe("formatTableSentinel", () => {
  it("formats the exact sentinel grammar the frontend parser expects", () => {
    const sentinel = formatTableSentinel({ table_id: "309", source_code: "SBC 201" });
    expect(sentinel).toBe("__sbc_table__::SBC-201::309");
    const m = sentinel!.match(FRONTEND_SENTINEL_RX);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("SBC-201");
    expect(m![2]).toBe("309");
  });

  it("round-trips a SBC 801 table id", () => {
    const sentinel = formatTableSentinel({ table_id: "903.2", source_code: "SBC 801" });
    expect(sentinel).toBe("__sbc_table__::SBC-801::903.2");
    expect(FRONTEND_SENTINEL_RX.test(sentinel!)).toBe(true);
  });

  it("preserves parenthesised table ids (e.g. 1006.3.4(1)) verbatim", () => {
    const sentinel = formatTableSentinel({ table_id: "1006.3.4(1)", source_code: "SBC 201" });
    expect(sentinel).toBe("__sbc_table__::SBC-201::1006.3.4(1)");
    const m = sentinel!.match(FRONTEND_SENTINEL_RX);
    expect(m![2]).toBe("1006.3.4(1)");
  });

  it("returns null when source_code cannot be normalised", () => {
    expect(formatTableSentinel({ table_id: "309", source_code: "IBC 2021" })).toBeNull();
    expect(formatTableSentinel({ table_id: "309", source_code: null })).toBeNull();
  });

  it("returns null when table_id is missing/empty", () => {
    expect(formatTableSentinel({ table_id: "", source_code: "SBC 201" })).toBeNull();
  });
});

describe("buildTableSourceSignals", () => {
  it("builds parallel files/sourceMeta arrays for every valid row", () => {
    const rows: StructuredTableSourceRow[] = [
      { table_id: "309", source_code: "SBC 201" },
      { table_id: "903.2", source_code: "SBC 801" },
    ];
    const { files, sourceMeta } = buildTableSourceSignals(rows);
    expect(files).toEqual([
      "__sbc_table__::SBC-201::309",
      "__sbc_table__::SBC-801::903.2",
    ]);
    expect(sourceMeta).toHaveLength(2);
    for (const [i, entry] of sourceMeta.entries()) {
      expect(entry.file).toBe(files[i]);
      expect(entry.pageStart).toBeNull();
      expect(entry.pageEnd).toBeNull();
      expect(entry.precision).toBe("unavailable");
    }
  });

  it("skips rows with unrecognised source_code without throwing", () => {
    const rows: StructuredTableSourceRow[] = [
      { table_id: "309", source_code: "SBC 201" },
      { table_id: "999", source_code: "NOT-A-CODE" },
    ];
    const { files, sourceMeta } = buildTableSourceSignals(rows);
    expect(files).toEqual(["__sbc_table__::SBC-201::309"]);
    expect(sourceMeta).toHaveLength(1);
  });

  it("dedupes rows that produce the identical sentinel, keeping first-occurrence order", () => {
    // sbc_code_tables.table_id is NOT unique in production (index.ts's
    // KNOWN_TABLE_IDS comment records "417" on two rows), and
    // fetchStructuredTables matches it with .in("table_id", ids), so both rows
    // arrive here. The sentinel is fully determined by (source_code,
    // table_id), so the repeat must not reach X-SBC-Sources twice.
    const rows: StructuredTableSourceRow[] = [
      { table_id: "417", source_code: "SBC 201" },
      { table_id: "309", source_code: "SBC 201" },
      { table_id: "417", source_code: "SBC 201" },
      // Same table_id under a DIFFERENT code is a different source — keep both.
      { table_id: "417", source_code: "SBC 801" },
    ];
    const { files, sourceMeta } = buildTableSourceSignals(rows);
    expect(files).toEqual([
      "__sbc_table__::SBC-201::417",
      "__sbc_table__::SBC-201::309",
      "__sbc_table__::SBC-801::417",
    ]);
    expect(sourceMeta.map((e) => e.file)).toEqual(files);
  });

  it("returns empty arrays for an empty or missing row list", () => {
    expect(buildTableSourceSignals([])).toEqual({ files: [], sourceMeta: [] });
    // deno-lint-ignore no-explicit-any
    expect(buildTableSourceSignals(undefined as any)).toEqual({ files: [], sourceMeta: [] });
  });
});

describe("formatExternalRefsBlock", () => {
  it("returns empty string for no rows", () => {
    expect(formatExternalRefsBlock([])).toBe("");
  });

  it("emits one negative-phrased line per distinct standard_ref, containing the anchor phrase", () => {
    const rows: ExternalRefRow[] = [
      { standard: "NFPA", standard_ref: "NFPA 13" },
      { standard: "ASTM", standard_ref: "ASTM E119" },
    ];
    const block = formatExternalRefsBlock(rows);
    expect(block).toContain("NFPA 13");
    expect(block).toContain("ASTM E119");
    // Exact mandated wording, verbatim, per reference.
    expect(block).toContain(
      "نص SBC المسترجع يُحيل إلى NFPA 13 — هذا المعيار غير متوفر في مصادر النظام ولا يمكن استرجاع نص بنوده.",
    );
    expect(block).toContain(
      "نص SBC المسترجع يُحيل إلى ASTM E119 — هذا المعيار غير متوفر في مصادر النظام ولا يمكن استرجاع نص بنوده.",
    );
    // Every emitted line carries the anchor phrase.
    const lines = block.split("\n").filter((l) => l.includes("يُحيل إلى"));
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toContain(EXTERNAL_REF_ANCHOR_PHRASE);
    }
  });

  it("is clearly labelled with a header and footer", () => {
    const block = formatExternalRefsBlock([{ standard: "NFPA", standard_ref: "NFPA 13" }]);
    expect(block).toMatch(/===.*EXTERNAL STANDARDS.*===/);
    expect(block).toMatch(/===.*END EXTERNAL STANDARD REFERENCES.*===/);
  });

  it("dedupes by standard_ref, keeping first occurrence order", () => {
    const rows: ExternalRefRow[] = [
      { standard: "NFPA", standard_ref: "NFPA 13" },
      { standard: "NFPA", standard_ref: "NFPA 13" },
      { standard: "NFPA", standard_ref: "NFPA 72" },
    ];
    const block = formatExternalRefsBlock(rows);
    const occurrences = block.split("NFPA 13").length - 1;
    expect(occurrences).toBe(1);
    expect(block).toContain("NFPA 72");
  });

  it("falls back to `standard` when standard_ref is null (family-only citation)", () => {
    const rows: ExternalRefRow[] = [{ standard: "NFPA", standard_ref: null }];
    const block = formatExternalRefsBlock(rows);
    expect(block).toContain(
      "نص SBC المسترجع يُحيل إلى NFPA — هذا المعيار غير متوفر في مصادر النظام ولا يمكن استرجاع نص بنوده.",
    );
  });

  it("caps at EXTERNAL_REFS_MAX_LINES (5) distinct references", () => {
    const rows: ExternalRefRow[] = Array.from({ length: 12 }, (_, i) => ({
      standard: "NFPA",
      standard_ref: `NFPA ${i}`,
    }));
    const block = formatExternalRefsBlock(rows);
    const lines = block.split("\n").filter((l) => l.includes("يُحيل إلى"));
    expect(lines).toHaveLength(EXTERNAL_REFS_MAX_LINES);
    expect(lines).toHaveLength(5);
    // First 5 in input order, not the last 5.
    expect(block).toContain("NFPA 0");
    expect(block).toContain("NFPA 4");
    expect(block).not.toContain("NFPA 5 ");
  });

  it("skips rows whose standard_ref and standard are both empty/whitespace", () => {
    const rows: ExternalRefRow[] = [
      { standard: "   ", standard_ref: "  " },
      { standard: "UL", standard_ref: "UL 268" },
    ];
    const block = formatExternalRefsBlock(rows);
    const lines = block.split("\n").filter((l) => l.includes("يُحيل إلى"));
    expect(lines).toHaveLength(1);
    expect(block).toContain("UL 268");
  });
});
