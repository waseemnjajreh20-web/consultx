# Advisory Section-Number Drift — Dry-Run Report

Generated: 2026-05-01T01:12:17.023Z
Project: `hrnltxmwoaphgejckutk`

**READ-ONLY.** No DB writes. No UPDATE/INSERT/DELETE/UPSERT/DDL/migrations.

## 1. Baseline
- Total rows in `sbc_documents`: **4630**
- Distinct `file_name`: **18**
- Rows with `section_number` null/empty: **354**
- Rows with `section_number` populated: **4276**

Columns:
- `id` (bigint)
- `content` (text)
- `metadata` (jsonb)
- `embedding` (USER-DEFINED)
- `code_type` (text)
- `section_number` (text)
- `chapter_number` (text)
- `page_start` (integer)
- `page_end` (integer)
- `file_name` (text)
- `chunk_index` (integer)
- `created_at` (timestamp with time zone)
- `canonical_section_id` (text)
- `normative` (boolean)
- `language` (text)

## 2. Mismatch counts by classification
| Type | Count | % of inspected |
|---|---:|---:|
| no_detectable_heading | 2121 | 45.81% |
| exact_match | 1245 | 26.89% |
| no_detectable_heading_and_no_label | 354 | 7.65% |
| suspicious_cross_chapter_label | 340 | 7.34% |
| body_heading_child_of_section_number | 337 | 7.28% |
| body_heading_differs_from_section_number | 231 | 4.99% |
| section_number_parent_only | 2 | 0.04% |

Total mismatch rows (all non-`exact_match`): **3385** of 4630 (73.11%).

## 3. Top 30 mismatch examples
| # | type | file (short) | page | section_number | body_heading | snippet |
|---:|---|---|---|---|---|---|
| 1 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 1-8 | (null) | (none) | The Saudi General Building Code Code & Commentaries SBC 201 - CC SBC - official … |
| 2 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 1-8 | (null) | (none) | King Abdulaziz University Dr. Saeed A. Asiri Advisory Committee Dr. Hani M. Zahr… |
| 3 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 1-8 | (null) | (none) | The Saudi Building Code Suite (SBCS)-2024 Sr. No. SBC Title Sr. No. SBC Title Sr… |
| 4 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 1-8 | (null) | (none) | PREFACE TO THE SAUDI BUILDING CODE (SBC 201-2024) The Saudi General Building Cod… |
| 5 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 9-9 | (null) | (none) | ARRANGEMENT AND FORMAT OF SBC 201-2024 SBC 201-CC-2024 ii ARRANGEMENT AND FORMAT… |
| 6 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 10-10 | (null) | (none) | ARRANGEMENT AND FORMAT OF SBC 201-2024 SBC 201-CC-2024 iii SBC 501 Correlated To… |
| 7 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 11-31 | (null) | (none) | SUMMARY OF CHAPTERS SBC 201-CC-2024 iv SUMMARY OF CHAPTERS… |
| 8 | no_detectable_heading | SBC 201 [1-250]… | 11-31 | 102.4 | (none) | Chapter 1 Scope and Administration Chapter 1 establishes the limits of applicabi… |
| 9 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 11-31 | (null) | (none) | Where the provisions of the code address uses differently, moving from one activ… |
| 10 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 11-31 | (null) | (none) | Chapter 1 is subdivided into two parts. Part 1 includes scope and application, S… |
| 11 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 12-14 | (null) | (none) | SUMMARY OF CHAPTERS SBC 201-CC-2024 v… |
| 12 | no_detectable_heading | SBC 201 [1-250]… | 12-14 | 406.5.4 | (none) | Chapter 4 Special Detailed Requirements Based on Occupancy and Use Chapter 4 con… |
| 13 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 12-14 | (null) | (none) | The greater the potential fire hazards indicated as a function of the group, the… |
| 14 | no_detectable_heading | SBC 201 [1-250]… | 12-14 | 1103.1 | (none) | of fire. The fire-resistance-rated construction requirements within Chapter 7 pr… |
| 15 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 12-14 | (null) | (none) | Appendix E is supplemental information included in the code to address accessibi… |
| 16 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 15-15 | (null) | (none) | SUMMARY OF CHAPTERS SBC 201-CC-2024 viii Chapter 18 Soils and Foundations Chapte… |
| 17 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 16-16 | (null) | (none) | SUMMARY OF CHAPTERS SBC 201-CC-2024 ix This chapter establishes regulations for … |
| 18 | no_detectable_heading | SBC 201 [1-250]… | 17-33 | 102.4 | (none) | SUMMARY OF CHAPTERS SBC 201-CC-2024 x Chapter 31 Special Construction Chapter 31… |
| 19 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 17-33 | (null) | (none) | Appendix C Group U—Agricultural Buildings Appendix C provides a more liberal set… |
| 20 | no_detectable_heading | SBC 201 [1-250]… | 17-33 | 415.9.3 | (none) | Appendix M Tsunami-Generated Flood Hazards Addressing a tsunami risk for all typ… |
| 21 | suspicious_cross_chapter_label | SBC 201 [1-250]… | 17-33 | 105.5 | 102.6.2 | ❖ This section applies to any building that may have been completed but not occu… |
| 22 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 21-21 | (null) | (none) | TABLE OF CONTENTS SBC 201-CC-2024 xiv SECTION 417 DRYING ROOMS .................… |
| 23 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 22-22 | (null) | (none) | TABLE OF CONTENTS SBC 201-CC-2024 xv SECTION 803 WALL AND CEILING FINISHES .....… |
| 24 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 23-23 | (null) | (none) | TABLE OF CONTENTS SBC 201-CC-2024 xvi SECTION 1030 ASSEMBLY ....................… |
| 25 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 24-24 | (null) | (none) | TABLE OF CONTENTS SBC 201-CC-2024 xvii —STRUCTURAL DESIGN ......................… |
| 26 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 25-25 | (null) | (none) | TABLE OF CONTENTS SBC 201-CC-2024 xviii SECTION 2112 —MASONRY HEATERS ..........… |
| 27 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 26-26 | (null) | (none) | TABLE OF CONTENTS SBC 201-CC-2024 xix SECTION 2602 FINISH AND TRIM .............… |
| 28 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 27-28 | (null) | (none) | TABLE OF CONTENTS SBC 201-CC-2024 xx —SAFEGUARDS DURING CONSTRUCTION ...........… |
| 29 | no_detectable_heading_and_no_label | SBC 201 [1-250]… | 27-28 | (null) | (none) | APPENDIX H —SIGNS ..............................................................… |
| 30 | body_heading_differs_from_section_number | SBC 201 [1-250]… | 34-50 | 104.10 | 104.2 | ❖ The duty of the building official is to enforce the code, and he or she is the… |

