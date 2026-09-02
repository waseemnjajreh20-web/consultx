/**
 * synthetic-probe/logic.ts — pure helpers for the synthetic-probe edge
 * function. No Deno APIs, no I/O, no external deps, so this file is
 * imported directly by src/__tests__/syntheticProbe.test.ts under vitest AND
 * by index.ts under Deno — the same pure-module pattern
 * supabase/functions/fire-safety-chat/queryAnalysis.ts and evals/lib/sse.ts
 * use (see those files' headers).
 *
 * Covers four independent concerns, kept in one file because index.ts is the
 * only consumer and they are all small:
 *   1. SSE parsing — mirrors fire-safety-chat's own wire format (OpenAI-style
 *      content deltas, `thinking_status` / `sources` / `error` event objects,
 *      `[DONE]`) and evals/lib/sse.ts's line-splitting technique.
 *   2. Percentile + aggregate stats over a window of perf_events rows.
 *   3. SLO breach evaluation and the consecutive-breach/alert/recovery state
 *      machine (2 consecutive breaches to alert, cleared on first recovery).
 *   4. Arabic alert-email text builders.
 *
 * Field shapes cross-checked 2026-09-03 against:
 *   - the live SSE event shapes emitted by fire-safety-chat/index.ts
 *     (`{type:"sources", files, engine, retrievalFallback, timing}`,
 *     `{type:"thinking_status", message}`, `{type:"error", error, error_code}`,
 *     `{choices:[{delta:{content}}]}`, `data: [DONE]`)
 *   - the reference probe script used to measure these marks live
 *     (ttfb_probe.mjs: headers / firstThinking / firstDelta / done marks)
 */

// ============================================================
// 1. SSE parsing
// ============================================================

export interface SseMarks {
  firstStatusMs: number | null;
  firstTextMs: number | null;
  doneMs: number | null;
  chars: number;
  sourcesCount: number | null;
  engine: string | null;
  fallbackReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sourcesTiming: string | null;
}

export function createInitialMarks(): SseMarks {
  return {
    firstStatusMs: null,
    firstTextMs: null,
    doneMs: null,
    chars: 0,
    sourcesCount: null,
    engine: null,
    fallbackReason: null,
    errorCode: null,
    errorMessage: null,
    sourcesTiming: null,
  };
}

const DATA_PREFIX = "data:";
const DONE_MARKER = "[DONE]";

/**
 * Splits accumulated SSE text on all three line terminators the spec allows
 * (CRLF, LF, lone CR — see evals/lib/sse.ts's splitLines for why the lone-CR
 * case matters), returning the complete lines and the trailing partial line
 * to prepend to the next chunk. A "data: ..." frame can arrive split across
 * two network reads, so callers must carry `remainder` forward rather than
 * parsing each chunk in isolation.
 */
export function splitCompleteLines(buffer: string): { complete: string[]; remainder: string } {
  const parts = buffer.split(/\r\n|\r|\n/);
  const remainder = parts.pop() ?? "";
  return { complete: parts, remainder };
}

/**
 * Extracts the "data:" payload from one raw SSE line, trimmed. Returns null
 * for blank lines or any line that isn't a data field — callers treat null
 * as "nothing to apply", never as an error.
 */
export function extractDataPayload(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(DATA_PREFIX)) return null;
  return trimmed.slice(DATA_PREFIX.length).trim();
}

/**
 * Applies one decoded "data:" payload (already stripped of the "data:"
 * prefix) to the running marks at `elapsedMs` since the request started.
 * Returns a new marks object; never mutates or throws — a malformed or
 * unrecognised payload is ignored, matching fire-safety-chat's own tolerance
 * for partial/garbled frames on its Gemini-facing leg.
 */
