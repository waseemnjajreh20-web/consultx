/**
 * synthetic-probe — scheduled (pg_cron, every 15 min) synthetic monitor for
 * fire-safety-chat. Each run: mints a session for the dedicated smoke
 * account, calls fire-safety-chat once per mode (primary/standard/analysis)
 * with a rotating fixed question, records timing/correctness into
 * perf_events, evaluates slo_targets over their trailing windows, and emails
 * the owner (Resend) when a target breaches for 2 consecutive runs — with a
 * matching recovery email when it clears. Also tracks whether the pg_cron
 * invocation itself is healthy (last_cron_status()) and whether the probe's
 * own smoke-account login is working, through the same consecutive-breach
 * mechanism, so a broken monitor pages the owner instead of going silent.
 *
 * WHY THIS EXISTS: nothing today measures what a real user's request
 * actually experiences end-to-end (region-pinned, streaming, per mode) on a
 * schedule. Ad-hoc probes (evals/live/bench-live2.mjs, the scratchpad
 * ttfb_probe.mjs) exist but require a human to run them.
 *
 * AUTH: same pattern as ingest-sbc-2024/index.ts — requires header
 * `x-probe-token` equal to env PROBE_TASK_TOKEN, constant-time compared,
 * fails closed (401) if the env is unset. This function has NO
 * `verify_jwt = false` entry in supabase/config.toml (deliberately —
 * see the runbook), so the platform's default JWT gate ALSO applies: every
 * caller (pg_cron's net.http_post and any manual/curl test) must additionally
 * send `Authorization: Bearer <anon/publishable key>` — the anon key is
 * public by design (docs/OWNER_ACTIONS.md), it does not need to be a real
 * user session. Same two-gate shape ingest-sbc-2024 already uses in
 * production.
 *
 * Smoke account: resolved by email (smoke_retrieval_042026@mailnull.com),
 * password rotated then signed in — identical recipe to
 * evals/live/bench-live2.mjs / the scratchpad ttfb_probe.mjs. CAVEAT: a
 * concurrently-running human bench run rotates the same shared password and
 * can make this probe's own sign-in race and fail for one cycle — see
 * docs/launch/synthetic-probe-runbook.md. That is why smoke-auth failure is
 * NOT alerted on the first occurrence (see breach:smoke_auth below).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPublishableKey, getSecretKey, SECRET_KEY_RESOLUTION } from "../_shared/supabaseKeys.ts";
import {
  aggregateStats,
  buildCronBreachEmail,
  buildCronRecoveryEmail,
  buildPerfEventRow,
  buildProbeErrorEmail,
  buildProbeRecoveryEmail,
  buildTargetBreachEmail,
  buildTargetRecoveryEmail,
  createInitialMarks,
  evaluateTarget,
  extractDataPayload,
  isCronStatusBreached,
  nextBreachState,
  nextQuestionIndex,
  PROBE_QUESTIONS,
  reduceSseChunk,
  applySsePayload,
  splitCompleteLines,
  timingSafeEqual,
  type AggregatedStats,
  type PerfEventInsertRow,
  type PerfEventRowForStats,
  type SloTarget,
  type SseMarks,
} from "./logic.ts";

const FIRE_SAFETY_CHAT_URL = "https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat";
// The old hardcoded smoke user was deleted in the 2026-09-01 test-account
// cleanup; the sole kept test account is resolved by email at runtime — same
// as evals/live/bench-live2.mjs and the scratchpad ttfb_probe.mjs.
const SMOKE_EMAIL = "smoke_retrieval_042026@mailnull.com";
const MODES = ["primary", "standard", "analysis"] as const;
const REGION = "ap-southeast-2";
const REQUEST_TIMEOUT_MS = 150_000;
const BREACH_THRESHOLD = 2;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-probe-token",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Deliberately `any`, not `ReturnType<typeof createClient>`: passing the
// un-parameterised client (no Database generic — this function has no
// generated types to give it) through a named type alias trips a
// self-referential generic mismatch in supabase-js 2.90's own typing
// ("public" not assignable to "never" on PostgrestClient) the moment the
// alias is used as a separate function parameter type, even though the
// value itself is the client's own return type. Every other edge function
// in this repo sidesteps this by never naming the client's type at all
// (admin-stats/index.ts uses untyped `any` params for the same reason).
// deno-lint-ignore no-explicit-any
type Db = any;

// ── probe_state (generic key/value bookkeeping: rotation index, per-target
//    consecutive-breach counters, last observed cron status) ──────────────
async function getProbeState(db: Db, key: string): Promise<unknown | null> {
  const { data, error } = await db.from("probe_state").select("value").eq("key", key).maybeSingle();
  if (error || !data) return null;
  return (data as { value: unknown }).value;
}

async function setProbeState(db: Db, key: string, value: unknown): Promise<string | null> {
  const { error } = await db.from("probe_state").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) console.error(`[synthetic-probe] probe_state upsert failed for ${key}:`, error.message);
  return error ? error.message : null;
}

async function sendResendEmail(apiKey: string, from: string, to: string, subject: string, html: string): Promise<void> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error(`[synthetic-probe] Resend send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
  } catch (e) {
    console.error(`[synthetic-probe] Resend send threw: ${e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)}`);
  }
}

/**
 * Shared consecutive-breach bookkeeping for any of the three independent
 * alarm classes this function tracks (per-SLO-target, cron health, probe's
 * own auth health). Reads/writes probe_state[stateKey] and fires the
 * matching email through `alertFn` at most once per state transition.
 */
