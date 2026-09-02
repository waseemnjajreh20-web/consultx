/**
 * gemini-diag — token-gated, read-mostly diagnostics against the Gemini API,
 * so the HYPOTHESES recorded in ../fire-safety-chat/geminiContextCache.ts can
 * be CONFIRMED (or refuted) with a live key before that module is wired into
 * fire-safety-chat.
 *
 * WHY A FUNCTION AND NOT A SCRIPT: the Gemini key lives only as a Supabase
 * Edge Function secret (GOOGLE_GEMINI_API_KEY). Nothing in the repo, no
 * developer shell and no CI job has it, so the only place a live API-shape
 * question can be answered is inside a deployed function. This one exists for
 * exactly that, touches no database, writes nothing, and creates only the one
 * cachedContents object it deletes again at the end of the same request.
 *
 * WHAT IT ANSWERS (each one is currently an unverified assumption in
 * geminiContextCache.ts — its own file header says so):
 *   1. Does POST v1beta/cachedContents accept
 *      {model:"models/<id>", systemInstruction:{parts:[{text}]}, ttl:"600s"}
 *      and return {name:"cachedContents/...", expireTime}? (Section 5 there.)
 *   2. Does streamGenerateContent accept `cachedContent` + `contents` with NO
 *      systemInstruction, and answer normally? (Section 7's field layout.)
 *   3. Does it REJECT cachedContent and systemInstruction sent together — the
 *      assumption the whole "dynamic text travels as a leading user turn"
 *      design rests on? A 2xx here means that design can be simplified.
 *   4. What is the real minimum-token wording when the cached prefix is too
 *      short (looksLikeTooShortRejection's broad match, Section 5)?
 *
 * AUTH: identical shape to ../synthetic-probe/index.ts — header
 * `x-probe-token` must equal the PROBE_TASK_TOKEN secret, compared in
 * constant time, failing closed (401) when the secret is unset. Unlike
 * synthetic-probe this function DOES get a `verify_jwt = false` entry in
 * supabase/config.toml, because it is invoked by hand from the orchestrator's
 * shell rather than by pg_cron, and the token is the whole gate.
 *
 * SECRET HYGIENE: the API key is interpolated into request URLs and NEVER
 * anywhere else — not into a response, not into a log line, not into an echoed
 * request body. Every string that leaves this function goes through
 * truncate() (300 chars), which also bounds how much of an upstream error
 * message can be reflected. Response bodies are reduced to their SHAPE
 * (shapeJson) rather than returned whole.
 */
import { fetchAvailableGeminiModels } from "../fire-safety-chat/geminiResilience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-probe-token",
};

/** Every string in every response goes through this. */
const MAX_STRING = 300;

const DEFAULT_MODEL = "gemini-3.7-flash";
const DEFAULT_FILLER_WORDS = 1200;
const CACHE_TTL = "600s";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Byte-wise constant-time compare — replicated from synthetic-probe/logic.ts
 *  rather than imported, so this function bundles nothing from another
 *  function's directory beyond the one pure Gemini module it genuinely needs. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function truncate(s: string): string {
  const t = String(s ?? "");
  return t.length > MAX_STRING ? `${t.slice(0, MAX_STRING)}…[+${t.length - MAX_STRING}]` : t;
}

/**
 * Reduce an arbitrary JSON value to its SHAPE: every string truncated, every
 * array capped at its first few entries with a count, objects walked. The
 * point of the "cachetest" action is the field names and types the API
 * returns, not the payload — and a cached-content response can echo the whole
 * prefix back.
 */
function shapeJson(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 6) return "[depth-capped]";
  if (Array.isArray(value)) {
    const head = value.slice(0, 3).map((v) => shapeJson(v, depth + 1));
    return value.length > 3 ? [...head, `[+${value.length - 3} more]`] : head;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shapeJson(v, depth + 1);
    }
    return out;
  }
  return typeof value;
}

/** Read a response body once, as text, and shape it as JSON when it parses. */
async function readShaped(resp: Response): Promise<{ status: number; ok: boolean; bodyShape: unknown }> {
  const text = await resp.text().catch(() => "");
  let bodyShape: unknown;
  try {
    bodyShape = shapeJson(JSON.parse(text));
  } catch {
    bodyShape = truncate(text);
  }
  return { status: resp.status, ok: resp.ok, bodyShape };
}

/**
 * Harmless, non-repeating filler for the cached systemInstruction. Numbered
 * sentences rather than one repeated line: identical repeated text can
 * tokenize far more cheaply than its word count suggests, which would make a
 * "too short" rejection look like a shape problem instead of a size one.
 */
function buildFiller(words: number): string {
  const target = Math.max(1, Math.min(20000, Math.floor(words)));
  const parts: string[] = [
    "The following text is neutral filler used only to reach the minimum size",
    "required to create a cached content object. It states no policy and no",
    "engineering requirement of any kind.",
  ];
  let count = parts.join(" ").split(/\s+/).length;
  let n = 1;
  while (count < target) {
    const sentence = `Filler sentence number ${n} mentions a neutral topic such as weather patterns, library shelving, or bicycle maintenance, and carries no instruction.`;
    parts.push(sentence);
    count += sentence.split(/\s+/).length;
    n++;
  }
  return parts.join(" ");
}

