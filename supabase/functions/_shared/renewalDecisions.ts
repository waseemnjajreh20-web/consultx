// ============================================================
// _shared/renewalDecisions.ts
//
// Pure decision logic for `process-subscription-renewal`.
//
// Same rules as _shared/billing.ts and _shared/webhookDecisions.ts, and for the
// same reason: ZERO imports, no Deno globals, no Supabase client. That is what
// lets this module be imported unchanged by `supabase/functions/**` (Deno) and
// by `src/__tests__/renewalDecisions.test.ts` (vitest / Node).
//
// It deliberately does NOT live in process-subscription-renewal/index.ts: that
// file imports `https://deno.land/std@0.168.0/http/server.ts` and calls
// `serve()` at module scope, so importing it from Vitest fails outright with
// "Only URLs with a scheme in: file and data are supported by the default ESM
// loader".
//
// Contract: docs/launch/billing-contract-20260823.md
// ============================================================

// ── H5. Single-flight lease ───────────────────────────────────────────────────

/** Lease key. One row per job in `public.job_locks`. */
export const RENEWAL_JOB_LOCK_NAME = "process-subscription-renewal";

/**
 * Lease TTL, in seconds. 15 minutes.
 *
 * Two bounds decide this number:
 *   - It must be COMFORTABLY LONGER than a worst-case run. A Supabase edge
 *     function is killed at its wall-clock ceiling (400 s at the time of
 *     writing), and this job additionally caps its own Moyasar lookups
 *     (`STALE_INITIATED_LOOKUP_CAP`), so no successful run can approach
 *     900 s. A lease that expired mid-run would let the next tick start while
 *     this one is still charging cards — exactly the double charge H5 closes.
 *   - It must be SHORTER than the cron interval (hourly), so that a run which
 *     dies without releasing (OOM, hard timeout, deploy) costs at most a
 *     handful of skipped ticks rather than a permanently wedged job.
 * 900 s sits between the two with room on both sides.
 */
export const RENEWAL_JOB_LOCK_TTL_SECONDS = 15 * 60;

export type LockOutcome =
  /** The lease is ours. Proceed, and release it at the end. */
  | "acquired"
  /** Someone else holds the lease, or the lock state is unknown. Skip this tick. */
  | "locked"
  /** The RPC does not exist yet (migration not applied). Proceed WITHOUT a lease. */
  | "degraded_missing_rpc";

/**
 * True when a PostgREST / Postgres error means "that FUNCTION does not exist".
 *
 * PostgREST returns `PGRST202` with "Could not find the function ... in the
 * schema cache"; Postgres returns SQLSTATE `42883` for an undefined function.
 * Deliberately narrower than `isUndefinedColumnError`: a generic
 * "... does not exist" only counts when the text also mentions a function, so
 * a missing TABLE or a missing ROLE is never mistaken for a missing RPC.
 */
export function isMissingFunctionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  if (code === "PGRST202" || code === "42883") return true;
  const text = [e.message, e.details, e.hint]
    .map((v) => (typeof v === "string" ? v.toLowerCase() : ""))
    .join(" ");
  if (text.includes("could not find the function")) return true;
  return text.includes("function") && text.includes("does not exist");
}

/**
 * Turn the result of the `try_acquire_job_lock` RPC into a decision.
 *
 * Three cases, and the direction of each failure is deliberate:
 *   1. No error, `data === true`  -> "acquired".
 *   2. No error, anything else    -> "locked" (another run holds the lease).
 *   3. The RPC is MISSING         -> "degraded_missing_rpc". The owner applies
 *      migrations by hand, so the code must not brick itself while waiting: a
 *      bricked renewal job means no trial ever converts and no subscription
 *      ever renews. Fail SOFT, loudly.
 *   4. Any OTHER error            -> "locked". An unknown lock state is treated
 *      as "someone else may be running": a skipped tick is harmless, a double
 *      charge on a stored card is not.
 */
export function classifyLockResult(error: unknown, data: unknown): LockOutcome {
  if (error) {
    return isMissingFunctionError(error) ? "degraded_missing_rpc" : "locked";
  }
  return data === true ? "acquired" : "locked";
}

// ── H7. The rejected-conversion zombie ────────────────────────────────────────

/**
 * `webhook_dead_letters.reason` written for ONE permanent refusal of the
 * unattended post-trial charge. These rows are the refusal counter: there is no
 * column on `user_subscriptions` to hold one and none may be added.
 */
export const TRIAL_CONVERSION_REFUSAL_REASON = "trial_conversion_refused";

/** `reason` written once, when a refused trial is finally closed out. */
export const TRIAL_CONVERSION_FORFEIT_REASON = "trial_conversion_forfeited";

