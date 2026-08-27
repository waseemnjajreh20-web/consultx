#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write
/**
 * ConsultX Advisory Benchmark Runner — Phase P1 (eval harness repair)
 *
 * Dry-run by default: parses advisory_benchmark.jsonl, scores synthetic
 * placeholder answers, and writes a baseline report without calling the edge
 * function.
 *
 * Live mode: set CONSULTX_EVAL_LIVE=1 to call the deployed edge function.
 *
 * Required env vars for live mode:
 *   CONSULTX_EDGE_URL    — https://<ref>.supabase.co/functions/v1/fire-safety-chat
 *   CONSULTX_SERVICE_KEY — Supabase service-role JWT (never commit)
 *   SMOKE_USER_ID        — UUID of smoke_retrieval_test_042026@mailnull.com
 *
 * Mode coverage (Phase P1): every question in the JSONL is run against BOTH
 * mode "standard" and mode "analysis" (two result rows per question), plus a
 * fixed 2-question smoke check in mode "primary" that only asserts the
 * [SWITCH:...] escalation protocol never leaks malformed or bare into
 * displayed output — see runPrimarySmoke() below.
 *
 * Live mode reads the response as SSE via evals/lib/sse.ts (the shape
 * fire-safety-chat/index.ts actually streams — see its `transformStream`
 * around line 3065), with a JSON/plain-text fallback for any response that
 * isn't SSE. It also records the X-Retrieval-Engine, X-SBC-Sources and
 * X-SBC-Source-Meta response headers per question.
 *
 * Two scoring tiers, both always reported as separate columns:
 *   tier-A — binding today. Plain-regex section-ref / chain-pair presence,
 *            forbidden-claim and fabricated-standard-clause absence, and
 *            canonical-refusal-sentence matching for must_refuse rows. This
 *            tier gates pass/fail.
 *   tier-B — the structured `[SBC-... | conf:...]` citation-token metric.
 *            Kept and reported, but NOT a pass/fail gate: no producer emits
 *            that token today, so it is expected to read ~0% in live mode
 *            until ADVISORY_CITATION_TOKENS_ENABLED ships. See the tier_b
 *            block in computeMetrics() for the full rationale.
 *
 * A safety_critical: true row that fails tier-A fails the whole run — see
 * the REGRESSION banner in main() — independent of the aggregate thresholds.
 *
 * Output written to: evals/results/{YYYY-MM-DD}/results.json + report.md
 */

import { RETRIEVAL_ENGINE_HEADER } from "../supabase/functions/fire-safety-chat/retrievalPolicy.ts";
import { assembleSseText, parseSseAnswer } from "./lib/sse.ts";
// The pure scoring predicates live in ./lib/scoring.ts so they can be
// imported and EXECUTED by src/__tests__/evalScoring.test.ts — this file
// cannot be, because it calls main() at module top level. The refusal-marker
// set and the fabricated-clause pattern are where the harness's honesty
// lives; see that module's comments for what is deliberately excluded from
// each and why.
import {
  checkSwitchMarkerProtocol,
  countChainPairsFound,
  countExpectedSectionsFound,
  hasFabricatedStandardClause,
  hasRefusalSentence,
  hasSBCCitationToken,
  mentionsForbiddenClaim,
} from "./lib/scoring.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EvalMode = "standard" | "analysis";

interface BenchmarkRow {
  id: string;
  question_ar: string;
  question_en: string;
  expected_section_refs: string[];
  expected_table_ids: string[];
  forbidden_claims: string[];
  must_refuse: boolean;
  refuse_reason: string | null;
  category: string;
  // Phase P1 additions — honored when present in the JSONL, defaulted when
  // absent so today's 20-row file (which has none of these) still runs.
  chain_pairs?: Array<[string, string]>;
  language?: "ar" | "en";
  safety_critical?: boolean;
}

interface TierAScore {
  expected_sections_found: number;
  expected_sections_total: number;
  chain_pairs_found: number;
  chain_pairs_total: number;
  mentions_forbidden_claim: boolean;
  has_refusal_sentence: boolean;
  has_fabricated_clause: boolean;
  /** Row-level tier-A verdict — see tierAPassed() for the exact rule. */
  pass: boolean;
}

interface TierBScore {
  has_sbc_citation_token: boolean;
}

interface ResponseHeaders {
  retrieval_engine: string | null;
  sbc_sources: string | null;
  sbc_source_meta: string | null;
}

interface EvalResult {
  id: string;
  category: string;
  mode: EvalMode;
  language: "ar" | "en";
  must_refuse: boolean;
  safety_critical: boolean;
  tier_a: TierAScore;
  tier_b: TierBScore;
  headers: ResponseHeaders;
  answer_length: number;
  latency_ms: number;
  answer_preview: string;
  error?: string;
  // Rate-limit retry visibility (live mode): how many attempts the answer
  // took and how long the harness slept in backoff to obtain it. latency_ms
  // stays per-successful-attempt by design; these expose the difference.
  attempts?: number;
  backoff_ms?: number;
  // True when the whole retry ladder was exhausted by a rate limit — feeds
  // the main loop's starvation circuit breaker.
  rate_limit_starved?: boolean;
}

