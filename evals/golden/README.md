# evals/golden/ — the advisory golden question set

The pool `evals/advisory_benchmark.jsonl` (the 43-question advisory harness)
grows from. Built and maintained by `scripts/golden-set.mjs`; the review
workflow and effort estimate live in `docs/launch/golden-set-notes.md`.

## Files

- **`candidates-20260903.json`** — the full candidate pool. One JSON array,
  one object per question. This is the file every other file here derives
  from or feeds back into.
- **`review-sheet-20260903.csv`** — a human review worksheet: every
  candidate still in `status: "candidate"` (i.e. everything except the
  pre-existing benchmark set — see "Status semantics" below), one row each,
  with blank `decision` / `corrected answer key` columns for a reviewer to
  fill in. UTF-8 with a BOM (opens correctly in Excel).
- **`validated_bench-20260903.jsonl`** — not committed by default; produced
  on demand by `--export-bench` (see below) once some candidates have been
  reviewed and promoted to `"validated"`.

## Candidate schema

```
{
  id: string,                    // unique across the whole file
  question_ar: string,
  category: string,
  code_family: string,           // "SBC 201" | "SBC 401" | "SBC 501" | "SBC 201 / SBC 801" | "n/a" | "unknown"
  expected_sections: string[],   // section/table numbers; [] for a deliberate negative-control row
  source: "benchmark" | "gate" | "generated",
  status: "candidate" | "validated" | "rejected",
  validator?: string,
  validated_at?: string,         // ISO date
  notes?: string,                // provenance, page numbers, reviewer comments
}
```

`source` says where a row came from:

- **`benchmark`** — copied from `evals/advisory_benchmark.jsonl`, the
  pre-existing, already-in-production 43-question harness.
- **`gate`** — copied from
  `docs/launch/new-source-codes-gate-20260831.md`, the 36-question SBC 401 /
  SBC 501 launch gate (18 questions per code, the last 2 of each being a
  deliberate negative control).
- **`generated`** — mechanically produced by walking the extracted SBC 401 /
  SBC 501 corpus (`D:\SBC_2024_intake\out\*_extracted_chunks.json`) and
  writing one templated Arabic question per matched high-value section. Also
  the target shape `src/pages/AdminFeedback.tsx`'s "تصدير للمجموعة الذهبية"
  export button produces from reviewed user-feedback rows (that export is a
  separate, standalone JSON file — it is not auto-merged into
  `candidates-20260903.json`; see that component's `feedbackRowToCandidate`
  for exactly what it can and cannot fill in).

### Status semantics — read this before trusting a "validated" row

- **`benchmark` rows start `"validated"`.** The transformation from
  `evals/advisory_benchmark.jsonl` is lossless — `expected_sections` is a
  direct field copy of that file's own hand-authored
  `expected_section_refs`/`expected_table_ids`. No interpretation happens.
- **`gate` rows start `"candidate"`**, even though the gate document's own
  prose ground truth is itself source-verified with page citations. Why:
  `expected_sections` for a gate row is extracted from free-form Markdown
  prose by regex, and that extraction can be imprecise (worked example: it
  can pick up a stray equation number, like the "(4)" in "Chapter 43
  equation (4)", as if it were a second section reference). Calling these
  `"validated"` would overclaim confidence in the SCRIPT's parsing, not in
  the source document — so gate rows go through the same human review as
  generated ones before they are trusted.
- **`generated` rows start `"candidate"`** — never validated by construction.
  A generated question's `expected_sections` is just "the section number
  attached to the corpus chunk that matched a topic keyword" — it has not
  been confirmed that the section text actually answers the generated
  question. `notes` always carries the exact chunk id and page range so a
  reviewer can go check.

## Commands

```
node scripts/golden-set.mjs                       # build/merge (see below)
node scripts/golden-set.mjs --import reviewed.csv  # apply a reviewed sheet
node scripts/golden-set.mjs --export-bench [--out path]  # emit validated rows as harness JSONL
```

**Build** merges `benchmark` + `gate` + a fresh `generated` corpus walk into
`candidates-20260903.json` and regenerates `review-sheet-20260903.csv` from
whatever is still `status: "candidate"` afterward. It is **safe to re-run**:
any `id` already present in an existing `candidates-20260903.json` is left
completely untouched, so a prior `--import` review pass is never clobbered
by a rebuild (the same "on conflict do nothing" idempotency the SQL files in
`docs/db/` use for seed rows). Regenerating the full `generated` set needs
the `D:\SBC_2024_intake` corpus on disk; without it the build still succeeds
using whatever `generated` rows already exist in the file.

**Import** reads a filled-in review sheet and, per row, applies `decision`:
`accept` → `status: "validated"` (keeps `expected_sections` unless
`corrected answer key` is non-empty); `edit` → `status: "validated"` and
`expected_sections` replaced from `corrected answer key`; `reject` →
`status: "rejected"`. Blank/unrecognized decisions and unknown ids are left
untouched (an unknown id is skipped, not an error, so a partially reviewed
or re-ordered sheet never aborts the whole import).

**Export-bench** writes every `status: "validated"` row whose `source` is
NOT `"benchmark"` (those already live natively in
`evals/advisory_benchmark.jsonl`) as JSONL in the harness's own row shape.
This is an operator-reviewed export, not an automatic merge — read the
output before appending it to `evals/advisory_benchmark.jsonl`.

## Corpus coverage (confirmed 2026-09-03 — read before extending the generator)

`scripts/golden-set.mjs`'s `generated` step reads only
`D:\SBC_2024_intake\out\*_extracted_chunks.json` (SBC 401: 480 chunks / 299
unique sections; SBC 501: 484 chunks / 383 unique sections — mostly
`content_type: "commentary"`, since SBC 501-CC-2024 is a Code-and-Commentary
edition). `D:\SBC-CC-201-801\`, the other directory named in this batch's
build brief, has **no** `*_chunks.json` anywhere; its
`brain/sections/sbc801/*.md` and `brain/tables/*.md` files (308 + 25 of
them) are empty maintainer-note stubs — every one sampled reads literally
"pending maintainer synthesis," with no extracted section text. It is not a
usable generation source. SBC 201/801 coverage in this golden set therefore
comes entirely from the `benchmark` and `gate` merges, not from a corpus
walk — see `scripts/golden-set.mjs`'s own header comment for the full
finding.

## Tests

`src/__tests__/goldenSet.test.ts` checks the committed artifacts directly
(schema, id uniqueness, the ≥200 minimum, every generated row having
`expected_sections` + a traceable notes pointer, and the CSV round-trip) —
see that file's header for why it reads the artifacts instead of importing
`scripts/golden-set.mjs`.
