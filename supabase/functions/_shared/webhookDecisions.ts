// ============================================================
// _shared/webhookDecisions.ts
//
// Pure decision logic for the Moyasar webhook.
//
// Same rules as _shared/billing.ts and for the same reason: ZERO imports, no
// Deno globals, no Supabase client. That is what lets this module be imported
// unchanged by `supabase/functions/**` (Deno) and by
// `src/__tests__/billing.test.ts` (vitest / Node).
//
// It deliberately does NOT live in moyasar-webhook/index.ts: that file imports
// `https://deno.land/std@0.168.0/http/server.ts` and calls `serve()` at module
// scope, so importing it from Vitest fails outright with
// "Only URLs with a scheme in: file and data are supported by the default ESM
// loader" — verified, not assumed.
//
// Contract: docs/launch/billing-contract-20260823.md
// ============================================================

// ── R3-C2: no activation after cancellation ───────────────────────────────────
//
// The race this closes:
//   09:00  process-subscription-renewal creates a `post_trial_first_charge`
//          (or `renewal`) payment against the stored card.
//   09:02  the customer cancels.
//   09:05  Moyasar delivers the `paid` webhook for the 09:00 payment.
//
// Before this guard the `paid` branch set `status = "active"` unconditionally,
// so a cancelled subscription was revived and the money kept.

export type ActivationFlow =
  | "trial_card_verification"
  | "immediate_charge"
  | "post_trial_first_charge"
  | "renewal";

/**
 * How recent a payment must be to count as a deliberate new checkout rather
 * than a stale delivery.
 *
 * Deliberately the SAME 24h bound as `REPROCESS_WINDOW_MS` in
 * moyasar-webhook/index.ts, which is Moyasar's own redelivery window and is
 * documented there as existing "so an ancient redelivery can never resurrect a
 * closed period". Reusing it means a redelivery old enough that the idempotency
 * path refuses to re-apply it can never be treated as a fresh resubscribe
 * either — the two bounds cannot drift into disagreeing about the same event.
 */
export const RESUBSCRIBE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Tolerance for clock skew between Moyasar's `created_at` and our own clock.
 * Without it a payment created "now" on a slightly fast upstream clock would
 * have a negative age and a genuine resubscribe would be refused.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export interface ActivationInput {
  /** `user_subscriptions.status` as it stands RIGHT NOW, re-read from the row. */
  subStatus: string | null | undefined;
  /** `user_subscriptions.cancel_at_period_end`. */
  cancelAtPeriodEnd: boolean | null | undefined;
  /** `user_subscriptions.cancelled_at` in ms, or null. */
  cancelledAtMs: number | null;
  /** The flow of this payment, read from the RE-VERIFIED Moyasar payment. */
  flow: ActivationFlow;
  /** Moyasar `payment.created_at` in ms, or null when absent/unparseable. */
  paymentCreatedAtMs: number | null;
  nowMs: number;
}

export type ActivationDecision =
  | { activate: true; reason: "ok" }
  | { activate: false; reason: "paid_after_cancel" };

const REFUSE: ActivationDecision = { activate: false, reason: "paid_after_cancel" };
const ALLOW: ActivationDecision = { activate: true, reason: "ok" };

