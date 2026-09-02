/**
 * D1 — embedding + retrieval-result caches for fire-safety-chat.
 *
 * Pure logic + a tiny structural DB-client contract (no concrete Deno or
 * supabase-js imports) so this module can be unit-tested from src/__tests__
 * with an in-memory fake client — the same "no Deno APIs at import time"
 * pattern as ./retrievalPolicy.ts and ./graphExpansion.ts. The one place this
 * module differs from those two: it DOES perform I/O (Postgres reads/writes),
 * so instead of taking no dependencies at all it takes a duck-typed
 * `RetrievalCacheClient` — real enough to be satisfied by the actual
 * `createClient(...)` admin client index.ts already builds, narrow enough for
 * a test to fake in a few lines.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CACHES, AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------
 * Two independent caches, both two-layer (in-memory LRU+TTL first, Postgres
 * second so a cold isolate still gets a warm cache):
 *
 *   (a) EMBEDDING cache — keyed on (normalized query text, embedding model
 *       id). Value: the raw embedding float array. Saves a Gemini embedding
 *       call for a repeated/near-repeated question.
 *   (b) RETRIEVAL-RESULT cache — keyed on (embedding-key, sorted SBC codes,
 *       mode, flags-version, corpus_version). Value: the retrieval result
 *       object fetchSBCContextVector already returns — {context, files,
 *       sourceMeta, docIds, engine, graphExpansionCount, fallbackReason} —
 *       stored as JSON. Saves the embedding-model round trip AND the
 *       match_sbc_documents RPC(s) AND graph expansion for a repeated query
 *       under the same corpus/flags.
 *
 * OUT OF SCOPE, ON PURPOSE: caching the final MODEL ANSWER. An answer can
 * embed per-user context (user_memory, conversation history, attached
 * images) that the retrieval layer never sees, so a cached answer served to
 * a different user/conversation would leak or misattribute that context.
 * Nothing in this module stores, keys on, or returns an answer — it only
 * ever caches (1) a deterministic function of query text and (2) a
 * deterministic function of query text + corpus state. Do not extend this
 * module to cache answers without re-deriving that argument from scratch.
 *
 * ---------------------------------------------------------------------------
 * PRIVACY ARGUMENT
 * ---------------------------------------------------------------------------
 * Cache keys are sha256 hashes of: normalized question text, embedding model
 * id, SBC code list, mode, a flags-version tag, and corpus_version. NONE of
 * these is a user id, session id, or account identifier — the corpus being
 * retrieved from (sbc_documents) is public building-code text, identical for
 * every account. Two different users asking the same normalized question
 * legitimately get the same cache entry, by design: that is not a leak, it
 * is the entire point (a shared cache only pays off when hits cross
 * sessions). The `retrieval_cache` table this module reads/writes carries no
 * per-user column at all (see docs/db/20260903_retrieval_cache.sql) — there
 * is no user_id to leak even if a key were somehow reversed. Contrast this
 * with user_memory (docs/db/20260901_user_memory.sql), which IS per-user and
 * RLS-scoped to auth.uid() — deliberately a different table, different
 * table, because it holds a different kind of fact.
 *
 * ---------------------------------------------------------------------------
 * KEY RECIPES (must match exactly wherever a caller builds a key by hand)
 * ---------------------------------------------------------------------------
 *   embedding key  = cacheKey(["embedding", modelId, normalizeForKey(text)])
 *                    — this is exactly what getEmbeddingCached computes
 *                    internally; a caller that needs the same string (to
 *                    feed it into a retrieval key, see below) must reproduce
 *                    this call verbatim rather than inventing a shortcut.
 *   retrieval key  = cacheKey(["retrieval", ...keyParts]) where the caller
 *                    is expected to build keyParts as:
 *                    [embeddingKey, sortedCodes.join(","), mode,
 *                     flagsVersion, String(corpusVersion)]
 *                    — "sortedCodes" means whatever SBC code filter(s) this
 *                    retrieval used, sorted so key order never matters
 *                    (["SBC801","SBC201"] and ["SBC201","SBC801"] must
 *                    collide). getRetrievalCached does not interpret
 *                    keyParts at all; it only joins-then-hashes them, so the
 *                    caller owns getting this list right — see
 *                    docs/launch/retrieval-cache-notes.md for the full
 *                    wiring recipe.
 *
 * Normalization (normalizeForKey) is exactly five steps, in this order: (1)
 * unify alef forms (أ/إ/آ/ٱ -> ا), (2) strip Arabic diacritics/tatweel
 * (harakat, shadda, sukun, dagger alef, kashida), (3) lowercase — a no-op on
 * Arabic script and on digits, so this step only ever affects Latin letters,
 * (4) collapse any whitespace run to one space, (5) trim. Nothing here
 * touches Arabic-Indic vs ASCII digits, alef maksura, or teh marbuta — those
 * are different normalization questions this task did not ask for, and
 * adding them silently would change which questions collide without a
 * measurement backing the choice (the same discipline retrievalPolicy.ts
 * applies to its similarity floor).
 *
 * ---------------------------------------------------------------------------
 * corpus_version IS A GLOBAL CACHE EPOCH, NOT JUST A RETRIEVAL-KEY FIELD
 * ---------------------------------------------------------------------------
 * Every row this module writes — embedding or retrieval — carries the
 * corpus_version that was current at write time, and every DB hit re-checks
 * it against the CURRENT value from runtime_settings before trusting the
 * row, even though corpus_version is already folded into the retrieval key's
 * hash (so a version bump already produces a different retrieval key on its
 * own). The explicit re-check is redundant for the hash-key path by
 * construction, but it is NOT redundant for the embedding cache (an
 * embedding's key never includes corpus_version, since a text+model
 * embedding is independent of what is in the corpus) and it is what gives
 * the owner a single, uniform "invalidate everything" lever: one UPDATE on
 * runtime_settings.corpus_version and every row in the table — embeddings
 * included — stops being trusted on its next read, without needing a second,
 * differently-shaped invalidation path for each cache. See
 * docs/launch/retrieval-cache-notes.md for the exact statement.
 *
 * ---------------------------------------------------------------------------
 * WHY NO INTERNAL FLAG CHECK
 * ---------------------------------------------------------------------------
 * retrievalCacheEnabled() exists so index.ts can decide, at the call site,
 * whether to route through this module at all — getEmbeddingCached and
 * getRetrievalCached themselves perform their two-layer logic
 * UNCONDITIONALLY whenever called, with no internal flag check. This is
 * deliberate, not an oversight: retrievalCacheEnabled() reads
 * globalThis.Deno, which does not exist under vitest, so if the cache
 * functions short-circuited on it internally every test in
 * src/__tests__/retrievalCache.test.ts would silently bypass straight to
 * compute() and the two-layer logic below would never run under test. The
 * flag gate and the cache mechanism are kept as two separate, independently
 * testable pieces on purpose — do not fold the check back in here.
 *
 * ---------------------------------------------------------------------------
 * WHY globalThis.Deno INSTEAD OF THE BARE `Deno` IDENTIFIER
 * ---------------------------------------------------------------------------
 * Verified directly (not assumed): src/__tests__/*.test.ts sit inside
 * tsconfig.app.json's `include`, and `tsc -p tsconfig.app.json --listFiles`
 * shows it transitively pulls in every supabase/functions/fire-safety-chat/
 * *.ts file a test under src/__tests__ imports — this module included, once
 * retrievalCache.test.ts imports it. A bare `Deno` reference — even only
 * inside a `typeof Deno !== "undefined"` guard — is a hard TS2304 "Cannot
 * find name 'Deno'" under that program, which has no ambient Deno lib types.
 * `(globalThis as {Deno?: ...}).Deno` sidesteps that: it is ordinary
 * structurally-typed property access, valid with or without Deno's ambient
 * types, and behaves identically at runtime (undefined under vitest/Node,
 * the real Deno namespace under the Edge Function).
 *
 * Created 2026-09-03 (D1).
 */