## 4. Known failure cases

### 4a. Group M sprinkler trigger (1,115 m² — 903.2.7) lives under wrong label
- id=1716 `SBC 201 - The Saudi General Building Code-251-500_extracted_chunks.json` p79-224, **section_number=`508.4`**
  - snippet: `with Section 903.2.7 a fire area containing a Group M occupancy and exceeding 1115 m2 must be sprinkler protected. [Fire areas (defined in -`
- id=2208 `SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json` p350-360, **section_number=`903.3.1`**
  - snippet: ` where one of the following conditions exists: 1 A Group M fire area exceeds 1115 m2. 2 A Group M fire area is located more than three stories above grade plane. 3 The combined area of all Group M fire areas on all floors, including any mez`
- id=2205 `SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json` p350-360, **section_number=`903.2.4`**
  - snippet: `here one of the following conditions exists: 1 A Group F-1 fire area exceeds 1115 m2. 2 A Group F-1 fire area is located more than three stories above grade plane. 3 The combined area of all Group F-1 fire areas on all floors, including any`
- id=2292 `SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json` p411-435, **section_number=`508.4.1`**
  - snippet: ` boxes. Buildings with a fire area containing a Group M occupancy in excess of 1115 m2 must be equipped with an automatic sprinkler system complying with Section 903.2.7 . 907.2.7.1 Occupant notification. During times that the building is o`
- id=4088 `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` p73-85, **section_number=`903.2.3`**
  - snippet: ` E occupancies as follows: 1. Throughout all Group E fire areas greater than 1115 m2 in area. 2. The Group E fire area is located on a floor other than a level of exit discharge serving such occupancies. Exception: In buildings where every `
- id=4089 `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` p73-85, **section_number=`707.3.10`**
  - snippet: `f this fire area is separated into two fire areas and neither is in excess of 1115 m2, an automatic fire sprinkler system is not required. To be considered separate fire areas, the areas must be separated by fire barriers or horizontal asse`
