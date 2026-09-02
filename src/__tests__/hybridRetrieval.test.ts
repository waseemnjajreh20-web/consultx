/**
 * Tests for hybrid retrieval (wave 1 item B1b):
 * supabase/functions/fire-safety-chat/hybridRetrieval.ts.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE CAN AND CANNOT PROVE
 * ---------------------------------------------------------------------------
 * hybridRetrieval.ts is pure (no Deno APIs) except for one I/O function,
 * fetchSBCContextHybrid, whose Supabase client is a parameter — the same
 * injectable-dependency pattern that makes it safe to import here, the same
 * pattern src/__tests__/retrievalPolicy.test.ts documents for
 * ./retrievalPolicy.ts and ./graphExpansion.ts. Every test below either
 * exercises pure logic directly or drives fetchSBCContextHybrid against a
 * FAKE client (`fakeClient()` below) — never a real database.
 *
 * NOT PROVED HERE: that docs/db/20260903_hybrid_retrieval.sql actually
 * applies cleanly, or that public.match_sbc_hybrid / public.sbc_normalize_ar
 * behave the way this file's TS mirror (sbcNormalizeAr) assumes, against a
 * live Postgres. That needs the owner to apply the SQL file and run the
 * gate in docs/launch/hybrid-retrieval-notes.md. What IS pinned here is the
 * CONTRACT this module promises its future caller: normalized query text,
 * exact RPC argument shape, the fail-open-to-null behaviour on any RPC
 * problem, and the row-to-context mapping — all independent of whether the
 * SQL has been applied yet.
 */
import { describe, it, expect } from "vitest";
import {
  HYBRID_RETRIEVAL_FLAG_ENV,
  isHybridRetrievalEnabled,
  sbcNormalizeAr,
  reciprocalRankFusion,
  codeFromFileName,
  buildHybridContext,
  fetchSBCContextHybrid,
  DEFAULT_HYBRID_CONTEXT_LIMIT,
  type HybridDocRow,
  type SupabaseRpcLike,
} from "../../supabase/functions/fire-safety-chat/hybridRetrieval.ts";

// ===========================================================================
// 1. ADVISORY_HYBRID_RETRIEVAL_ENABLED flag — default OFF, exact "1" only
// ===========================================================================
describe("isHybridRetrievalEnabled (ADVISORY_HYBRID_RETRIEVAL_ENABLED)", () => {
  const envOf = (map: Record<string, string>) => (k: string) => map[k];

  it("uses the exact env var name the wiring change and docs/launch/hybrid-retrieval-notes.md expect", () => {
    expect(HYBRID_RETRIEVAL_FLAG_ENV).toBe("ADVISORY_HYBRID_RETRIEVAL_ENABLED");
  });

  it("is OFF when the variable is unset", () => {
    expect(isHybridRetrievalEnabled(envOf({}))).toBe(false);
  });

  it.each(["", "0", "2", "true", "TRUE", "True", "yes", "on", " 1", "1 ", "01"])(
    'is OFF for the value %j — only the exact string "1" enables it',
    (value) => {
      expect(isHybridRetrievalEnabled(envOf({ [HYBRID_RETRIEVAL_FLAG_ENV]: value }))).toBe(false);
    },
  );

  it('is ON only for the exact string "1"', () => {
    expect(isHybridRetrievalEnabled(envOf({ [HYBRID_RETRIEVAL_FLAG_ENV]: "1" }))).toBe(true);
  });
});