// ===========================================================================
// 1. DB CLIENT CONTRACT
// ===========================================================================
//
// Narrow, structural, and deliberately NOT imported from @supabase/supabase-js
// — the real admin client index.ts builds via createClient(...) already
// satisfies this shape (its builder has strictly more methods, and TS
// structural typing accepts that), and a test can satisfy it with a plain
// object in a handful of lines. Only the two query shapes this module
// actually issues are represented: `select(...).eq(...).eq(...).maybeSingle()`
// and `upsert(row)` — the exact same chain fetchUserMemory /
// updateUserMemoryInBackground already use elsewhere in index.ts.

export interface RetrievalCacheQueryBuilder {
  eq(column: string, value: unknown): RetrievalCacheQueryBuilder;
  maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
}

export interface RetrievalCacheTableBuilder {
  select(columns: string): RetrievalCacheQueryBuilder;
  upsert(row: Record<string, unknown>): PromiseLike<{ error: unknown }>;
}

export interface RetrievalCacheClient {
  from(table: string): RetrievalCacheTableBuilder;
}

export const RETRIEVAL_CACHE_TABLE = "retrieval_cache";
export const RUNTIME_SETTINGS_TABLE = "runtime_settings";

// ===========================================================================
// 2. KEY NORMALIZATION AND HASHING
// ===========================================================================

