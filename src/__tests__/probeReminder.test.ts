/**
 * Still-down reminders (2026-09-04) — written the morning after the platform
 * spent fourteen hours unable to answer a single question while the monitoring
 * worked exactly as designed: it sent ONE email at minute 30 and then nothing,
 * because `shouldAlert` fired only on the run where the counter reached the
 * threshold. In an inbox, one email about a fourteen-hour total outage is
 * indistinguishable from one email about a slow afternoon.
 */
import { describe, it, expect } from "vitest";
import {
  BREACH_REMINDER_EVERY,
  breachDurationAr,
  buildTargetBreachEmail,
  nextBreachState,
  type SloTarget,
} from "../../supabase/functions/synthetic-probe/logic.ts";

const target: SloTarget = {
  key: "first_text_ms_standard",
  metric: "first_text_ms",
  mode: "standard",
  comparator: "lte",
  threshold: 5000,
} as SloTarget;

describe("nextBreachState — first notice, then reminders, then recovery", () => {
  it("alerts once when the threshold is reached, and not on the runs in between", () => {
    expect(nextBreachState(0, true)).toMatchObject({ count: 1, shouldAlert: false, isReminder: false });
    expect(nextBreachState(1, true)).toMatchObject({ count: 2, shouldAlert: true, isReminder: false });
    expect(nextBreachState(2, true)).toMatchObject({ count: 3, shouldAlert: false });
    expect(nextBreachState(20, true)).toMatchObject({ count: 21, shouldAlert: false });
  });

  it("re-alerts every BREACH_REMINDER_EVERY runs while the breach persists, flagged as a reminder", () => {
    // threshold 2 + 24 runs = the 26th consecutive breach, i.e. six hours in.
    const first = nextBreachState(2 + BREACH_REMINDER_EVERY - 1, true);
    expect(first).toMatchObject({ shouldAlert: true, isReminder: true });
    const second = nextBreachState(2 + 2 * BREACH_REMINDER_EVERY - 1, true);
    expect(second).toMatchObject({ shouldAlert: true, isReminder: true });
    // and not on the neighbouring runs
    expect(nextBreachState(2 + BREACH_REMINDER_EVERY, true).shouldAlert).toBe(false);
    expect(nextBreachState(2 + BREACH_REMINDER_EVERY - 2, true).shouldAlert).toBe(false);
  });

  it("can be switched off with repeatEvery = 0, keeping the old once-per-incident behaviour", () => {
    for (const prev of [2, 10, 25, 100]) {
      expect(nextBreachState(prev, true, 2, 0).shouldAlert).toBe(false);
    }
  });

  it("recovers exactly once, and only if an alert was ever sent", () => {
    expect(nextBreachState(5, false)).toMatchObject({ count: 0, shouldRecover: true, isReminder: false });
    expect(nextBreachState(1, false)).toMatchObject({ count: 0, shouldRecover: false });
    expect(nextBreachState(0, false)).toMatchObject({ count: 0, shouldRecover: false });
  });
});

describe("breachDurationAr", () => {
  it("renders consecutive 15-minute runs as an Arabic duration", () => {
    expect(breachDurationAr(2)).toBe("30 دقيقة");
    expect(breachDurationAr(4)).toBe("1 ساعة");
    expect(breachDurationAr(26)).toBe("6 ساعة و30 دقيقة");
    expect(breachDurationAr(56)).toBe("14 ساعة"); // the 2026-09-03 outage
  });

  it("says nothing when there is nothing to say", () => {
    expect(breachDurationAr(undefined)).toBeNull();
    expect(breachDurationAr(0)).toBeNull();
    expect(breachDurationAr(1)).toBeNull();
  });
});

describe("buildTargetBreachEmail", () => {
  it("marks a reminder in the subject with how long it has been down", () => {
    const { subject, html } = buildTargetBreachEmail({
      target, observed: 99000, sinceIso: new Date().toISOString(),
      consecutiveRuns: 56, isReminder: true,
    });
    expect(subject).toContain("ما زال متجاوزاً");
    expect(subject).toContain("14 ساعة");
    expect(html).toContain("14 ساعة");
  });

  it("keeps the original subject for a first notice", () => {
    const { subject } = buildTargetBreachEmail({
      target, observed: 99000, sinceIso: new Date().toISOString(),
      consecutiveRuns: 2, isReminder: false,
    });
    expect(subject).toContain("تنبيه أداء");
    expect(subject).not.toContain("ما زال");
  });

  it("still builds without the new fields — an older caller keeps working", () => {
    const { subject } = buildTargetBreachEmail({ target, observed: 1, sinceIso: new Date().toISOString() });
    expect(subject).toContain("تنبيه أداء");
  });
});
