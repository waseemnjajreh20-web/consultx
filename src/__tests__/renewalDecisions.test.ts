/**
 * Contract tests for the pure decision logic of
 * `supabase/functions/process-subscription-renewal`.
 *
 * Source of truth: docs/launch/billing-contract-20260823.md
 *
 * What these tests pin down, and why each direction matters:
 *
 *   H5  — an unknown lock state must read as LOCKED (skip the tick), while a
 *         MISSING lock RPC must read as "run anyway, loudly". A skipped tick is
 *         harmless; a bricked renewal job means no trial ever converts.
 *   H7  — a permanent refusal of the unattended post-trial charge is counted and
 *         eventually closes the row; the counter never reads as "zero refusals"
 *         on corrupt input, because that would restore the forever-zombie.
 *   M9  — a stale `initiated` transaction is only ever flipped to `failed` when
 *         no money can have moved. Every other upstream status leaves the row
 *         alone, because flipping a paid row unblocks the idempotency guard and
 *         charges the customer twice.
 */
import { describe, it, expect } from "vitest";
import {
  classifyLockResult,
  isMissingFunctionError,
  MAX_TRIAL_CONVERSION_REFUSALS,
  RENEWAL_JOB_LOCK_NAME,
  RENEWAL_JOB_LOCK_TTL_SECONDS,
  resolveStaleInitiated,
  STALE_INITIATED_AFTER_MS,
  STALE_INITIATED_LOOKUP_CAP,
  STALE_INITIATED_NO_PAYMENT_ID_CODE,
  TRIAL_CONVERSION_FORFEIT_REASON,
  TRIAL_CONVERSION_REFUSAL_REASON,
  trialRefusalOutcome,
} from "../../supabase/functions/_shared/renewalDecisions.ts";

// ── H5. Detecting a missing RPC ───────────────────────────────────────────────

describe("isMissingFunctionError", () => {
  it("matches the PostgREST code for an unknown function", () => {
    expect(isMissingFunctionError({ code: "PGRST202" })).toBe(true);
  });

  it("matches the Postgres SQLSTATE for an undefined function", () => {
    expect(isMissingFunctionError({ code: "42883" })).toBe(true);
  });

  it("matches PostgREST's schema-cache message", () => {
    expect(
      isMissingFunctionError({
        message:
          "Could not find the function public.try_acquire_job_lock(p_holder, p_job, p_ttl_seconds) in the schema cache",
      }),
    ).toBe(true);
  });

  it("matches a Postgres 'function ... does not exist' message", () => {
    expect(
      isMissingFunctionError({ message: 'function public.release_job_lock(text, text) does not exist' }),
    ).toBe(true);
  });

  it("does NOT match a missing COLUMN error", () => {
    // PGRST204 is the column case and is handled by isUndefinedColumnError.
    // Confusing the two would make the job run unlocked on the wrong signal.
    expect(isMissingFunctionError({ code: "PGRST204", message: "Could not find the 'x' column" })).toBe(false);
  });

  it("does NOT match a missing RELATION error", () => {
    expect(isMissingFunctionError({ message: 'relation "public.job_locks" does not exist' })).toBe(false);
  });

  it("does NOT match a transport error", () => {
    expect(isMissingFunctionError({ message: "fetch failed" })).toBe(false);
  });

  it("is safe on null / non-objects", () => {
    expect(isMissingFunctionError(null)).toBe(false);
    expect(isMissingFunctionError(undefined)).toBe(false);
    expect(isMissingFunctionError("PGRST202")).toBe(false);
    expect(isMissingFunctionError(42883)).toBe(false);
  });
});

// ── H5. Turning the RPC result into a decision ────────────────────────────────

describe("classifyLockResult", () => {
  it("acquires only on an explicit true", () => {
    expect(classifyLockResult(null, true)).toBe("acquired");
  });

  it("treats false as another run holding the lease", () => {
    expect(classifyLockResult(null, false)).toBe("locked");
  });

  it("treats a null / undefined / non-boolean result as LOCKED, not acquired", () => {
    // Fail closed: an ambiguous answer must never be read as "the lease is ours".
    expect(classifyLockResult(null, null)).toBe("locked");
    expect(classifyLockResult(null, undefined)).toBe("locked");
    expect(classifyLockResult(null, "true")).toBe("locked");
    expect(classifyLockResult(null, 1)).toBe("locked");
  });

  it("fails SOFT when the RPC does not exist yet (migration not applied)", () => {
    expect(classifyLockResult({ code: "PGRST202" }, null)).toBe("degraded_missing_rpc");
  });

  it("fails CLOSED on any other error, even when data looks like success", () => {
    // The error wins. An unknown lock state is treated as held.
    expect(classifyLockResult({ message: "fetch failed" }, true)).toBe("locked");
    expect(classifyLockResult({ code: "57014", message: "canceling statement due to statement timeout" }, true))
      .toBe("locked");
  });
});

describe("renewal lease constants", () => {
  it("names the lease after the job", () => {
    expect(RENEWAL_JOB_LOCK_NAME).toBe("process-subscription-renewal");
  });

  it("holds the lease longer than any possible run but shorter than the cron interval", () => {
    // Longer than the Supabase edge-function wall-clock ceiling (400 s), so the
    // lease cannot expire mid-run and let the next tick charge the same cards.
    expect(RENEWAL_JOB_LOCK_TTL_SECONDS).toBeGreaterThan(400);
    // Shorter than the hourly cron interval, so a run that dies without
    // releasing costs a few skipped ticks, not a permanently wedged job.
    expect(RENEWAL_JOB_LOCK_TTL_SECONDS).toBeLessThan(60 * 60);
  });
});

// ── H7. The rejected-conversion zombie ────────────────────────────────────────

