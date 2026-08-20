# Trial Policy — Decision Required

**Status:** blocking. The fix cannot be written until the policy question below is answered,
because the two possible answers produce opposite code.

---

## Correction to the earlier plan

My previous plan described this as *"a race between `auto-trial` and `corporate-trial`, both
creating a profile, producing duplicate rows."* **That was wrong.** After reading both functions
and the schema:

- The two functions write to **different tables**, so they cannot collide on the same row.
- `profiles.user_id` is `UNIQUE` (migration `20260309064547`), so duplicate profiles are
  impossible anyway — the second insert would simply fail.

The actual defect is narrower to describe and **more damaging** than a race.

---

## The actual defect: two sources of truth that disagree

Both functions fire in parallel on every `SIGNED_IN` event:

```47:54:src/hooks/useAuth.tsx
        if (event === "SIGNED_IN" && session?.access_token) {
          supabase.functions.invoke("auto-trial", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).catch(() => {});
          supabase.functions.invoke("corporate-trial", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).catch(() => {});
        }
```

They apply **different eligibility rules to different tables**:

| Function | Table written | Who gets Engineer |
|---|---|---|
| `auto-trial` | `user_subscriptions` | **everyone**, unconditionally |
| `corporate-trial` | `profiles` | **corporate email domains only**; everyone else gets `plan_type='free'` |

And the two readers disagree about which table wins:

| Reader | Source of truth |
|---|---|
| Frontend `getUserActivePlan()` (`src/utils/planAccess.ts:7`) | `profiles` **only** |
| Backend `check-subscription` (`index.ts:400`) | `user_subscriptions.plan_id` **first**, `profiles.plan_type` as fallback |

### Consequence

For a **personal-email signup** (gmail, hotmail, outlook — the majority of signups):

- `user_subscriptions` → Engineer, `trialing`, 7 days
- `profiles.plan_type` → `free`, no `trial_end`

So:

- The **server** believes the user is on Engineer and authorises Engineer work.
- The **UI** reads `profiles`, sees `free` with no trial, and **locks the Standard and
  Analysis modes** via `canAccessMode()`.

The user is granted a 7-day paid-tier trial that they can neither see nor use. It expires
untouched. For a **corporate-email signup** both tables agree and the trial works correctly.

This means the trial currently works for the minority of signups and silently fails for the
majority — and `corporate-trial`'s domain gating is effectively dead, since `auto-trial`
overrides it server-side for everyone.

---

## The decision I need from you

**Who is the 7-day Engineer trial for?**

### Option A — Everyone gets the trial

Every new signup receives 7 days of Engineer, regardless of email domain.

- `corporate-trial` stops writing `plan_type: 'free'`; it writes the same Engineer trial
  that `auto-trial` writes, and keeps recording `corporate_domain` for analytics only.
- **Effect:** maximises activation and trial-to-paid conversion. Higher AI/Gemini cost per
  signup, and open to abuse via throwaway addresses.
- Best if the goal right now is growth and filling the EID50 funnel.

### Option B — Corporate emails only

Only business domains get Engineer; personal emails start on Free.

- `auto-trial` gains the same domain check `corporate-trial` already has, so it stops
  granting Engineer to everyone.
- **Effect:** protects margin and targets buyers who can actually expense a subscription.
  Fewer trials, better qualified. Personal-email users see a clean Free plan and an upgrade
  prompt instead of a broken locked state.
- Best if the goal is qualified B2B leads and cost control.

Both options are roughly the same amount of work. The difference is commercial, not technical,
which is why I am not choosing for you.

---

## What I will fix regardless of your answer

These are defects under either policy, and I will implement them once you choose:

1. **Collapse to one source of truth.** The frontend and backend must not read different
   tables. `getUserActivePlan()` will be reconciled with what `check-subscription` returns so
   the UI can never contradict the server's entitlement decision.

2. **Add a `UNIQUE` constraint on `user_subscriptions.user_id`.** Unlike `profiles`, this table
   has no uniqueness guarantee, and `auto-trial` does a check-then-insert. Two concurrent
   `SIGNED_IN` events (two tabs, or a fast re-login) can create two trial rows for one user.
   This is a genuine race — it is the reason `check-subscription` had to be given
   `order by created_at desc` in commit `5c75a96`. The constraint fixes the cause rather than
   the symptom.

3. **Stop swallowing failures.** Both invocations end in `.catch(() => {})`, so if trial
   provisioning fails the user is silently left on Free with no signal to us. Failures need
   to surface.

---

## Related open decision

`invite_user` (owner task list) has the same shape of problem: the admin picks a plan for an
invited user, the plan name is written, but no entitlement is granted — so the invitee stays
locked out. That one also needs your choice between granting full access, granting a
time-limited trial, or leaving it as-is. My recommendation there is a time-limited trial.