async function processBreach(
  db: Db,
  stateKey: string,
  breachedNow: boolean,
  buildEmail: (isBreach: boolean) => { subject: string; html: string } | null,
  alertFn: (subject: string, html: string) => Promise<void>,
): Promise<void> {
  const state = await getProbeState(db, stateKey);
  const previousCount = state && typeof (state as { count?: unknown }).count === "number" ? (state as { count: number }).count : 0;
  const { count, shouldAlert, shouldRecover } = nextBreachState(previousCount, breachedNow, BREACH_THRESHOLD);
  await setProbeState(db, stateKey, { count });

  if (shouldAlert) {
    const email = buildEmail(true);
    if (email) await alertFn(email.subject, email.html);
  } else if (shouldRecover) {
    const email = buildEmail(false);
    if (email) await alertFn(email.subject, email.html);
  }
}

// ── One probe request: fetch fire-safety-chat, stream-parse the SSE body,
//    return the raw outcome for buildPerfEventRow() to turn into a row ────
interface RunOutcome {
  mode: string;
  httpStatus: number | null;
  headersMs: number | null;
  marks: SseMarks;
  xTimingHeader: string | null;
  timedOut: boolean;
  fetchErrorMessage: string | null;
}

async function runOneProbe(mode: string, question: string, jwt: string): Promise<RunOutcome> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let marks = createInitialMarks();
  let httpStatus: number | null = null;
  let headersMs: number | null = null;
  let xTimingHeader: string | null = null;
  let timedOut = false;
  let fetchErrorMessage: string | null = null;

  try {
    const resp = await fetch(FIRE_SAFETY_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
        // Pin execution next to the database — same header the reference
        // scratchpad probe and the live bench use; without it, an unpinned
        // invocation runs near the caller and every DB round trip crosses
        // half the planet (see fire-safety-chat/index.ts's corsHeaders note).
        "x-region": REGION,
      },
      body: JSON.stringify({ messages: [{ role: "user", content: question }], mode, language: "ar" }),
      signal: controller.signal,
    });
    httpStatus = resp.status;
    headersMs = Date.now() - t0;
    xTimingHeader = resp.headers.get("x-timing");

    if (resp.ok && resp.body) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { complete, remainder } = splitCompleteLines(buffer);
        buffer = remainder;
        marks = reduceSseChunk(marks, complete, Date.now() - t0);
        if (marks.doneMs !== null) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
      if (marks.doneMs === null) {
        buffer += decoder.decode();
        const payload = extractDataPayload(buffer);
        if (payload !== null) marks = applySsePayload(marks, payload, Date.now() - t0);
        // Stream closed without an explicit [DONE] frame — treat "now" as done
        // rather than leaving done_ms null (which would misreport as "still running").
        if (marks.doneMs === null) marks = { ...marks, doneMs: Date.now() - t0 };
      }
    }
  } catch (e) {
    timedOut = controller.signal.aborted;
    fetchErrorMessage = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
  } finally {
    clearTimeout(timer);
  }

  return { mode, httpStatus, headersMs, marks, xTimingHeader, timedOut, fetchErrorMessage };
}