/** Parse an ISO-8601 (or epoch-ms) timestamp. Returns null when unusable. */
export function parseTimestampMs(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Decide whether a captured payment may move a subscription to `active`.
 *
 * Only called for the real-invoice flows (`immediate_charge`,
 * `post_trial_first_charge`, `renewal`). `trial_card_verification` never
 * activates anything and keeps its own branch in index.ts.
 *
 * A subscription is "closed" when it is `cancelled` / `expired`, OR when it is
 * still live but the customer has already asked for it to end
 * (`cancel_at_period_end = true` — which is what a `trialing` cancellation now
 * writes; see cancel-subscription/index.ts).
 *
 * A closed subscription may ONLY be activated by a deliberate new checkout:
 *   - the flow must be `immediate_charge`. An unattended cron charge is never
 *     `immediate_charge` or `post_trial_first_charge` — see R4-CRITICAL-1 in the
 *     body for why admitting the second one is safe, and why `renewal` is not.
 *   - the payment must be fresh — created within RESUBSCRIBE_WINDOW_MS.
 *   - the payment must have been created AFTER the cancellation. This is the
 *     precise discriminator: in the race the payment predates the cancel; in a
 *     genuine resubscribe it follows it.
 *
 * Unknown timestamps fail CLOSED (refuse). A refusal is loud, dead-lettered and
 * refundable; a wrong activation silently keeps a cancelled customer's money.
 */
export function decideActivation(input: ActivationInput): ActivationDecision {
  const terminated = input.subStatus === "cancelled" || input.subStatus === "expired";
  const cancelPending = input.cancelAtPeriodEnd === true;

  if (!terminated && !cancelPending) return ALLOW;

  // R4-CRITICAL-1 (2026-08-23). This used to be `flow !== "immediate_charge"`,
  // which refused BEFORE the timestamp discriminator below could run. That
  // silently broke the only recovery path a mid-trial canceller has:
  //
  //   deriveFlow (_shared/billing.ts) returns `post_trial_first_charge` for
  //   EVERY lapsed `trialing` row — not `immediate_charge`. So a customer who
  //   cancelled during the trial, let it lapse, and then came back through
  //   /subscribe was CHARGED (plan price minus the 1.00 SAR credit) and then
  //   REFUSED here, landing a `paid_after_cancel` dead letter. Money taken,
  //   nothing delivered, and nothing in the product told them why.
  //
  // WHY ADMITTING THIS FLOW IS SAFE — the property that carries it:
  // `post_trial_first_charge` payments have exactly two possible authors.
  //   1. The renewal cron's conversion pass. It selects with
  //      `.eq("cancel_at_period_end", false)`
  //      (process-subscription-renewal/index.ts, trial-conversion query), so it
  //      can only ever create such a payment for a row that was NOT cancelled at
  //      creation time. If the customer cancels afterwards, the payment
  //      necessarily PREDATES `cancelled_at` and the discriminator below refuses
  //      it — which is precisely the 09:00 / 09:02 / 09:05 race R3-C2 exists for.
  //   2. The customer's own authenticated checkout, which is by definition
  //      created AFTER the cancellation they are walking back.
  // The two cases are therefore separated exactly by "was this payment created
  // after `cancelled_at`?" — the same discriminator, no new signal required.
  //
  // `renewal` stays refused. It is cron-only (a checkout never derives it) and
  // that pass carries the same `cancel_at_period_end = false` filter, so a
  // renewal created after a cancellation cannot legitimately exist. Refusing it
  // is defence in depth, not a behaviour anyone can reach.
  const ACTIVATABLE_AFTER_CANCEL: readonly ActivationFlow[] = [
    "immediate_charge",
    "post_trial_first_charge",
  ];
  if (!ACTIVATABLE_AFTER_CANCEL.includes(input.flow)) return REFUSE;

  const createdAtMs = input.paymentCreatedAtMs;
  if (createdAtMs === null) return REFUSE;

  const ageMs = input.nowMs - createdAtMs;
  if (ageMs < -CLOCK_SKEW_TOLERANCE_MS) return REFUSE;
  if (ageMs >= RESUBSCRIBE_WINDOW_MS) return REFUSE;

  if (input.cancelledAtMs !== null && createdAtMs <= input.cancelledAtMs) return REFUSE;

  return ALLOW;
}

// ── Resubscribing INSIDE the trial: clearing a scheduled cancellation ────────
//
// `decideActivation` above governs the real-invoice flows only. The
// `trial_card_verification` branch of moyasar-webhook never activates anything,
// so it never consults it — and it also never cleared `cancel_at_period_end`.
//
// That left a hole in the opposite direction from R3-C2. A customer who cancels
// during the trial keeps `status = "trialing"` with `cancel_at_period_end =
// true` (cancel-subscription/index.ts). If they then change their mind and
// check out again while the trial is still running,
// moyasar-create-subscription reuses that same live row and the flow is
// `trial_card_verification` again — a second 1.00 SAR charge. The webhook
// stored the card, and left the cancellation standing:
// process-subscription-renewal filters its conversion passes on
// `cancel_at_period_end = false`, so the subscription was still closed at
// trial_end. Money taken, nothing bought, no signal anywhere.
//
// The clear has to survive the SAME race decideActivation exists for: a
// verification created at 09:00, a cancellation at 09:02 and the webhook at
// 09:05 must NOT un-cancel anything. So the discriminator is identical — the
// payment must be fresh AND created strictly after the cancellation — and it is
// applied here without touching decideActivation or the conditions under which
// that guard is consulted.

export interface TrialCancelClearInput {
  /** `user_subscriptions.status`, re-read from the row. Must be `trialing`. */
  subStatus: string | null | undefined;
  /** `user_subscriptions.cancel_at_period_end`. */
  cancelAtPeriodEnd: boolean | null | undefined;
  /** `user_subscriptions.cancelled_at` in ms, or null. */
  cancelledAtMs: number | null;
  /** Moyasar `payment.created_at` in ms, or null when absent/unparseable. */
  paymentCreatedAtMs: number | null;
  nowMs: number;
}

export type TrialCancelClearDecision =
  | { clear: true; reason: "resubscribed_after_cancel" }
  | {
      clear: false;
      reason:
        | "nothing_to_clear"
        | "not_trialing"
        | "unknown_payment_time"
        | "future_dated_payment"
        | "stale_payment"
        | "unknown_cancel_time"
        | "payment_predates_cancel";
    };

/**
 * Decide whether a captured 1.00 SAR card verification may withdraw a
 * customer's scheduled end-of-trial cancellation.
 *
 * Fail-closed in BOTH unknown cases (no payment timestamp, no cancellation
 * timestamp): the cancellation stands. Refusing costs at most the 1.00 SAR
 * verification and is dead-lettered by the caller so a human can see it;
 * clearing wrongly silently overrides a cancellation the customer asked for and
 * bills them a full plan price at trial_end.
 *
 * `reason: "nothing_to_clear"` is the ordinary case (no cancellation pending)
 * and is NOT an anomaly — the caller must not dead-letter it.
 */
export function decideTrialCancelClear(
  input: TrialCancelClearInput,
): TrialCancelClearDecision {
  if (input.cancelAtPeriodEnd !== true) return { clear: false, reason: "nothing_to_clear" };
  // Only a live trial can be re-armed here. A `cancelled` / `expired` /
  // `active` row reaching this branch is a late or misrouted verification and
  // its lifecycle is left untouched, exactly as the surrounding branch does.
  if (input.subStatus !== "trialing") return { clear: false, reason: "not_trialing" };

  const createdAtMs = input.paymentCreatedAtMs;
  if (createdAtMs === null) return { clear: false, reason: "unknown_payment_time" };

  const ageMs = input.nowMs - createdAtMs;
  // R4-LOW-9: these are two different anomalies and must not share one label.
  // A payment dated in the FUTURE beyond clock-skew tolerance is a clock or data
  // fault; a payment older than the resubscribe window is genuinely stale. Ops
  // reads these reasons out of the dead letters, and calling a future-dated
  // payment "stale" sends the reader looking for the wrong problem.
  if (ageMs < -CLOCK_SKEW_TOLERANCE_MS) return { clear: false, reason: "future_dated_payment" };
  if (ageMs >= RESUBSCRIBE_WINDOW_MS) return { clear: false, reason: "stale_payment" };

  if (input.cancelledAtMs === null) return { clear: false, reason: "unknown_cancel_time" };
  if (createdAtMs <= input.cancelledAtMs) {
    return { clear: false, reason: "payment_predates_cancel" };
  }

  return { clear: true, reason: "resubscribed_after_cancel" };
}

// ── M17: retirement must key off the NAMED constraint ────────────────────────
//
// The `paid` path reacts to a unique violation during activation by expiring
// the user's OTHER `trialing` / `past_due` rows. That destructive write is only
// ever correct for ONE constraint: the partial unique index that allows a single
// live row per user. `isUniqueViolationError` in _shared/billing.ts matches ANY
// SQLSTATE 23505, so a violation raised by some other unique index (today or
// after any future schema change) would have retired live subscription rows for
// a reason that had nothing to do with them.

/** The only unique constraint whose violation may retire other live rows. */
export const ONE_LIVE_ROW_CONSTRAINT = "user_subscriptions_one_live_row_per_user";

/**
 * True ONLY for a unique violation that actually names
 * `user_subscriptions_one_live_row_per_user`.
 *
 * SAFE DEFAULT — an unrecognisable error returns FALSE (do not retire).
 *
 * The two ways to be wrong are not symmetric:
 *   - Wrongly returning TRUE expires live `trialing` / `past_due` rows that
 *     belong to a subscription this payment never bought. That is a silent,
 *     destructive loss of a paying customer's access, with nothing in the
 *     dead-letter table to show for it — the retry after it may even succeed.
 *   - Wrongly returning FALSE leaves the activation UPDATE failing, which falls
 *     straight into the `subscription_update_failed_on_paid` path: a dead letter
 *     plus a non-2xx, so Moyasar redelivers and a human sees the captured
 *     payment. Nothing is destroyed and nothing is silent.
 *
 * So the unknown case fails toward "strand loudly", never toward "delete".
 * In practice the name is recoverable: PostgREST forwards the Postgres message
 * verbatim ('duplicate key value violates unique constraint "<name>"') and
 * postgres-js style errors carry a `constraint` field, both of which are read
 * below.
 */
export function isOneLiveRowPerUserViolation(error: unknown): boolean {
  return isNamedUniqueViolation(error, ONE_LIVE_ROW_CONSTRAINT);
}

/**
 * The unique index on `payment_transactions (moyasar_payment_id)`
 * (`WHERE moyasar_payment_id IS NOT NULL`), confirmed present in
 * docs/audits/schema-baseline-20260501/indexes.json.
 */
export const TRANSACTION_PAYMENT_ID_CONSTRAINT = "payment_transactions_moyasar_payment_id_key";

/**
 * True when an INSERT into `payment_transactions` collided with the unique
 * index on `moyasar_payment_id`.
 *
 * This is the one transaction-write error that is NOT a failure to persist: the
 * row exists, another in-flight delivery of the SAME event wrote it a moment
 * earlier (the `existingTx` lookup runs before the insert, so two overlapping
 * deliveries can both see "no row"). Treating it as fatal would file a
 * `transaction_write_failed` dead letter and demand a redelivery for a state
 * that is already correct.
 *
 * Same fail-closed default as above: an unnamed 23505 returns FALSE and is
 * handled as a real write failure — dead letter plus non-2xx — which self-heals
 * on redelivery because the row is found by then.
 */
export function isDuplicateTransactionInsert(error: unknown): boolean {
  return isNamedUniqueViolation(error, TRANSACTION_PAYMENT_ID_CONSTRAINT);
}

/**
 * Shared implementation: SQLSTATE 23505 that actually NAMES `constraintName`.
 *
 * Strictly 23505 — a textual "duplicate key" fallback is deliberately not
 * accepted, because both callers use the answer to take an irreversible-ish
 * decision (destroy rows / skip an error) and must demand the machine-readable
 * code rather than prose.
 */
function isNamedUniqueViolation(error: unknown, constraintName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    constraint?: unknown;
  };

  if (e.code !== "23505") return false;

  // `constraint` is authoritative when the driver provides it.
  if (typeof e.constraint === "string" && e.constraint.length > 0) {
    return e.constraint === constraintName;
  }

  const text = [e.message, e.details]
    .map((v) => (typeof v === "string" ? v.toLowerCase() : ""))
    .join(" ");
  return text.includes(constraintName);
}