interface SmokeResult {
  id: string;
  mode: "primary";
  passed: boolean;
  leaked_switch_token: boolean;
  detail: string;
  latency_ms: number;
  answer_length: number;
  error?: string;
}

interface RunReport {
  run_date: string;
  mode: "dry-run" | "live";
  // Present only on CONSULTX_EVAL_SUBSET runs: the requested question ids.
  // Subset artifacts also land in a separate "<date>-subset" directory so a
  // reduced sample can never overwrite the day's canonical full-run record.
  subset?: string[];
  total: number;
  // Live-mode retry visibility: rate-limit retries across the run.
  rate_limit_retries?: { retried_questions: number; total_retries: number; total_backoff_ms: number };
  tier_a: {
    exact_section_match_rate: number;
    chain_match_rate: number;
    refusal_correctness: number;
    hallucination_rate: number;
  };
  tier_b: {
    citation_discipline_rate: number;
    note: string;
  };
  latency_p95_ms: number;
  safety_critical_regressions: Array<{ id: string; mode: EvalMode }>;
  smoke: SmokeResult[];
  pass: boolean;
  results: EvalResult[];
}

const TIER_B_NOTE =
  "tier-B (no producer yet — expected 0 until ADVISORY_CITATION_TOKENS_ENABLED ships)";

// ---------------------------------------------------------------------------
// Scoring helpers
//
// The predicates themselves live in ./lib/scoring.ts (imported above) so that
// src/__tests__/evalScoring.test.ts can execute them directly — this file
// cannot be imported by a test, because it calls main() at module top level.
// What stays here is only the row-level verdict that combines them, which
// depends on this file's BenchmarkRow / TierAScore shapes.
// ---------------------------------------------------------------------------

/**
 * Row-level tier-A verdict.
 *   must_refuse rows    — pass iff a canonical/boundary refusal sentence is
 *                          present AND no forbidden claim AND no fabricated
 *                          standard clause.
 *   non-must_refuse rows — pass iff every expected_section_refs entry and
 *                          every chain_pairs entry was found, AND no
 *                          forbidden claim AND no fabricated standard clause.
 */
function tierAPassed(row: BenchmarkRow, a: TierAScore): boolean {
  if (row.must_refuse) {
    return a.has_refusal_sentence && !a.mentions_forbidden_claim && !a.has_fabricated_clause;
  }
  const sectionsOk = a.expected_sections_total === 0 ||
    a.expected_sections_found === a.expected_sections_total;
  const chainOk = a.chain_pairs_total === 0 ||
    a.chain_pairs_found === a.chain_pairs_total;
  return sectionsOk && chainOk && !a.mentions_forbidden_claim && !a.has_fabricated_clause;
}

function scoreAnswer(
  row: BenchmarkRow,
  answer: string,
): { tier_a: TierAScore; tier_b: TierBScore } {
  const chainPairs = row.chain_pairs ?? [];
  const tier_a: TierAScore = {
    expected_sections_found: countExpectedSectionsFound(answer, row.expected_section_refs),
    expected_sections_total: row.expected_section_refs.length,
    chain_pairs_found: countChainPairsFound(answer, chainPairs),
    chain_pairs_total: chainPairs.length,
    mentions_forbidden_claim: mentionsForbiddenClaim(answer, row.forbidden_claims),
    has_refusal_sentence: hasRefusalSentence(answer),
    has_fabricated_clause: hasFabricatedStandardClause(answer),
    pass: false,
  };
  tier_a.pass = tierAPassed(row, tier_a);

  const tier_b: TierBScore = {
    has_sbc_citation_token: hasSBCCitationToken(answer),
  };

  return { tier_a, tier_b };
}

// ---------------------------------------------------------------------------
// Dry-run scorer — produces synthetic passing answers for baseline output
// ---------------------------------------------------------------------------

function dryRunAnswer(row: BenchmarkRow): string {
  if (row.must_refuse) {
    return (
      "يتطلب هذا المرجع حزمة مصادر NFPA أو الدفاع المدني المقابلة، وهي غير مفهرسة حالياً في ConsultX. " +
      "This reference requires the corresponding NFPA or Civil Defense source pack, which is not currently indexed in ConsultX."
    );
  }
  const firstRef = row.expected_section_refs[0] ?? "1.1";
  const doc = row.category.startsWith("SBC-801") ? "801" : "201";
  const sectionMentions = row.expected_section_refs.map((r) => `Section ${r}`).join(", ");
  const chainMentions = (row.chain_pairs ?? [])
    .map(([a, b]) => `Section ${a} and Section ${b}`)
    .join("; ");
  return (
    `[SBC-${doc} Section ${firstRef} | conf:medium] Dry-run placeholder — no API call made. ` +
    sectionMentions +
    (chainMentions ? `. Chain: ${chainMentions}.` : "")
  );
}