export function applySsePayload(marks: SseMarks, payload: string, elapsedMs: number): SseMarks {
  if (payload === DONE_MARKER) {
    return marks.doneMs === null ? { ...marks, doneMs: elapsedMs } : marks;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return marks;
  }
  if (!parsed || typeof parsed !== "object") return marks;
  const p = parsed as Record<string, unknown>;

  if (p.type === "thinking_status") {
    return marks.firstStatusMs === null ? { ...marks, firstStatusMs: elapsedMs } : marks;
  }

  if (p.type === "sources") {
    const files = Array.isArray(p.files) ? p.files : null;
    return {
      ...marks,
      sourcesCount: files ? files.length : marks.sourcesCount,
      engine: typeof p.engine === "string" ? p.engine : marks.engine,
      fallbackReason: typeof p.retrievalFallback === "string" ? p.retrievalFallback : marks.fallbackReason,
      sourcesTiming: typeof p.timing === "string" ? p.timing : marks.sourcesTiming,
    };
  }

  if (p.type === "error") {
    return {
      ...marks,
      errorCode: typeof p.error_code === "string" ? p.error_code : "UNKNOWN_ERROR",
      errorMessage: typeof p.error === "string" ? p.error : marks.errorMessage,
    };
  }

  const choices = p.choices as Array<{ delta?: { content?: unknown } }> | undefined;
  const content = choices?.[0]?.delta?.content;
  if (typeof content === "string" && content.length > 0) {
    return {
      ...marks,
      chars: marks.chars + content.length,
      firstTextMs: marks.firstTextMs === null ? elapsedMs : marks.firstTextMs,
    };
  }

  return marks;
}

/** Applies every "data:" line in one already-split batch (one network chunk's worth) at a shared elapsed-ms timestamp. */
export function reduceSseChunk(marks: SseMarks, lines: string[], elapsedMs: number): SseMarks {
  let next = marks;
  for (const line of lines) {
    const payload = extractDataPayload(line);
    if (payload !== null) next = applySsePayload(next, payload, elapsedMs);
  }
  return next;
}

// ============================================================
// timingSafeEqual — constant-time token comparison (mirrors
// ingest-sbc-2024/index.ts's helper of the same name; kept here so it is
// unit-tested rather than trusted by inspection).
// ============================================================
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// ============================================================
// buildPerfEventRow — turns one probe run's raw outcome into the exact row
// shape docs/db/20260903_perf_events.sql expects. Centralises the "ok" rule
// ("true only if content>0 and no error") so index.ts stays thin.
// ============================================================

export interface ProbeRunOutcome {
  mode: string;
  region: string;
  questionIndex: number;
  /** null only when the fetch itself never produced a response (network error or hard timeout). */
  httpStatus: number | null;
  headersMs: number | null;
  marks: SseMarks;
  xTimingHeader: string | null;
  timedOut: boolean;
  fetchErrorMessage: string | null;
}

export interface PerfEventInsertRow {
  source: "synthetic";
  mode: string;
  region: string;
  headers_ms: number | null;
  first_status_ms: number | null;
  first_text_ms: number | null;
  done_ms: number | null;
  chars: number;
  sources_count: number | null;
  engine: string | null;
  fallback_reason: string | null;
  error_code: string | null;
  ok: boolean;
  extra: Record<string, unknown>;
}

