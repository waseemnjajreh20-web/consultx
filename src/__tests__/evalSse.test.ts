/**
 * Tests for evals/lib/sse.ts — the SSE assembler the advisory benchmark uses
 * to read fire-safety-chat's streamed answers.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Every failure mode of an SSE reader is SILENT. A parser that mishandles a
 * frame does not throw — it returns a shorter string, or an empty one. The
 * benchmark then scores that string, finds no section numbers in it, and
 * reports a retrieval regression that never happened. So the assembler has to
 * be pinned on fixtures rather than trusted to a live run, where a wrong
 * answer and a badly-parsed answer look identical.
 *
 * evals/lib/sse.ts is pure (no Deno APIs, no I/O, no external deps), so it is
 * imported and executed directly here — the same pattern
 * retrievalPolicy.test.ts uses for retrievalPolicy.ts.
 *
 * The frame shape under test is the one index.ts's `transformStream` actually
 * emits (index.ts ~3065-3111):
 *     data: {"choices":[{"delta":{"content":"..."}}]}
 *     data: [DONE]
 */

import { describe, it, expect } from "vitest";
import { assembleSseText, parseSseAnswer } from "../../evals/lib/sse.ts";

/** Builds one wire frame, with a configurable line terminator. */
function frame(content: string, eol = "\n\n"): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}${eol}`;
}

/** Serves an exact list of byte-chunks as a ReadableStream, so chunk boundaries are controlled to the character. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

describe("assembleSseText — line terminators", () => {
  it("assembles LF-delimited frames in order", () => {
    const raw = frame("مبنى ") + frame("فندقي") + "data: [DONE]\n\n";
    expect(assembleSseText(raw)).toBe("مبنى فندقي");
  });

  it("assembles CRLF-delimited frames", () => {
    const raw = frame("Section ", "\r\n\r\n") + frame("903.2.1", "\r\n\r\n") +
      "data: [DONE]\r\n\r\n";
    expect(assembleSseText(raw)).toBe("Section 903.2.1");
  });

  it("assembles CR-only-delimited frames (the third terminator the SSE spec allows)", () => {
    // Regression: a splitter that only knows /\r\n|\n/ treats this whole body
    // as ONE line, so the payload arrives with the rest of the stream glued to
    // its tail, JSON.parse fails on every frame, and the result is silently
    // "" rather than a visible parse error.
    const raw = frame("A", "\r\r") + frame("B", "\r\r") + "data: [DONE]\r\r";
    expect(assembleSseText(raw)).toBe("AB");
  });
});

describe("assembleSseText — frame content edge cases", () => {
  it("treats an empty delta as a no-op, not as a terminator", () => {
    const raw = frame("start") + frame("") + frame("end") + "data: [DONE]\n\n";
    expect(assembleSseText(raw)).toBe("startend");
  });

  it("preserves whitespace and newlines inside a delta", () => {
    // The delta content is JSON-escaped on the wire, so a literal newline in
    // the answer must survive assembly intact.
    const raw = frame("Section\n1010.1.3") + "data: [DONE]\n\n";
    expect(assembleSseText(raw)).toBe("Section\n1010.1.3");
  });

  it("stops at [DONE] and ignores anything after it", () => {
    const raw = frame("kept") + "data: [DONE]\n\n" + frame("DISCARDED");
    expect(assembleSseText(raw)).toBe("kept");
  });

  it("accepts 'data:' with no space after the colon", () => {
    const raw = `data:${JSON.stringify({ choices: [{ delta: { content: "tight" } }] })}\n\n` +
      "data:[DONE]\n\n";
    expect(assembleSseText(raw)).toBe("tight");
  });

  it("skips SSE comment/heartbeat lines and blank lines", () => {
    const raw = ": keep-alive\n\n" + frame("real") + "\n\n: ping\n\n" + "data: [DONE]\n\n";
    expect(assembleSseText(raw)).toBe("real");
  });

  it("skips a malformed frame without aborting assembly of the rest", () => {
    const raw = frame("before") + 'data: {"choices":[{"delta":\n\n' + frame("after") +
      "data: [DONE]\n\n";
    expect(assembleSseText(raw)).toBe("beforeafter");
  });

  it("skips a well-formed frame whose delta carries no content field", () => {
    const raw = frame("x") + 'data: {"choices":[{"delta":{}}]}\n\n' + frame("y") +
      "data: [DONE]\n\n";
    expect(assembleSseText(raw)).toBe("xy");
  });

  it("returns empty string for a body that is not SSE at all", () => {
    expect(assembleSseText('{"error":"boom"}')).toBe("");
    expect(assembleSseText("")).toBe("");
  });

  it("assembles a stream that never sends [DONE]", () => {
    expect(assembleSseText(frame("a") + frame("b"))).toBe("ab");
  });
});

describe("parseSseAnswer — chunk boundaries", () => {
  it("reassembles a frame split mid-JSON across two chunks", async () => {
    const whole = frame("903.3.1.1") + "data: [DONE]\n\n";
    const cut = 20; // lands inside the JSON object, well before its closing brace
    expect(await parseSseAnswer(streamOf([whole.slice(0, cut), whole.slice(cut)])))
      .toBe("903.3.1.1");
  });

  it("reassembles a frame split one character at a time", async () => {
    const whole = frame("القسم 1006.2.1") + "data: [DONE]\n\n";
    expect(await parseSseAnswer(streamOf(Array.from(whole)))).toBe("القسم 1006.2.1");
  });

  it("reassembles when the split falls between the CR and the LF of a CRLF pair", async () => {
    // The CR terminates the (complete) line and the orphaned LF opens an empty
    // one, which must be skipped rather than corrupting the next frame.
    const a = frame("left", "\r\n\r\n");
    const b = frame("right", "\r\n\r\n") + "data: [DONE]\r\n\r\n";
    const cut = a.length - 3; // mid-CRLF
    const whole = a + b;
    expect(await parseSseAnswer(streamOf([whole.slice(0, cut), whole.slice(cut)])))
      .toBe("leftright");
  });

  it("reassembles a multi-byte UTF-8 character split across a chunk boundary", async () => {
    // TextDecoder must be used in streaming mode, or the split codepoint
    // decodes to a replacement character and the Arabic answer is corrupted.
    const whole = frame("مبنى فندقي") + "data: [DONE]\n\n";
    const bytes = new TextEncoder().encode(whole);
    // Cut inside the first Arabic character's byte sequence.
    const cut = whole.indexOf("م") + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    expect(await parseSseAnswer(stream)).toBe("مبنى فندقي");
  });

  it("stops at a [DONE] that arrives mid-buffer with more frames behind it", async () => {
    const chunk = frame("kept") + "data: [DONE]\n\n" + frame("DISCARDED");
    expect(await parseSseAnswer(streamOf([chunk]))).toBe("kept");
  });

  it("flushes a trailing frame when the stream ends without [DONE]", async () => {
    // No trailing newline: the last frame sits in the buffer and is only
    // scored if the post-loop flush processes it.
    const raw = frame("first") +
      `data: ${JSON.stringify({ choices: [{ delta: { content: "last" } }] })}`;
    expect(await parseSseAnswer(streamOf([raw]))).toBe("firstlast");
  });

  it("returns empty string for an empty stream", async () => {
    expect(await parseSseAnswer(streamOf([]))).toBe("");
  });

  it("agrees with assembleSseText on the same body", async () => {
    const raw = frame("a") + frame("") + frame("ب") + "data: [DONE]\n\n";
    expect(await parseSseAnswer(streamOf([raw]))).toBe(assembleSseText(raw));
  });
});

describe("parseSseAnswer — resource handling", () => {
  it("cancels the underlying stream when it stops early at [DONE]", async () => {
    // The response body is not exhausted at [DONE] — abandoning it half-read
    // leaks the connection, and the benchmark opens one per question per mode.
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(frame("done") + "data: [DONE]\n\n"));
        // Deliberately left open: only a cancel() can settle this stream.
      },
      cancel() {
        cancelled = true;
      },
    });
    expect(await parseSseAnswer(stream)).toBe("done");
    expect(cancelled).toBe(true);
  });
});
