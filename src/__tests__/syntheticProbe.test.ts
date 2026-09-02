/**
 * Tests for supabase/functions/synthetic-probe/logic.ts.
 *
 * logic.ts is pure (no Deno APIs, no I/O) and is imported and executed
 * directly here — the same pattern queryAnalysis.test.ts and
 * evalSse.test.ts use for their sibling modules (see those files' headers).
 * This proves the module's own logic; it does NOT prove anything about how
 * index.ts wires it to a live fire-safety-chat call or a live Resend send.
 */
import { describe, it, expect } from "vitest";
import {
  aggregateStats,
  applySsePayload,
  buildCronBreachEmail,
  buildCronRecoveryEmail,
  buildPerfEventRow,
  buildProbeErrorEmail,
  buildTargetBreachEmail,
  buildTargetRecoveryEmail,
  compareValue,
  createInitialMarks,
  evaluateTarget,
  extractDataPayload,
  isCronStatusBreached,
  nextBreachState,
  nextQuestionIndex,
  percentile,
  PROBE_QUESTIONS,
  reduceSseChunk,
  splitCompleteLines,
  timingSafeEqual,
  type PerfEventRowForStats,
  type SloTarget,
  type SseMarks,
} from "../../supabase/functions/synthetic-probe/logic.ts";

// ============================================================
// SSE parsing
// ============================================================

describe("splitCompleteLines", () => {
  it("splits LF-delimited lines and retains the trailing partial line", () => {
    const { complete, remainder } = splitCompleteLines("data: a\ndata: b\ndata: c-partial");
    expect(complete).toEqual(["data: a", "data: b"]);
    expect(remainder).toBe("data: c-partial");
  });

  it("splits CRLF-delimited lines", () => {
    const { complete, remainder } = splitCompleteLines("data: a\r\ndata: b\r\n");
    expect(complete).toEqual(["data: a", "data: b"]);
    expect(remainder).toBe("");
  });

  it("splits lone-CR-delimited lines (the third SSE terminator)", () => {
    const { complete } = splitCompleteLines("data: a\rdata: b\r");
    expect(complete).toEqual(["data: a", "data: b"]);
  });

  it("returns the whole buffer as remainder when no terminator is present yet", () => {
    const { complete, remainder } = splitCompleteLines("data: still-buffering");
    expect(complete).toEqual([]);
    expect(remainder).toBe("data: still-buffering");
  });

  it("a chunk boundary mid-frame is recovered once the rest arrives", () => {
    // Simulates two network reads: first half has no newline yet.
    const first = splitCompleteLines('data: {"choices":[{"delta":{"content":"مب');
    expect(first.complete).toEqual([]);
    const second = splitCompleteLines(first.remainder + 'نى"}}]}\n');
    expect(second.complete).toEqual(['data: {"choices":[{"delta":{"content":"مبنى"}}]}']);
  });
});

describe("extractDataPayload", () => {
  it("extracts and trims the payload after 'data:'", () => {
    expect(extractDataPayload('data: {"a":1}')).toBe('{"a":1}');
  });

  it("returns null for a blank line", () => {
    expect(extractDataPayload("")).toBeNull();
  });

  it("returns null for a non-data line", () => {
    expect(extractDataPayload("event: ping")).toBeNull();
  });
});

