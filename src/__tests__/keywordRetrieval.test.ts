/**
 * D3 — in-database keyword retrieval (2026-09-03).
 *
 * The storage keyword path lists a bucket, downloads up to 12 chunk-JSON
 * files and scores every chunk in the isolate: 0.6-3.8s measured on
 * production, and it is the path most heavy-mode requests actually take.
 * One indexed query over sbc_documents.tsv answers the same question in 33ms
 * (measured against the live corpus). These tests pin the two properties that
 * make the swap safe: the rendered context is indistinguishable from the
 * storage path's, and every failure mode falls back to it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildKeywordContext,
  fetchSBCContextKeywordFts,
  isKeywordFtsEnabled,
  KEYWORD_FTS_FLAG_ENV,
  usableTerms,
  type KeywordDocRow,
} from "../../supabase/functions/fire-safety-chat/keywordRetrieval.ts";

const envOf = (map: Record<string, string>) => (k: string) => map[k];

function row(over: Partial<KeywordDocRow> = {}): KeywordDocRow {
  return {
    id: 1,
    content: "Travel distance shall not exceed 60 m.",
    code_type: "SBC201",
    section_number: "1017.2",
    page_start: 100,
    page_end: 101,
    file_name: "SBC 201 - chunks.json",
    score: 1.5,
    ...over,
  };
}

function fakeClient(respond: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(respond(fn, args));
    },
  };
}

describe("isKeywordFtsEnabled", () => {
  it('is exact-"1", default off', () => {
    expect(isKeywordFtsEnabled(envOf({}))).toBe(false);
    expect(isKeywordFtsEnabled(envOf({ [KEYWORD_FTS_FLAG_ENV]: "1" }))).toBe(true);
    for (const off of ["", "0", "true", "yes", " 1"]) {
      expect(isKeywordFtsEnabled(envOf({ [KEYWORD_FTS_FLAG_ENV]: off }))).toBe(false);
    }
  });
});

describe("usableTerms", () => {
  it("drops blanks, single characters and punctuation-only terms, and de-duplicates case-insensitively", () => {
    expect(usableTerms(["travel distance", "", null, "a", "  ", "-", "1017.2", "Travel Distance", undefined]))
      .toEqual(["travel distance", "1017.2"]);
  });

  it("keeps Arabic terms — the SQL side decides what matches, not this filter", () => {
    expect(usableTerms(["مرشات", "sprinkler"])).toEqual(["مرشات", "sprinkler"]);
  });
});

describe("buildKeywordContext — indistinguishable from the storage path's output", () => {
  it("groups by source with the same header, counts and separator", () => {
    const out = buildKeywordContext([
      row({ id: 1, file_name: "A.json", content: "first" }),
      row({ id: 2, file_name: "A.json", content: "second" }),
      row({ id: 3, file_name: "B.json", content: "third" }),
    ]);
    expect(out.context).toContain("📚 SBC REFERENCE DOCUMENTS (MOST RELEVANT SECTIONS SELECTED):");
    expect(out.context).toContain("=== A.json (2 relevant sections) ===\nfirst\n---\nsecond");
    expect(out.context).toContain("=== B.json (1 relevant sections) ===\nthird");
    expect(out.files).toEqual(["A.json", "B.json"]);
    expect(out.docIds).toEqual([1, 2, 3]);
  });

  it("derives one page range per file, min start to max end", () => {
    const out = buildKeywordContext([
      row({ id: 1, file_name: "A.json", page_start: 50, page_end: 60 }),
      row({ id: 2, file_name: "A.json", page_start: 20, page_end: 30 }),
      row({ id: 3, file_name: "B.json", page_start: null, page_end: null }),
    ]);
    expect(out.sourceMeta).toEqual([
      { file: "A.json", pageStart: 20, pageEnd: 60, precision: "page_range" },
      { file: "B.json", pageStart: null, pageEnd: null, precision: "chunk_range_only" },
    ]);
  });

  it("stops before the budget is exceeded rather than truncating a chunk", () => {
    const big = "x".repeat(400);
    const out = buildKeywordContext([row({ id: 1, content: big }), row({ id: 2, content: big })], 500);
    expect(out.docIds).toEqual([1]);
    expect(out.context).not.toContain("x".repeat(800));
  });

  it("returns an empty context when nothing survived, so the caller can decline", () => {
    expect(buildKeywordContext([]).context).toBe("");
    expect(buildKeywordContext([row({ content: "" })]).files).toEqual([]);
  });
});

describe("fetchSBCContextKeywordFts — the RPC call and the fail-open contract", () => {
  it("sends cleaned terms, the row cap and a null code filter under the SQL names", async () => {
    const client = fakeClient(() => ({ data: [row()], error: null }));
    await fetchSBCContextKeywordFts(["travel distance", "a", "1017.2"], null, 40, client);
    expect(client.calls[0].fn).toBe("match_sbc_keywords");
    expect(client.calls[0].args).toEqual({
      terms: ["travel distance", "1017.2"],
      match_count: 40,
      filter_codes: null,
    });
  });

  it("passes a code filter through, and turns an empty array into null", async () => {
    const client = fakeClient(() => ({ data: [row()], error: null }));
    await fetchSBCContextKeywordFts(["sprinkler"], ["SBC801"], 25, client);
    expect(client.calls[0].args.filter_codes).toEqual(["SBC801"]);
    await fetchSBCContextKeywordFts(["sprinkler"], [], 25, client);
    expect(client.calls[1].args.filter_codes).toBeNull();
  });

  it("returns null — never throws — for no usable terms, an RPC error, a missing function, or zero rows", async () => {
    const noCall = fakeClient(() => ({ data: [], error: null }));
    await expect(fetchSBCContextKeywordFts(["a", ""], null, 40, noCall)).resolves.toBeNull();
    expect(noCall.calls).toHaveLength(0); // never even asked

    const missing = fakeClient(() => ({ data: null, error: { message: "Could not find the function public.match_sbc_keywords in the schema cache" } }));
    await expect(fetchSBCContextKeywordFts(["sprinkler"], null, 40, missing)).resolves.toBeNull();

    const broken = fakeClient(() => ({ data: null, error: { message: "permission denied" } }));
    await expect(fetchSBCContextKeywordFts(["sprinkler"], null, 40, broken)).resolves.toBeNull();

    const empty = fakeClient(() => ({ data: [], error: null }));
    await expect(fetchSBCContextKeywordFts(["sprinkler"], null, 40, empty)).resolves.toBeNull();

    const thrower = { rpc: () => { throw new Error("socket closed"); } };
    await expect(fetchSBCContextKeywordFts(["sprinkler"], null, 40, thrower)).resolves.toBeNull();
  });

  it("returns a rendered result when rows come back", async () => {
    const client = fakeClient(() => ({ data: [row({ id: 7 })], error: null }));
    const out = await fetchSBCContextKeywordFts(["sprinkler"], null, 40, client);
    expect(out?.docIds).toEqual([7]);
    expect(out?.files).toEqual(["SBC 201 - chunks.json"]);
  });
});

describe("index.ts wiring", () => {
  const INDEX_SRC = readFileSync(
    path.resolve(__dirname, "../../supabase/functions/fire-safety-chat/index.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("sits behind the flag, before the downloads, and returns without touching storage on success", () => {
    const guardAt = INDEX_SRC.indexOf("if (isKeywordFtsEnabled(Deno.env.get)) {");
    const downloadAt = INDEX_SRC.indexOf("const downloadPromises = selectedFiles.map(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(downloadAt).toBeGreaterThan(guardAt);
    // Exactly one call site, and it is inside the guard.
    expect(INDEX_SRC.split("fetchSBCContextKeywordFts(").length - 1).toBe(1);
    const block = INDEX_SRC.slice(guardAt, downloadAt);
    expect(block).toContain("await fetchSBCContextKeywordFts(");
    expect(block).toContain("return result;");
    // No storage API call in the block — the comments mention the storage
    // path, so this asserts on the calls, not on the word.
    expect(block).not.toMatch(/\.storage\s*\n?\s*\.from\(|\.storage\.from\(|\.download\(/);
  });

  it("caches its result in the same query cache the storage path uses", () => {
    const guardAt = INDEX_SRC.indexOf("if (isKeywordFtsEnabled(Deno.env.get)) {");
    const block = INDEX_SRC.slice(guardAt, INDEX_SRC.indexOf("const downloadPromises", guardAt));
    expect(block).toContain("queryCache.set(cacheKey, { result, timestamp: Date.now() });");
    expect(block).toContain("cleanupQueryCache();");
  });
});