export function buildPerfEventRow(outcome: ProbeRunOutcome): PerfEventInsertRow {
  const base = {
    source: "synthetic" as const,
    mode: outcome.mode,
    region: outcome.region,
  };

  // Fetch-level failure: no response was ever received (timeout or network error).
  if (outcome.httpStatus === null) {
    return {
      ...base,
      headers_ms: null,
      first_status_ms: null,
      first_text_ms: null,
      done_ms: outcome.marks.doneMs,
      chars: 0,
      sources_count: null,
      engine: null,
      fallback_reason: null,
      error_code: outcome.timedOut ? "TIMEOUT" : "FETCH_ERROR",
      ok: false,
      extra: {
        question_index: outcome.questionIndex,
        fetch_error: outcome.fetchErrorMessage,
        timed_out: outcome.timedOut,
      },
    };
  }

  // HTTP-level failure: a response arrived but was not 2xx (headers only, no stream to read).
  if (outcome.httpStatus < 200 || outcome.httpStatus >= 300) {
    return {
      ...base,
      headers_ms: outcome.headersMs,
      first_status_ms: null,
      first_text_ms: null,
      done_ms: outcome.headersMs,
      chars: 0,
      sources_count: null,
      engine: null,
      fallback_reason: null,
      error_code: `HTTP_${outcome.httpStatus}`,
      ok: false,
      extra: {
        question_index: outcome.questionIndex,
        x_timing: outcome.xTimingHeader,
      },
    };
  }

  // 2xx: judge success from the stream itself. A hard timeout mid-stream
  // overrides any partially-parsed error_code so the row always reflects why
  // the run really ended.
  const m = outcome.marks;
  const errorCode = outcome.timedOut ? "TIMEOUT" : m.errorCode;
  const ok = m.chars > 0 && errorCode === null;

  return {
    ...base,
    headers_ms: outcome.headersMs,
    first_status_ms: m.firstStatusMs,
    first_text_ms: m.firstTextMs,
    done_ms: m.doneMs,
    chars: m.chars,
    sources_count: m.sourcesCount,
    engine: m.engine,
    fallback_reason: m.fallbackReason,
    error_code: errorCode,
    ok,
    extra: {
      question_index: outcome.questionIndex,
      x_timing: outcome.xTimingHeader,
      sources_timing: m.sourcesTiming,
      error_message: m.errorMessage,
      timed_out: outcome.timedOut,
    },
  };
}

// ============================================================
// Question rotation — a different fixed question each run so a per-question
// response cache (if one exists anywhere in the stack) cannot make a
// regression look fast forever.
// ============================================================

export const PROBE_QUESTIONS: readonly string[] = [
  "ما متطلبات تركيب مرشات الإطفاء التلقائية في مبنى سكني من ستة طوابق؟",
  "ما الحد الأقصى المسموح به لمسافة الإخلاء (travel distance) في مبنى مكاتب؟",
  "ما تصنيف مقاومة الحريق (fire-resistance rating) المطلوب لجدار ممر داخل مبنى؟",
];

/** Advances the rotation index by one, wrapping. `previous` is whatever was last persisted in probe_state (null on first-ever run or a corrupt/missing value). */
export function nextQuestionIndex(previous: number | null): number {
  const n = PROBE_QUESTIONS.length;
  const base = typeof previous === "number" && Number.isFinite(previous) ? Math.trunc(previous) : -1;
  return (((base + 1) % n) + n) % n;
}

// ============================================================
// 2. Percentiles + window aggregation
// ============================================================

/**
 * Nearest-rank percentile (no interpolation) over a numeric array; sorts a
 * copy, never mutates the input. Returns null for an empty array — an empty
 * window has no percentile, which is a distinct fact from "0ms".
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}

export interface PerfEventRowForStats {
  first_status_ms: number | null;
  first_text_ms: number | null;
  done_ms: number | null;
  chars: number;
  ok: boolean;
  error_code: string | null;
}

export interface AggregatedStats {
  count: number;
  p50FirstStatusMs: number | null;
  p95FirstStatusMs: number | null;
  p50FirstTextMs: number | null;
  p95FirstTextMs: number | null;
  p50DoneMs: number | null;
  p95DoneMs: number | null;
  /** null when count === 0 — "no data" is distinct from "0% ok". */
  okRate: number | null;
  /** Count of rows that completed with zero content and no explicit error — a silent failure distinct from ok=false in general. */
  emptyStreams: number;
}