function rowLanguage(row: BenchmarkRow): "ar" | "en" {
  return row.language === "en" ? "en" : "ar";
}

function buildDryRunResult(row: BenchmarkRow, mode: EvalMode): EvalResult {
  const answer = dryRunAnswer(row);
  const { tier_a, tier_b } = scoreAnswer(row, answer);
  return {
    id: row.id,
    category: row.category,
    mode,
    language: rowLanguage(row),
    must_refuse: row.must_refuse,
    safety_critical: row.safety_critical === true,
    tier_a,
    tier_b,
    headers: { retrieval_engine: null, sbc_sources: null, sbc_source_meta: null },
    answer_length: answer.length,
    latency_ms: 0,
    answer_preview: answer.slice(0, 200),
  };
}

function buildDryRunSmoke(row: BenchmarkRow): SmokeResult {
  const answer = "Dry-run placeholder — primary mode. No switch marker emitted.";
  const { leaked, detail } = checkSwitchMarkerProtocol(answer);
  return {
    id: row.id,
    mode: "primary",
    passed: !leaked,
    leaked_switch_token: leaked,
    detail,
    latency_ms: 0,
    answer_length: answer.length,
  };
}

// ---------------------------------------------------------------------------
// Live scorer — calls the deployed fire-safety-chat edge function
// ---------------------------------------------------------------------------

interface LiveCallResult {
  answer: string;
  latency_ms: number;
  headers: ResponseHeaders;
  error?: string;
  // Structured error state (2026-08-27 review fixes): the retry decision and
  // the report read these, never the formatted `error` string.
  status?: number;
  error_code?: string;
  attempts: number;
  backoff_ms: number;
}

// Pacing + provider-rate-limit resilience (added 2026-08-26 after the first
// live run): 86 back-to-back heavy calls exhausted the Gemini per-minute
// quota after ~9 questions — every later call came back as the function's
// honest 503 GEMINI_RATE_LIMIT passthrough, contaminating the scores.
//   CONSULTX_EVAL_DELAY_MS  — fixed pause between questions (default 15000)
//   Genuine rate limits (503 + error_code GEMINI_RATE_LIMIT, or 429) are
//   retried up to 4 times with a 75s backoff — long enough for a per-minute
//   provider quota window to reset. All other failures return immediately.
// Malformed values ("15s", "15 000") must fail loudly, not silently disable
// pacing: Number("15s") is NaN and `NaN > 0` is false at every guard site.
// An exported-but-empty var (?? misses it) falls back to the default.
const EVAL_DELAY_MS = (() => {
  const raw = Deno.env.get("CONSULTX_EVAL_DELAY_MS");
  if (raw === undefined || raw.trim() === "") return 15_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.error(
      `CONSULTX_EVAL_DELAY_MS="${raw}" is not a non-negative number of milliseconds — refusing to run unpaced.`,
    );
    Deno.exit(1);
  }
  return n;
})();
const RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_BACKOFF_MS = 75_000;
// Abort the whole run once this many consecutive questions exhaust their
// retry ladder on a provider rate limit: the quota is gone for longer than a
// window and every further question would burn 5 minutes to learn nothing.
const STARVATION_ABORT_AFTER = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A paced run can outlive a 1h user-session JWT. When CONSULTX_TOKEN_FILE is
// set, the Bearer token is re-read from that file before every call, so an
// outer wrapper can refresh the session and rewrite the file mid-run.
// CONSULTX_EVAL_SUBSET: comma-separated question ids (e.g. "ADV-001,ADV-021")
// to run a reduced, quota-friendly sample instead of the full 43. Unknown ids
// are a hard error, smoke rows come from the subset, the report carries a
// SUBSET banner, and artifacts land in "<date>-subset/" so a sample can never
// overwrite the day's canonical full-run record.
const EVAL_SUBSET = new Set(
  (Deno.env.get("CONSULTX_EVAL_SUBSET") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

const TOKEN_FILE = Deno.env.get("CONSULTX_TOKEN_FILE") ?? "";
// A fallback to the service key changes the auth principal (different quota
// and RLS path), so it must never happen silently — warn once per cause.
const tokenWarned = new Set<string>();
function warnTokenOnce(cause: string) {
  if (tokenWarned.has(cause)) return;
  tokenWarned.add(cause);
  console.warn(`    WARNING: token file ${cause} — falling back to CONSULTX_SERVICE_KEY for this and similar calls`);
}
function jwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 < Date.now();
  } catch {
    return false; // not a decodable JWT — let the server judge it
  }
}
function liveAuthKey(fallback: string): string {
  if (!TOKEN_FILE) return fallback;
  try {
    const t = Deno.readTextFileSync(TOKEN_FILE).trim();
    if (t.length === 0) {
      warnTokenOnce("is empty");
      return fallback;
    }
    if (jwtExpired(t)) {
      // Still send it (the wrapper may be mid-refresh); the warning names the
      // real cause so a page of 401s is not misread as a model regression.
      warnTokenOnce("holds an EXPIRED JWT (wrapper refresh stalled?)");
    }
    return t;
  } catch {
    warnTokenOnce("could not be read");
    return fallback;
  }
}