// أ إ آ ٱ -> ا. Deliberately only the alef family; see the module doc comment
// for why alef maksura / teh marbuta / digit-script unification are left out.
const ARABIC_ALEF_VARIANTS_RE = /[آأإٱ]/g;

// Fathatan, dammatan, kasratan, fatha, damma, kasra, shadda, sukun (064B-0652),
// dagger alef (0670), tatweel/kashida (0640).
const ARABIC_DIACRITICS_AND_TATWEEL_RE = /[ً-ْٰـ]/g;

const WHITESPACE_RUN_RE = /\s+/g;

/**
 * Normalize question text for cache-key purposes. See the module doc comment
 * ("Normalization") for the exact five steps and why each one is there.
 * Pure string function — same input always produces the same output, no I/O.
 */
export function normalizeForKey(text: string): string {
  const raw = text ?? "";
  const unifiedAlef = raw.replace(ARABIC_ALEF_VARIANTS_RE, "ا");
  const stripped = unifiedAlef.replace(ARABIC_DIACRITICS_AND_TATWEEL_RE, "");
  // toLowerCase() is a no-op on Arabic script and on digits, so this only
  // ever affects Latin letters — exactly "lowercase Latin (keep numbers)".
  const lowered = stripped.toLowerCase();
  const collapsed = lowered.replace(WHITESPACE_RUN_RE, " ");
  return collapsed.trim();
}

// ASCII Unit Separator. Joins key parts before hashing so that parts
// ["ab", "c"] and ["a", "bc"] can never collide the way naive concatenation
// would; chosen because it is vanishingly unlikely to occur in real question
// text, SBC code names, or mode strings.
const KEY_PART_SEPARATOR = "\u001f";

/**
 * sha256 hex digest of `parts` joined with a separator that real cache-key
 * inputs cannot plausibly contain. Uses the Web Crypto API, which is a
 * genuine global in both Deno and Node 20+/vitest — no runtime-specific
 * import needed on either side (verified: `crypto.subtle.digest` is
 * available under this repo's vitest/Node runtime without any polyfill).
 */
export async function cacheKey(parts: string[]): Promise<string> {
  const joined = parts.join(KEY_PART_SEPARATOR);
  const bytes = new TextEncoder().encode(joined);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ===========================================================================
// 3. FLAG GATE
// ===========================================================================

export const RETRIEVAL_CACHE_FLAG_ENV = "RETRIEVAL_CACHE_ENABLED";

/** Structural, not `typeof Deno` — see the module doc comment ("WHY
 *  globalThis.Deno...") for why the bare identifier is not safe here. */
function readDenoEnv(name: string): string | undefined {
  const g = globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } };
  return g.Deno?.env?.get?.(name);
}

/**
 * True only for the exact string "1" — same life-safety-flag discipline as
 * ADVISORY_VECTOR_RETRIEVAL_ENABLED in ./retrievalPolicy.ts: unset / "" /
 * "0" / "true" are all OFF, so a typo cannot silently turn this on. Always
 * false under vitest (globalThis.Deno is undefined there), which is correct
 * — the flag's only job is deciding whether index.ts routes through this
 * module in the real Edge Function.
 */
export function retrievalCacheEnabled(): boolean {
  return readDenoEnv(RETRIEVAL_CACHE_FLAG_ENV) === "1";
}

