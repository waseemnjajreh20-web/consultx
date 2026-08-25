/**
 * evals/lib/sse.ts — Server-Sent Events assembly for the advisory benchmark.
 *
 * fire-safety-chat/index.ts streams answers as OpenAI-style SSE (transformed
 * from Gemini's own SSE shape — see index.ts lines ~3065-3111, the
 * `transformStream` that produces this exact frame format):
 *
 *   data: {"choices":[{"delta":{"content":"TEXT_CHUNK"}}]}
 *
 *   data: [DONE]
 *
 * This module is pure and Deno-safe (no Deno-specific APIs, no external
 * deps) so `assembleSseText` can be unit-tested on plain strings without a
 * live stream, and `parseSseAnswer` can be imported by the live benchmark
 * runner — the same pure-module pattern as
 * supabase/functions/fire-safety-chat/retrievalPolicy.ts.
 */

interface SseDeltaFrame {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
}

const DATA_PREFIX = "data:";
const DONE_MARKER = "[DONE]";

/**
 * Splits on all three line terminators the SSE spec defines: CRLF, LF, and a
 * lone CR. The lone-CR case is the one that is easy to miss — a splitter that
 * only knows `\r\n|\n` treats a whole CR-delimited body as ONE line, so the
 * "data:" payload arrives with the rest of the stream glued to its tail,
 * JSON.parse fails on every frame, and the assembled answer comes back empty
 * rather than wrong — a silent zero-score, not a visible parse error.
 *
 * Splitting on a lone CR stays safe when a chunk boundary falls between the
 * CR and the LF of a CRLF pair: the CR terminates the (already complete) line
 * and the orphaned LF opens an empty one, which is skipped for not starting
 * with "data:".
 */
function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/**
 * Extracts the delta content from one already-unwrapped "data:" payload.
 * Returns null for [DONE], for non-JSON payloads, and for frames whose shape
 * doesn't match `{ choices: [{ delta: { content } }] }` — callers treat null
 * as "nothing to append", never as an error, so a single malformed or
 * truncated frame (e.g. one split across a chunk boundary and never
 * recovered) cannot abort assembly of the rest of the answer.
 */
function extractDeltaContent(payload: string): string | null {
  if (payload === DONE_MARKER) return null;
  try {
    const frame = JSON.parse(payload) as SseDeltaFrame;
    const content = frame.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

/**
 * Pure text-in/text-out assembler: concatenates every
 * `choices[0].delta.content` chunk found in a complete, already-decoded SSE
 * body, in order, stopping as soon as a `data: [DONE]` line is seen. Exists
 * so the frame-parsing logic can be unit-tested directly on string fixtures,
 * without going through a ReadableStream.
 */
export function assembleSseText(rawText: string): string {
  let answer = "";

  for (const line of splitLines(rawText)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(DATA_PREFIX)) continue;

    const payload = trimmed.slice(DATA_PREFIX.length).trim();
    if (payload === DONE_MARKER) break;

    const content = extractDeltaContent(payload);
    if (content !== null) answer += content;
  }

  return answer;
}

/**
 * Reads an OpenAI-style SSE `ReadableStream<Uint8Array>` to completion (or
 * to the first `data: [DONE]`, whichever comes first) and returns the
 * assembled answer text.
 *
 * A "data: {...}" frame can be split across two network reads mid-chunk, so
 * this buffers the trailing partial line across `reader.read()` calls
 * instead of decoding and splitting each chunk in isolation — the same
 * technique index.ts's own `transformStream` uses on the Gemini→OpenAI leg
 * (index.ts line ~3068, `lineBuffer`).
 */
export async function parseSseAnswer(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  const processLine = (line: string): boolean => {
    // Returns false when [DONE] was seen, to signal "stop reading".
    const trimmed = line.trim();
    if (!trimmed.startsWith(DATA_PREFIX)) return true;

    const payload = trimmed.slice(DATA_PREFIX.length).trim();
    if (payload === DONE_MARKER) return false;

    const content = extractDeltaContent(payload);
    if (content !== null) answer += content;
    return true;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = splitLines(buffer);
      buffer = lines.pop() ?? ""; // retain the incomplete trailing line

      let keepReading = true;
      for (const line of lines) {
        keepReading = processLine(line);
        if (!keepReading) break;
      }
      if (!keepReading) {
        // [DONE] seen. Cancel rather than just returning: the response body
        // is usually not exhausted at this point (the server still has the
        // trailing blank line, and often more, to send), and abandoning a
        // half-read body leaks the connection. The benchmark opens roughly
        // 2 x rows + 2 of these per run, so a leak per question is the
        // difference between a run that exits and one that hangs on
        // outstanding ops.
        await reader.cancel();
        return answer;
      }
    }

    // Stream ended without an explicit [DONE] — flush the decoder and
    // process whatever complete-looking line is left in the buffer.
    buffer += decoder.decode();
    if (buffer.length > 0) processLine(buffer);
  } finally {
    reader.releaseLock();
  }

  return answer;
}