// ===========================================================================
// 2. sbcNormalizeAr — TS mirror of public.sbc_normalize_ar
// ===========================================================================
describe("sbcNormalizeAr", () => {
  it("null/undefined normalize to an empty string", () => {
    expect(sbcNormalizeAr(null)).toBe("");
    expect(sbcNormalizeAr(undefined)).toBe("");
    expect(sbcNormalizeAr("")).toBe("");
  });

  // ---- alef / yeh / ta-marbuta letter-variant unification ----------------
  it("unifies alef-hamza-above (U+0623) to bare alef", () => {
    expect(sbcNormalizeAr("أحمد")).toBe("احمد");
  });

  it("unifies alef-hamza-below (U+0625) to bare alef", () => {
    expect(sbcNormalizeAr("إبراهيم")).toBe("ابراهيم");
  });

  it("unifies alef-madda-above (U+0622) to bare alef", () => {
    expect(sbcNormalizeAr("آدم")).toBe("ادم");
  });

  it("unifies alef-maksura (ى, U+0649) to yeh (ي, U+064A)", () => {
    expect(sbcNormalizeAr("على")).toBe("علي");
  });

  it("unifies ta-marbuta (ة, U+0629) to heh (ه, U+0647)", () => {
    expect(sbcNormalizeAr("مدرسة")).toBe("مدرسه");
  });

  // ---- diacritics (harakat) and tatweel -----------------------------------
  it("strips every codepoint in the documented harakat range U+064B-U+0652", () => {
    for (let cp = 0x064b; cp <= 0x0652; cp++) {
      const withMark = "ب" + String.fromCodePoint(cp) + "يت"; // "بيت" (house) with one mark inserted
      expect(sbcNormalizeAr(withMark), `codepoint U+${cp.toString(16).toUpperCase()}`).toBe("بيت");
    }
  });

  it("strips tatweel (U+0640, kashida)", () => {
    const withTatweel = "م" + "ـ" + "رحبا"; // مـرحبا
    expect(sbcNormalizeAr(withTatweel)).toBe("مرحبا");
  });

  it("does not over-strip into a real letter just below the documented range", () => {
    expect(sbcNormalizeAr("ي")).toBe("ي"); // U+064A, yeh — a letter, one codepoint below U+064B
  });

  it("a combining mark just OUTSIDE the documented harakat range is still removed, as a side effect of punctuation-stripping (not a second diacritics pass)", () => {
    // U+0653 (combining maddah above) is one past U+0652 — outside the
    // documented U+064B-U+0652 range the diacritics step targets. It is
    // still removed, but by a DIFFERENT step: punctuation-stripping keeps
    // only \p{L} (letter) / \p{N} (number) / whitespace / "." / "-", and a
    // combining mark's Unicode category is Mn ("Mark, nonspacing"), not L —
    // so it falls through to "everything else becomes a space" regardless of
    // which codepoint range it is in. Harmless for this corpus (classical
    // Quranic marks like standalone maddah essentially never appear in
    // modern technical SBC text) and consistent with the SQL side, whose
    // punctuation step uses the same shape of allow-list ([:alnum:], which
    // likewise excludes combining marks) — so this is not a TS/SQL parity
    // gap, just two different steps reaching the same outcome.
    const withMaddahAbove = "ا" + "ٓ" + "حمد"; // ا + U+0653 + حمد
    expect(sbcNormalizeAr(withMaddahAbove)).not.toContain("ٓ");
    expect(sbcNormalizeAr(withMaddahAbove)).toBe("ا حمد");
  });

  // ---- combined, cross-checked against the SQL file's own sanity check ---
  it("matches the exact input/output pair documented as the post-apply sanity check in docs/db/20260903_hybrid_retrieval.sql", () => {
    // "الأَمان في نظام السَّلامة  من  الحريق (903.2.11.3)" built from explicit
    // codepoints for the two marked words, rather than typing the combining
    // sequence directly, so the exact diacritics under test are unambiguous.
    const amanWithFatha = "الأ" + "َ" + "مان"; // الأَمان (fatha after hamza-above alef)
    const salamaWithMarks = "الس" + "َ" + "ّ" + "لامة"; // السَّلامة (fatha + shadda)
    const input = `${amanWithFatha} في نظام ${salamaWithMarks}  من  الحريق (903.2.11.3)`;
    expect(sbcNormalizeAr(input)).toBe("الامان في نظام السلامه من الحريق 903.2.11.3");
  });

  // ---- section numbers must "stay intact" ---------------------------------
  it("keeps a dot-style mixed Arabic/English section number intact: 903.2.11.3", () => {
    expect(sbcNormalizeAr("Section 903.2.11.3")).toBe("section 903.2.11.3");
    expect(sbcNormalizeAr("القسم 903.2.11.3 يتطلب")).toBe("القسم 903.2.11.3 يتطلب");
  });

  it("keeps an IEC-style hyphenated section number intact (SBC 401: '41-1.4', '712-')", () => {
    expect(sbcNormalizeAr("41-1.4")).toBe("41-1.4");
    expect(sbcNormalizeAr("712-")).toBe("712-");
  });

  it("strips surrounding punctuation while keeping the section number and the hyphen token intact", () => {
    const ilzamiWithHamza = "إ" + "لزامي"; // إلزامي (hamza-below alef)
    const input = `القسم (903.2.11.3) - ${ilzamiWithHamza}؟`;
    expect(sbcNormalizeAr(input)).toBe("القسم 903.2.11.3 - الزامي");
  });

  // ---- Latin case folding, whitespace -------------------------------------
  it("lowercases Latin text", () => {
    expect(sbcNormalizeAr("Fire Safety Chapter")).toBe("fire safety chapter");
  });

  it("collapses whitespace runs and trims", () => {
    expect(sbcNormalizeAr("hello   world")).toBe("hello world");
    expect(sbcNormalizeAr("  hello  ")).toBe("hello");
  });

  // ---- idempotency (the RPC normalizes a second time in SQL) -------------
  it("is idempotent — normalizing an already-normalized string is a no-op (relied on by match_sbc_hybrid normalizing query_text a second time in SQL)", () => {
    const samples = [
      "الامان في نظام السلامه من الحريق 903.2.11.3",
      "section 903.2.11.3",
      "41-1.4",
      "",
      "hello world",
      sbcNormalizeAr("أحمد إبراهيم آدم على مدرسة"),
    ];
    for (const s of samples) {
      const once = sbcNormalizeAr(s);
      const twice = sbcNormalizeAr(once);
      expect(twice, `input: ${JSON.stringify(s)}`).toBe(once);
    }
  });
});

