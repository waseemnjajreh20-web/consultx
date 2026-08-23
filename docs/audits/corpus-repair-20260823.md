# Corpus data repair — verification report — 2026-08-23

Sub-agent: B5 (knowledge lane). Companion file: `docs/audits/corpus-repair-20260823.sql`.
No database writes were made by this agent. All numbers below come from `SELECT`
queries run against production via `q.mjs` (SELECT-only), reproducible by
Supervisor B with the exact SQL quoted in each section.

Source findings under repair: `docs/audits/advisory-retrieval-truth-20260823.md`.
Every finding was re-derived from production directly — the audit is treated as
a hypothesis to check, not as authoritative.

---

## Repair 1 — `sbc_documents.code_type`: SBC 801 content labeled SBC201

**Audit claim:** 420 rows.

**SELECT run:**
```sql
SELECT count(*) FROM sbc_documents
WHERE code_type = 'SBC201' AND content ~ 'SBC\s*801\s*-?\s*CC\s*-?\s*\d{4}';
```
**Result:** 308.

**Agreement with audit:** DISAGREES. The audit's 420 is reproducible, but only
by using `file_name ILIKE 'SBC 801%'` as ground truth:
```sql
SELECT count(*) FROM sbc_documents
WHERE code_type = 'SBC201' AND file_name ILIKE 'SBC 801%';
-- returns 420, exactly
```
The task instructions explicitly said to use the in-text running header, not
the filename, as ground truth. Doing that strictly yields 308, not 420. The
gap (112 rows) is file_name='SBC 801...' chunks whose extracted text happens
not to include a header line (a chunking-boundary artifact, not a labeling
signal) — 20 of those 112 rows even reference "SBC 201" in body text as a
legitimate cross-reference to the building code, which is exactly the kind of
case a filename-only rule would misjudge. Zero rows disagree in the other
direction (no SBC801-labeled row was found with a 201 header).

**Confidence:** CONFIRMED for the 308-row fix (direct textual evidence, in
every one of 308 rows the file_name and the in-text header agree with each
other, and disagree only with `code_type`). The 112-row gap is UNKNOWN and
explicitly out of scope of this repair — flagged for the owner / B1 as a
possible follow-up requiring chunk-level judgment, not a blanket rule.

**SQL section:** `SECTION 1` in `corpus-repair-20260823.sql`.
**Backup table:** `sbc_documents_backup_20260823_codetype` (id, old code_type).
**Rollback:** `UPDATE sbc_documents s SET code_type = b.code_type FROM sbc_documents_backup_20260823_codetype b WHERE s.id = b.id;`

---

## Repair 2 — `sbc_documents.language`: whole table wrongly marked 'AR'

**Audit claim:** `language='AR'` on 4,630 rows that are entirely English; a
240-row sample found 0 rows with any Arabic character.

**SELECT run (distribution):**
```sql
SELECT language, count(*) FROM sbc_documents GROUP BY language;
```
**Result:** `AR` — 4,630 (the entire table). Matches the audit's 4,630 exactly.

**SELECT run (full-table Arabic-character sweep, not a sample):**
```sql
SELECT count(*) FILTER (WHERE content ~ '[Arabic Unicode blocks]') AS rows_with_arabic
FROM sbc_documents;
```
**Result:** 8 rows contain real Arabic-range characters.

**Agreement with audit:** DISAGREES on "zero Arabic rows." The 240-row sample
in the audit happened to miss all 8 Arabic-bearing rows out of 4,630 (8/4630 ≈
0.17%, plausible to miss in a 240-row sample — roughly a 60% chance of missing
all 8 by pure sampling luck, so this is not evidence the audit was careless,
just that a sample is not a proof). A full sweep is required to actually prove
zero, and it does not come back zero. Inspected all 8 rows individually:
- 2 rows (ids 1, 2356) are English cover pages carrying a short embedded
  Arabic honorific for the Crown Prince ("رئيس مجلس الوزراء... حفظه الله"),
  encoded as reversed/isolated presentation-form glyphs — genuinely Arabic
  text, but a small fragment of an otherwise English page.
- 5 rows (ids 757, 758, 759, 760, 761) are bilingual EN/AR tables of Saudi
  province and city names for climate-zone classification — 19-25% of each
  chunk's characters are Arabic script. These are not "entirely English" by
  any reasonable definition.
- 1 row (id 1032) has exactly one Arabic-range character (a stray Arabic
  comma "،" inside an English sentence) — effectively noise, not content.