export function aggregateStats(rows: PerfEventRowForStats[]): AggregatedStats {
  const firstStatus = rows.map((r) => r.first_status_ms).filter((v): v is number => v !== null);
  const firstText = rows.map((r) => r.first_text_ms).filter((v): v is number => v !== null);
  const done = rows.map((r) => r.done_ms).filter((v): v is number => v !== null);
  const okCount = rows.filter((r) => r.ok).length;
  const emptyStreams = rows.filter((r) => r.chars === 0 && r.error_code === null).length;

  return {
    count: rows.length,
    p50FirstStatusMs: percentile(firstStatus, 50),
    p95FirstStatusMs: percentile(firstStatus, 95),
    p50FirstTextMs: percentile(firstText, 50),
    p95FirstTextMs: percentile(firstText, 95),
    p50DoneMs: percentile(done, 50),
    p95DoneMs: percentile(done, 95),
    okRate: rows.length > 0 ? okCount / rows.length : null,
    emptyStreams,
  };
}

// ============================================================
// 3. SLO breach evaluation + consecutive-breach state machine
// ============================================================

export interface SloTarget {
  key: string;
  /** 'all' | 'primary' | 'standard' | 'analysis' — scope resolution (which stats to pass in) is the caller's job; this module stays pure. */
  mode: string;
  metric: "first_status_ms" | "first_text_ms" | "ok_rate" | "empty_streams" | string;
  threshold: number;
  comparator: "<=" | ">=" | "=" | "<" | ">" | string;
  window_minutes: number;
}

/** True when `observed` SATISFIES the comparator against `threshold` (i.e. NOT breached). An unrecognised comparator fails open — a typo'd row must never manufacture a phantom page. */
export function compareValue(observed: number, comparator: string, threshold: number): boolean {
  switch (comparator) {
    case "<=":
      return observed <= threshold;
    case ">=":
      return observed >= threshold;
    case "=":
      return observed === threshold;
    case "<":
      return observed < threshold;
    case ">":
      return observed > threshold;
    default:
      return true;
  }
}

function metricValue(target: SloTarget, stats: AggregatedStats): number | null {
  switch (target.metric) {
    case "first_status_ms":
      return stats.p95FirstStatusMs;
    case "first_text_ms":
      return stats.p95FirstTextMs;
    case "ok_rate":
      return stats.okRate;
    case "empty_streams":
      return stats.emptyStreams;
    default:
      return null;
  }
}

export interface TargetEvaluation {
  breached: boolean;
  observed: number | null;
}

/**
 * Evaluates one slo_targets row against the aggregated stats for its scope.
 * `stats` must already be correctly scoped by the caller (all-modes-combined
 * for a target.mode === 'all' row, single-mode otherwise). A metric with no
 * data yet (observed === null, e.g. an empty window) is never breached — an
 * empty window is "unknown", not "broken".
 */
export function evaluateTarget(target: SloTarget, stats: AggregatedStats): TargetEvaluation {
  const observed = metricValue(target, stats);
  if (observed === null) return { breached: false, observed: null };
  return { breached: !compareValue(observed, target.comparator, target.threshold), observed };
}

/** True (breached) for any concrete non-200 status. A null status (no net._http_response row visible yet — e.g. brand new project, or the shared-table caveat documented in the runbook) is "unknown", not "broken", and never breaches. */
export function isCronStatusBreached(statusCode: number | null): boolean {
  return statusCode !== null && statusCode !== 200;
}

export interface BreachState {
  count: number;
  shouldAlert: boolean;
  shouldRecover: boolean;
}

/**
 * Pure state transition for "alert on N consecutive breaches, one email per
 * incident, one recovery email when it clears". `previousCount` is read from
 * probe_state before the call; the returned `count` is what the caller
 * writes back.
 *
 * `shouldAlert` fires exactly once per incident — the run where the counter
 * reaches `threshold` — never again on subsequent still-breached runs, so a
 * target stuck in breach for hours does not re-page every 15 minutes.
 * `shouldRecover` fires exactly once, on the first non-breached run after an
 * alert was actually sent (previousCount >= threshold) — a target that only
 * ever reached 1 consecutive breach recovers silently, matching that no
 * alert was ever sent for it either.
 */