// ===========================================================================
// 3. reciprocalRankFusion — pure RRF, mirrors match_sbc_hybrid's SQL fusion
// ===========================================================================
describe("reciprocalRankFusion", () => {
  const item = (id: number) => ({ id, label: `doc-${id}` });

  it("documents ranked in BOTH lists outrank documents ranked #1 in only one list, and equal scores tie-break by id ascending", () => {
    const vector = [item(1), item(2), item(3)]; // ranks: 1->1, 2->2, 3->3
    const fts = [item(4), item(3), item(2)]; // ranks: 4->1, 3->2, 2->3
    // 2: vector rank2 (1/62) + fts rank3 (1/63) = 3 in both lists at moderate ranks.
    // 3: vector rank3 (1/63) + fts rank2 (1/62) = same sum as 2 (tie).
    // 1: vector rank1 ONLY (1/61). 4: fts rank1 ONLY (1/61) (tie with 1).
    const fused = reciprocalRankFusion(vector, fts);

    expect(fused.map((f) => f.id)).toEqual([2, 3, 1, 4]);

    const byId = new Map(fused.map((f) => [f.id, f]));
    expect(byId.get(2)!.rrfScore).toBeCloseTo(byId.get(3)!.rrfScore, 12);
    expect(byId.get(1)!.rrfScore).toBeCloseTo(byId.get(4)!.rrfScore, 12);
    expect(byId.get(2)!.rrfScore).toBeGreaterThan(byId.get(1)!.rrfScore);
  });

  it("reports vectorRank/ftsRank as null for the list a document is absent from", () => {
    const fused = reciprocalRankFusion([item(1)], [item(2)]);
    const byId = new Map(fused.map((f) => [f.id, f]));
    expect(byId.get(1)).toMatchObject({ vectorRank: 1, ftsRank: null });
    expect(byId.get(2)).toMatchObject({ vectorRank: null, ftsRank: 1 });
  });

  it("defaults k to 60 (Cormack, Clarke & Buettcher's tuned constant — matches match_sbc_hybrid's rrf_k default)", () => {
    const fused = reciprocalRankFusion([item(1)], []);
    expect(fused[0].rrfScore).toBeCloseTo(1 / 61, 12);
  });

  it("honours a custom k", () => {
    const fused = reciprocalRankFusion([item(1)], [], { k: 1 });
    expect(fused[0].rrfScore).toBeCloseTo(1 / 2, 12);
  });

  it("limit truncates the fused, already-sorted result", () => {
    const vector = [item(1), item(2), item(3), item(4)];
    const fused = reciprocalRankFusion(vector, [], { limit: 2 });
    expect(fused.map((f) => f.id)).toEqual([1, 2]);
  });

  it("empty inputs produce an empty result", () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
  });

  it("carries the original item object through unchanged", () => {
    const fused = reciprocalRankFusion([{ id: 1, label: "hello" }], []);
    expect(fused[0].item).toEqual({ id: 1, label: "hello" });
  });
});

