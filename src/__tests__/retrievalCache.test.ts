/**
 * Tests for the fire-safety-chat embedding + retrieval-result cache (D1).
 *
 * Subject: supabase/functions/fire-safety-chat/retrievalCache.ts — no
 * concrete Deno or supabase-js imports, imported and executed directly here,
 * the same pattern retrievalPolicy.test.ts and graphExpansion.test.ts use for
 * their subjects. The one addition this module has over those two pure
 * modules is real I/O (Postgres reads/writes via a client parameter), so the
 * fake client below stands in for docs/db/20260903_retrieval_cache.sql's
 * `retrieval_cache` / `runtime_settings` tables — a plain in-memory Map per
 * table, filtered the same way `.eq(...).eq(...).maybeSingle()` filters a
 * real query, with `JSON.parse(JSON.stringify(...))` on write to mimic
 * jsonb's actual inability to store `undefined`/`NaN`/`Infinity` (catches a
 * real class of bug: a payload field that silently vanishes/nulls on a real
 * round trip should also vanish/null here).
 *
 * ---------------------------------------------------------------------------
 * ON THE SHARED corpus_version MEMO ACROSS TESTS IN THIS FILE
 * ---------------------------------------------------------------------------
 * getCorpusVersion's 5-minute memoization is a MODULE-LEVEL singleton by
 * design (one isolate, one warm cache) — it is not reset between tests in
 * this file. Every test below that seeds a "current" corpus_version seeds it
 * as '1' (matching docs/db/20260903_retrieval_cache.sql's default seed), so
 * whichever test populates the memo first, every later test still observes
 * the same correct value whether it hits the live memo or forces a fresh
 * read. Only the "corpus_version" describe block varies the current value
 * (to prove memoization/expiry itself, using vi.useFakeTimers with a
 * near-epoch anchor so the memo it leaves behind reads as long-expired once
 * real timers resume) and it runs first, before anything else has touched
 * getCorpusVersion. Cache-hit tests below use a unique text/keyParts tag per
 * test so the IN-MEMORY layer (also a shared module singleton) can never
 * short-circuit a test into vacuously passing without exercising the DB path
 * it claims to test.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CORPUS_VERSION_CACHE_TTL_MS,
  RETRIEVAL_CACHE_FLAG_ENV,
  RETRIEVAL_CACHE_TABLE,
  RUNTIME_SETTINGS_TABLE,
  cacheKey,
  getCorpusVersion,
  getEmbeddingCached,
  getRetrievalCached,
  normalizeForKey,
  retrievalCacheEnabled,
  type RetrievalCacheClient,
} from "../../supabase/functions/fire-safety-chat/retrievalCache.ts";

// ---------------------------------------------------------------------------
// Fake client — see the file doc comment above.
// ---------------------------------------------------------------------------

type FakeRow = Record<string, unknown>;

interface FakeClientOptions {
  throwOnSelect?: boolean;
  throwOnUpsert?: boolean;
}

function createFakeClient(options: FakeClientOptions = {}) {
  const tables = new Map<string, Map<string, FakeRow>>();
  const tableFor = (name: string): Map<string, FakeRow> => {
    let t = tables.get(name);
    if (!t) {
      t = new Map();
      tables.set(name, t);
    }
    return t;
  };

  /** Seed a row directly, bypassing the cache functions — for DB-hit /
   *  expiry / corpus_version-mismatch tests that must prove the DB path ran
   *  without ever calling compute(). Keyed by the row's own "key" field,
   *  same primary key column both real tables use. */
  const seed = (table: string, row: FakeRow): void => {
    tableFor(table).set(String(row.key), JSON.parse(JSON.stringify(row)));
  };

  const client: RetrievalCacheClient = {
    from(tableName: string) {
      const rows = tableFor(tableName);
      return {
        select(_columns: string) {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            async maybeSingle() {
              if (options.throwOnSelect) throw new Error("simulated select failure");
              const match = [...rows.values()].find((row) =>
                filters.every(([col, val]) => row[col] === val),
              );
              return { data: match ? (JSON.parse(JSON.stringify(match)) as FakeRow) : null, error: null };
            },
          };
          return builder;
        },
        async upsert(row: FakeRow) {
          if (options.throwOnUpsert) throw new Error("simulated upsert failure");
          rows.set(String(row.key), JSON.parse(JSON.stringify(row)));
          return { error: null };
        },
      };
    },
  };

  return { client, seed };
}