describe("applySsePayload — event detection", () => {
  it("detects [DONE] and sets doneMs once, ignoring a later duplicate", () => {
    let marks = createInitialMarks();
    marks = applySsePayload(marks, "[DONE]", 500);
    expect(marks.doneMs).toBe(500);
    marks = applySsePayload(marks, "[DONE]", 900);
    expect(marks.doneMs).toBe(500); // first one wins
  });

  it("sets firstStatusMs on the first thinking_status event only", () => {
    let marks = createInitialMarks();
    marks = applySsePayload(marks, JSON.stringify({ type: "thinking_status", message: "جاري البحث" }), 120);
    expect(marks.firstStatusMs).toBe(120);
    marks = applySsePayload(marks, JSON.stringify({ type: "thinking_status", message: "still going" }), 300);
    expect(marks.firstStatusMs).toBe(120); // unchanged
  });

  it("captures the sources event fields (files/engine/retrievalFallback/timing)", () => {
    let marks = createInitialMarks();
    marks = applySsePayload(
      marks,
      JSON.stringify({
        type: "sources",
        files: ["SBC201_1.json", "SBC201_2.json"],
        engine: "vector",
        retrievalFallback: null,
        timing: "retrieval=+900ms,gemini_connect=+1200ms",
      }),
      950,
    );
    expect(marks.sourcesCount).toBe(2);
    expect(marks.engine).toBe("vector");
    expect(marks.fallbackReason).toBeNull();
    expect(marks.sourcesTiming).toBe("retrieval=+900ms,gemini_connect=+1200ms");
  });

  it("captures a non-null retrievalFallback reason", () => {
    let marks = createInitialMarks();
    marks = applySsePayload(
      marks,
      JSON.stringify({ type: "sources", files: [], engine: "keyword", retrievalFallback: "vector_empty", timing: "" }),
      100,
    );
    expect(marks.fallbackReason).toBe("vector_empty");
  });

  it("captures an error event's error_code and message", () => {
    let marks = createInitialMarks();
    marks = applySsePayload(marks, JSON.stringify({ type: "error", error: "Service error occurred", error_code: "PIPELINE_ERROR" }), 2000);
    expect(marks.errorCode).toBe("PIPELINE_ERROR");
    expect(marks.errorMessage).toBe("Service error occurred");
  });

  it("falls back to UNKNOWN_ERROR when an error event omits error_code", () => {
    let marks = createInitialMarks();
    marks = applySsePayload(marks, JSON.stringify({ type: "error", error: "x" }), 10);
    expect(marks.errorCode).toBe("UNKNOWN_ERROR");
  });

  it("accumulates OpenAI-style content deltas and sets firstTextMs once", () => {
    let marks = createInitialMarks();
    marks = applySsePayload(marks, JSON.stringify({ choices: [{ delta: { content: "الحد " } }] }), 1500);
    marks = applySsePayload(marks, JSON.stringify({ choices: [{ delta: { content: "الأدنى" } }] }), 1600);
    expect(marks.chars).toBe("الحد ".length + "الأدنى".length);
    expect(marks.firstTextMs).toBe(1500);
  });

  it("ignores an empty-string content delta (does not mark firstTextMs)", () => {
    let marks = createInitialMarks();
    marks = applySsePayload(marks, JSON.stringify({ choices: [{ delta: { content: "" } }] }), 1500);
    expect(marks.chars).toBe(0);
    expect(marks.firstTextMs).toBeNull();
  });

  it("ignores malformed JSON without throwing", () => {
    const marks = createInitialMarks();
    expect(() => applySsePayload(marks, "{not json", 10)).not.toThrow();
    expect(applySsePayload(marks, "{not json", 10)).toEqual(marks);
  });

  it("ignores an unrecognised object shape without throwing", () => {
    const marks = createInitialMarks();
    const next = applySsePayload(marks, JSON.stringify({ foo: "bar" }), 10);
    expect(next).toEqual(marks);
  });
});

describe("reduceSseChunk — a full frame sequence", () => {
  it("processes a realistic run: thinking_status, sources, deltas, [DONE]", () => {
    const lines = [
      'data: {"type":"thinking_status","message":"جاري البحث"}',
      'data: {"type":"sources","files":["a.json"],"engine":"vector","retrievalFallback":null,"timing":"retrieval=+800ms"}',
      'data: {"choices":[{"delta":{"content":"مرحباً"}}]}',
      "",
      "data: [DONE]",
    ];
    let marks = createInitialMarks();
    marks = reduceSseChunk(marks, lines, 1800);
    expect(marks.firstStatusMs).toBe(1800);
    expect(marks.sourcesCount).toBe(1);
    expect(marks.engine).toBe("vector");
    expect(marks.chars).toBe("مرحباً".length);
    expect(marks.firstTextMs).toBe(1800);
    expect(marks.doneMs).toBe(1800);
  });

  it("an error event mid-stream is captured alongside any content already received", () => {
    const lines = [
      'data: {"choices":[{"delta":{"content":"جزء"}}]}',
      'data: {"type":"error","error":"AI provider is busy","error_code":"GEMINI_RATE_LIMIT"}',
    ];
    const marks = reduceSseChunk(createInitialMarks(), lines, 500);
    expect(marks.chars).toBeGreaterThan(0);
    expect(marks.errorCode).toBe("GEMINI_RATE_LIMIT");
  });
});