// ===========================================================================
// 4. codeFromFileName + buildHybridContext — row -> {context, files, ...} shape
// ===========================================================================
describe("codeFromFileName (replicated from index.ts:1225)", () => {
  it.each([
    ["SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json", "SBC-201"],
    ["SBC 801 - Fire Code-401-600_extracted_chunks.json", "SBC-801"],
    ["SBC501_CC2024_305-509_chunks.json", "SBC-501"],
    ["SBC401_CR2024_1-100_chunks.json", "SBC-401"],
    ["something_else.json", "UNKNOWN"],
    ["SBC4011_weird.json", "UNKNOWN"], // (?!\d) guard: 401 followed by another digit must not match
    [null, "UNKNOWN"],
    [undefined, "UNKNOWN"],
  ] as const)("%s -> %s", (fileName, expected) => {
    expect(codeFromFileName(fileName)).toBe(expected);
  });

  it("the 201/801 \\b guard (unlike 501/401's (?!\\d) guard) requires a non-word separator — an underscore immediately after the code number does not satisfy \\b, so it falls through to UNKNOWN", () => {
    // Real 201/801 filenames observed in this codebase always carry a space
    // or hyphen right after the code number ("SBC 201 - ...", "SBC 801 -
    // ..."), where \b holds fine (space/hyphen are non-word characters).
    // 501/401 filenames instead put an underscore immediately after the
    // number ("SBC401_CR2024_..."), which is why index.ts uses (?!\d) for
    // those two branches instead of \b: a digit-then-underscore is NOT a \b
    // transition (both are \w), so \b would silently misclassify a real
    // 401/501 filename as UNKNOWN. This test pins that 201/801 do NOT get
    // the same tolerance — an underscore-styled 801 name genuinely falls
    // through today, exactly as in the function this was replicated from.
    expect(codeFromFileName("SBC801_1-200_chunks.json")).toBe("UNKNOWN");
    expect(codeFromFileName("SBC201_1-200_chunks.json")).toBe("UNKNOWN");
  });
});

function row(overrides: Partial<HybridDocRow> = {}): HybridDocRow {
  return {
    id: 1,
    content: "Sample content.",
    metadata: {},
    code_type: "SBC201",
    section_number: "903.2.11.3",
    chapter_number: "9",
    page_start: 100,
    page_end: 102,
    file_name: "SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json",
    similarity: 0.912,
    rrf_score: 0.03123,
    vector_rank: 1,
    fts_rank: 2,
    fts_score: 0.4,
    ...overrides,
  };
}