/** Extract readable text out of a (possibly SSE) generateContent response. */
function extractAnswerText(raw: string): string {
  const collected: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      for (const c of parsed.candidates ?? []) {
        for (const p of c.content?.parts ?? []) {
          if (typeof p.text === "string") collected.push(p.text);
        }
      }
    } catch {
      // Not a JSON frame (SSE keep-alive, a bare error body) — ignore; the
      // caller still gets the raw head via bodyShape on the failure paths.
    }
    if (collected.join("").length >= MAX_STRING) break;
  }
  return collected.join("");
}

/**
 * One streamGenerateContent attempt against `model`, with whatever body the
 * caller hands it. Returns status + either the first 300 chars of the answer
 * or the first 300 chars of the error.
 */
async function tryStream(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
): Promise<{ status: number; ok: boolean; text: string }> {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const raw = await resp.text().catch(() => "");
    return {
      status: resp.status,
      ok: resp.ok,
      text: truncate(resp.ok ? extractAnswerText(raw) : raw),
    };
  } catch (e) {
    return { status: 0, ok: false, text: truncate(e instanceof Error ? e.message : String(e)) };
  }
}

const TINY_TURN = [{ role: "user", parts: [{ text: "Reply with the single word: ready." }] }];

/**
 * The full context-cache probe. Order matters and is fixed: create, then the
 * cachedContent-only call, then the cachedContent+systemInstruction call, then
 * delete — so the delete runs even when a call fails, and so the two
 * generateContent variants are measured against the SAME cache object.
 */
async function runCacheTest(
  apiKey: string,
  model: string,
  fillerWords: number,
): Promise<Record<string, unknown>> {
  const staticPrefixText = buildFiller(fillerWords);
  const out: Record<string, unknown> = {
    model,
    filler_words_requested: fillerWords,
    filler_chars: staticPrefixText.length,
  };

  // ── 1. create ─────────────────────────────────────────────────────────────
  // Exactly the body geminiContextCache.ts's ensureContextCache sends today.
  let created: { status: number; ok: boolean; bodyShape: unknown };
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${model}`,
          systemInstruction: { parts: [{ text: staticPrefixText }] },
          ttl: CACHE_TTL,
        }),
      },
    );
    created = await readShaped(resp);
  } catch (e) {
    out.create = { status: 0, ok: false, bodyShape: truncate(e instanceof Error ? e.message : String(e)) };
    return out;
  }
  out.create = created;

  const cacheName =
    created.ok &&
    created.bodyShape &&
    typeof (created.bodyShape as { name?: unknown }).name === "string"
      ? String((created.bodyShape as { name: string }).name)
      : null;
  out.cache_name = cacheName;

  if (!cacheName) {
    // The create failed (or returned no name). The truncated error body above
    // IS the answer for the minimum-token question — geminiContextCache.ts's
    // looksLikeTooShortRejection can be matched against the real wording.
    out.note =
      "no cachedContents name returned — read create.bodyShape for the API's own wording (this is where a minimum-token rule shows up)";
    return out;
  }

  // ── 2. cachedContent + contents, NO systemInstruction ─────────────────────
  // The shape buildRequestWithCache produces. A 2xx here confirms Section 7's
  // field layout works as designed.
  out.stream_with_cache_only = await tryStream(apiKey, model, {
    cachedContent: cacheName,
    contents: TINY_TURN,
  });

  // ── 3. cachedContent AND systemInstruction together ───────────────────────
  // geminiContextCache.ts ASSUMES this is rejected, and the whole
  // "dynamic text rides a leading user turn" design exists because of that
  // assumption. A 2xx here means the design can be simplified — record it
  // either way; do not act on it from inside this function.
  out.stream_with_cache_and_system = await tryStream(apiKey, model, {
    cachedContent: cacheName,
    systemInstruction: { parts: [{ text: "Answer in exactly one word." }] },
    contents: TINY_TURN,
  });

  // ── 4. delete (best effort — a leaked cache still expires at ttl) ─────────
  try {
    const del = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${cacheName}?key=${apiKey}`,
      { method: "DELETE" },
    );
    out.delete = await readShaped(del);
  } catch (e) {
    out.delete = { status: 0, ok: false, bodyShape: truncate(e instanceof Error ? e.message : String(e)) };
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const expected = Deno.env.get("PROBE_TASK_TOKEN");
  const got = req.headers.get("x-probe-token") ?? "";
  if (!expected || !timingSafeEqual(got, expected)) {
    return json({ error: "forbidden" }, 401);
  }

  const apiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!apiKey) return json({ error: "GOOGLE_GEMINI_API_KEY is not configured" }, 500);

  let body: { action?: string; model?: string; words?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "body must be JSON" }, 400);
  }

  const action = String(body.action ?? "");
  const model = typeof body.model === "string" && body.model ? body.model : DEFAULT_MODEL;

  try {
    if (action === "models") {
      // The names THIS key can see — the same call fire-safety-chat's model
      // chain is built from, so a "model not found" incident can be diagnosed
      // without guessing (see project_gemini_model_incident: the 2.5 family
      // died on a key rotation).
      const models = await fetchAvailableGeminiModels(apiKey);
      return json({ action, count: models.length, models: models.map(truncate) });
    }

    if (action === "cachetest") {
      const words = typeof body.words === "number" ? body.words : DEFAULT_FILLER_WORDS;
      return json({ action, result: await runCacheTest(apiKey, model, words) });
    }

    return json({ error: "unknown action", supported: ["models", "cachetest"] }, 400);
  } catch (e) {
    return json({ error: truncate(e instanceof Error ? e.message : String(e)) }, 500);
  }
});