// ============================================================
// timingSafeEqual
// ============================================================

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("secret-token", "secret-token")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqual("secret-token", "secret-tokeX")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeEqual("short", "much-longer-value")).toBe(false);
  });

  it("returns false against an empty string", () => {
    expect(timingSafeEqual("", "nonempty")).toBe(false);
  });

  it("two empty strings are equal", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

// ============================================================
// buildPerfEventRow
// ============================================================

describe("buildPerfEventRow", () => {
  const baseOutcome = {
    mode: "primary",
    region: "ap-southeast-2",
    questionIndex: 0,
    xTimingHeader: "headers_out=+120ms",
    timedOut: false,
    fetchErrorMessage: null as string | null,
  };

  it("marks ok=true when content>0 and no error", () => {
    const marks: SseMarks = { ...createInitialMarks(), chars: 42, firstStatusMs: 100, firstTextMs: 400, doneMs: 3000, sourcesCount: 3, engine: "vector" };
    const row = buildPerfEventRow({ ...baseOutcome, httpStatus: 200, headersMs: 90, marks });
    expect(row.ok).toBe(true);
    expect(row.error_code).toBeNull();
    expect(row.chars).toBe(42);
    expect(row.sources_count).toBe(3);
    expect(row.engine).toBe("vector");
  });

  it("marks ok=false when chars=0 even with no explicit error (silent empty stream)", () => {
    const marks: SseMarks = { ...createInitialMarks(), doneMs: 3000 };
    const row = buildPerfEventRow({ ...baseOutcome, httpStatus: 200, headersMs: 90, marks });
    expect(row.ok).toBe(false);
    expect(row.error_code).toBeNull();
    expect(row.chars).toBe(0);
  });

  it("marks ok=false when an in-stream error event fired, even with partial content", () => {
    const marks: SseMarks = { ...createInitialMarks(), chars: 10, errorCode: "GEMINI_RATE_LIMIT", doneMs: 2000 };
    const row = buildPerfEventRow({ ...baseOutcome, httpStatus: 200, headersMs: 90, marks });
    expect(row.ok).toBe(false);
    expect(row.error_code).toBe("GEMINI_RATE_LIMIT");
  });

  it("a hard timeout overrides any partially-parsed error_code", () => {
    const marks: SseMarks = { ...createInitialMarks(), chars: 5, doneMs: 150_000 };
    const row = buildPerfEventRow({ ...baseOutcome, httpStatus: 200, headersMs: 90, marks, timedOut: true });
    expect(row.error_code).toBe("TIMEOUT");
    expect(row.ok).toBe(false);
  });

  it("a non-2xx HTTP status produces an HTTP_<status> row with no stream fields", () => {
    const row = buildPerfEventRow({ ...baseOutcome, httpStatus: 401, headersMs: 80, marks: createInitialMarks() });
    expect(row.error_code).toBe("HTTP_401");
    expect(row.ok).toBe(false);
    expect(row.first_status_ms).toBeNull();
    expect(row.done_ms).toBe(80);
  });

  it("httpStatus=null (fetch never returned) produces FETCH_ERROR when not timed out", () => {
    const row = buildPerfEventRow({
      ...baseOutcome,
      httpStatus: null,
      headersMs: null,
      marks: createInitialMarks(),
      fetchErrorMessage: "network unreachable",
    });
    expect(row.error_code).toBe("FETCH_ERROR");
    expect(row.headers_ms).toBeNull();
    expect(row.ok).toBe(false);
  });

  it("httpStatus=null with timedOut=true produces TIMEOUT", () => {
    const row = buildPerfEventRow({ ...baseOutcome, httpStatus: null, headersMs: null, marks: createInitialMarks(), timedOut: true });
    expect(row.error_code).toBe("TIMEOUT");
  });

  it("always tags the row source='synthetic' and carries mode/region through", () => {
    const row = buildPerfEventRow({ ...baseOutcome, mode: "analysis", httpStatus: 200, headersMs: 50, marks: { ...createInitialMarks(), chars: 1 } });
    expect(row.source).toBe("synthetic");
    expect(row.mode).toBe("analysis");
    expect(row.region).toBe("ap-southeast-2");
  });
});

// ============================================================
// Question rotation
// ============================================================

describe("nextQuestionIndex", () => {
  it("starts at 0 when there is no prior state", () => {
    expect(nextQuestionIndex(null)).toBe(0);
  });

  it("advances by one each call", () => {
    expect(nextQuestionIndex(0)).toBe(1);
    expect(nextQuestionIndex(1)).toBe(2);
  });

  it("wraps back to 0 after the last question", () => {
    expect(nextQuestionIndex(PROBE_QUESTIONS.length - 1)).toBe(0);
  });

  it("recovers from an out-of-range or corrupt previous value instead of throwing", () => {
    expect(() => nextQuestionIndex(999)).not.toThrow();
    expect(nextQuestionIndex(-5)).toBeGreaterThanOrEqual(0);
    expect(nextQuestionIndex(NaN)).toBe(0);
  });

  it("there are exactly 3 fixed questions", () => {
    expect(PROBE_QUESTIONS.length).toBe(3);
  });
});

// ============================================================
// Percentiles + aggregation
// ============================================================

describe("percentile", () => {
  it("returns null for an empty array", () => {
    expect(percentile([], 95)).toBeNull();
  });

  it("returns the single value for a 1-element array at any percentile", () => {
    expect(percentile([1000], 50)).toBe(1000);
    expect(percentile([1000], 95)).toBe(1000);
  });

  it("computes p50 and p95 on a known 10-element set", () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentile(values, 50)).toBe(500);
    expect(percentile(values, 95)).toBe(1000);
  });

  it("does not mutate the input array", () => {
    const values = [5, 3, 1, 4, 2];
    const copy = [...values];
    percentile(values, 50);
    expect(values).toEqual(copy);
  });
});