async function callEdgeFunction(
  questionText: string,
  mode: EvalMode | "primary",
  language: "ar" | "en",
  edgeUrl: string,
  serviceKey: string,
  userId: string,
): Promise<LiveCallResult> {
  // Retry ONLY genuine rate limits, decided on structured fields:
  //   - 503 with error_code GEMINI_RATE_LIMIT (provider per-minute quota)
  //   - 429 (the function's per-user quota limiter)
  // Deterministic 503s (empty SBC context, GEMINI_PROVIDER_ERROR) and every
  // other failure return immediately — waiting 75s changes nothing for them.
  let backoffTotal = 0;
  for (let attempt = 0; ; attempt++) {
    const r = await callEdgeFunctionOnce(questionText, mode, language, edgeUrl, serviceKey, userId);
    r.attempts = attempt + 1;
    r.backoff_ms = backoffTotal;
    const rateLimited = (r.status === 503 && r.error_code === "GEMINI_RATE_LIMIT") || r.status === 429;
    if (!rateLimited || attempt >= RATE_LIMIT_RETRIES) return r;
    console.log(
      `    ${r.status} rate-limited (${r.error_code ?? "no error_code"}) — waiting ${RATE_LIMIT_BACKOFF_MS / 1000}s (retry ${attempt + 1}/${RATE_LIMIT_RETRIES})`,
    );
    await sleep(RATE_LIMIT_BACKOFF_MS);
    backoffTotal += RATE_LIMIT_BACKOFF_MS;
  }
}

// True when a result burned its whole retry ladder on a rate limit — the
// signal the main loop's starvation circuit breaker counts.
function exhaustedByRateLimit(r: LiveCallResult): boolean {
  return r.attempts > RATE_LIMIT_RETRIES &&
    ((r.status === 503 && r.error_code === "GEMINI_RATE_LIMIT") || r.status === 429);
}

async function callEdgeFunctionOnce(
  questionText: string,
  mode: EvalMode | "primary",
  language: "ar" | "en",
  edgeUrl: string,
  serviceKey: string,
  userId: string,
): Promise<LiveCallResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${liveAuthKey(serviceKey)}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: questionText }],
        mode,
        userId,
        language,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      // The function's error envelope always carries error_code
      // (GEMINI_RATE_LIMIT / GEMINI_PROVIDER_ERROR / ...) — parse it BEFORE
      // slicing so the retry decision never depends on message formatting.
      let errorCode: string | undefined;
      try {
        errorCode = JSON.parse(body)?.error_code ?? undefined;
      } catch { /* non-JSON error body — leave error_code unset */ }
      return {
        answer: "",
        latency_ms: Date.now() - t0,
        headers: { retrieval_engine: null, sbc_sources: null, sbc_source_meta: null },
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        status: res.status,
        error_code: errorCode,
        attempts: 1,
        backoff_ms: 0,
      };
    }

    const headers: ResponseHeaders = {
      retrieval_engine: res.headers.get(RETRIEVAL_ENGINE_HEADER),
      sbc_sources: res.headers.get("X-SBC-Sources"),
      sbc_source_meta: res.headers.get("X-SBC-Source-Meta"),
    };

    const contentType = res.headers.get("Content-Type") ?? "";
    let answer: string;
    if (contentType.includes("text/event-stream") && res.body) {
      answer = await parseSseAnswer(res.body);
    } else {
      // Fallback for a JSON or plain-text response (e.g. a non-streamed
      // error path, or a future response-shape change).
      const bodyText = await res.text();
      try {
        const json = JSON.parse(bodyText);
        answer =
          json?.content ?? json?.response ?? json?.text ??
          json?.candidates?.[0]?.content?.parts?.[0]?.text ??
          bodyText;
      } catch {
        // Not JSON and not declared as SSE — try assembling it as SSE text
        // anyway (a proxy can drop Content-Type on stream passthrough)
        // before giving up and scoring the raw body.
        const assembled = assembleSseText(bodyText);
        answer = assembled.length > 0 ? assembled : bodyText;
      }
    }

    // Latency covers the full round trip including stream assembly, not
    // just time-to-first-byte, so p95 reflects what a real user waits for.
    // (Deliberately per-attempt: retry backoffs are harness pacing, not user
    // experience — the report surfaces attempts/backoff_ms separately.)
    return { answer, latency_ms: Date.now() - t0, headers, status: res.status, attempts: 1, backoff_ms: 0 };
  } catch (err) {
    return {
      answer: "",
      latency_ms: Date.now() - t0,
      headers: { retrieval_engine: null, sbc_sources: null, sbc_source_meta: null },
      error: String(err),
      attempts: 1,
      backoff_ms: 0,
    };
  }
}