Per the task instructions ("if you find even one genuinely Arabic row, say so
and scope the UPDATE around it"), the fix below flips 4,622 rows to `EN` and
explicitly excludes and flags the 8 rows with real Arabic content, rather than
either leaving them mislabeled 'AR' silently or blindly flipping them to 'EN'.

**Confidence:** CONFIRMED for 4,622 rows to flip; CONFIRMED for the 8-row
exclusion list (each inspected individually, not sampled).

**SQL section:** `SECTION 2` in `corpus-repair-20260823.sql`.
**Backup table:** `sbc_documents_backup_20260823_language` (id, old language, old metadata).
**Rollback:** `UPDATE sbc_documents s SET language = b.language, metadata = b.metadata FROM sbc_documents_backup_20260823_language b WHERE s.id = b.id;`

---

## Repair 3 — `sbc_documents`: flag 71 dot-leader TOC/index chunks

**Audit claim:** 71 rows match a dot-leader (run of `.` characters to a page
number) pattern and are indistinguishable from real code text.

**SELECT run:**
```sql
SELECT count(*) FROM sbc_documents
WHERE content ~ '\.{4,}\s*\d+'
   OR content ~ '(\.\s){4,}\d+'
   OR content ~ '…\s*\d+';
```
**Result:** 71.

**Agreement with audit:** CONFIRMED, exact match — but only once the pattern
also covers the Unicode ellipsis character "…" (used as a single-glyph dot
leader on some pages) in addition to plain `....` runs and space-separated
`. . . .` runs. A plain contiguous-dot regex alone (`\.{4,}\s*\d+`) returns
only 67; adding the ellipsis variant brings it to exactly 71, which is what
the audit reported. Sampled 12 of the 71 rows directly — all are genuine
`TABLE OF CONTENTS` pages. Note for the owner: several of these are chunks
that mix TOC lines with the start of real chapter body text in the same
chunk (already tagged `content_type: "mixed"` in existing metadata) — a
chunking-boundary artifact, not a pure-junk chunk. Per instructions these are
flagged only (additive metadata), never deleted.

**Confidence:** CONFIRMED.

**SQL section:** `SECTION 3` in `corpus-repair-20260823.sql`.
**Backup table:** `sbc_documents_backup_20260823_toc_metadata` (id, old metadata).
**Rollback:** `UPDATE sbc_documents s SET metadata = b.metadata FROM sbc_documents_backup_20260823_toc_metadata b WHERE s.id = b.id;`

---

## Repair 4 — `source_registry`: SBC201/SBC801 edition and vector_indexed

**Audit claim:** production says edition 2018 and `vector_indexed = false`;
repo's `src/data/sourceRegistry.json` and the PDFs say 2024.

**SELECT run:**
```sql
SELECT source_id, edition_year, ingestion_status, vector_indexed
FROM source_registry ORDER BY source_id;
```
**Result:**
| source_id | edition_year | vector_indexed |
|---|---|---|
| SBC201 | 2024 | false |
| SBC801 | 2024 | false |
| NFPA101/NFPA13/NFPA2/NFPA30/NFPA72/SFPE/IBC/IFC | NULL | false (all `ingestion_status='absent'`) |

**Agreement with audit:** DISAGREES on edition_year. Production already shows
`2024` for both SBC201 and SBC801, matching `src/data/sourceRegistry.json`
exactly — the audit's claim of "production says 2018" does not reproduce.
Either it was already fixed by an earlier pass, or the audit's number was
stale/wrong. `vector_indexed = false` IS confirmed wrong: a direct check of
`sbc_documents.embedding` shows 2,739 of 2,775 SBC201 rows (98.7%) and 1,855
of 1,855 SBC801 rows (100%) already carry a real embedding vector.

**Residual note:** 36 SBC201 rows still lack an embedding. Not part of this
repair's scope (the source-level `vector_indexed` boolean is a reasonable
`true` at 98.7%/100% coverage), but flagged for follow-up — likely the same
lane as the code_type gap in Repair 1.

NFPA / SFPE / IBC / IFC rows were verified unchanged and untouched by this
repair — `ingestion_status='absent'`, `edition_year IS NULL` for all 8, exactly
matching the audit's expectation that these must stay `absent`.

**Confidence:** CONFIRMED for `vector_indexed → true`. CONFIRMED-NO-OP for
`edition_year` (already correct; UPDATE guarded so it does nothing here, kept
for idempotency/safety only).