function statsRow(overrides: Partial<PerfEventRowForStats> = {}): PerfEventRowForStats {
  return { first_status_ms: 100, first_text_ms: 500, done_ms: 3000, chars: 50, ok: true, error_code: null, ...overrides };
}

describe("aggregateStats", () => {
  it("returns nulls and count=0 for an empty window", () => {
    const stats = aggregateStats([]);
    expect(stats.count).toBe(0);
    expect(stats.okRate).toBeNull();
    expect(stats.p95FirstStatusMs).toBeNull();
    expect(stats.emptyStreams).toBe(0);
  });

  it("computes okRate from the ok column", () => {
    const rows = [statsRow({ ok: true }), statsRow({ ok: true }), statsRow({ ok: false, chars: 0, error_code: "TIMEOUT" })];
    expect(aggregateStats(rows).okRate).toBeCloseTo(2 / 3);
  });

  it("counts empty streams as chars=0 AND error_code=null (excludes explicit errors)", () => {
    const rows = [
      statsRow({ chars: 0, error_code: null, ok: false }), // silent empty -> counted
      statsRow({ chars: 0, error_code: "TIMEOUT", ok: false }), // explicit error -> not counted
      statsRow({ chars: 10, error_code: null, ok: true }), // has content -> not counted
    ];
    expect(aggregateStats(rows).emptyStreams).toBe(1);
  });

  it("ignores null latency values when computing percentiles", () => {
    const rows = [statsRow({ first_status_ms: null }), statsRow({ first_status_ms: 200 }), statsRow({ first_status_ms: 400 })];
    const stats = aggregateStats(rows);
    expect(stats.p95FirstStatusMs).toBe(400);
  });
});