async function liveScore(
  row: BenchmarkRow,
  mode: EvalMode,
  edgeUrl: string,
  serviceKey: string,
  userId: string,
): Promise<EvalResult> {
  const language = rowLanguage(row);
  const questionText = language === "en" ? row.question_en : row.question_ar;
  const call = await callEdgeFunction(questionText, mode, language, edgeUrl, serviceKey, userId);

  const { tier_a, tier_b } = scoreAnswer(row, call.answer);
  return {
    id: row.id,
    category: row.category,
    mode,
    language,
    must_refuse: row.must_refuse,
    safety_critical: row.safety_critical === true,
    tier_a,
    tier_b,
    headers: call.headers,
    answer_length: call.answer.length,
    latency_ms: call.latency_ms,
    answer_preview: call.answer.slice(0, 200),
    error: call.error,
    attempts: call.attempts,
    backoff_ms: call.backoff_ms,
    rate_limit_starved: exhaustedByRateLimit(call),
  };
}

async function livePrimarySmoke(
  row: BenchmarkRow,
  edgeUrl: string,
  serviceKey: string,
  userId: string,
): Promise<SmokeResult> {
  const language = rowLanguage(row);
  const questionText = language === "en" ? row.question_en : row.question_ar;
  const call = await callEdgeFunction(questionText, "primary", language, edgeUrl, serviceKey, userId);

  if (call.error) {
    return {
      id: row.id,
      mode: "primary",
      passed: false,
      leaked_switch_token: false,
      detail: "call failed before protocol check could run",
      latency_ms: call.latency_ms,
      answer_length: 0,
      error: call.error,
    };
  }

  const { leaked, detail } = checkSwitchMarkerProtocol(call.answer);
  return {
    id: row.id,
    mode: "primary",
    passed: !leaked,
    leaked_switch_token: leaked,
    detail,
    latency_ms: call.latency_ms,
    answer_length: call.answer.length,
  };
}

// ---------------------------------------------------------------------------
// Aggregate metrics
// ---------------------------------------------------------------------------

// Fixed 2-question smoke set: the first two rows of the JSONL. Any two rows
// exercise the primary-mode protocol equally well (the check is about
// marker hygiene, not question content), so a stable, deterministic
// selection is preferable to a random one.
const SMOKE_ROW_COUNT = 2;
const EVAL_MODES: EvalMode[] = ["standard", "analysis"];
// Set once in main() after the JSONL loads; the subset banner uses it to show
// "N/43" honestly even if the benchmark grows.
let FULL_BENCHMARK_ROWS = 0;