describe("trialRefusalOutcome", () => {
  it("does not close the row before the cap is reached", () => {
    for (let n = 1; n < MAX_TRIAL_CONVERSION_REFUSALS; n++) {
      const outcome = trialRefusalOutcome(n);
      expect(outcome.expire).toBe(false);
      expect(outcome.remaining).toBe(MAX_TRIAL_CONVERSION_REFUSALS - n);
    }
  });

  it("closes the row exactly at the cap", () => {
    const outcome = trialRefusalOutcome(MAX_TRIAL_CONVERSION_REFUSALS);
    expect(outcome.expire).toBe(true);
    expect(outcome.remaining).toBe(0);
  });

  it("closes the row above the cap too", () => {
    expect(trialRefusalOutcome(MAX_TRIAL_CONVERSION_REFUSALS + 5).expire).toBe(true);
  });

  it("never reads corrupt input as 'no refusals yet'", () => {
    // Reading 0 would restore the defect: a row refused on every tick forever.
    // The floor is 1 — the refusal that was just written.
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      const outcome = trialRefusalOutcome(bad as number | null | undefined);
      expect(outcome.remaining).toBeLessThanOrEqual(MAX_TRIAL_CONVERSION_REFUSALS - 1);
    }
  });

  it("floors a fractional count instead of rounding it up", () => {
    expect(trialRefusalOutcome(2.9)).toEqual(trialRefusalOutcome(2));
  });

  it("uses distinct dead-letter reasons for a refusal and for the final forfeit", () => {
    // The refusal reason is the counting key; mixing the two would make the
    // forfeit row inflate the count that triggers the forfeit.
    expect(TRIAL_CONVERSION_REFUSAL_REASON).not.toBe(TRIAL_CONVERSION_FORFEIT_REASON);
    expect(TRIAL_CONVERSION_REFUSAL_REASON.length).toBeGreaterThan(0);
    expect(TRIAL_CONVERSION_FORFEIT_REASON.length).toBeGreaterThan(0);
  });

  it("gives ops more than one dated observation before closing a row", () => {
    expect(MAX_TRIAL_CONVERSION_REFUSALS).toBeGreaterThan(1);
  });
});

// ── M9 / M11. Stale `initiated` transactions ──────────────────────────────────

describe("resolveStaleInitiated", () => {
  it("closes a payment Moyasar still reports as initiated", () => {
    const r = resolveStaleInitiated("initiated");
    expect(r.action).toBe("mark_failed");
    expect(r.failureCode).toBe("STALE_INITIATED_NEVER_CAPTURED");
    expect(r.deadLetterReason).toBeNull();
  });

  it("closes a payment Moyasar reports as failed", () => {
    const r = resolveStaleInitiated("failed");
    expect(r.action).toBe("mark_failed");
    expect(r.failureCode).toBe("MOYASAR_FAILED");
  });

  it("NEVER closes a payment Moyasar reports as paid", () => {
    // This is the double-charge guard. Flipping a captured payment to `failed`
    // unblocks the idempotency guard and the next tick charges the card again.
    const r = resolveStaleInitiated("paid");
    expect(r.action).toBe("dead_letter_paid");
    expect(r.failureCode).toBeNull();
    expect(r.deadLetterReason).toBe("stale_initiated_but_paid");
  });

  it("never closes a status that means funds were touched", () => {
    for (const status of ["authorized", "captured", "refunded", "voided"]) {
      const r = resolveStaleInitiated(status);
      expect(r.action).toBe("dead_letter_unexpected");
      expect(r.failureCode).toBeNull();
    }
  });

  it("never closes an unrecognised or missing status", () => {
    for (const status of [null, undefined, "", "   ", 7, {}, "something_new"]) {
      const r = resolveStaleInitiated(status);
      expect(r.action).toBe("dead_letter_unexpected");
      expect(r.failureCode).toBeNull();
      expect(r.deadLetterReason).toBe("stale_initiated_unexpected_status");
    }
  });

  it("normalises case and surrounding whitespace", () => {
    expect(resolveStaleInitiated("  PAID ").action).toBe("dead_letter_paid");
    expect(resolveStaleInitiated("Failed").action).toBe("mark_failed");
    expect(resolveStaleInitiated("INITIATED").action).toBe("mark_failed");
  });

  it("pairs every action with exactly the fields that action needs", () => {
    for (const status of ["initiated", "failed", "paid", "authorized", "nonsense", null]) {
      const r = resolveStaleInitiated(status);
      if (r.action === "mark_failed") {
        expect(typeof r.failureCode).toBe("string");
        expect(r.deadLetterReason).toBeNull();
      } else {
        expect(r.failureCode).toBeNull();
        expect(typeof r.deadLetterReason).toBe("string");
      }
    }
  });
});

describe("stale-initiated bounds", () => {
  it("only touches transactions that are hours old", () => {
    // A live charge settles in seconds and its webhook lands within minutes.
    expect(STALE_INITIATED_AFTER_MS).toBe(2 * 60 * 60 * 1000);
  });

  it("bounds the Moyasar lookups per run so the charge loop keeps its budget", () => {
    expect(STALE_INITIATED_LOOKUP_CAP).toBeGreaterThan(0);
    expect(STALE_INITIATED_LOOKUP_CAP).toBeLessThanOrEqual(50);
  });

  it("labels a transaction that never reached Moyasar with its own failure code", () => {
    // Distinct from MOYASAR_FAILED: nothing was ever sent, so no money moved.
    expect(STALE_INITIATED_NO_PAYMENT_ID_CODE).toBe("STALE_INITIATED_NO_PAYMENT_ID");
    expect(STALE_INITIATED_NO_PAYMENT_ID_CODE).not.toBe(resolveStaleInitiated("failed").failureCode);
  });
});