describe("buildHybridContext", () => {
  it("renders a single row with the vector path's header grammar plus an RRF field", () => {
    const result = buildHybridContext([row()]);
    expect(result.engine).toBe("hybrid");
    expect(result.context).toContain(
      "=== SBC REFERENCE DOCUMENTS (Hybrid Search: Vector + Full-Text, RRF-fused) ===",
    );
    expect(result.context).toContain("Code: SBC-201");
    expect(result.context).toContain("Section: 903.2.11.3");
    expect(result.context).toContain("Pages: 100-102");
    expect(result.context).toContain("Similarity: 0.912");
    expect(result.context).toContain("RRF: 0.03123");
    expect(result.context).toContain("Sample content.");
    expect(result.files).toEqual(["SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json"]);
    expect(result.docIds).toEqual([1]);
  });

  it("renders 'n/a' for a null similarity (FTS-only hit with no embedding), never NaN/undefined", () => {
    const result = buildHybridContext([row({ similarity: null })]);
    expect(result.context).toContain("Similarity: n/a");
    expect(result.context).not.toContain("NaN");
    expect(result.context).not.toContain("undefined");
  });

  it("falls back to 'N/A' for a missing section_number, matching the vector path", () => {
    const result = buildHybridContext([row({ section_number: null })]);
    expect(result.context).toContain("Section: N/A");
  });

  it("dedupes files and docIds, and computes each file's min/max page range across its rows", () => {
    const rows = [
      row({ id: 1, file_name: "A.json", page_start: 10, page_end: 12 }),
      row({ id: 2, file_name: "A.json", page_start: 5, page_end: 8 }),
      row({ id: 3, file_name: "B.json", page_start: 50, page_end: 55 }),
      row({ id: 1, file_name: "A.json", page_start: 10, page_end: 12 }), // duplicate id
    ];
    const result = buildHybridContext(rows);
    expect(result.files).toEqual(["A.json", "B.json"]);
    expect(result.docIds).toEqual([1, 2, 3]);
    expect(result.sourceMeta).toEqual([
      { file: "A.json", pageStart: 5, pageEnd: 12, precision: "page_range" },
      { file: "B.json", pageStart: 50, pageEnd: 55, precision: "page_range" },
    ]);
  });

  it("stops appending once the next entry would exceed contextLimit (break, not skip-and-continue) — matches fetchSBCContextVector's truncation", () => {
    const rows = [row({ id: 1, content: "a".repeat(500) }), row({ id: 2, content: "b".repeat(500) })];
    // Derive the exact boundary from the function itself rather than hand-
    // counting header/entry format lengths, so this stays correct even if
    // the header or per-entry grammar text is edited later.
    const firstEntryOnlyLength = buildHybridContext([rows[0]]).context.length;

    const tight = buildHybridContext(rows, firstEntryOnlyLength);
    expect(tight.context).toContain("a".repeat(500));
    expect(tight.context).not.toContain("b".repeat(500));
    expect(tight.context.length).toBe(firstEntryOnlyLength);

    const full = buildHybridContext(rows, DEFAULT_HYBRID_CONTEXT_LIMIT);
    expect(full.context).toContain("a".repeat(500));
    expect(full.context).toContain("b".repeat(500));
  });

  it("engine is always exactly 'hybrid'", () => {
    expect(buildHybridContext([]).engine).toBe("hybrid");
    expect(buildHybridContext([row()]).engine).toBe("hybrid");
  });

  it("empty rows produce a header-only context with no files/docIds/sourceMeta", () => {
    const result = buildHybridContext([]);
    expect(result.files).toEqual([]);
    expect(result.docIds).toEqual([]);
    expect(result.sourceMeta).toEqual([]);
    expect(result.context).toBe(
      "\n=== SBC REFERENCE DOCUMENTS (Hybrid Search: Vector + Full-Text, RRF-fused) ===\n",
    );
  });
});

// ===========================================================================
// 5. fetchSBCContextHybrid — the one I/O function, driven by a fake client
// ===========================================================================

interface FakeCall {
  fn: string;
  args: Record<string, unknown>;
}

function fakeClient(
  respond: (
    fn: string,
    args: Record<string, unknown>,
  ) => { data: unknown; error: { message: string; code?: string } | null },
): SupabaseRpcLike & { calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(respond(fn, args));
    },
  };
}

