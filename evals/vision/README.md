# ConsultX Vision Eval — دليل السلامة البصرية / Vision Ground-Truth Harness

## PRIVACY HARD RULE / قاعدة الخصوصية الحرجة

**English:** Client drawings are read from local disk only. They must NEVER
be uploaded to Supabase, storage buckets, git, or any third-party service.
The ONLY permitted network egress is the direct Gemini API call for
evaluation, using an owner-provided key from the environment. Do not commit
drawing files or their derived images. This harness is local-and-manual
only — never wired into CI.

**عربي:** تُقرأ مخططات العميل من القرص المحلي فقط. يُمنع رفعها نهائياً إلى
Supabase أو أي bucket تخزين أو git أو أي خدمة طرف ثالث. المسار الشبكي
الوحيد المسموح به هو استدعاء Gemini API مباشرة للتقييم، باستخدام مفتاح
يوفّره المالك من بيئة التشغيل. لا تُلحق (commit) ملفات المخططات أو الصور
المشتقة منها بالمستودع. هذه الأداة محلية ويدوية فقط — لا تُشغَّل أبداً ضمن
CI.

This rule is also stated verbatim at the top of `run_vision_eval.ts` — that
copy is the one that governs; this README restates it for visibility.

---

## What this measures

`fire-safety-chat/index.ts` runs a 5-stage vision pipeline when a user
attaches a drawing. Stage 1 (`getVisionPlanningPrompt`, index.ts around line
1903) is a single-shot JSON extraction: what is literally visible on the
sheet — document type, sheet title/number/scale, room labels, legend
symbols, image quality, etc. Everything downstream (chain-of-thought, SBC
retrieval, the compliance verdict) depends on Stage 1 being honest and
accurate. This harness isolates Stage 1 and scores it against real project
drawings the owner approved for local-only testing, with hand-reviewed
"expected facts" files as ground truth.

It does **not** call Stage 2-5, does not call the Supabase edge function,
and does not touch `index.ts` in any way — it re-sends a local copy of the
Stage-1 English prompt directly to the Gemini API (see "Prompt provenance"
in `run_vision_eval.ts`'s file header for exactly why it's a copy and not an
import, and what to do when the production prompt changes).

## Files

```
evals/vision/
  run_vision_eval.ts        the harness (Deno script)
  cases.json                case registry (id, title, source_path, pages?, expected_facts_file)
  expected/
    nhc-dwg-24.json          SEEDED from derived project_facts (page 1 only) — review_status: seed_pending_owner_review
    test_plan.json            SKELETON — review_status: todo_owner_fills
    shorebase-ele-018.json    SKELETON — review_status: todo_owner_fills
  results/                  dated run output (results.json + report.md)
    .gitignore               `*` plus `!.gitignore` — everything the harness writes
                             here is ignored, but the ignore file itself stays
                             tracked so the rule survives a clone. (A bare `*`
                             ignores the .gitignore too, which would silently
                             un-ignore this whole directory for everyone else —
                             run output contains model-extracted drawing content,
                             so that must not happen.)
  README.md                 this file
```

## Case registry

| id | source (local, owner machine only) | scope | expected facts |
|---|---|---|---|
| `NHC-DWG-24` | `D:\sbc_consultx\raw\plans\NHC-DWG-24.pdf` | page 1 | seeded from `D:\sbc_consultx\derived\project_facts\nhc_dwg_24_project_facts.json` |
| `test_plan` | `D:\sbc_consultx\raw\plans\test_plan.pdf` | page 1 | skeleton, owner to fill |
| `shorebase-ele-018` | `...\بن ظفرة - fire alarm + emergency lighting 11-12-2025\BOOK 4 SHORE BASE STAGE 3C (SUBMITTED)\05-624000-4800000700-ASB-ELE-DRG-000018_B.pdf` | page 1 | skeleton, owner to fill |

### Why this FLS/fire-alarm drawing

The submittal folder's own naming pattern
(`05-624000-4800000700-ASB-[DISCIPLINE]-DRG-[seq]_[rev].pdf`, disciplines
ARC/ELE/FLS/INF) has exactly **one** file whose discipline code is literally
`FLS`: `05-624000-4800000700-ASB-FLS-DRG-000001_B.pdf`, and it is **123.1
MB** — the file the task explicitly said to avoid. Every other candidate in
that "fire alarm + emergency lighting" submittal folder is coded ARC, ELE,
INF, MEC, or STR. Of those, the **ELE** (electrical) sheets are the ones
that actually carry fire-alarm content for this contractor's package (panel
connections, device wiring, MFACP/MFCP layouts — matching the
`system_identity` facts already seen in the NHC-DWG-24 extraction: `MFACP`,
`CONNECTED MFCP`, `FIRE ALARM WIRING`, `FIRE ALARM MANUAL CALL STATION`).
`05-624000-4800000700-ASB-ELE-DRG-000018_B.pdf` (~5.2 MB) was picked because
it sits solidly in the "moderate size" band of that ELE set (which ranges
4.2 MB-55 MB, plus one 112.9 MB outlier) — big enough to be a real,
non-trivial submittal drawing, small enough to upload and iterate on
quickly during manual eval runs.

