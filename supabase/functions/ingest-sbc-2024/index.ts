/**
 * ingest-sbc-2024 — one-off, operator-invoked ingestion of the SBC 401/501
 * 2024 chunk volumes from bucket 'ssss' into sbc_documents, embedding
 * server-side with the function-env GOOGLE_GEMINI_API_KEY (the key never
 * leaves Supabase).
 *
 * WHY THIS EXISTS: scripts/generate-embeddings.mjs does the same job from the
 * owner's machine but requires pasting the Gemini + service keys locally.
 * This function needs neither on the client. Delete it after the intake
 * completes (rollback + deletion steps in
 * docs/launch/new-source-codes-runbook-20260831.md).
 *
 * SEQUENCING (binding): do NOT invoke `ingest` before the benchmark-gate
 * window. ADVISORY_VECTOR_RETRIEVAL_ENABLED is live in production, and
 * match_sbc_documents with filter_code=null searches every code_type — rows
 * planted here become vector-retrievable immediately, gate or no gate.
 *
 * AUTH: requires header `x-ingest-token` equal to env INGEST_TASK_TOKEN
 * (set via `supabase secrets set`), on top of the platform JWT check.
 * Constant-time comparison; absent env → every request refused (fails closed).
 *
 * Actions (POST JSON):
 *   {action:"status"}                          → row counts by code_type
 *   {action:"ingest", file, offset?, limit?}   → embed+insert one slice (idempotent:
 *                                                existing (file_name,chunk_index) rows are skipped)
 *   {action:"probe", q, filter?}               → embed q, run match_sbc_documents, top-5 summary
 *   {action:"purge", confirm:"SBC-2024"}       → delete ALL SBC401/SBC501 rows (rollback)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;
const ALLOWED_FILES = /^SBC[45]01_C[RC]2024_\d+-\d+_chunks\.json$/;

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function extractSection(text: string): string | null {
  return text.match(/\b(\d{3,4}\.\d{1,3}(?:\.\d{1,2})?)\b/)?.[1]
    ?? text.match(/\b(\d{2,3}(?::\d{2})?-\d{1,2}(?:\.\d{1,3}){0,4})\b/)?.[1]
    ?? null;
}
function extractChapter(text: string): string | null {
  return text.match(/(?:Chapter|الفصل)\s*(\d+)/i)?.[1] || null;
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const requests = texts.map((t) => ({
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text: t.substring(0, 8000) }] },
    outputDimensionality: EMBED_DIM,
  }));
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requests }) },
    );
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Math.min(15000 * (attempt + 1), 45000)));
      continue;
    }
    if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    return data.embeddings.map((e: { values: number[] }) => e.values);
  }
  throw new Error("embed: rate-limited after 5 attempts");
}

Deno.serve(async (req) => {
  const expected = Deno.env.get("INGEST_TASK_TOKEN");
  const got = req.headers.get("x-ingest-token") ?? "";
  if (!expected || !timingSafeEqual(got, expected)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const gemini = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  const db = createClient(url, key);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }
  const action = body.action;

  try {
    if (action === "status") {
      const counts: Record<string, number> = {};
      for (const ct of ["SBC201", "SBC801", "SBC401", "SBC501"]) {
        const { count } = await db.from("sbc_documents")
          .select("id", { count: "exact", head: true }).eq("code_type", ct);
        counts[ct] = count ?? 0;
      }
      return Response.json({ ok: true, counts });
    }

    if (action === "ingest") {
      if (!gemini) return Response.json({ error: "GOOGLE_GEMINI_API_KEY absent" }, { status: 500 });
      const file = String(body.file ?? "");
      if (!ALLOWED_FILES.test(file)) {
        return Response.json({ error: `file not in 2024-intake allow-list: ${file}` }, { status: 400 });
      }
      const offset = Number(body.offset ?? 0);
      const limit = Math.min(Number(body.limit ?? 60), 100);

      const { data: blob, error: dlErr } = await db.storage.from("ssss").download(file);
      if (dlErr || !blob) return Response.json({ error: `download: ${dlErr?.message}` }, { status: 500 });
      const raw = JSON.parse(await blob.text());
      const codeType = String(raw.code_type ?? "");
      if (codeType !== "SBC401" && codeType !== "SBC501") {
        return Response.json({ error: `blob code_type ${codeType} not allowed` }, { status: 400 });
      }
      const chunks: Record<string, unknown>[] = raw.chunks ?? [];
      const slice = chunks.slice(offset, offset + limit)
        .map((c, i) => ({ chunk: c, index: offset + i }))
        .filter((x) => typeof x.chunk.content === "string" && (x.chunk.content as string).length >= 20);

      const { data: existing } = await db.from("sbc_documents")
        .select("chunk_index").eq("file_name", file)
        .gte("chunk_index", offset).lt("chunk_index", offset + limit);
      const done = new Set((existing ?? []).map((e: { chunk_index: number }) => e.chunk_index));
      const pending = slice.filter((x) => !done.has(x.index));

      let inserted = 0;
      for (let b = 0; b < pending.length; b += 20) {
        const batch = pending.slice(b, b + 20);
        const vectors = await embedBatch(batch.map((x) => x.chunk.content as string), gemini);
        const rows = batch.map((x, j) => ({
          content: x.chunk.content,
          metadata: {
            code_id: x.chunk.code_id ?? raw.code_id,
            chunk_id: x.chunk.chunk_id,
            content_type: x.chunk.content_type,
            has_table: x.chunk.has_table,
            has_commentary: x.chunk.has_commentary,
            references: x.chunk.references,
            token_count: x.chunk.token_count,
            edition: raw.edition,
          },
          embedding: vectors[j],
          code_type: codeType,
          // Prefer the chunk's OWN section_number — extract_sbc.py computes it
          // with the code-correct grammar (iec_style for 401's "41-1.4" / "712-"
          // numbering). extractSection() here is a generic-first regex that
          // mislabels IEC content (a stray "101.1" in the body wins over the
          // real "712-…"). Fall back to it only when the chunk has none.
          section_number: ((): string | null => {
            const s = x.chunk.section_number;
            return (typeof s === "string" && s.trim()) ? s.trim() : extractSection(x.chunk.content as string);
          })(),
          chapter_number: (typeof x.chunk.chapter_number === "string" && (x.chunk.chapter_number as string).trim())
            ? (x.chunk.chapter_number as string).trim()
            : (extractChapter(x.chunk.content as string) || (x.chunk.chapter_id as string)),
          page_start: x.chunk.page_start,
          page_end: x.chunk.page_end,
          file_name: file,
          chunk_index: x.index,
        }));
        const { error: insErr } = await db.from("sbc_documents").insert(rows);
        if (insErr) return Response.json({ error: `insert: ${insErr.message}`, inserted }, { status: 500 });
        inserted += rows.length;
      }
      return Response.json({
        ok: true, file, offset, limit,
        total_in_file: chunks.length, skipped_existing: done.size, inserted,
        next_offset: offset + limit < chunks.length ? offset + limit : null,
      });
    }

    if (action === "probe") {
      if (!gemini) return Response.json({ error: "GOOGLE_GEMINI_API_KEY absent" }, { status: 500 });
      const q = String(body.q ?? "");
      const [vec] = await embedBatch([q], gemini);
      const { data: matches, error: rpcErr } = await db.rpc("match_sbc_documents", {
        query_embedding: vec, match_count: 5, filter_code: body.filter ?? null,
      });
      if (rpcErr) return Response.json({ error: rpcErr.message }, { status: 500 });
      return Response.json({
        ok: true,
        top: (matches ?? []).map((m: Record<string, unknown>) => ({
          code_type: m.code_type, section: m.section_number,
          similarity: m.similarity, snippet: String(m.content ?? "").slice(0, 90),
        })),
      });
    }

    if (action === "purge") {
      if (body.confirm !== "SBC-2024") {
        return Response.json({ error: "confirm phrase required" }, { status: 400 });
      }
      // Optional selective purge: {codes:["SBC401"]} — only 2024-intake codes
      // are ever deletable here; 201/801 are structurally out of reach.
      const requested = Array.isArray(body.codes) ? body.codes.map(String) : ["SBC401", "SBC501"];
      const codes = requested.filter((c) => c === "SBC401" || c === "SBC501");
      if (codes.length === 0) {
        return Response.json({ error: "no valid codes in purge request" }, { status: 400 });
      }
      const { error: delErr, count } = await db.from("sbc_documents")
        .delete({ count: "exact" }).in("code_type", codes);
      if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
      return Response.json({ ok: true, deleted: count, codes });
    }

    // Diagnostic: verify the function-env Gemini key can GENERATE (not just
    // embed) with the models fire-safety-chat actually uses. Returns HTTP
    // status + error class per model, never the key.
    if (action === "gentest") {
      if (!gemini) return Response.json({ error: "GOOGLE_GEMINI_API_KEY absent" }, { status: 500 });
      const models = Array.isArray(body.models) && body.models.length > 0
        ? body.models.map(String).slice(0, 8)
        : ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
      const out: Record<string, string> = {};
      for (const model of models) {
        try {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gemini}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: [{ text: "reply with the word ok" }] }] }),
            },
          );
          if (r.ok) {
            out[model] = "OK";
          } else {
            const t = await r.text();
            out[model] = `${r.status}: ${t.slice(0, 180).replace(/\s+/g, " ")}`;
          }
        } catch (e) {
          out[model] = `fetch_error: ${String(e).slice(0, 100)}`;
        }
        // Streaming probe with fire-safety-chat's EXACT request shape
        // (systemInstruction + contents + generationConfig.temperature),
        // because generateContent working does not prove streamGenerateContent
        // does — the incident retro's exact verification gap.
        try {
          const sr = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${gemini}&alt=sse`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: "You answer briefly." }] },
                contents: [{ role: "user", parts: [{ text: "reply with the word ok" }] }],
                generationConfig: { temperature: 0.7 },
              }),
            },
          );
          if (sr.ok) {
            const reader = sr.body?.getReader();
            let firstBytes = "";
            if (reader) {
              const { value } = await reader.read();
              firstBytes = new TextDecoder().decode(value ?? new Uint8Array()).slice(0, 160);
              await reader.cancel();
            }
            out[model + ":stream"] = `OK first_bytes=${firstBytes.replace(/\s+/g, " ")}`;
          } else {
            out[model + ":stream"] = `${sr.status}: ${(await sr.text()).slice(0, 200).replace(/\s+/g, " ")}`;
          }
        } catch (e) {
          out[model + ":stream"] = `fetch_error: ${String(e).slice(0, 100)}`;
        }
      }
      // Also report what ListModels claims is available to this key — the
      // resilience layer builds its chain from this list, so a catalog that
      // STILL names blocked 2.5 models explains a dead chain.
      let listed: string[] = [];
      try {
        const lr = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${gemini}&pageSize=1000`,
        );
        if (lr.ok) {
          const ld = await lr.json();
          listed = (ld.models ?? [])
            .map((m: { name?: string }) => String(m.name ?? "").replace("models/", ""))
            .filter((n: string) => n.startsWith("gemini-"));
        }
      } catch { /* report empty */ }
      return Response.json({ ok: true, generation: out, listed_gemini_models: listed });
    }

    // Diagnostic: the ADVISORY path differs from PRIMARY in one big way — it
    // streams a LARGE system prompt (retrieved SBC context, up to ~120k chars).
    // gentest proved the models stream on a TINY payload; this proves they
    // stream on an advisory-sized one. Builds a padded systemInstruction of
    // `kchars`*1000 characters and streams it, reporting first bytes or the
    // error. This is the last unverified variable in the advisory failure.
    if (action === "bigstream") {
      if (!gemini) return Response.json({ error: "GOOGLE_GEMINI_API_KEY absent" }, { status: 500 });
      const model = String(body.model ?? "gemini-3.1-pro-preview");
      const kchars = Math.min(Number(body.kchars ?? 120), 200);
      const filler =
        "SBC 801 Section 906 fire extinguishers: portable fire extinguishers shall be installed. ";
      const bigContext = filler.repeat(Math.ceil((kchars * 1000) / filler.length)).slice(0, kchars * 1000);
      try {
        const sr = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${gemini}&alt=sse`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: "You are a fire-safety consultant. Context:\n" + bigContext }] },
              contents: [{ role: "user", parts: [{ text: "ما اشتراطات طفايات الحريق في المكاتب؟" }] }],
              generationConfig: { temperature: 0.7 },
            }),
          },
        );
        if (!sr.ok) {
          return Response.json({ ok: true, model, prompt_chars: bigContext.length,
            result: `HTTP ${sr.status}: ${(await sr.text()).slice(0, 300).replace(/\s+/g, " ")}` });
        }
        const reader = sr.body?.getReader();
        let firstBytes = "", chunks = 0;
        if (reader) {
          for (let i = 0; i < 3; i++) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks++;
            if (!firstBytes) firstBytes = new TextDecoder().decode(value ?? new Uint8Array()).slice(0, 160);
          }
          await reader.cancel();
        }
        return Response.json({ ok: true, model, prompt_chars: bigContext.length,
          result: `OK chunks=${chunks} first_bytes=${firstBytes.replace(/\s+/g, " ")}` });
      } catch (e) {
        return Response.json({ ok: true, model, prompt_chars: bigContext.length,
          result: `fetch_error: ${String(e).slice(0, 160)}` });
      }
    }

    return Response.json({ error: `unknown action` }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