- id=4092 `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` p73-85, **section_number=`308.6.1`**
  - snippet: ` where one of the following conditions exists: 1. A Group M fire area exceeds 1115 m2. 2. A Group M fire area is located more than three stories above grade plane. 3. The combined area of all Group M fire areas on all floors, including any `
- id=4096 `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` p73-85, **section_number=`903.2.9`**
  - snippet: `enclosed parking garage, in accordance with Section 406.6 of SBC 201, exceeds 1115 m2. 2. Where the enclosed parking garage, in accordance with Section 406.6 of SBC 201, is located beneath other groups. Exception: Enclosed parking garages l`
- id=4126 `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` p89-155, **section_number=`903.2.6`**
  - snippet: ` boxes. Buildings with a fire area containing a Group M occupancy in excess of 1115 m2 must be equipped with an automatic sprinkler system complying with Section 903.2.7. 907.2.7.1 Occupant notification. During times that the building is oc`

### 4b. Rows labeled `section_number = 903.2.7` — what is actually in the body
- id=4093 `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` p73-85
  - body head: `❖ Regardless of the size of the Group M fire area, an automatic sprinkler system may be required in a high-piled storage area. High-piled storage includes piled, palletized, bin box, shelf or rack storage of Class I through IV combustibles `

### 4c. Body text contains "907.2.7 Group M" but section_number is something else
- id=291 `SBC 201 - The Saudi General Building Code-1001-1250_extracted_chunks.json` p1-23, **section_number=`904.11`**
  - snippet: ` load of > 500; or, occupant load of >100 above/below level of exit discharge (907.2.7 ) Hotels (R-1) All (exceptions for < 2 stories with sleeping units having exit directly to exterior; sprinklers) (907.2.8.1 ) Multifamily (R-2) If units `
- id=4312 `SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json` p37-68, **section_number=`907.2.1`**
  - snippet: ` load of > 500; or, occupant load of >100 above/below level of exit discharge (907.2.7) Hotels (R-1) All (exceptions for < 2 stories with sleeping units having exit directly to exterior; sprinklers) (907.2.8.1) Multi-family (R-2) If units >`
- id=2291 `SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json` p411-435, **section_number=`907.2.6`**
  - snippet: `ses, clothes, etc.) and the likelihood of involvement over an extended area. 907.2.7 Group M. A manual fire alarm system that activates the occupant notification system in accordance with Section 907.5 shall be installed in Group M occupanc`
- id=2292 `SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json` p411-435, **section_number=`508.4.1`**
  - snippet: ` equipped with an automatic sprinkler system complying with Section 903.2.7 . 907.2.7.1 Occupant notification. During times that the building is occupied, the initiation of a signal from a manual fire alarm box or from a waterflow switch sh`
- id=4126 `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` p89-155, **section_number=`903.2.6`**
  - snippet: `ses, clothes, etc.) and the likelihood of involvement over an extended area. 907.2.7 Group M. A manual fire alarm system that activates the occupant notification system in accordance with Section 907.5shall be installed in Group M occupanci`

### 4d. `sbc_code_tables` — table_id 903.2 (curated row)
- table_id=`903.2`  edition=2024  source=SBC 801  md_len=3156
  - title: `Occupancies Requiring Automatic Sprinkler Systems — SBC 801 Section 903.2 Summary`
  - head: `## Section 903.2 — Where Required: Automatic Sprinkler Systems by Occupancy **SBC 801 | Section 903.2 | Chapter 9 — Fire Suppression Systems** > Note: SBC 801 does not present 903.2 as a single consolidated table — requirements are in sub-sections. This structured summary covers all 903.2.x sub-sections. | SBC 801 SECTION | OCCUPANCY | SPRINKLER REQUIREMENT `

### 4e. `community_summaries` row mentioning Mercantile + 1,115
- id=9a8e89fe-859e-4a77-9de2-1672238a3c62 level=0
  - summary: `Automatic Sprinkler System Requirements — Decision Tree (SBC 801 Section 903.2) Universal triggers (apply to any occupancy): (1) High-rise building — floor height above grade > 23 m → sprinklers required throughout (Section 903.2.11). (2) Any underground story present, regardless of size → sprinklers required throughout entire building (Section 903.2.10). By occupancy group: - A`