/**
 * How many PERMANENT refusals a lapsed trial may accumulate before the row is
 * closed to `expired`.
 *
 * Why 3, and why not "forever":
 *   - A permanent refusal is DETERMINISTIC. `trialChargeAuthorized` compares the
 *     row against the immutable metadata of an already-captured verification
 *     payment, so tick 2 and tick 3 cannot reach a different answer. The count
 *     buys observation time for a human, not a different outcome.
 *   - Leaving the row `trialing` forever is the defect: it is refused on every
 *     hourly tick, never converts, never expires, and — because
 *     `user_subscriptions_one_live_row_per_user` counts `trialing` as LIVE —
 *     blocks any new subscription the customer buys.
 *   - 3 ticks (about 3 hours on the hourly schedule) leaves three dated dead
 *     letters and three loud log lines before anything is closed, which is
 *     enough for the daily ops sweep to see the row in its pre-closure state.
 *
 * TRANSIENT refusals (Moyasar unreachable) are NOT counted here and never
 * dead-lettered — see the call site.
 */
export const MAX_TRIAL_CONVERSION_REFUSALS = 3;

export interface TrialRefusalOutcome {
  /** True when this refusal is the one that closes the row. */
  expire: boolean;
  /** Refusals still allowed after this one. 0 once the row is being closed. */
  remaining: number;
}

/**
 * @param refusalCount refusals recorded for THIS subscription INCLUDING the one
 *                     just written. A non-finite / negative input is treated as
 *                     1 (this refusal) rather than as 0, so a broken count can
 *                     never read as "no refusals yet, keep going forever".
 */
export function trialRefusalOutcome(refusalCount: number | null | undefined): TrialRefusalOutcome {
  const raw = Number(refusalCount ?? 0);
  const count = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  if (count >= MAX_TRIAL_CONVERSION_REFUSALS) return { expire: true, remaining: 0 };
  return { expire: false, remaining: MAX_TRIAL_CONVERSION_REFUSALS - count };
}

// ── M9 / M11. Stale `initiated` payment_transactions ──────────────────────────

/**
 * How old an `initiated` transaction must be before this job will resolve it.
 * Two hours. A live Moyasar charge settles in seconds and its webhook lands
 * within minutes; two hours is far outside that envelope, so nothing in flight
 * is ever touched.
 */
export const STALE_INITIATED_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * Maximum Moyasar payment lookups this pass performs per run.
 *
 * Each lookup is one HTTPS round-trip. 25 keeps the pass under roughly a minute
 * even at a pessimistic 2 s per request, which leaves the bulk of the edge
 * function's wall-clock budget for the charge loop — the part that must not be
 * cut off half way. Rows not reached this tick are simply picked up next hour;
 * they are already hours old, so an extra hour changes nothing.
 */
export const STALE_INITIATED_LOOKUP_CAP = 25;

export type StaleInitiatedAction =
  /** Safe to mark the transaction `failed`: no money can have moved. */
  | "mark_failed"
  /** Money DID move (or may still). Never flip it — dead-letter for a replay. */
  | "dead_letter_paid"
  /** A status this job does not understand. Leave the row alone, dead-letter it. */
  | "dead_letter_unexpected";

export interface StaleInitiatedResolution {
  action: StaleInitiatedAction;
  /** `payment_transactions.failure_code` to write, when action is "mark_failed". */
  failureCode: string | null;
  /** `webhook_dead_letters.reason` to write, for the two dead-letter actions. */
  deadLetterReason: string | null;
}

/**
 * Decide what to do with a `payment_transactions` row stuck at `initiated` for
 * more than `STALE_INITIATED_AFTER_MS`, given the status Moyasar reports for the
 * payment it references.
 *
 * This pass exists because such a row blocks BOTH idempotency guards in this
 * job (they match `initiated` as well as `captured`), so the subscription is
 * never charged again. It is also the single most dangerous thing in the file:
 * flipping a row that actually SUCCEEDED to `failed` unblocks the guard and lets
 * the next tick charge the customer a second time. Hence:
 *
 *   moyasar "initiated"  -> mark_failed. Moyasar `initiated` means
 *                           created-but-not-captured. After two hours it will
 *                           never complete, and no money has moved.
 *   moyasar "failed"     -> mark_failed. Authoritative.
 *   moyasar "paid"       -> NEVER flip. A captured payment whose webhook was
 *                           lost needs a replay, not a `failed` stamp.
 *   anything else        -> NEVER flip. `authorized` / `captured` / `refunded` /
 *                           `voided` all mean funds were touched, and an
 *                           unrecognised string means this code is out of date.
 *                           Unknown state is never "safe to re-charge".
 */
export function resolveStaleInitiated(moyasarStatus: unknown): StaleInitiatedResolution {
  const status = typeof moyasarStatus === "string" ? moyasarStatus.trim().toLowerCase() : "";

  if (status === "initiated") {
    return {
      action: "mark_failed",
      failureCode: "STALE_INITIATED_NEVER_CAPTURED",
      deadLetterReason: null,
    };
  }
  if (status === "failed") {
    return {
      action: "mark_failed",
      failureCode: "MOYASAR_FAILED",
      deadLetterReason: null,
    };
  }
  if (status === "paid") {
    return {
      action: "dead_letter_paid",
      failureCode: null,
      deadLetterReason: "stale_initiated_but_paid",
    };
  }
  return {
    action: "dead_letter_unexpected",
    failureCode: null,
    deadLetterReason: "stale_initiated_unexpected_status",
  };
}

/** `failure_code` for a stale row that never reached Moyasar at all. */
export const STALE_INITIATED_NO_PAYMENT_ID_CODE = "STALE_INITIATED_NO_PAYMENT_ID";