// ── SLO evaluation over perf_events, per target, with row-fetch caching so
//    the N slo_targets rows that share a (scope, window) only fetch once ──
async function evaluateSlosAndAlert(
  db: Db,
  alert: (subject: string, html: string) => Promise<void>,
): Promise<void> {
  const { data: targets, error: targetsErr } = await db.from("slo_targets").select("*");
  if (targetsErr) {
    console.error("[synthetic-probe] slo_targets fetch failed:", targetsErr.message);
    return;
  }

  const allModeCache = new Map<number, AggregatedStats>();
  const perModeCache = new Map<string, AggregatedStats>();
  const SELECT_COLS = "first_status_ms, first_text_ms, done_ms, chars, ok, error_code";

  for (const raw of (targets ?? []) as SloTarget[]) {
    const target = raw;
    const windowStart = new Date(Date.now() - target.window_minutes * 60_000).toISOString();

    let stats: AggregatedStats;
    if (target.mode === "all") {
      let cached = allModeCache.get(target.window_minutes);
      if (!cached) {
        const { data } = await db
          .from("perf_events")
          .select(SELECT_COLS)
          .eq("source", "synthetic")
          .gte("ts", windowStart);
        cached = aggregateStats((data ?? []) as PerfEventRowForStats[]);
        allModeCache.set(target.window_minutes, cached);
      }
      stats = cached;
    } else {
      const cacheKey = `${target.mode}:${target.window_minutes}`;
      let cached = perModeCache.get(cacheKey);
      if (!cached) {
        const { data } = await db
          .from("perf_events")
          .select(SELECT_COLS)
          .eq("source", "synthetic")
          .eq("mode", target.mode)
          .gte("ts", windowStart);
        cached = aggregateStats((data ?? []) as PerfEventRowForStats[]);
        perModeCache.set(cacheKey, cached);
      }
      stats = cached;
    }

    const { breached, observed } = evaluateTarget(target, stats);
    await processBreach(
      db,
      `breach:${target.key}`,
      breached,
      (isBreach) =>
        isBreach
          ? buildTargetBreachEmail({ target, observed: observed as number, sinceIso: new Date().toISOString() })
          : buildTargetRecoveryEmail({ target }),
      alert,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const expected = Deno.env.get("PROBE_TASK_TOKEN");
  const got = req.headers.get("x-probe-token") ?? "";
  if (!expected || !timingSafeEqual(got, expected)) {
    return json({ error: "forbidden" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = getSecretKey();
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  // Diagnostic (never the key itself): which key shape resolved, and — for a
  // legacy JWT — the role claim it carries. Answers "why did RLS apply?".
  const keyKind = serviceKey.startsWith("sb_secret_") ? "new_secret_key"
    : serviceKey.startsWith("sb_publishable_") ? "new_publishable_key"
    : serviceKey.split(".").length === 3 ? "legacy_jwt" : "unknown";
  let keyRole: string | null = null;
  if (keyKind === "legacy_jwt") {
    try { keyRole = String(JSON.parse(atob(serviceKey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role ?? null); } catch { keyRole = "unparsable"; }
  }
  const keyDiag = { key_kind: keyKind, key_role: keyRole, has_secret_keys_env: !!Deno.env.get("SUPABASE_SECRET_KEYS"), has_legacy_env: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), helper: SECRET_KEY_RESOLUTION };

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ConsultX <noreply@consultx.app>";
  const alertEmail = Deno.env.get("ALERT_EMAIL");

  const alert = async (subject: string, html: string): Promise<void> => {
    if (!resendKey || !alertEmail) {
      console.error(`[synthetic-probe] cannot send alert (RESEND_API_KEY or ALERT_EMAIL missing): ${subject}`);
      return;
    }
    await sendResendEmail(resendKey, fromEmail, alertEmail, subject, html);
  };

  // ── 1. mint the smoke-account session ──────────────────────────────────
  let jwt: string | null = null;
  let authError: string | null = null;
  try {
    const { data: userList, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw new Error(`listUsers: ${listErr.message}`);
    const smokeUser = userList.users.find((u) => u.email === SMOKE_EMAIL);
    if (!smokeUser) throw new Error(`smoke account ${SMOKE_EMAIL} not found`);

    const newPassword = crypto.randomUUID() + crypto.randomUUID();
    const upd = await db.auth.admin.updateUserById(smokeUser.id, { password: newPassword, email_confirm: true });
    if (upd.error) throw new Error(`password rotate: ${upd.error.message}`);

    // ROOT CAUSE of the silent write failures (2026-09-03): signing in on `db`
    // itself made supabase-js adopt the smoke user's session, so every later
    // PostgREST call ran as `authenticated` — RLS rejected the inserts and the
    // admin-only SELECTs came back empty. The sign-in now uses a throwaway
    // publishable-key client; `db` keeps the service role.
    const authClient = createClient(url, getPublishableKey(), { auth: { autoRefreshToken: false, persistSession: false } });
    const signin = await authClient.auth.signInWithPassword({ email: SMOKE_EMAIL, password: newPassword });
    if (signin.error || !signin.data.session) throw new Error(`signin: ${signin.error?.message ?? "no session returned"}`);
    jwt = signin.data.session.access_token;
  } catch (e) {
    authError = e instanceof Error ? e.message : String(e);
  }

  // Route auth failure through the same 2-consecutive-run mechanism as every
  // other alarm class — a single failed run is expected background noise
  // (see the concurrent-bench-run caveat in the module header) and must not
  // page the owner by itself.
  await processBreach(
    db,
    "breach:smoke_auth",
    jwt === null,
    (isBreach) => (isBreach ? buildProbeErrorEmail(authError ?? "unknown error") : buildProbeRecoveryEmail()),
    alert,
  );

  if (jwt === null) {
    console.error("[synthetic-probe] smoke auth failed this run (no chat probes executed):", authError);
    return json({ ok: false, error: `smoke auth failed: ${authError}` }, 500);
  }

  // ── 2. rotate the fixed question ────────────────────────────────────────
  const rotationState = await getProbeState(db, "rotation:question_index");
  const previousIndex =
    rotationState && typeof (rotationState as { index?: unknown }).index === "number"
      ? (rotationState as { index: number }).index
      : null;
  const questionIndex = nextQuestionIndex(previousIndex);
  // Write failures are surfaced in the response body as well as the logs —
  // the response is what the cron's net._http_response log keeps.
  const writeErrors: string[] = [];
  const rotErr = await setProbeState(db, "rotation:question_index", { index: questionIndex });
  if (rotErr) writeErrors.push(`probe_state: ${rotErr}`);
  const question = PROBE_QUESTIONS[questionIndex];

  // ── 3. run all 3 modes (best-effort per mode — one failing mode must not
  //       drop the other two), insert perf_events rows ─────────────────────
  const results: Array<{ mode: string; ok: boolean }> = [];
  for (const mode of MODES) {
    try {
      const outcome = await runOneProbe(mode, question, jwt);
      const row: PerfEventInsertRow = buildPerfEventRow({
        mode,
        region: REGION,
        questionIndex,
        httpStatus: outcome.httpStatus,
        headersMs: outcome.headersMs,
        marks: outcome.marks,
        xTimingHeader: outcome.xTimingHeader,
        timedOut: outcome.timedOut,
        fetchErrorMessage: outcome.fetchErrorMessage,
      });
      const { error: insErr } = await db.from("perf_events").insert(row);
      if (insErr) {
        console.error(`[synthetic-probe] perf_events insert failed for ${mode}:`, insErr.message);
        writeErrors.push(`perf_events(${mode}): ${insErr.message}`);
      }
      results.push({ mode, ok: row.ok });
    } catch (e) {
      console.error(`[synthetic-probe] probe run threw for ${mode}:`, e instanceof Error ? e.message : String(e));
      results.push({ mode, ok: false });
    }
  }

  // ── 4. SLO evaluation + alerting (best-effort — must not blank the response) ──
  try {
    await evaluateSlosAndAlert(db, alert);
  } catch (e) {
    console.error("[synthetic-probe] SLO evaluation failed:", e instanceof Error ? e.message : String(e));
  }

  // ── 5. cron health check ────────────────────────────────────────────────
  let cronStatus: number | null = null;
  try {
    const { data, error } = await db.rpc("last_cron_status");
    if (!error) cronStatus = (data as number | null) ?? null;
    else console.error("[synthetic-probe] last_cron_status() failed:", error.message);
  } catch (e) {
    console.error("[synthetic-probe] last_cron_status() threw:", e instanceof Error ? e.message : String(e));
  }
  await setProbeState(db, "cron_status", { status_code: cronStatus, checked_at: new Date().toISOString() });

  await processBreach(
    db,
    "breach:cron_status",
    isCronStatusBreached(cronStatus),
    (isBreach) => (isBreach ? buildCronBreachEmail(cronStatus) : buildCronRecoveryEmail()),
    alert,
  );

  return json({
    ok: true,
    question_index: questionIndex,
    results,
    cron_status: cronStatus,
    write_errors: writeErrors.map((e) => e.slice(0, 200)),
    key_diag: keyDiag,
  });
});