const future = (ms = 60_000) => new Date(Date.now() + ms).toISOString();
const past = (ms = 60_000) => new Date(Date.now() - ms).toISOString();
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

// ---------------------------------------------------------------------------
// normalizeForKey
// ---------------------------------------------------------------------------

describe("normalizeForKey", () => {
  it("trims and collapses internal whitespace runs (spaces, tabs, newlines) to one space", () => {
    expect(normalizeForKey("  Sprinkler   SBC-801  \n\t")).toBe("sprinkler sbc-801");
  });

  it("unifies all four alef forms to bare alef", () => {
    expect(normalizeForKey("آمن")).toBe(normalizeForKey("امن")); // madda
    expect(normalizeForKey("أين")).toBe(normalizeForKey("اين")); // hamza above
    expect(normalizeForKey("إخلاء")).toBe(normalizeForKey("اخلاء")); // hamza below
    expect(normalizeForKey("ٱلرشاشات")).toBe(normalizeForKey("الرشاشات")); // wasla
  });

  it("strips harakat, shadda, sukun, dagger alef, and tatweel", () => {
    expect(normalizeForKey("الرشّاشات")).toBe(normalizeForKey("الرشاشات")); // shadda
    expect(normalizeForKey("السُّلَّم")).toBe("السلم"); // damma+shadda, fatha+shadda
    expect(normalizeForKey("كشّـاف")).toBe(normalizeForKey("كشاف")); // shadda + tatweel
  });

  it("lowercases Latin letters but leaves Arabic script and digits unaffected", () => {
    expect(normalizeForKey("Section 903.2.11.4")).toBe("section 903.2.11.4");
    expect(normalizeForKey("SBC201")).toBe("sbc201");
    expect(normalizeForKey("٢٠٢٤")).toBe("٢٠٢٤"); // Arabic-Indic digits untouched
  });

  it("treats a diacritics+spacing variant and a plain variant of the same question as equivalent", () => {
    const withMarks = normalizeForKey("متطلبات   الرشّاشات في المبنى");
    const plain = normalizeForKey("متطلبات الرشاشات في المبنى");
    expect(withMarks).toBe(plain);
  });

  it("treats different alef-form spellings of the same question as equivalent", () => {
    const withHamza = normalizeForKey("أين تقع المخارج");
    const bareAlef = normalizeForKey("اين تقع المخارج");
    expect(withHamza).toBe(bareAlef);
  });

  it("handles null/undefined input as empty string rather than throwing", () => {
    expect(normalizeForKey(undefined as unknown as string)).toBe("");
    expect(normalizeForKey(null as unknown as string)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// cacheKey
// ---------------------------------------------------------------------------

describe("cacheKey", () => {
  it("returns a deterministic 64-character lowercase hex sha256 digest", async () => {
    const a = await cacheKey(["embedding", "gemini-embedding-001", "sprinkler requirements"]);
    const b = await cacheKey(["embedding", "gemini-embedding-001", "sprinkler requirements"]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not collide when concatenation would (separator prevents ['ab','c'] == ['a','bc'])", async () => {
    const first = await cacheKey(["ab", "c"]);
    const second = await cacheKey(["a", "bc"]);
    expect(first).not.toBe(second);
  });

  it("produces a different key for a different SBC code list (non-equivalence)", async () => {
    const embKey = await cacheKey(["embedding", "m1", "normalized query"]);
    const a = await cacheKey(["retrieval", embKey, "SBC201", "standard", "1", "1"]);
    const b = await cacheKey(["retrieval", embKey, "SBC201,SBC801", "standard", "1", "1"]);
    expect(a).not.toBe(b);
  });

  it("produces a different key for a different mode (non-equivalence)", async () => {
    const embKey = await cacheKey(["embedding", "m1", "normalized query"]);
    const standard = await cacheKey(["retrieval", embKey, "SBC201", "standard", "1", "1"]);
    const analysis = await cacheKey(["retrieval", embKey, "SBC201", "analysis", "1", "1"]);
    expect(standard).not.toBe(analysis);
  });

  it("produces a different key for a different flags-version (non-equivalence)", async () => {
    const embKey = await cacheKey(["embedding", "m1", "normalized query"]);
    const v1 = await cacheKey(["retrieval", embKey, "SBC201", "standard", "1", "1"]);
    const v2 = await cacheKey(["retrieval", embKey, "SBC201", "standard", "2", "1"]);
    expect(v1).not.toBe(v2);
  });

  it("sorted-code order is the caller's job: unsorted vs sorted code lists are different keys", async () => {
    // getRetrievalCached does not sort keyParts itself (see the module doc
    // comment) — this documents that the CALLER must pre-sort, by showing
    // the raw hash does not do it for them.
    const embKey = await cacheKey(["embedding", "m1", "normalized query"]);
    const unsorted = await cacheKey(["retrieval", embKey, "SBC801,SBC201", "standard", "1", "1"]);
    const sorted = await cacheKey(["retrieval", embKey, "SBC201,SBC801", "standard", "1", "1"]);
    expect(unsorted).not.toBe(sorted);
  });
});

// ---------------------------------------------------------------------------
// retrievalCacheEnabled
// ---------------------------------------------------------------------------

describe("retrievalCacheEnabled", () => {
  it("is false under vitest, where globalThis.Deno does not exist", () => {
    expect(typeof (globalThis as { Deno?: unknown }).Deno).toBe("undefined");
    expect(retrievalCacheEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCorpusVersion — runs first among client-touching tests; see the file
// doc comment for why test order matters here specifically.
// ---------------------------------------------------------------------------

describe("getCorpusVersion", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("memoizes a successful read for 5 minutes, then re-reads once the memo expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0); // near-epoch anchor: guaranteed far in the past relative to
                          // any real wall clock, so the memo this test leaves behind
                          // reads as expired once real timers resume (see file doc
                          // comment).

    const client1 = createFakeClient();
    client1.seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" });
    expect(await getCorpusVersion(client1.client)).toBe(1);

    // Swap to a client that would throw if actually queried, and that holds
    // a DIFFERENT value. Still within the 5-minute TTL: must see the
    // memoized 1, not throw and not see 2.
    const client2 = createFakeClient({ throwOnSelect: true });
    client2.seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "2" });
    vi.setSystemTime(CORPUS_VERSION_CACHE_TTL_MS - 1_000);
    expect(await getCorpusVersion(client2.client)).toBe(1);

    // Past the TTL: must re-read, and since client2 throws, must fail open to 1
    // (proves expiry triggered a real attempt, not just a stale return).
    vi.setSystemTime(CORPUS_VERSION_CACHE_TTL_MS + 1_000);
    expect(await getCorpusVersion(client2.client)).toBe(1);

    // One more, non-throwing client past the TTL: proves the re-read genuinely
    // reaches the DB rather than being stuck on any earlier value.
    const client3 = createFakeClient();
    client3.seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "3" });
    vi.setSystemTime(2 * CORPUS_VERSION_CACHE_TTL_MS);
    expect(await getCorpusVersion(client3.client)).toBe(3);
  });

  it("falls back to 1 when no runtime_settings row exists", async () => {
    const { client } = createFakeClient();
    expect(await getCorpusVersion(client)).toBe(1);
  });

  it("fails open to 1 when the client throws", async () => {
    const { client, seed } = createFakeClient({ throwOnSelect: true });
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "9" });
    expect(await getCorpusVersion(client)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getEmbeddingCached
// ---------------------------------------------------------------------------

describe("getEmbeddingCached", () => {
  const MODEL = "gemini-embedding-001";

  it("computes on miss, then hits memory on the next call without recomputing (roundtrip)", async () => {
    const { client, seed } = createFakeClient();
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" });
    const text = "__embed_memory_roundtrip__ ما هي متطلبات الرشاشات";
    const vector = [0.125, -0.5, 0, 1, 0.333333];
    const compute = vi.fn(async () => vector);

    const first = await getEmbeddingCached(client, text, MODEL, compute);
    expect(first).toEqual(vector);
    expect(compute).toHaveBeenCalledTimes(1);

    const second = await getEmbeddingCached(client, text, MODEL, compute);
    expect(second).toEqual(vector);
    expect(compute).toHaveBeenCalledTimes(1); // memory hit, not recomputed
  });

  it("finds a pre-seeded DB row without calling compute (DB hit hydrates memory)", async () => {
    const { client, seed } = createFakeClient();
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" });
    const text = "__embed_db_hit__ متطلبات مقاومة الحريق للدرج";
    const stored = [0.7, 0.2, -0.9];
    const key = await cacheKey(["embedding", MODEL, normalizeForKey(text)]);
    seed(RETRIEVAL_CACHE_TABLE, {
      key,
      kind: "embedding",
      payload: stored,
      corpus_version: 1,
      expires_at: future(),
    });
    const compute = vi.fn(async () => [9, 9, 9]);

    const result = await getEmbeddingCached(client, text, MODEL, compute);
    expect(result).toEqual(stored);
    expect(compute).not.toHaveBeenCalled();
  });

  it("treats an expired DB row as a miss and recomputes", async () => {
    const { client, seed } = createFakeClient();
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" });
    const text = "__embed_expired__ اشتراطات مخارج الطوارئ";
    const key = await cacheKey(["embedding", MODEL, normalizeForKey(text)]);
    seed(RETRIEVAL_CACHE_TABLE, {
      key,
      kind: "embedding",
      payload: [1, 1, 1],
      corpus_version: 1,
      expires_at: past(),
    });
    const fresh = [2, 2, 2];
    const compute = vi.fn(async () => fresh);

    const result = await getEmbeddingCached(client, text, MODEL, compute);
    expect(result).toEqual(fresh);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("treats a corpus_version mismatch as a miss and recomputes", async () => {
    const { client, seed } = createFakeClient();
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" }); // current = 1
    const text = "__embed_version_mismatch__ متطلبات التهوية الميكانيكية";
    const key = await cacheKey(["embedding", MODEL, normalizeForKey(text)]);
    seed(RETRIEVAL_CACHE_TABLE, {
      key,
      kind: "embedding",
      payload: [5, 5, 5],
      corpus_version: 2, // stale row from a different corpus epoch
      expires_at: future(),
    });
    const fresh = [6, 6, 6];
    const compute = vi.fn(async () => fresh);

    const result = await getEmbeddingCached(client, text, MODEL, compute);
    expect(result).toEqual(fresh);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("fails open (computes anyway) when the DB read AND the fire-and-forget write both throw", async () => {
    const { client } = createFakeClient({ throwOnSelect: true, throwOnUpsert: true });
    const text = "__embed_fail_open__ متطلبات أنظمة إنذار الحريق";
    const value = [3, 1, 4];
    const compute = vi.fn(async () => value);

    const result = await getEmbeddingCached(client, text, MODEL, compute);
    expect(result).toEqual(value);
    expect(compute).toHaveBeenCalledTimes(1);
    await flushMicrotasks(); // let the fire-and-forget write's catch run

    // Memory layer still shields a second call from the permanently-broken DB.
    const again = await getEmbeddingCached(client, text, MODEL, compute);
    expect(again).toEqual(value);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("DB round trip preserves float values exactly (embedding roundtrip through JSON)", async () => {
    const { client, seed } = createFakeClient();
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" });
    const text = "__embed_json_roundtrip__ عزل الأنابيب في الطابق السفلي";
    const stored = [0.123456789, -0.987654321, 0, 1, -1, 0.5];
    const key = await cacheKey(["embedding", MODEL, normalizeForKey(text)]);
    seed(RETRIEVAL_CACHE_TABLE, {
      key,
      kind: "embedding",
      payload: stored,
      corpus_version: 1,
      expires_at: future(),
    });
    const compute = vi.fn(async () => {
      throw new Error("must not be called — DB hit expected");
    });

    const result = await getEmbeddingCached(client, text, MODEL, compute);
    expect(result).toEqual(stored);
  });
});

// ---------------------------------------------------------------------------
// getRetrievalCached
// ---------------------------------------------------------------------------

type FakeRetrievalResult = {
  context: string;
  files: string[];
  docIds: number[];
  engine: "vector" | "keyword";
  graphExpansionCount: number | null;
  fallbackReason: string | null;
};

const sampleResult = (tag: string): FakeRetrievalResult => ({
  context: `context for ${tag}`,
  files: [`${tag}.json`],
  docIds: [1, 2, 3],
  engine: "vector",
  graphExpansionCount: null,
  fallbackReason: null,
});

describe("getRetrievalCached", () => {
  const TTL_SECONDS = 300;

  it("computes on miss, then hits memory on the next call without recomputing", async () => {
    const { client, seed } = createFakeClient();
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" });
    const keyParts = ["embKeyA", "SBC201", "standard", "1", "1"];
    const value = sampleResult("memory-roundtrip");
    const compute = vi.fn(async () => value);

    const first = await getRetrievalCached(client, keyParts, TTL_SECONDS, compute);
    expect(first).toEqual(value);
    expect(compute).toHaveBeenCalledTimes(1);

    const second = await getRetrievalCached(client, keyParts, TTL_SECONDS, compute);
    expect(second).toEqual(value);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("finds a pre-seeded DB row without calling compute (DB hit hydrates memory)", async () => {
    const { client, seed } = createFakeClient();
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" });
    const keyParts = ["embKeyB", "SBC201,SBC801", "analysis", "1", "1"];
    const stored = sampleResult("db-hit");
    const key = await cacheKey(["retrieval", ...keyParts]);
    seed(RETRIEVAL_CACHE_TABLE, {
      key,
      kind: "retrieval",
      payload: stored,
      corpus_version: 1,
      expires_at: future(),
    });
    const compute = vi.fn(async () => sampleResult("should-not-be-used"));

    const result = await getRetrievalCached(client, keyParts, TTL_SECONDS, compute);
    expect(result).toEqual(stored);
    expect(compute).not.toHaveBeenCalled();
  });

  it("treats an expired DB row as a miss and recomputes", async () => {
    const { client, seed } = createFakeClient();
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" });
    const keyParts = ["embKeyC", "SBC501", "standard", "1", "1"];
    const key = await cacheKey(["retrieval", ...keyParts]);
    seed(RETRIEVAL_CACHE_TABLE, {
      key,
      kind: "retrieval",
      payload: sampleResult("stale"),
      corpus_version: 1,
      expires_at: past(),
    });
    const fresh = sampleResult("fresh-after-expiry");
    const compute = vi.fn(async () => fresh);

    const result = await getRetrievalCached(client, keyParts, TTL_SECONDS, compute);
    expect(result).toEqual(fresh);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("treats a corpus_version mismatch as a miss and recomputes", async () => {
    const { client, seed } = createFakeClient();
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" }); // current = 1
    const keyParts = ["embKeyD", "SBC401", "standard", "1", "1"];
    const key = await cacheKey(["retrieval", ...keyParts]);
    seed(RETRIEVAL_CACHE_TABLE, {
      key,
      kind: "retrieval",
      payload: sampleResult("from-old-corpus"),
      corpus_version: 7, // stale epoch
      expires_at: future(),
    });
    const fresh = sampleResult("fresh-after-reingest");
    const compute = vi.fn(async () => fresh);

    const result = await getRetrievalCached(client, keyParts, TTL_SECONDS, compute);
    expect(result).toEqual(fresh);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("fails open (computes anyway) when the client throws on read and on write", async () => {
    const { client } = createFakeClient({ throwOnSelect: true, throwOnUpsert: true });
    const keyParts = ["embKeyE", "SBC201", "standard", "1", "1"];
    const value = sampleResult("fail-open");
    const compute = vi.fn(async () => value);

    const result = await getRetrievalCached(client, keyParts, TTL_SECONDS, compute);
    expect(result).toEqual(value);
    expect(compute).toHaveBeenCalledTimes(1);
    await flushMicrotasks();

    const again = await getRetrievalCached(client, keyParts, TTL_SECONDS, compute);
    expect(again).toEqual(value);
    expect(compute).toHaveBeenCalledTimes(1); // memory still shields a 2nd call
  });

  it("different keyParts (codes, mode, flags-version) are independent cache entries", async () => {
    const { client, seed } = createFakeClient();
    seed(RUNTIME_SETTINGS_TABLE, { key: "corpus_version", value: "1" });
    const base = ["embKeyF", "SBC201", "standard", "1", "1"];
    const differentCodes = ["embKeyF", "SBC201,SBC801", "standard", "1", "1"];
    const differentMode = ["embKeyF", "SBC201", "analysis", "1", "1"];
    const differentFlags = ["embKeyF", "SBC201", "standard", "2", "1"];

    const computeBase = vi.fn(async () => sampleResult("base"));
    const computeCodes = vi.fn(async () => sampleResult("codes"));
    const computeMode = vi.fn(async () => sampleResult("mode"));
    const computeFlags = vi.fn(async () => sampleResult("flags"));

    const rBase = await getRetrievalCached(client, base, TTL_SECONDS, computeBase);
    const rCodes = await getRetrievalCached(client, differentCodes, TTL_SECONDS, computeCodes);
    const rMode = await getRetrievalCached(client, differentMode, TTL_SECONDS, computeMode);
    const rFlags = await getRetrievalCached(client, differentFlags, TTL_SECONDS, computeFlags);

    expect(computeBase).toHaveBeenCalledTimes(1);
    expect(computeCodes).toHaveBeenCalledTimes(1);
    expect(computeMode).toHaveBeenCalledTimes(1);
    expect(computeFlags).toHaveBeenCalledTimes(1);
    expect(rBase).toEqual(sampleResult("base"));
    expect(rCodes).toEqual(sampleResult("codes"));
    expect(rMode).toEqual(sampleResult("mode"));
    expect(rFlags).toEqual(sampleResult("flags"));
  });
});