// ===========================================================================
// 4. IN-MEMORY LAYER (LRU by recency, TTL per entry)
// ===========================================================================
//
// Same purpose as index.ts's existing fileCache/queryCache (a warm isolate
// avoids repeat work), same Map-based shape, generalized over a value type so
// both caches below can share one implementation. `touch`-on-read plus
// re-insert-on-write is the standard "Map preserves insertion order" trick
// for a cheap LRU: the oldest (least recently touched) key is always
// `map.keys().next().value`.

interface MemoryEntry<V> {
  value: V;
  expiresAt: number;
}

function memoryGet<V>(map: Map<string, MemoryEntry<V>>, key: string): V | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    map.delete(key);
    return undefined;
  }
  map.delete(key);
  map.set(key, entry); // touch: move to most-recently-used position
  return entry.value;
}

function memorySet<V>(
  map: Map<string, MemoryEntry<V>>,
  key: string,
  value: V,
  ttlSeconds: number,
  maxEntries: number,
): void {
  map.delete(key);
  map.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlSeconds) * 1000 });
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

// Embeddings are small (768 floats, ~6KB as JS numbers) — 200 entries is a
// generous bound (~1.2MB worst case) for one isolate's lifetime.
export const EMBEDDING_MEMORY_MAX_ENTRIES = 200;

// Retrieval payloads carry the built context string (up to ~120,000 chars,
// the same contextLimit fetchSBCContextVector already enforces) — kept
// deliberately small (30 entries, ~7MB worst case) for the same reason
// index.ts's own queryCache caps at 20.
export const RETRIEVAL_MEMORY_MAX_ENTRIES = 30;

// Embeddings for a fixed (normalized text, model id) pair are deterministic
// — the model id is part of the key, so a real model upgrade already
// produces a different key on its own. 30 days is generous headroom against
// storage growth / staleness, not a correctness requirement.
export const EMBEDDING_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

const embeddingMemory: Map<string, MemoryEntry<number[]>> = new Map();
const retrievalMemory: Map<string, MemoryEntry<unknown>> = new Map();

// ===========================================================================
// 5. corpus_version (runtime_settings, 5-minute memoized read, fail-open)
// ===========================================================================

export const CORPUS_VERSION_CACHE_TTL_MS = 5 * 60 * 1000;

let corpusVersionMemo: { value: number; expiresAt: number } | null = null;

function toFiniteNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Current corpus_version from runtime_settings, memoized in-process for 5
 * minutes so a burst of concurrent requests on a warm isolate does not each
 * pay a round trip. Fails open to 1 on ANY error (missing table, network,
 * malformed value) — a corpus_version read must never be the reason
 * retrieval fails; the worst case of returning a stale/default 1 is an
 * over-eager cache hit against an older corpus, bounded by whatever TTL the
 * caller passed to getRetrievalCached. Only a SUCCESSFUL read is memoized —
 * a failure is retried on the very next call rather than "sticking" for 5
 * minutes, so a transient outage self-heals as soon as the DB is back.
 */
export async function getCorpusVersion(client: RetrievalCacheClient): Promise<number> {
  const now = Date.now();
  if (corpusVersionMemo && corpusVersionMemo.expiresAt > now) {
    return corpusVersionMemo.value;
  }
  try {
    const { data, error } = await client
      .from(RUNTIME_SETTINGS_TABLE)
      .select("value")
      .eq("key", "corpus_version")
      .maybeSingle();
    if (error) throw error;
    const value = toFiniteNumber(data?.value, 1);
    corpusVersionMemo = { value, expiresAt: now + CORPUS_VERSION_CACHE_TTL_MS };
    return value;
  } catch {
    return 1;
  }
}

// ===========================================================================
// 6. FIRE-AND-FORGET WRITES
// ===========================================================================

function scheduleWrite(client: RetrievalCacheClient, row: Record<string, unknown>): void {
  void (async () => {
    try {
      await client.from(RETRIEVAL_CACHE_TABLE).upsert(row);
    } catch {
      // Fire-and-forget by design: the caller already has its value from
      // compute() (or from a prior cache hit) by the time this runs. A write
      // failure here must never surface as a retrieval failure.
    }
  })();
}