// ============================================================
// SLO breach evaluation
// ============================================================

describe("compareValue", () => {
  it("<= is satisfied at and below the threshold", () => {
    expect(compareValue(2000, "<=", 2000)).toBe(true);
    expect(compareValue(1999, "<=", 2000)).toBe(true);
    expect(compareValue(2001, "<=", 2000)).toBe(false);
  });

  it(">= is satisfied at and above the threshold", () => {
    expect(compareValue(0.99, ">=", 0.99)).toBe(true);
    expect(compareValue(0.98, ">=", 0.99)).toBe(false);
  });

  it("= is satisfied only at an exact match", () => {
    expect(compareValue(0, "=", 0)).toBe(true);
    expect(compareValue(1, "=", 0)).toBe(false);
  });

  it("an unrecognised comparator fails open (returns satisfied=true)", () => {
    expect(compareValue(999999, "???", 0)).toBe(true);
  });
});

function target(overrides: Partial<SloTarget> = {}): SloTarget {
  return { key: "t", mode: "all", metric: "first_status_ms", threshold: 2000, comparator: "<=", window_minutes: 1440, ...overrides };
}

describe("evaluateTarget", () => {
  it("not breached when the observed p95 is within threshold", () => {
    const stats = aggregateStats([statsRow({ first_status_ms: 1000 }), statsRow({ first_status_ms: 1500 })]);
    const result = evaluateTarget(target({ metric: "first_status_ms", threshold: 2000, comparator: "<=" }), stats);
    expect(result.breached).toBe(false);
  });

  it("breached when the observed p95 exceeds threshold", () => {
    const stats = aggregateStats([statsRow({ first_status_ms: 5000 }), statsRow({ first_status_ms: 6000 })]);
    const result = evaluateTarget(target({ metric: "first_status_ms", threshold: 2000, comparator: "<=" }), stats);
    expect(result.breached).toBe(true);
    expect(result.observed).toBe(6000);
  });

  it("an empty window (no data) is never breached", () => {
    const stats = aggregateStats([]);
    const result = evaluateTarget(target(), stats);
    expect(result.breached).toBe(false);
    expect(result.observed).toBeNull();
  });

  it("ok_rate metric reads from stats.okRate with >= comparator", () => {
    const stats = aggregateStats([statsRow({ ok: false, chars: 0, error_code: "TIMEOUT" }), statsRow({ ok: true })]);
    const result = evaluateTarget(target({ metric: "ok_rate", threshold: 0.99, comparator: ">=" }), stats);
    expect(result.breached).toBe(true); // 0.5 < 0.99
  });

  it("empty_streams metric reads the raw count with = comparator", () => {
    const stats = aggregateStats([statsRow({ chars: 0, error_code: null, ok: false })]);
    const result = evaluateTarget(target({ metric: "empty_streams", threshold: 0, comparator: "=" }), stats);
    expect(result.breached).toBe(true);
    expect(result.observed).toBe(1);
  });
});

describe("isCronStatusBreached", () => {
  it("200 is not breached", () => {
    expect(isCronStatusBreached(200)).toBe(false);
  });

  it("any other concrete status is breached", () => {
    expect(isCronStatusBreached(401)).toBe(true);
    expect(isCronStatusBreached(500)).toBe(true);
  });

  it("null (unknown) is not breached", () => {
    expect(isCronStatusBreached(null)).toBe(false);
  });
});

// ============================================================
// Consecutive-breach state machine
// ============================================================