function computeMetrics(
  results: EvalResult[],
  smoke: SmokeResult[],
  mode: "dry-run" | "live",
  subset?: string[],
): RunReport {
  const date = new Date().toISOString().slice(0, 10);
  const total = results.length;

  const nonRefuseRows = results.filter((r) => !r.must_refuse);
  const refuseRows = results.filter((r) => r.must_refuse);

  // tier-A: exact-section match — expected section refs found across all
  // non-refuse rows.
  const totalExpected = nonRefuseRows.reduce((s, r) => s + r.tier_a.expected_sections_total, 0);
  const totalFound = nonRefuseRows.reduce((s, r) => s + r.tier_a.expected_sections_found, 0);
  const sectionMatchRate = totalExpected === 0 ? 1 : totalFound / totalExpected;

  // tier-A: chain match — both sections of a chain_pairs entry found.
  const totalChainExpected = results.reduce((s, r) => s + r.tier_a.chain_pairs_total, 0);
  const totalChainFound = results.reduce((s, r) => s + r.tier_a.chain_pairs_found, 0);
  const chainMatchRate = totalChainExpected === 0 ? 1 : totalChainFound / totalChainExpected;

  // tier-A: refusal correctness — must_refuse rows that emit a refusal
  // sentence, mention no forbidden claim, and fabricate no standard clause.
  const refusalCorrectness = refuseRows.length === 0 ? 1 :
    refuseRows.filter((r) =>
      r.tier_a.has_refusal_sentence && !r.tier_a.mentions_forbidden_claim && !r.tier_a.has_fabricated_clause
    ).length / refuseRows.length;

  // tier-A: hallucination rate — non-refuse rows that mention a forbidden
  // claim OR fabricate a standard clause the row didn't anticipate. Widened
  // from the pre-Phase-P1 definition (forbidden_claims only) to also catch
  // fabricated NFPA/SFPE/IBC/IFC clause numbers on non-bait questions.
  const hallucinationRate = nonRefuseRows.length === 0 ? 0 :
    nonRefuseRows.filter((r) => r.tier_a.mentions_forbidden_claim || r.tier_a.has_fabricated_clause).length /
    nonRefuseRows.length;

  // tier-B: citation discipline — reported, not gating. See TIER_B_NOTE.
  const citationDiscipline = nonRefuseRows.length === 0 ? 1 :
    nonRefuseRows.filter((r) => r.tier_b.has_sbc_citation_token).length / nonRefuseRows.length;

  // Latency p95 (0ms for dry-run).
  const latencies = results.map((r) => r.latency_ms).sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);
  const latencyP95 = latencies[p95Index] ?? 0;

  const safetyCriticalRegressions = results
    .filter((r) => r.safety_critical && !r.tier_a.pass)
    .map((r) => ({ id: r.id, mode: r.mode }));

  const smokePass = smoke.every((s) => s.passed);

  const metricsPass =
    sectionMatchRate >= 0.60 &&
    refusalCorrectness >= 1.00 &&
    hallucinationRate <= 0.05 &&
    (mode === "dry-run" || latencyP95 <= 45_000);

  const pass = metricsPass && smokePass && safetyCriticalRegressions.length === 0;

  const retriedRows = results.filter((r) => (r.attempts ?? 1) > 1);
  const rateLimitRetries = mode === "live"
    ? {
      retried_questions: retriedRows.length,
      total_retries: retriedRows.reduce((s, r) => s + (r.attempts ?? 1) - 1, 0),
      total_backoff_ms: retriedRows.reduce((s, r) => s + (r.backoff_ms ?? 0), 0),
    }
    : undefined;

  return {
    run_date: date,
    mode,
    subset,
    rate_limit_retries: rateLimitRetries,
    total,
    tier_a: {
      exact_section_match_rate: Math.round(sectionMatchRate * 100),
      chain_match_rate: Math.round(chainMatchRate * 100),
      refusal_correctness: Math.round(refusalCorrectness * 100),
      hallucination_rate: Math.round(hallucinationRate * 100),
    },
    tier_b: {
      citation_discipline_rate: Math.round(citationDiscipline * 100),
      note: TIER_B_NOTE,
    },
    latency_p95_ms: latencyP95,
    safety_critical_regressions: safetyCriticalRegressions,
    smoke,
    pass,
    results,
  };
}

// ---------------------------------------------------------------------------
// Markdown report renderer
// ---------------------------------------------------------------------------