describe("fetchSBCContextHybrid — fail-open contract", () => {
  const embedding = [0.1, 0.2, 0.3];

  it.each([
    "Could not find the function public.match_sbc_hybrid(...) in the schema cache",
    "function public.match_sbc_hybrid(text, vector, integer, text[], integer, integer) does not exist",
    "PGRST202: schema cache miss",
  ])("returns null when the RPC is not provisioned yet (SQL not applied): %s", async (message) => {
    const client = fakeClient(() => ({ data: null, error: { message } }));
    const result = await fetchSBCContextHybrid("سؤال عن السلامة", embedding, null, 25, client);
    expect(result).toBeNull();
  });

  it("returns null on a generic/unrelated RPC error too — fails open broadly, not only for the missing-function case", async () => {
    const client = fakeClient(() => ({ data: null, error: { message: "connection timeout" } }));
    const result = await fetchSBCContextHybrid("سؤال", embedding, null, 25, client);
    expect(result).toBeNull();
  });

  it("returns null when the RPC succeeds with zero rows (mirrors fetchSBCContextVector's !primaryMatches?.length fallback trigger)", async () => {
    const client = fakeClient(() => ({ data: [], error: null }));
    const result = await fetchSBCContextHybrid("سؤال", embedding, null, 25, client);
    expect(result).toBeNull();
  });

  it("returns null when client.rpc's promise rejects outright (network exception)", async () => {
    const throwingClient: SupabaseRpcLike = {
      rpc() {
        return Promise.reject(new Error("network exploded"));
      },
    };
    const result = await fetchSBCContextHybrid("سؤال", embedding, null, 25, throwingClient);
    expect(result).toBeNull();
  });
});

describe("fetchSBCContextHybrid — success path", () => {
  const embedding = [0.1, 0.2, 0.3];

  it("normalizes the query before sending it as query_text, and maps rows into a HybridRetrievalResult", async () => {
    const salamaWithMarks = "الس" + "َ" + "ّ" + "لامة"; // السَّلامة
    const client = fakeClient(() => ({
      data: [row({ id: 7, content: "Sprinkler rule." })],
      error: null,
    }));

    const result = await fetchSBCContextHybrid(salamaWithMarks, embedding, null, 25, client);

    expect(result).not.toBeNull();
    expect(result!.engine).toBe("hybrid");
    expect(result!.docIds).toEqual([7]);
    expect(result!.context).toContain("Sprinkler rule.");

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].fn).toBe("match_sbc_hybrid");
    expect(client.calls[0].args.query_text).toBe("السلامه"); // diacritics gone, ة->ه
    expect(client.calls[0].args.query_embedding).toBe(embedding);
    expect(client.calls[0].args.match_count).toBe(25);
    expect(client.calls[0].args.filter_codes).toBeNull();
    // rrf_k / candidate_pool omitted unless explicitly overridden, so the
    // SQL side's own defaults (60 / 40) govern rather than being silently
    // shadowed by a duplicated default here.
    expect(client.calls[0].args).not.toHaveProperty("rrf_k");
    expect(client.calls[0].args).not.toHaveProperty("candidate_pool");
  });

  it("passes filter_codes through as a plural array, and collapses an empty array to null (an accidental [] must not silently mean 'match nothing')", async () => {
    const client = fakeClient(() => ({ data: [row()], error: null }));

    await fetchSBCContextHybrid("q", embedding, ["SBC201", "SBC801"], 10, client);
    expect(client.calls[0].args.filter_codes).toEqual(["SBC201", "SBC801"]);

    await fetchSBCContextHybrid("q", embedding, [], 10, client);
    expect(client.calls[1].args.filter_codes).toBeNull();
  });

  it("passes rrfK/candidatePool through only when explicitly set in opts", async () => {
    const client = fakeClient(() => ({ data: [row()], error: null }));
    await fetchSBCContextHybrid("q", embedding, null, 10, client, { rrfK: 30, candidatePool: 20 });
    expect(client.calls[0].args.rrf_k).toBe(30);
    expect(client.calls[0].args.candidate_pool).toBe(20);
  });

  it("passes contextLimit through to buildHybridContext", async () => {
    const bigRows = [row({ id: 1, content: "a".repeat(500) }), row({ id: 2, content: "b".repeat(500) })];
    const client = fakeClient(() => ({ data: bigRows, error: null }));

    const unbounded = await fetchSBCContextHybrid("q", embedding, null, 10, client);
    expect(unbounded!.context).toContain("b".repeat(500));

    const firstOnlyLength = buildHybridContext([bigRows[0]]).context.length;
    const bounded = await fetchSBCContextHybrid("q", embedding, null, 10, client, {
      contextLimit: firstOnlyLength,
    });
    expect(bounded!.context).not.toContain("b".repeat(500));
  });
});