describe("nextBreachState", () => {
  it("a single breach increments the counter but does not alert", () => {
    const state = nextBreachState(0, true);
    expect(state.count).toBe(1);
    expect(state.shouldAlert).toBe(false);
    expect(state.shouldRecover).toBe(false);
  });

  it("the second consecutive breach alerts exactly once", () => {
    const state = nextBreachState(1, true);
    expect(state.count).toBe(2);
    expect(state.shouldAlert).toBe(true);
  });

  it("a third and further consecutive breach does not re-alert", () => {
    const third = nextBreachState(2, true);
    expect(third.count).toBe(3);
    expect(third.shouldAlert).toBe(false);
    const fourth = nextBreachState(3, true);
    expect(fourth.shouldAlert).toBe(false);
  });

  it("recovering after an alert was sent (count >= threshold) fires shouldRecover once", () => {
    const state = nextBreachState(2, false);
    expect(state.count).toBe(0);
    expect(state.shouldRecover).toBe(true);
  });

  it("recovering after only 1 breach (never alerted) does not fire a recovery email", () => {
    const state = nextBreachState(1, false);
    expect(state.count).toBe(0);
    expect(state.shouldRecover).toBe(false);
  });

  it("staying clear (0 -> not breached) is a silent no-op", () => {
    const state = nextBreachState(0, false);
    expect(state.count).toBe(0);
    expect(state.shouldAlert).toBe(false);
    expect(state.shouldRecover).toBe(false);
  });

  it("respects a custom threshold", () => {
    // threshold=3: the first two consecutive breaches must not alert, the third must.
    expect(nextBreachState(0, true, 3)).toMatchObject({ count: 1, shouldAlert: false });
    expect(nextBreachState(1, true, 3)).toMatchObject({ count: 2, shouldAlert: false });
    expect(nextBreachState(2, true, 3)).toMatchObject({ count: 3, shouldAlert: true });
    expect(nextBreachState(3, true, 3)).toMatchObject({ count: 4, shouldAlert: false }); // already alerted at 3
  });
});

// ============================================================
// Alert email builders — smoke-test the Arabic copy carries the essentials
// (metric identity, mode, numbers), not exact wording.
// ============================================================

describe("buildTargetBreachEmail / buildTargetRecoveryEmail", () => {
  it("breach email names the mode and includes the observed + threshold values", () => {
    const { subject, html } = buildTargetBreachEmail({
      target: target({ mode: "primary", metric: "first_text_ms", threshold: 5000, comparator: "<=" }),
      observed: 7300,
      sinceIso: "2026-09-03T10:00:00.000Z",
    });
    expect(subject).toContain("ConsultX");
    expect(html).toContain("7.3"); // 7300ms -> 7.3 seconds
    expect(html).toContain("5.0"); // threshold
    expect(html).toContain("الوضع الرئيسي");
  });

  it("recovery email references the same metric/mode", () => {
    const { html } = buildTargetRecoveryEmail({ target: target({ mode: "standard", metric: "ok_rate" }) });
    expect(html).toContain("الوضع الاستشاري");
  });

  it("ok_rate is formatted as a percentage", () => {
    const { html } = buildTargetBreachEmail({
      target: target({ metric: "ok_rate", threshold: 0.99, comparator: ">=" }),
      observed: 0.87,
      sinceIso: "2026-09-03T10:00:00.000Z",
    });
    expect(html).toContain("87.0%");
  });

  it("never emits a raw section-sign character", () => {
    const { subject, html } = buildTargetBreachEmail({
      target: target(),
      observed: 3000,
      sinceIso: "2026-09-03T10:00:00.000Z",
    });
    expect(subject + html).not.toContain("§");
  });
});

describe("buildCronBreachEmail / buildCronRecoveryEmail", () => {
  it("breach email includes the observed status code", () => {
    const { html } = buildCronBreachEmail(401);
    expect(html).toContain("401");
  });

  it("handles a null status code without throwing", () => {
    expect(() => buildCronBreachEmail(null)).not.toThrow();
  });

  it("recovery email is distinct from the breach email", () => {
    const breach = buildCronBreachEmail(500);
    const recovery = buildCronRecoveryEmail();
    expect(breach.subject).not.toBe(recovery.subject);
  });
});

describe("buildProbeErrorEmail", () => {
  it("escapes HTML-significant characters from the error message", () => {
    const { html } = buildProbeErrorEmail('signin failed: <script>alert(1)</script> & "quoted"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