export function nextBreachState(previousCount: number, breachedNow: boolean, threshold = 2): BreachState {
  if (breachedNow) {
    const count = previousCount + 1;
    return { count, shouldAlert: count === threshold, shouldRecover: false };
  }
  return { count: 0, shouldAlert: false, shouldRecover: previousCount >= threshold };
}

// ============================================================
// 4. Alert email text builders (Arabic body per the operating contract)
// ============================================================

const METRIC_LABELS_AR: Record<string, string> = {
  first_status_ms: "زمن أول استجابة (بداية التفكير)",
  first_text_ms: "زمن أول نص من الإجابة",
  ok_rate: "نسبة الطلبات الناجحة",
  empty_streams: "عدد الردود الفارغة تماماً",
};

const MODE_LABELS_AR: Record<string, string> = {
  all: "كل الأوضاع",
  primary: "الوضع الرئيسي",
  standard: "الوضع الاستشاري",
  analysis: "الوضع التحليلي",
};

function formatObserved(metric: string, value: number): string {
  if (metric === "ok_rate") return `${(value * 100).toFixed(1)}%`;
  if (metric === "empty_streams") return String(value);
  return `${(value / 1000).toFixed(1)} ثانية`;
}

function formatComparator(comparator: string): string {
  switch (comparator) {
    case "<=":
      return "لا يتجاوز";
    case ">=":
      return "لا يقل عن";
    case "=":
      return "يساوي";
    case "<":
      return "أقل من";
    case ">":
      return "أكبر من";
    default:
      return comparator;
  }
}

function emailShell(titleColor: string, title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>ConsultX</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px 16px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
  <p style="color:#6b7280;font-size:13px;margin:0 0 8px">ConsultX &middot; مراقبة الأداء التلقائية</p>
  <h1 style="color:${titleColor};font-size:18px;margin:0 0 16px;font-weight:700">${title}</h1>
  ${bodyHtml}
  <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#9ca3af;font-size:12px;margin:0">تحقّق عبر لوحة /admin/health، أو راجع docs/launch/synthetic-probe-runbook.md.</p>
</div></body></html>`;
}

export interface TargetAlertInfo {
  target: SloTarget;
  observed: number;
  /** ISO timestamp of the run where the breach was confirmed (the 2nd consecutive breach). */
  sinceIso: string;
}

function impactSentence(metric: string): string {
  if (metric === "empty_streams") return "بعض المستخدمين يحصلون على إجابة فارغة تماماً — كأن التطبيق لم يرد على سؤالهم.";
  if (metric === "ok_rate") return "نسبة ملحوظة من طلبات المستخدمين تفشل ولا تصل إلى إجابة.";
  return "المستخدمون ينتظرون وقتاً أطول من المعتاد قبل ظهور أول رد من المساعد.";
}

export function buildTargetBreachEmail(info: TargetAlertInfo): { subject: string; html: string } {
  const { target, observed, sinceIso } = info;
  const metricLabel = METRIC_LABELS_AR[target.metric] ?? target.metric;
  const modeLabel = MODE_LABELS_AR[target.mode] ?? target.mode;
  const since = new Date(sinceIso).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
  const subject = `[ConsultX] تنبيه أداء: ${metricLabel} — ${modeLabel}`;
  const body = `
  <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151">
    <tr><td style="padding:6px 0;color:#6b7280;width:150px">الوضع</td><td style="padding:6px 0">${modeLabel}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">القيمة المرصودة</td><td style="padding:6px 0">${formatObserved(target.metric, observed)}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">الحد المسموح</td><td style="padding:6px 0">${formatComparator(target.comparator)} ${formatObserved(target.metric, target.threshold)}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">مستمر منذ</td><td style="padding:6px 0">${since}</td></tr>
  </table>
  <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#374151;font-size:14px;line-height:1.7;margin:0">${impactSentence(target.metric)}</p>`;
  return { subject, html: emailShell("#b91c1c", `تجاوز حد الأداء: ${metricLabel}`, body) };
}