// ===========================================================================
// 7. EMBEDDING CACHE
// ===========================================================================

/**
 * Two-layer cache for one query embedding. `compute` is called on a miss and
 * MUST reject (never resolve with a sentinel like an empty array) when the
 * real embedding call fails — a failure is not cached at any layer, so the
 * next call retries exactly as if caching did not exist. See the module doc
 * comment ("KEY RECIPES") for the exact key this computes.
 */
export async function getEmbeddingCached(
  client: RetrievalCacheClient,
  text: string,
  modelId: string,
  compute: () => Promise<number[]>,
): Promise<number[]> {
  const key = await cacheKey(["embedding", modelId, normalizeForKey(text)]);

  const hit = memoryGet(embeddingMemory, key);
  if (hit) return hit;

  const corpusVersion = await getCorpusVersion(client);
  try {
    const { data, error } = await client
      .from(RETRIEVAL_CACHE_TABLE)
      .select("payload, corpus_version, expires_at")
      .eq("key", key)
      .eq("kind", "embedding")
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const notExpired = new Date(String(data.expires_at)).getTime() > Date.now();
      const sameVersion = toFiniteNumber(data.corpus_version, NaN) === corpusVersion;
      if (notExpired && sameVersion) {
        const value = data.payload as number[];
        memorySet(embeddingMemory, key, value, EMBEDDING_CACHE_TTL_SECONDS, EMBEDDING_MEMORY_MAX_ENTRIES);
        return value;
      }
    }
  } catch {
    // Fail-open: fall through to compute() exactly as if this were a miss.
  }

  const value = await compute();
  memorySet(embeddingMemory, key, value, EMBEDDING_CACHE_TTL_SECONDS, EMBEDDING_MEMORY_MAX_ENTRIES);
  if (value != null) {
    scheduleWrite(client, {
      key,
      kind: "embedding",
      payload: value,
      corpus_version: corpusVersion,
      expires_at: new Date(Date.now() + EMBEDDING_CACHE_TTL_SECONDS * 1000).toISOString(),
    });
  }
  return value;
}

// ===========================================================================
// 8. RETRIEVAL-RESULT CACHE
// ===========================================================================

/**
 * Two-layer cache for one retrieval result, generic over the result shape
 * (in practice fetchSBCContextVector's {context, files, sourceMeta, docIds,
 * engine, graphExpansionCount, fallbackReason}). `keyParts` is opaque to
 * this function — it only joins-then-hashes them — so the CALLER owns
 * building them correctly; see the module doc comment ("KEY RECIPES") for
 * the exact recipe. `ttlSeconds` governs both layers: the in-memory entry's
 * expiry and the Postgres row's `expires_at`, one number, one meaning.
 */
export async function getRetrievalCached<T>(
  client: RetrievalCacheClient,
  keyParts: string[],
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const key = await cacheKey(["retrieval", ...keyParts]);

  const hit = memoryGet(retrievalMemory, key);
  if (hit !== undefined) return hit as T;

  const corpusVersion = await getCorpusVersion(client);
  try {
    const { data, error } = await client
      .from(RETRIEVAL_CACHE_TABLE)
      .select("payload, corpus_version, expires_at")
      .eq("key", key)
      .eq("kind", "retrieval")
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const notExpired = new Date(String(data.expires_at)).getTime() > Date.now();
      const sameVersion = toFiniteNumber(data.corpus_version, NaN) === corpusVersion;
      if (notExpired && sameVersion) {
        const value = data.payload as T;
        memorySet(retrievalMemory, key, value, ttlSeconds, RETRIEVAL_MEMORY_MAX_ENTRIES);
        return value;
      }
    }
  } catch {
    // Fail-open: fall through to compute() exactly as if this were a miss.
  }

  const value = await compute();
  memorySet(retrievalMemory, key, value, ttlSeconds, RETRIEVAL_MEMORY_MAX_ENTRIES);
  if (value != null) {
    scheduleWrite(client, {
      key,
      kind: "retrieval",
      payload: value,
      corpus_version: corpusVersion,
      expires_at: new Date(Date.now() + Math.max(0, ttlSeconds) * 1000).toISOString(),
    });
  }
  return value;
}