## 5. Mismatch concentration by file (top 30)
| File | Mismatch rows |
|---|---:|
| `SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json` | 392 |
| `SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json` | 241 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1801-2061_extracted_chunks.json` | 239 |
| `SBC 201 - The Saudi General Building Code-1001-1250_extracted_chunks.json` | 224 |
| `SBC 201 - The Saudi General Building Code-251-500_extracted_chunks.json` | 221 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1-200_extracted_chunks.json` | 207 |
| `SBC 201 - The Saudi General Building Code-1751-2000_extracted_chunks.json` | 197 |
| `SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json` | 191 |
| `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` | 183 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1601-1800_extracted_chunks.json` | 168 |
| `SBC 201 - The Saudi General Building Code-1501-1750_extracted_chunks.json` | 157 |
| `SBC 201 - The Saudi General Building Code-2001-2200_extracted_chunks.json` | 157 |
| `SBC 801 - The Saudi Fire Protection Code (3)-201-400_extracted_chunks.json` | 151 |
| `SBC 201 - The Saudi General Building Code-1251-1500_extracted_chunks.json` | 148 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1001-1200_extracted_chunks.json` | 145 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1401-1600_extracted_chunks.json` | 138 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1201-1400_extracted_chunks.json` | 124 |
| `SBC 801 - The Saudi Fire Protection Code (3)-801-1000_extracted_chunks.json` | 102 |

## 6. Safety classification of proposed updates

Categories below are recommendations only. Nothing has been changed.

**SAFE-AUTO (consider auto-update with batch + audit log):**
- `body_heading_child_of_section_number` — body heading is a sub-clause of column. Rename column to body heading is generally safe (e.g. column `903.2.7` body `903.2.7.2` ⇒ retag to `903.2.7.2`).
- `section_number_parent_only` — column is a parent (e.g. `903.2`) but body has a specific child (e.g. `903.2.7`). Retagging to body heading is generally safe.

**MANUAL-REVIEW (do NOT auto-update):**
- `body_heading_differs_from_section_number` — same chapter, different sub-clause. Could be a chunk boundary issue (chunk straddles two sub-clauses) or genuine drift. Needs eyeballing.
- `suspicious_cross_chapter_label` — column is in a different chapter from body heading (e.g. column `508.4.1` body `903.2.7`). High-value cases (these are the Group M drift roots) but each must be confirmed against the chunk boundaries before retag.
- `missing_section_number` — column null while body has a heading. Retag is usually correct, but null may have been intentional for cross-reference / index chunks.
- `no_detectable_heading` (with column populated) — column says `903.2.7` but body has no detectable heading; could be a continuation chunk that legitimately inherits the parent label.

**DO-NOT-TOUCH:**
- Rows where heading regex matched a cross-reference (e.g. "see Section 903.3.1.1") in the first 700 chars by accident. Need a stricter validator before any UPDATE.
- `no_detectable_heading_and_no_label` — both unlabeled. Cannot be auto-resolved.

## 7. Risks before any real UPDATE
- Section labels are referenced by `analyticalRouting.ts` `KNOWN_TABLE_IDS` and `PARENT_ALIASES`; retagging shifts which chunks are returned for a given query. Run a regression on a benchmark prompt set first.
- The `sbc_code_tables.table_id='903.2'` curated row already disagrees with the verbatim chunks (puts Mercantile at 903.2.6 vs verbatim 903.2.7). Backfilling chunk labels without reconciling the curated table will create a new internal inconsistency.
- vector embeddings are not affected by relabeling, but the RPC `match_sbc_documents` returns `section_number` in its response; downstream prompt-context formatting will change.
- Some chunks contain BOTH a heading and a different referenced section (e.g. `"903.2.7 Group M ... see Section 907.5"`). The first-match-wins regex might misattribute on chunk continuations whose first heading is actually a quoted reference.

## 8. Recommended next step (Step 2.5)

Do **not** run an auto-batch UPDATE yet. Recommended sequence:
1. Tighten the heading detector — add a stricter regex that disqualifies matches preceded by keywords like "see", "per", "in accordance with", "complying with".
2. Re-run this dry-run with the tightened detector and compare counts.
3. Manually review the SAFE-AUTO category's top 50 rows to confirm zero false positives.
4. Reconcile `sbc_code_tables.table_id='903.2'` Mercantile section numbering with the verbatim chunks (separate migration).
5. Only then propose a batched UPDATE — wrapped in a transaction, with a `section_number_was` audit column saved before mutating.

---

Companion JSON: `reports/advisory-section-drift-dry-run.json`.