function renderReport(report: RunReport): string {
  const status = report.pass ? "PASS" : "FAIL";
  const lines: string[] = [
    `# ConsultX Advisory Benchmark — ${report.run_date} (${report.mode})`,
    "",
    `**Overall result: ${status}**`,
    "",
  ];

  if (report.subset && report.subset.length > 0) {
    lines.push(
      `> **SUBSET RUN (${report.results.length / EVAL_MODES.length}/${FULL_BENCHMARK_ROWS} questions): ${report.subset.join(", ")}**`,
      "> Scores below cover ONLY this sample — not comparable to a full-run report.",
      "",
    );
  }

  if (report.rate_limit_retries && report.rate_limit_retries.total_retries > 0) {
    const rl = report.rate_limit_retries;
    lines.push(
      `> Rate-limit retries: ${rl.total_retries} across ${rl.retried_questions} question(s), total backoff ${Math.round(rl.total_backoff_ms / 1000)}s. Latency figures exclude backoff.`,
      "",
    );
  }

  if (report.safety_critical_regressions.length > 0) {
    lines.push(
      "## REGRESSION — safety_critical question(s) failed tier-A",
      "",
      ...report.safety_critical_regressions.map((r) => `- **${r.id}** [${r.mode}]`),
      "",
    );
  }

  lines.push(
    "## Aggregate scores",
    "",
    "### tier-A (binding today)",
    "",
    "| Metric | Score | Threshold | Result |",
    "|---|---|---|---|",
    `| Exact-section match rate | ${report.tier_a.exact_section_match_rate}% | >= 60% | ${report.tier_a.exact_section_match_rate >= 60 ? "PASS" : "FAIL"} |`,
    `| Chain-pair match rate | ${report.tier_a.chain_match_rate}% | n/a (reported) | n/a |`,
    `| Refusal correctness | ${report.tier_a.refusal_correctness}% | 100% | ${report.tier_a.refusal_correctness >= 100 ? "PASS" : "FAIL"} |`,
    `| Hallucination rate | ${report.tier_a.hallucination_rate}% | <= 5% | ${report.tier_a.hallucination_rate <= 5 ? "PASS" : "FAIL"} |`,
    `| Latency p95 | ${report.latency_p95_ms}ms | <= 45000ms | ${report.mode === "dry-run" ? "n/a (dry-run)" : report.latency_p95_ms <= 45000 ? "PASS" : "FAIL"} |`,
    "",
    `### ${report.tier_b.note}`,
    "",
    "| Metric | Score | Gate |",
    "|---|---|---|",
    `| Citation discipline rate | ${report.tier_b.citation_discipline_rate}% | not gating — informational only |`,
    "",
    "## Primary-mode [SWITCH:...] smoke check",
    "",
    "| ID | Result | Detail | Latency |",
    "|---|---|---|---|",
  );
  for (const s of report.smoke) {
    lines.push(
      `| ${s.id} | ${s.passed ? "PASS" : "FAIL"} | ${s.detail}${s.error ? ` — ERROR: ${s.error}` : ""} | ${s.latency_ms}ms |`,
    );
  }

  lines.push(
    "",
    "## Per-question results",
    "",
    "| ID | Mode | Category | Safety-critical | Sections found | Chain found | Refusal | Forbidden claim | Fabricated clause | tier-B token | Answer len | Retrieval engine | Latency | Error |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  );

  for (const r of report.results) {
    const sectionFrac = r.tier_a.expected_sections_total > 0
      ? `${r.tier_a.expected_sections_found}/${r.tier_a.expected_sections_total}`
      : "n/a";
    const chainFrac = r.tier_a.chain_pairs_total > 0
      ? `${r.tier_a.chain_pairs_found}/${r.tier_a.chain_pairs_total}`
      : "n/a";
    const flagForbidden = r.tier_a.mentions_forbidden_claim ? "**YES**" : "no";
    const flagFabricated = r.tier_a.has_fabricated_clause ? "**YES**" : "no";
    lines.push(
      `| ${r.id} | ${r.mode} | ${r.category} | ${r.safety_critical ? "yes" : "no"} | ${sectionFrac} | ${chainFrac} | ${r.tier_a.has_refusal_sentence ? "yes" : "no"} | ${flagForbidden} | ${flagFabricated} | ${r.tier_b.has_sbc_citation_token ? "yes" : "no"} | ${r.answer_length} | ${r.headers.retrieval_engine ?? "n/a"} | ${r.latency_ms}ms | ${r.error ?? ""} |`,
    );
  }

  lines.push(
    "",
    "---",
    "",
    `_Generated by \`evals/run_advisory_benchmark.ts\` — ${report.mode} mode_`,
    `_tier-A pass thresholds defined in \`docs/advisory-acceptance.md\` Section 5.3_`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const isLive = Deno.env.get("CONSULTX_EVAL_LIVE") === "1";
  const mode: "dry-run" | "live" = isLive ? "live" : "dry-run";

  const jsonlText = await Deno.readTextFile("./evals/advisory_benchmark.jsonl");
  const rows: BenchmarkRow[] = jsonlText
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));

  FULL_BENCHMARK_ROWS = rows.length;
  console.log(`Loaded ${rows.length} benchmark questions.`);
  console.log(`Mode: ${isLive ? "LIVE — calling deployed edge function" : "DRY-RUN — no API calls"}`);
  if (isLive) console.log(`  Pacing: ${EVAL_DELAY_MS}ms between questions.`);

  if (!isLive) {
    console.log("Set CONSULTX_EVAL_LIVE=1 to run against the deployed edge function.\n");
  }

  // Subset validation applies to both modes so a dry run exercises the same
  // path. Unknown ids are a hard error — an id typo must never shrink the run
  // silently (an empty selection used to score as a vacuous PASS).
  const selectedRows = EVAL_SUBSET.size > 0 ? rows.filter((r) => EVAL_SUBSET.has(r.id)) : rows;
  if (EVAL_SUBSET.size > 0) {
    const knownIds = new Set(rows.map((r) => r.id));
    const unknown = [...EVAL_SUBSET].filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      console.error(
        `CONSULTX_EVAL_SUBSET contains id(s) not in the benchmark: ${unknown.join(", ")} — refusing to run.`,
      );
      Deno.exit(1);
    }
    console.log(`  SUBSET RUN: ${selectedRows.length}/${rows.length} questions (${[...EVAL_SUBSET].join(", ")})`);
  }

  // Smoke rows derive from the SELECTED rows: a 1-question subset makes only
  // that question's calls, and the pass verdict never hinges on rows the
  // operator excluded.
  const smokeRows = selectedRows.slice(0, SMOKE_ROW_COUNT);
  let results: EvalResult[];
  let smoke: SmokeResult[];

  if (!isLive) {
    results = selectedRows.flatMap((row) => EVAL_MODES.map((m) => buildDryRunResult(row, m)));
    smoke = smokeRows.map(buildDryRunSmoke);
  } else {
    const edgeUrl = Deno.env.get("CONSULTX_EDGE_URL");
    const serviceKey = Deno.env.get("CONSULTX_SERVICE_KEY");
    const userId = Deno.env.get("SMOKE_USER_ID");

    if (!edgeUrl || !serviceKey || !userId) {
      console.error(
        "Live mode requires CONSULTX_EDGE_URL, CONSULTX_SERVICE_KEY, and SMOKE_USER_ID.\n" +
        "See evals/results/README.md for setup instructions.",
      );
      Deno.exit(1);
    }

    results = [];
    // Starvation circuit breaker: consecutive questions that exhaust the
    // retry ladder on a rate limit mean the quota is gone for longer than a
    // window — abort WITHOUT writing a report (infrastructure failure, not a
    // model result) instead of burning 5 minutes per remaining question.
    let consecutiveStarved = 0;
    for (const row of selectedRows) {
      for (const evalMode of EVAL_MODES) {
        console.log(`  Running ${row.id} [${evalMode}] (${row.category})...`);
        const result = await liveScore(row, evalMode, edgeUrl, serviceKey, userId);
        results.push(result);
        const suffix = result.error ? ` ERROR: ${result.error}` : ` ${result.latency_ms}ms`;
        console.log(`    ${result.id} [${evalMode}] done.${suffix}`);
        consecutiveStarved = result.rate_limit_starved ? consecutiveStarved + 1 : 0;
        if (consecutiveStarved >= STARVATION_ABORT_AFTER) {
          console.error(
            `\nABORT: ${consecutiveStarved} consecutive calls exhausted their rate-limit retries — ` +
            `provider quota is gone. No report written (partial scores would be contamination, not measurement).`,
          );
          Deno.exit(2);
        }
        if (EVAL_DELAY_MS > 0) await sleep(EVAL_DELAY_MS);
      }
    }

    smoke = [];
    for (const row of smokeRows) {
      console.log(`  Smoke ${row.id} [primary]...`);
      const s = await livePrimarySmoke(row, edgeUrl, serviceKey, userId);
      smoke.push(s);
      console.log(`    ${s.id} [primary] ${s.passed ? "PASS" : "FAIL"} — ${s.detail}`);
      if (EVAL_DELAY_MS > 0) await sleep(EVAL_DELAY_MS);
    }
  }

  const report = computeMetrics(
    results,
    smoke,
    mode,
    EVAL_SUBSET.size > 0 ? [...EVAL_SUBSET] : undefined,
  );

  // Subset artifacts get their own directory: a reduced sample must never
  // overwrite the day's canonical full-run record.
  const dateDir = `./evals/results/${report.run_date}${EVAL_SUBSET.size > 0 ? "-subset" : ""}`;
  await Deno.mkdir(dateDir, { recursive: true });
  await Deno.writeTextFile(`${dateDir}/results.json`, JSON.stringify(report, null, 2));
  await Deno.writeTextFile(`${dateDir}/report.md`, renderReport(report));

  console.log(`\nResults written to ${dateDir}/`);
  if (report.safety_critical_regressions.length > 0) {
    console.log("\n*** REGRESSION: safety_critical question(s) failed tier-A ***");
    for (const r of report.safety_critical_regressions) {
      console.log(`    ${r.id} [${r.mode}]`);
    }
  }
  console.log(`\n  Overall:                   ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`  tier-A exact-section match: ${report.tier_a.exact_section_match_rate}%  (threshold >= 60%)`);
  console.log(`  tier-A chain match:         ${report.tier_a.chain_match_rate}%  (reported only)`);
  console.log(`  tier-A refusal correctness: ${report.tier_a.refusal_correctness}%  (threshold 100%)`);
  console.log(`  tier-A hallucination rate:  ${report.tier_a.hallucination_rate}%  (threshold <= 5%)`);
  console.log(`  ${report.tier_b.note}`);
  console.log(`  tier-B citation discipline: ${report.tier_b.citation_discipline_rate}%  (not gating)`);
  console.log(`  Latency p95:                ${report.latency_p95_ms}ms  (threshold <= 45000ms)`);
  if (report.rate_limit_retries && report.rate_limit_retries.total_retries > 0) {
    const rl = report.rate_limit_retries;
    console.log(`  Rate-limit retries:         ${rl.total_retries} across ${rl.retried_questions} question(s), backoff ${Math.round(rl.total_backoff_ms / 1000)}s (excluded from latency)`);
  }
  console.log(`  Primary smoke:              ${smoke.every((s) => s.passed) ? "PASS" : "FAIL"}`);

  Deno.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  Deno.exit(1);
});