## Dry mode (default — safe, no key, no network)

```
deno run --allow-read --allow-write --allow-env \
  evals/vision/run_vision_eval.ts
```

Validates `cases.json`, checks each `source_path` exists on this machine
(**warns**, never fails — these are owner-local drawings that will not
exist on every workstation), validates each `expected_facts_file` parses
and has the required shape, prints the case table, writes
`evals/vision/results/{YYYY-MM-DD}/{results.json,report.md}`, and always
exits 0. This is a diagnostic tool, not a gate.

## Live mode (calls the Gemini API directly — real cost, real time)

```
VISION_EVAL_LIVE=1 `
GOOGLE_GEMINI_API_KEY=<owner-provided-key> `
deno run --allow-read --allow-write --allow-env --allow-net `
  evals/vision/run_vision_eval.ts
```

(PowerShell line-continuation shown with a backtick; use `\` in bash.)

- `VISION_EVAL_LIVE` uses **exact-string `"1"`** semantics — anything else
  (unset, `"0"`, `"true"`, ...) runs dry mode.
- `GOOGLE_GEMINI_API_KEY` is named to match the existing production
  convention in `supabase/functions/fire-safety-chat/index.ts`
  (`Deno.env.get("GOOGLE_GEMINI_API_KEY")`). **Never** put a real key in a
  command you paste into chat, a script you commit, or this README — the
  example above is a placeholder, not a value to fill in and save.
- The key is sent as an **`x-goog-api-key` header**, never as a `?key=` URL
  parameter. This deliberately diverges from `index.ts`'s `?key=` form
  (both are accepted by the API): this is a CLI script that prints errors to
  a terminal, and Deno embeds the full request URL in fetch failure
  messages, so a key in the query string would land in scrollback on any
  network blip. Error text is also run through a redaction pass before being
  printed or written to `results.json`.

> **NOT VERIFIED — live mode has never been run end-to-end.** No Gemini API
> key exists in the environment this harness was built in, so the
> upload → generate → score path is reviewed and type-checked but not
> runtime-proven. Only dry mode has actually executed. Budget time to debug
> the first live run (auth, Files API response shape, model availability).

For each case, live mode uploads the local PDF bytes to the Gemini Files
API, calls `generateContent` with the Stage-1-style prompt (model chain
`gemini-2.5-pro` → `gemini-2.5-flash`, matching index.ts's own fallback
order), parses the JSON response, scores it, and deletes the uploaded file
from Gemini's side afterward (best-effort cleanup — Gemini also auto-expires
uploaded files after 48 hours regardless).

## Scoring design

All five metrics are computed **per case** against that case's
`expected/*.json` file:

- **`sheet_type_correct`** (boolean | n/a) — Stage-1's `documentType` enum
  (`floor_plan | reflected_ceiling_plan | fire_suppression_plan |
  fire_alarm_plan | mechanical_plan | site_plan | section_elevation |
  schedule_table | specification | mixed | unclear`) doesn't include
  `life_safety`, but that's the vocabulary the derived `page_inventory`
  facts use. The harness buckets `documentType` (plus a keyword scan of
  `observations`/`sheetContext.title` for "life safety", "evacuation",
  "travel distance", etc.) into the same vocabulary the expected-facts file
  uses, then does a plain string comparison. `n/a` when the case's expected
  file has `expected_sheet_type: null`.
- **`occupancy_correct`** (boolean | n/a) — normalized string comparison of
  `occupancyGroup` against `expected_occupancy_group`. `n/a` when null.
- **`legend_fidelity`** (0-1 | n/a) — fraction of `expected_legend_symbols`
  found in the extracted `legendSymbols` array, using a **token-overlap**
  match (≥50% of an expected symbol's normalized words present in some
  extracted symbol string) rather than exact substring matching, because
  Gemini routinely paraphrases legend text (e.g. `"ES: EXIT SEPRATION"` vs.
  `"Exit Separation (ES)"`). `n/a` when the case has no expected symbols.
- **`device_count_accuracy`** (per device type, relative error | n/a) —
  **the field name follows the phase digest's spec, but the value is the
  relative error** `|extracted - expected| / expected` (0 = exact match,
  larger = worse), not a 0-1 accuracy score. Stage-1's JSON contract has no
  numeric device-count field, so "extracted count" is a **proxy**: the
  number of distinct strings across `visibleSystems` + `legendSymbols` +
  `observations` + `fireRatedElements` + `exitElements` that mention the
  device-type keyword. This is a heuristic label-mention count, **not** a
  true device tally, and is documented as such in the code
  (`scoreDeviceCounts` in `run_vision_eval.ts`). All three seed cases ship
  `expected_device_counts: {}` because no ground-truth per-device counts
  exist in the derived `project_facts` data today — this metric goes live
  only once the owner adds real counts to an expected-facts file.
- **`unreadable_honesty`** (boolean | n/a) — **deliberately one-sided.** The
  failure mode being measured is the model claiming it could read something
  it could not; inventing content for an illegible region is what makes a
  downstream compliance verdict dangerous. Flagging *more* as unreadable
  than the owner marked is **not** a failure — that is appropriate caution,
  and penalizing it would reward overconfidence. So the metric only
  activates when the case's tested `pages` (from `cases.json`) intersect
  `expected_unreadable_pages` (or, if `pages` is unset, whenever
  `expected_unreadable_pages` is non-empty at all); it is `n/a` otherwise,
  which is why over-declaring on a fully legible sheet is never counted
  against the model. When it does activate, it passes if the model's
  `unreadableAreas` array is non-empty **or** `imageQuality` is
  `low`/`partial`/`illegible` — the model must have said *something* was
  hard to read, not necessarily the exact area the owner flagged.

None of these metrics gate pass/fail today. `report.pass` in live mode only
reflects whether every case **ran** (uploaded, got a response, parsed as
JSON) — not whether the extraction was accurate — because every
`expected/*.json` file currently carries `review_status:
"seed_pending_owner_review"` or `"todo_owner_fills"`. Scores are printed and
written to `report.md` as a diagnostic signal for the owner to read, not a
CI gate (and this harness is never wired into CI regardless — see the
PRIVACY HARD RULE).

## How the owner fills in expected-facts files (for `test_plan` and `shorebase-ele-018`)

1. Open the source PDF at the page(s) listed for that case in `cases.json`.
2. Read the title block, legend, and any visible schedules by eye.
3. Edit `evals/vision/expected/<case>.json`:
   - `expected_sheet_type` — one bucket value: see the enum list in the
     "Scoring design" section above (`life_safety` is valid even though it
     is not a Stage-1 `documentType` value — the harness maps for you).
   - `expected_occupancy_group` — only if an SBC 201 Chapter 3 occupancy
     group (A-1 through U) is actually labeled on the sheet; otherwise leave
     `null`.
   - `expected_device_counts` — `{ "sprinkler": 12, "manual_call_station": 4,
     ... }`, only for device types you can actually count by eye on the
     page(s) in scope. Leave `{}` if you're not confident in a count —
     an empty object is skipped by scoring, a wrong number silently poisons
     it.
   - `expected_legend_symbols` — exact or near-exact text of each legend
     entry on the page(s) in scope.
   - `expected_unreadable_pages` — page numbers (from the whole PDF, not
     just the scoped pages) where part of the drawing is genuinely
     illegible, cut off, or too small to read.
4. Set `review_status` to `"reviewed"` once you're confident in the values
   (the harness doesn't enforce this string, it's just what the *next*
   reader looks for before trusting a score).

   Dry mode **type-checks** what you write, not just that the fields exist:
   `expected_legend_symbols` must be an array of strings,
   `expected_unreadable_pages` an array of positive integers,
   `expected_device_counts` an object whose values are finite numbers `>= 0`,
   and the two `expected_*` scalars a string or `null`. A type error is
   reported in the dry-run table and makes the case **SKIP** in live mode
   rather than scoring it — that is intentional. A bare string left in
   `expected_legend_symbols`, for instance, would otherwise iterate
   character-by-character and produce a plausible-looking but meaningless
   `legend_fidelity` number.
5. Never widen `pages` in `cases.json` to include more of a very large sheet
   set without also widening what you review by eye — a case's expected
   facts must match exactly the pages the harness is told to look at.

## Before/after comparison workflow (for future pageManifests / legend prompt changes)

When a future change touches Stage 1's prompt, `pageManifests`, or the
legend-extraction logic in `index.ts`:

1. Run live mode **before** the change (on a small, deliberate set of
   cases — mind the Gemini API cost of re-uploading large drawings) and
   copy `evals/vision/results/{date}/results.json` somewhere outside
   `results/` (it's gitignored and will be overwritten by the next run).
2. Make the change.
3. **Manually re-sync `STAGE1_PLANNING_PROMPT_EN`** in `run_vision_eval.ts`
   with the new `getVisionPlanningPrompt("en")` in `index.ts` — this harness
   deliberately keeps a local copy rather than importing from the edge
   function (see "Prompt provenance" in the file header), so it will
   silently keep testing the *old* prompt contract until you do this.
4. Run live mode again on the same cases.
5. Diff the two `results.json` snapshots by hand: for each case, compare
   `sheet_type_correct`, `occupancy_correct`, `legend_fidelity`,
   `device_count_accuracy`, `unreadable_honesty`, and read
   `raw_response_preview` for anything that changed shape unexpectedly.
6. Because every seed/skeleton here is `review_status:
   "seed_pending_owner_review"` / `"todo_owner_fills"`, a score moving is a
   signal to go re-read the actual drawing, not proof of a regression by
   itself — treat before/after deltas as a prompt for owner review, not an
   automatic verdict.

## Extending the case registry

Add an entry to `cases.json` and a matching `expected/<id>.json` (use one of
the existing skeleton files as a template — required fields are `case_id`,
`review_status`, `source_file`, `expected_sheet_type`,
`expected_occupancy_group`, `expected_device_counts`,
`expected_legend_symbols`, `expected_unreadable_pages`, `notes`). Dry mode
will immediately validate the new entry on the next run.