// ── M13: metadata.expected_amount is written but was never validated ─────────
//
// Contract Section 7 lists `expected_amount` (halalas, string-or-number
// tolerant) in the metadata of every payment this codebase creates
// (moyasar-initiate-token-payment and process-subscription-renewal both write
// it alongside `flow`). Nothing ever read it back, so the one number the SERVER
// committed to at creation time was never compared with what was captured.

/**
 * Parse `metadata.expected_amount` — string-or-number tolerant, per Section 7.
 *
 * Money is always an integer number of halalas. Anything that is not a finite
 * non-negative integer (or the exact decimal string of one) is unusable, and
 * unusable is NOT the same as absent: the caller must treat it as a failure,
 * never as "no expectation".
 *
 * `typeof` guards come first on purpose: `Number([])` is 0 and `Number(true)`
 * is 1, so a bare `Number(raw)` would silently invent an expectation.
 */
export function parseExpectedAmount(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export interface ExpectedAmountInput {
  /**
   * Raw `metadata.flow` from the RE-VERIFIED payment. Its presence is the
   * marker that this payment was created by the current code, which always
   * writes `expected_amount` next to it.
   */
  rawFlow: unknown;
  /** Raw `metadata.expected_amount` from the RE-VERIFIED payment. */
  rawExpectedAmount: unknown;
  /** `amount` from the RE-VERIFIED payment (never the webhook body). */
  verifiedAmount: unknown;
}

export type ExpectedAmountDecision =
  | { ok: true; reason: "legacy_payment_no_flow_metadata" | "match"; expected: number | null }
  | {
      ok: false;
      reason:
        | "expected_amount_missing"
        | "expected_amount_unparseable"
        | "expected_amount_mismatch";
      expected: number | null;
    };

/**
 * Compare the amount the server intended when it CREATED the payment with the
 * amount Moyasar says it actually captured.
 *
 * This is IN ADDITION to `expectedAmountsFor` in _shared/billing.ts, not a
 * replacement. They prove two different things:
 *   - `expected_amount` proves the captured amount equals what THIS payment was
 *     created for (catches a tampered or re-priced charge between creation and
 *     capture).
 *   - `expectedAmountsFor` proves the captured amount is a price the plan is
 *     worth NOW (catches a payment created for a price the plan never had).
 * A payment can pass either one alone and still be wrong.
 *
 * Legacy payments — created before `flow` was written — carry no
 * `expected_amount` either. They are skipped, exactly as the flow-derivation
 * fallback in moyasar-webhook skips them, so old payments are never stranded.
 * Once `flow` IS present, a missing or unparseable `expected_amount` is a
 * defect in our own payment creation, not a legacy shape, and is refused.
 */
export function decideExpectedAmount(input: ExpectedAmountInput): ExpectedAmountDecision {
  const hasFlowMarker = typeof input.rawFlow === "string" && input.rawFlow.trim() !== "";
  if (!hasFlowMarker) {
    return { ok: true, reason: "legacy_payment_no_flow_metadata", expected: null };
  }

  if (input.rawExpectedAmount === undefined || input.rawExpectedAmount === null) {
    return { ok: false, reason: "expected_amount_missing", expected: null };
  }

  const expected = parseExpectedAmount(input.rawExpectedAmount);
  if (expected === null) {
    return { ok: false, reason: "expected_amount_unparseable", expected: null };
  }

  if (typeof input.verifiedAmount !== "number" || input.verifiedAmount !== expected) {
    return { ok: false, reason: "expected_amount_mismatch", expected };
  }

  return { ok: true, reason: "match", expected };
}