**SQL section:** `SECTION 4` in `corpus-repair-20260823.sql`.
**Backup table:** `source_registry_backup_20260823` (full row backup for SBC201, SBC801).
**Rollback:** `UPDATE source_registry s SET vector_indexed = b.vector_indexed, edition_year = b.edition_year, updated_at = b.updated_at FROM source_registry_backup_20260823 b WHERE s.source_id = b.source_id;`

---

## Repair 5 — `document_tables`: empty shells

**Audit claim:** 4 empty shells out of 7 rows.

**SELECT run:**
```sql
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE jsonb_array_length(coalesce(rows,'[]'::jsonb))=0) AS zero_row_count,
  count(*) FILTER (WHERE jsonb_array_length(coalesce(rows,'[]'::jsonb))=0 AND footnotes->>'status'='pending') AS pending_empty,
  count(*) FILTER (WHERE jsonb_array_length(coalesce(rows,'[]'::jsonb))=0 AND footnotes->>'status'='legacy_only') AS legacy_redirect_stub
FROM document_tables;
```
**Result:** total=7, zero_row_count=**5**, pending_empty=**3**, legacy_redirect_stub=**2**.

**Agreement with audit:** DISAGREES. Neither of the two honest readings of
"empty" gives 4:
- 5 rows have zero populated rows (not 4).
- Of those 5, only 3 (Table 504.3, Table 504.4, Table 506.2 — footnotes
  `status: "pending"`) are genuinely empty shells awaiting transcription.
- The other 2 (Table 503, Table 1004.1.2 — footnotes `status: "legacy_only"`)
  are deliberately empty: they are redirect stubs. Table 503's footnotes
  contain `redirect_to: ["SBC201:Table504.3", "SBC201:Table504.4",
  "SBC201:Table506.2"]` — i.e. it points at exactly the 3 pending rows above,
  meaning this table's structure is: one superseded table pointing forward to
  its three replacements (not yet populated), plus a second superseded table
  (Table 1004.1.2) pointing at Table 1004.5, which already has 3 verified
  rows. This is a coherent, intentional structure, not disorganized junk.

**Codebase check (read-only, as instructed):** grepped the whole repo for
`document_tables`. No Supabase Edge Function references it — in particular
`supabase/functions/fire-safety-chat` has zero matches, so this table is NOT
wired into the live prompt/retrieval path (unlike `sbc_code_tables`, which is
injected directly into the fire-safety-chat prompt and is the subject of a
separate, more urgent finding in
`docs/audits/SAFETY-ALERT-code-tables-20260823.md` — out of scope for B5). The
only real reference to `document_tables` is `tools/generate_insert_statements.py`,
a batch-insert generator reading `normalized_tables_payloads.json` — i.e. this
table is the staging/authoring surface for the code-table rebuild, which reads
as sub-agent B1's lane.

**Recommendation (not executed):** leave all 7 rows as-is. Do not delete the
3 pending shells — they are B1's rebuild targets and already carry the
correct `section_id`/`caption_en`/`page` scaffolding; deleting them loses that
scaffolding and breaks the `redirect_to` chain documented in Table 503's
footnotes. Do not delete the 2 legacy-redirect stubs either — they are
working as designed. This is a recommendation for the owner, not an action
taken by this agent; no `DELETE` was run.

**Confidence:** CONFIRMED for the count disagreement (5 zero-row rows, 3
genuinely pending, 2 deliberate stubs). LIKELY for the "do not delete"
recommendation — reasoned from the footnotes and codebase, but final call is
the owner's / B1's since it affects the code-table rebuild pipeline.

**SQL section:** `SECTION 5` in `corpus-repair-20260823.sql` — informational
`SELECT` and a backup table only, no `DELETE` executed. A commented-out,
explicitly "NOT RECOMMENDED" statement is included only for completeness in
case the owner overrides the recommendation.
**Backup table:** `document_tables_backup_20260823` (full table backup, in case the owner overrides).

---

## Summary table

| # | Finding | Audit said | Verified | Agree? | Confidence | Action |
|---|---|---|---|---|---|---|
| 1 | code_type mislabel | 420 | 308 (in-text header, as instructed) | Partial — 420 reproducible by filename, not by the instructed method | CONFIRMED (308) | UPDATE 308 rows |
| 2 | language='AR' wrong | 4,630 rows, 0 Arabic in 240-sample | 4,630 rows AR; 8 genuinely Arabic (full sweep, not sample) | Disagrees on "zero" | CONFIRMED | UPDATE 4,622 to EN, flag 8 |
| 3 | TOC dot-leader junk | 71 | 71 (needs ellipsis-char variant too) | Agrees, methodology detail | CONFIRMED | Flag 71, no delete |
| 4 | source_registry stale | edition 2018→2024, vector_indexed false→true | edition already 2024; vector_indexed false→true confirmed | Disagrees on edition (already fixed/stale claim) | CONFIRMED (vector_indexed only) | UPDATE vector_indexed for 2 rows |
| 5 | document_tables empty shells | 4 of 7 | 5 of 7 zero-row; 3 genuine + 2 deliberate stubs | Disagrees | CONFIRMED (count); LIKELY (recommendation) | No DELETE — recommend leave as-is |