export function buildTargetRecoveryEmail(info: { target: SloTarget }): { subject: string; html: string } {
  const { target } = info;
  const metricLabel = METRIC_LABELS_AR[target.metric] ?? target.metric;
  const modeLabel = MODE_LABELS_AR[target.mode] ?? target.mode;
  const subject = `[ConsultX] عودة الأداء للطبيعي: ${metricLabel} — ${modeLabel}`;
  const body = `<p style="color:#374151;font-size:14px;line-height:1.7;margin:0">
    عاد المقياس "<strong>${metricLabel}</strong>" (${modeLabel}) إلى ضمن الحد المسموح في آخر تشغيل للمراقبة التلقائية.
  </p>`;
  return { subject, html: emailShell("#15803d", "عودة الأداء للطبيعي", body) };
}

export function buildCronBreachEmail(statusCode: number | null): { subject: string; html: string } {
  const subject = "[ConsultX] تنبيه: مهمة المراقبة المجدولة (cron) لا تعمل بشكل صحيح";
  const body = `
  <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151">
    <tr><td style="padding:6px 0;color:#6b7280;width:150px">آخر رمز حالة</td><td style="padding:6px 0">${statusCode ?? "—"}</td></tr>
  </table>
  <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#374151;font-size:14px;line-height:1.7;margin:0">
    آخر استدعاء مجدول (pg_cron) لدالة synthetic-probe لم يُرجع الحالة 200 لمرتين متتاليتين. المراقبة التلقائية نفسها قد تكون متوقفة — راجع سجلات الدالة وحالة الجدولة قبل افتراض أن الدردشة نفسها سليمة.
  </p>`;
  return { subject, html: emailShell("#b91c1c", "عطل في مهمة المراقبة المجدولة", body) };
}

export function buildCronRecoveryEmail(): { subject: string; html: string } {
  const subject = "[ConsultX] عودة مهمة المراقبة المجدولة (cron) للعمل الطبيعي";
  const body = `<p style="color:#374151;font-size:14px;line-height:1.7;margin:0">
    عاد آخر استدعاء مجدول لدالة synthetic-probe إلى إرجاع الحالة 200.
  </p>`;
  return { subject, html: emailShell("#15803d", "عودة المراقبة المجدولة للعمل", body) };
}

/** The monitoring pipeline itself failed (e.g. could not mint the smoke-account session) for 2 consecutive runs — distinct from a chat-quality breach: this means the probe could not even ask its question. */
export function buildProbeErrorEmail(message: string): { subject: string; html: string } {
  const subject = "[ConsultX] تنبيه: فحص الأداء التلقائي نفسه متعطل";
  const body = `<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px">
    فشل فحص الأداء التلقائي (synthetic-probe) في تشغيل نفسه لمرتين متتاليتين قبل حتى الوصول إلى الدردشة — على الأرجح مشكلة في حساب الفحص التجريبي أو في مفاتيح الخدمة.
  </p>
  <p style="color:#374151;font-size:13px;line-height:1.6;margin:0;font-family:monospace;background:#f9fafb;padding:10px;border-radius:6px">${message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))}</p>`;
  return { subject, html: emailShell("#b91c1c", "فحص الأداء التلقائي متعطل", body) };
}

export function buildProbeRecoveryEmail(): { subject: string; html: string } {
  const subject = "[ConsultX] عودة فحص الأداء التلقائي للعمل";
  const body = `<p style="color:#374151;font-size:14px;line-height:1.7;margin:0">
    عاد فحص الأداء التلقائي (synthetic-probe) إلى العمل الطبيعي وتمكّن من تسجيل الدخول بحساب الفحص التجريبي بنجاح.
  </p>`;
  return { subject, html: emailShell("#15803d", "عودة فحص الأداء التلقائي", body) };
}