No `INSERT`/`UPDATE`/`DELETE`/DDL was executed against production by this
agent. All numbers above are reproducible with the exact `SELECT` statements
quoted.

---

## Supervisor B independent verification — 2026-08-23

Every expected count in `corpus-repair-20260823.sql` was re-run read-only against
production (project `hrnltxmwoaphgejckutk`) by supervisor B, in a single
statement, independently of the agent that wrote the file.

| SQL section | Expected in the file | Measured by supervisor | Verdict |
|---|---|---|---|
| 1 | `rows_to_fix = 308` | 308 | CONFIRMED |
| 2 | `total_ar = 4630` | 4630 | CONFIRMED |
| 2 | `to_flip_to_en = 4622` | 4622 | CONFIRMED |
| 2 | `genuinely_arabic = 8` | 8 | CONFIRMED |
| 3 | `toc_dot_leader_rows = 71` | 71 | CONFIRMED |
| 4 | SBC201 `missing_embeddings = 36` | 36 | CONFIRMED |
| 4 | SBC801 `missing_embeddings = 0` | 0 | CONFIRMED |
| 4 | SBC201/SBC801 `edition_year = 2024`, `vector_indexed = false` | both 2024 / false (`ingestion_status = 'partial'`) | CONFIRMED |
| 4 | IBC, IFC, NFPA101, NFPA13, NFPA2, NFPA30, NFPA72, SFPE all `absent`, edition NULL | all 8 `absent`, edition NULL, `vector_indexed = false` | CONFIRMED |
| 4 | SBC801_COMM `pending`, edition 2024 | `pending`, 2024 | CONFIRMED |
| 5 | `document_tables` 7 rows, 5 with zero `rows` | 7 / 5 | CONFIRMED |
| — | `sbc_documents` total | 4630 | CONFIRMED |

### Additional hazard checked and cleared

Sections 2b and 3 write `metadata = metadata || jsonb_build_object(...)`. In
Postgres, `NULL || jsonb` evaluates to NULL, so a NULL `metadata` on any matched
row would silently erase that row's metadata instead of adding to it. Measured:
`sbc_documents.metadata` is `jsonb NOT NULL`-in-practice with column default
`'{}'::jsonb`, and **0 rows have `metadata IS NULL`** — including 0 among the
rows matched by Section 2b and 0 among the 71 matched by Section 3. The
concatenation is therefore safe as written. CONFIRMED.

### Blast radius the file does not state (added here)

**Repair 1 changes what vector retrieval returns.**
`fire-safety-chat/index.ts` `fetchSBCContextVector()` derives a `filterCode` of
`'SBC801'` or `'SBC201'` from the user's question and passes it to
`match_sbc_documents(query_embedding, match_count, filter_code)`, which filters on
`sbc_documents.code_type`. Moving 308 rows from `SBC201` to `SBC801` therefore
moves that content **into** the result set for sprinkler/alarm/fire-protection
questions and **out of** the result set for general-building questions. The
direction is correct — the content really is SBC 801 text, proved by its own
printed running header — but it is a live retrieval behaviour change, not a
cosmetic label fix, and it should be re-benched with the vector work (task B4)
rather than assumed neutral. Today the effect is limited because the vector path
is only reached from the vision/analysis pipeline; it becomes general the moment
the advisory vector flag is turned on.

`sbc_documents.language` is **not** read by any Edge Function (grep over
`supabase/functions`: zero matches other than the request-body `language` field,
which is unrelated), so Repair 2 has no runtime blast radius. CONFIRMED.

### Verdict

`corpus-repair-20260823.sql` is **ACCEPTED** as owner-ready: every write is
preceded by a `SELECT` with a stated expected count, every section takes a
backup before it writes, every `WHERE` clause is self-limiting so a second run is
a no-op, there is no hard delete of live data, and all twelve stated expectations
match production exactly as of 2026-08-23. It remains an **owner action** — no
agent applies it.
