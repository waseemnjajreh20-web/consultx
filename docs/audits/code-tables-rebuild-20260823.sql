-- ###############################################################
-- ##                                                           ##
-- ##   DEPLOY ORDER - REQUIRED. READ BEFORE RUNNING ANYTHING.  ##
-- ##                                                           ##
-- ###############################################################
--
--   1. Deploy the updated `fire-safety-chat` Edge Function FIRST.
--   2. THEN apply this SQL.
--
-- WHY. This file gives 5 rebuilt tables ids that do not exist in
-- production today:
--        1006.3.4(1)
--        1020.2
--        1020.2-width
--        509.1
--        705.5
-- `fire-safety-chat` hard-codes table ids in KNOWN_TABLE_IDS and
-- PARENT_ALIASES, both built from the ids production carries NOW.
--
-- Applying this SQL against the CURRENTLY DEPLOYED function would:
--   * make rebuilt table 1006.3.4(1) COMPLETELY UNREACHABLE, and
--   * degrade 1020.2, 705.5 and 509.1 to matching only when the user
--     literally writes the word "Table".
--
-- The reverse order is harmless: deploying the code first simply means
-- the new ids match nothing until this SQL lands.
--
-- ###############################################################

-- SBC code-table rebuild - SQL for the OWNER to apply
-- Generated 2026-08-24 by tools/sbc_tables/build.py
-- Companion report: docs/audits/code-tables-rebuild-20260823.md
--
-- THIS FILE PERFORMS WRITES. Read it before running it.
-- It contains no DDL and touches no table other than public.sbc_code_tables.
--
-- REVERSIBILITY
--   Step 0 below takes a full backup of the table into
--   public.sbc_code_tables_backup_20260823. Run it FIRST. Every UPDATE
--   keys on the primary key id, so the whole change set is reversible with:
--
--     UPDATE public.sbc_code_tables t
--        SET content_md = b.content_md, table_id = b.table_id,
--            table_title = b.table_title, section = b.section,
--            notes = b.notes
--       FROM public.sbc_code_tables_backup_20260823 b
--      WHERE t.id = b.id;
--
-- IDEMPOTENCE
--   Every statement keys on id (table_id is NOT unique in this table -
--   table_id '417' has two distinct rows) and assigns literal values, so
--   running the file twice leaves exactly the same state as running it once.
--   The backup in step 0 is guarded by IF NOT EXISTS for the same reason.

BEGIN;

-- ---------------------------------------------------------------
-- STEP 0: backup (idempotent - only creates the table the first time)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name  = 'sbc_code_tables_backup_20260823'
  ) THEN
    CREATE TABLE public.sbc_code_tables_backup_20260823 AS
      SELECT * FROM public.sbc_code_tables;
  END IF;
END $$;

-- ===============================================================
-- 1. 1004.5  ->  table_id 1004.5   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-1001-1250.pdf
--    page     : page_index_0based=212 (printed page 1185)
--    caption  : Table 1004.5 - MAXIMUM FLOOR AREA ALLOWANCES PER OCCUPANT
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
--    note     : CALIBRATION TABLE. Caption printed as 'Table 1004.5'.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '8b7d0de6-5298-4c99-b638-fd284c5a9b48';

UPDATE public.sbc_code_tables SET
    table_id    = '1004.5',
    table_title = 'MAXIMUM FLOOR AREA ALLOWANCES PER OCCUPANT',
    edition     = '2024',
    section     = '1004.5',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-1001-1250.pdf, page_index_0based=212, printed page 1185, caption ''Table 1004.5''. Units exactly as printed (the SBC prints this table in metric). CALIBRATION TABLE. Caption printed as ''Table 1004.5''.',
    content_md  = '## Table 1004.5 - MAXIMUM FLOOR AREA ALLOWANCES PER OCCUPANT
**SBC 201-CC-2024 | Chapter 10 | printed page 1185**

> **[STRUCTURED_FACT - Source: TABLE 1004.5, SBC 201-CC-2024, printed page 1185]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-1001-1250.pdf`, page_index_0based=212, printed_page=1185.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| FUNCTION OF SPACE | OCCUPANT LOAD FACTOR (m2) |
|---|---|
| Accessory storage areas, mechanical equipment room | 28 gross |
| Agricultural building | 28 gross |
| Aircraft hangars | 46 gross |
| Airport terminal<br>Baggage claim<br>Baggage handling<br>Concourse<br>Waiting areas | 1.9 gross<br>28 gross<br>9 gross<br>1.4 gross |
| Assembly<br>Gaming floors (keno, slots, etc.)<br>Exhibit Gallery and Museum | 1 gross<br>2.8 net |
| Assembly with fixed seats | See Section 1004.6 |
| Assembly without fixed seats<br>Concentrated (chairs only-not fixed)<br>Standing space<br>Unconcentrated (tables and chairs) | 0.65 net<br>0.46 net<br>1.4 net |
| Bowling centers, allow 5 persons for each lane including 4.6 m of runway, and<br>for additional areas | 0.65 net |
| Business areas<br>Concentrated business use areas | 14 gross<br>See Section 1004.8 |
| Courtrooms—other than fixed seating areas | 3.7 net |
| Day care | 3.3 net |
| Dormitories | 4.6 gross |
| Educational<br>Classroom area<br>Shops and other vocational room areas | 1.9 net<br>4.6 net |
| Exercise rooms | 4.6 gross |
| H-5 Fabrication and manufacturing areas | 19 gross |
| Industrial areas | 9 gross |
| Institutional areas<br>Inpatient treatment areas<br>Outpatient areas<br>Sleeping areas | 22 gross<br>9 gross<br>11 gross |
| Kitchens, commercial | 19 gross |
| Library<br>Reading rooms<br>Stack area | 4.6 net<br>9 gross |
| Mall buildings—covered and open | See Section 402.8.2 |
| Mercantile<br>Areas on other floors<br>Basement and grade floor areas<br>Storage, stock, shipping areas | 5.6 gross<br>2.8 gross<br>28 gross |
| Parking garages | 19 gross |
| Residential | 19 gross |
| Skating rinks, swimming pools<br>Rink and pool<br>Decks | 4.6 gross<br>1.4 gross |
| Stages and platforms | 1.4 net |
| Warehouses | 46 gross |
'
  WHERE id = '8b7d0de6-5298-4c99-b638-fd284c5a9b48';

-- ===============================================================
-- 2. QUARANTINED_1006.2.1  ->  table_id 1006.2.1   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-1001-1250.pdf
--    page     : page_index_0based=213 (printed page 1186)
--    caption  : TABLE 1006.2.1 - SPACES WITH ONE EXIT OR EXIT ACCESS DOORWAY
--    checks   : (a) PASS  (b) PASS  (c) PASS  (d) PASS
--    note     : Three distance columns (OL<=30 / OL>30 without sprinkler, and with
--    note     : sprinkler). The production row had collapsed them into one.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '5339003f-4f51-4e8c-91f8-def550343af7';

UPDATE public.sbc_code_tables SET
    table_id    = '1006.2.1',
    table_title = 'SPACES WITH ONE EXIT OR EXIT ACCESS DOORWAY',
    edition     = '2024',
    section     = '1006.2.1',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-1001-1250.pdf, page_index_0based=213, printed page 1186, caption ''TABLE 1006.2.1''. Units exactly as printed (the SBC prints this table in metric). Three distance columns (OL<=30 / OL>30 without sprinkler, and with sprinkler). The production row had collapsed them into one.',
    content_md  = '## Table 1006.2.1 - SPACES WITH ONE EXIT OR EXIT ACCESS DOORWAY
**SBC 201-CC-2024 | Chapter 10 | printed page 1186**

> **[STRUCTURED_FACT - Source: TABLE 1006.2.1, SBC 201-CC-2024, printed page 1186]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-1001-1250.pdf`, page_index_0based=213, printed_page=1186.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| OCCUPANCY | MAXIMUM OCCUPANT LOAD | MAXIMUM COMMON PATH OF EGRESS TRAVEL DISTANCE (METER) - WITHOUT SPRINKLER SYSTEM (METER) - OCCUPANT LOAD - OL≤ 30 | MAXIMUM COMMON PATH OF EGRESS TRAVEL DISTANCE (METER) - WITHOUT SPRINKLER SYSTEM (METER) - OCCUPANT LOAD - OL > 30 | MAXIMUM COMMON PATH OF EGRESS TRAVEL DISTANCE (METER) - WITH SPRINKLER SYSTEM (METER) |
|---|---|---|---|---|
| Ac, M, U | 49 | 23 | 23 | 23a |
| B | 49 | 30 | 23 | 30a |
| F | 49 | 23 | 23 | 30a |
| H-1, H-2, H-3 | 3 | NP | NP | 7.5b |
| H-4, H-5 | 10 | NP | NP | 23b |
| I-1, I-2d, I-4 | 10 | NP | NP | 23a |
| I-3 | 10 | NP | NP | 30a |
| R-1 | 10 | NP | NP | 23a |
| R-2 | 20 | NP | NP | 38a |
| R-3e | 20 | NP | NP | 38a,g |
| R-4e | 20 | NP | NP | 38a,g |
| Sf | 29 | 30 | 23 | 30a |
| U | 49 | 30 | 23 | 23a |

**Notes, legend and footnotes as printed:**
- NP = Not Permitted.
- a. Buildings equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 or 903.3.1.2 . See Section 903 for occupancies where automatic sprinkler systems are permitted in accordance with Section 903.3.1.2 .
- b. Group H occupancies equipped throughout with an automatic sprinkler system in accordance with Section 903.2.5
- c. For a room or space used for assembly purposes having fixed seating, see Section 1030.8 .
- d. For the travel distance limitations in Group I-2, see Section 407.4 .
- e. The common path of egress travel distance shall only apply in a Group R-3 occupancy located in a mixed occupancy building or within a Group R-3 or R-4 congregate living facility.
- f. The length of common path of egress travel distance in a Group S-2 open parking garage shall be not more than 30 meters.
- g. For the travel distance limitations in Group R-3 and R-4 equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.3 , see Section 1006.2.2.6 .

> **[AMBIGUITY IN THE PRINTED CODE - READ BEFORE USING THIS TABLE]**
> Group U is printed in TWO different rows of this table with CONFLICTING unsprinklered limits. Row 1, printed ''A(c), M, U'', gives a maximum common path of egress travel of 23 m for occupant load <= 30 without sprinklers. Row 13, printed ''U'', gives 30 m for the same condition. A Group U space therefore has two different printed limits.
> Both rows are transcribed above exactly as printed; neither has been dropped, merged or corrected.
> **For design purposes the conservative value (23 m) governs until clarified by the authority having jurisdiction.**
> Origin of the contradiction: UNKNOWN. It is present in the printed page cited above.
> Cross-volume note, CONFIRMED by reading both pages: SBC 801 printed page 835 prints this same table with its first row as ''A(c), E, M'' rather than ''A(c), M, U'', and prints no Group U in that row at all. Which volume governs is an owner / authority question; neither reading is asserted here as correct.
'
  WHERE id = '5339003f-4f51-4e8c-91f8-def550343af7';

-- ===============================================================
-- 3. 1006.3.3  ->  table_id 1006.3.3   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-1001-1250.pdf
--    page     : page_index_0based=213 (printed page 1186)
--    caption  : TABLE 1006.3.3 - MINIMUM NUMBER OF EXITS OR ACCESS TO EXITS PER STORY
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
--    note     : CALIBRATION TABLE.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '76cd8e97-b854-4f4c-bc62-e19e3a2fa1bb';

UPDATE public.sbc_code_tables SET
    table_id    = '1006.3.3',
    table_title = 'MINIMUM NUMBER OF EXITS OR ACCESS TO EXITS PER STORY',
    edition     = '2024',
    section     = '1006.3.3',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-1001-1250.pdf, page_index_0based=213, printed page 1186, caption ''TABLE 1006.3.3''. Units exactly as printed (the SBC prints this table in metric). CALIBRATION TABLE.',
    content_md  = '## Table 1006.3.3 - MINIMUM NUMBER OF EXITS OR ACCESS TO EXITS PER STORY
**SBC 201-CC-2024 | Chapter 10 | printed page 1186**

> **[STRUCTURED_FACT - Source: TABLE 1006.3.3, SBC 201-CC-2024, printed page 1186]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-1001-1250.pdf`, page_index_0based=213, printed_page=1186.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| OCCUPANT LOAD PER STORY | MINIMUM NUMBER OF EXITS OR ACCESS TO EXITS FROM STORY |
|---|---|
| 1-500 | 2 |
| 501-1,000 | 3 |
| More than 1,000 | 4 |
'
  WHERE id = '76cd8e97-b854-4f4c-bc62-e19e3a2fa1bb';

-- ===============================================================
-- 4. QUARANTINED_1006.3.4  ->  table_id 1006.3.4(1)   [RENUMBERED]
--    source   : SBC 201 - The Saudi General Building Code-1001-1250.pdf
--    page     : page_index_0based=213 (printed page 1186)
--    caption  : TABLE 1006.3.4(1) - STORIES WITH ONE EXIT OR ACCESS TO ONE EXIT FOR R-2 OCCUPANCIES
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
--    ** RENUMBERED: table_id changes from 'QUARANTINED_1006.3.4' to '1006.3.4(1)'.
--       This changes what extractTableIds() in fire-safety-chat will match.
--    note     : SBC prints no bare 'TABLE 1006.3.4'; it prints 1006.3.4(1) for Group R-2
--    note     : and 1006.3.4(2) for other occupancies. The production row's title
--    note     : matches the R-2 table.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = 'a6ce9d2c-e38e-4f29-9e53-834b48c18b8b';

UPDATE public.sbc_code_tables SET
    table_id    = '1006.3.4(1)',
    table_title = 'STORIES WITH ONE EXIT OR ACCESS TO ONE EXIT FOR R-2 OCCUPANCIES',
    edition     = '2024',
    section     = '1006.3.4',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-1001-1250.pdf, page_index_0based=213, printed page 1186, caption ''TABLE 1006.3.4(1)''. Units exactly as printed (the SBC prints this table in metric). RENUMBERED from 1006.3.4 to 1006.3.4(1): the SBC does not print the former number. SBC prints no bare ''TABLE 1006.3.4''; it prints 1006.3.4(1) for Group R-2 and 1006.3.4(2) for other occupancies. The production row''s title matches the R-2 table.',
    content_md  = '## Table 1006.3.4(1) - STORIES WITH ONE EXIT OR ACCESS TO ONE EXIT FOR R-2 OCCUPANCIES
**SBC 201-CC-2024 | Chapter 10 | printed page 1186**

> **[STRUCTURED_FACT - Source: TABLE 1006.3.4(1), SBC 201-CC-2024, printed page 1186]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-1001-1250.pdf`, page_index_0based=213, printed_page=1186.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.
> NOTE: this table is printed in the SBC as TABLE 1006.3.4(1). The previous record carried the number 1006.3.4, which the SBC does not print.

| STORY | OCCUPANCY | MAXIMUM NUMBER OF DWELLING UNITS | MAXIMUM EXIT ACCESS TRAVEL DISTANCE |
|---|---|---|---|
| Basement, first, second or<br>third story above grade plane | R-2a,b | 4 dwelling units | 38 meters |
| Fourth story above grade<br>plane and higher | NP | NA | NA |

**Notes, legend and footnotes as printed:**
- NP = Not Permitted.
- NA = Not Applicable.
- a. Buildings classified as Group R-2 equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 or 903.3.1.2 and provided with emergency escape and rescue openings in accordance with Section 1031.
- b. This table is used for R-2 occupancies consisting of dwelling units. For R-2 occupancies consisting of sleeping units, use Table 1006.3.4(2).
'
  WHERE id = 'a6ce9d2c-e38e-4f29-9e53-834b48c18b8b';

-- ===============================================================
-- 5. 1006.3.4(2)  ->  table_id 1006.3.4(2)   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-1001-1250.pdf
--    page     : page_index_0based=214 (printed page 1187)
--    caption  : TABLE 1006.3.4(2) - STORIES WITH ONE EXIT OR ACCESS TO ONE EXIT FOR OTHER OCCUPANCIES
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = 'd419009f-e558-4a06-9d98-d5174957156e';

UPDATE public.sbc_code_tables SET
    table_id    = '1006.3.4(2)',
    table_title = 'STORIES WITH ONE EXIT OR ACCESS TO ONE EXIT FOR OTHER OCCUPANCIES',
    edition     = '2024',
    section     = '1006.3.4',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-1001-1250.pdf, page_index_0based=214, printed page 1187, caption ''TABLE 1006.3.4(2)''. Units exactly as printed (the SBC prints this table in metric).',
    content_md  = '## Table 1006.3.4(2) - STORIES WITH ONE EXIT OR ACCESS TO ONE EXIT FOR OTHER OCCUPANCIES
**SBC 201-CC-2024 | Chapter 10 | printed page 1187**

> **[STRUCTURED_FACT - Source: TABLE 1006.3.4(2), SBC 201-CC-2024, printed page 1187]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-1001-1250.pdf`, page_index_0based=214, printed_page=1187.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| STORY | OCCUPANCY | MAXIMUM OCCUPANT LOAD PER STORY | MAXIMUM EXIT ACCESS TRAVEL DISTANCE (METERS) |
|---|---|---|---|
| First story above or below<br>grade plane | A, Bb, E, Fb , M, U | 49 | 23 |
| First story above or below<br>grade plane | H-2, H-3 | 3 | 7.5 |
| First story above or below<br>grade plane | H-4, H-5, I, R-1,R-2a,c | 10 | 23 |
| First story above or below<br>grade plane | Sb,d | 29 | 23 |
| Second story above grade<br>plane | B, F, M, Sd | 29 | 23 |
| Third story above grade<br>plane and higher | NP | NA | NA |

**Notes, legend and footnotes as printed:**
- NP = Not Permitted.
- NA = Not Applicable.
- a. Buildings classified as Group R-2 equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 or 903.3.1.2 and provided with emergency escape and rescue openings in accordance with Section 1031.
- b. Group B, F and S occupancies in buildings equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 shall have a maximum exit access travel distance of 30 meters.
- c. This table is used for R-2 occupancies consisting of sleeping units. For R-2 occupancies consisting of dwelling units, use Table 1006.3.4(1).
- d. The length of exit access travel distance in a Group S-2 open parking garage shall be not more than 30 meters.
'
  WHERE id = 'd419009f-e558-4a06-9d98-d5174957156e';

-- ===============================================================
-- 6. QUARANTINED_1017.2  ->  table_id 1017.2   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-1001-1250.pdf
--    page     : page_index_0based=215 (printed page 1188)
--    caption  : TABLE 1017.2 - EXIT ACCESS TRAVEL DISTANCEa
--    checks   : (a) PASS  (b) PASS  (c) PASS  (d) PASS
--    note     : The table at the centre of the safety alert.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '36615928-df1b-42c1-937a-75afc343d3a2';

UPDATE public.sbc_code_tables SET
    table_id    = '1017.2',
    table_title = 'EXIT ACCESS TRAVEL DISTANCEa',
    edition     = '2024',
    section     = '1017.2',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-1001-1250.pdf, page_index_0based=215, printed page 1188, caption ''TABLE 1017.2''. Units exactly as printed (the SBC prints this table in metric). The table at the centre of the safety alert.',
    content_md  = '## Table 1017.2 - EXIT ACCESS TRAVEL DISTANCEa
**SBC 201-CC-2024 | Chapter 10 | printed page 1188**

> **[STRUCTURED_FACT - Source: TABLE 1017.2, SBC 201-CC-2024, printed page 1188]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-1001-1250.pdf`, page_index_0based=215, printed_page=1188.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| OCCUPANCY | WITHOUT SPRINKLER SYSTEM (meters) | WITH SPRINKLER SYSTEM (meters ) |
|---|---|---|
| A, E, F-1, I-1, M, R, S-1 | 60e | 75b |
| I-1 | Not permitted | 75 b |
| B | 60 | 90 c |
| F-2, S-2, U | 90 | 120 b |
| H-1 | Not Permitted | 23 c |
| H-2 | Not Permitted | 30 c |
| H-3 | Not Permitted | 46 c |
| H-4 | Not Permitted | 53 c |
| H-5 | Not Permitted | 60 c |
| I-2, I-3 | Not Permitted | 60 c |
| I-4 | 46 | 60 c |

**Notes, legend and footnotes as printed:**
- a. See the following sections for modifications to exit access travel distance requirements: Section 402.8 : For the distance limitation in malls. Section 407.4 : For the distance limitation in Group I-2. Sections 408.6.1 and 408.8.1 : For the distance limitations in Group I-3. Section 411.2 : For the distance limitation in special amusement areas. Section 412.6 : For the distance limitations in aircraft manufacturing facilities. Section 1006.2.2.2 : For the distance limitation in refrigeration machinery rooms. Section 1006.2.2.3 : For the distance limitation in refrigerated rooms and spaces. Section 1006.3.4 : For buildings with one exit. Section 1017.2.2 : For increased distance limitation in Groups F-1 and S-1. Section 1030.7 : For increased limitation in assembly seating. Section 3103.4 : For temporary structures. Section 3104.9 : For pedestrian walkways.
- b. Buildings equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 or 903.3.1.2 See Section 903 for occupancies where automatic sprinkler systems are permitted in accordance with Section 903.3.1.2 .
- c. Buildings equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 .
- d. Group H occupancies equipped throughout with an automatic sprinkler system in accordance with Section 903.2.5.1
- e. Group R-3 and R-4 buildings equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.3 . See Section 903.2.8 for occupancies where automatic sprinkler systems are permitted in accordance with Section 903.3.1.3 .

> **[AMBIGUITY IN THE PRINTED CODE - READ BEFORE USING THIS TABLE]**
> Group I-1 is printed in TWO different rows of this table with CONFLICTING unsprinklered limits. Row 1, printed ''A, E, F-1, I-1, M, R, S-1'', gives a maximum exit access travel distance of 60 m without a sprinkler system. Row 2, printed ''I-1'' on its own, gives ''Not permitted'' without a sprinkler system. A Group I-1 building therefore has two different printed answers to the same question. Both rows give 75 m with sprinklers, so the conflict is confined to the unsprinklered column.
> Both rows are transcribed above exactly as printed; neither has been dropped, merged or corrected.
> **For design purposes the conservative value (Not permitted - i.e. an unsprinklered Group I-1 exit access is treated as not allowed) governs until clarified by the authority having jurisdiction.**
> Origin of the contradiction: UNKNOWN. It is present in the printed page cited above.
> Read from SBC 201 printed page 1188 (page_index_0based 215). The same two-row pattern is printed in SBC 801 printed page 838.
'
  WHERE id = '36615928-df1b-42c1-937a-75afc343d3a2';

-- ===============================================================
-- 7. 1020.1  ->  table_id 1020.2   [RENUMBERED]
--    source   : SBC 201 - The Saudi General Building Code-1001-1250.pdf
--    page     : page_index_0based=215 (printed page 1188)
--    caption  : TABLE 1020.2 - CORRIDOR FIRE-RESISTANCE RATING
--    checks   : (a) PASS  (b) PASS  (c) PASS  (d) PASS
--    ** RENUMBERED: table_id changes from '1020.1' to '1020.2'.
--       This changes what extractTableIds() in fire-safety-chat will match.
--    note     : RENUMBERED 1020.1 -> 1020.2. SBC prints the corridor fire-resistance
--    note     : table as TABLE 1020.2; there is no TABLE 1020.1 in SBC 201. Hours of
--    note     : rating: a LARGER value is MORE strict.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '138da5fc-b9b6-4317-ab3c-d51ea381da8b';

UPDATE public.sbc_code_tables SET
    table_id    = '1020.2',
    table_title = 'CORRIDOR FIRE-RESISTANCE RATING',
    edition     = '2024',
    section     = '1020.2',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-1001-1250.pdf, page_index_0based=215, printed page 1188, caption ''TABLE 1020.2''. Units exactly as printed (the SBC prints this table in metric). RENUMBERED from 1020.1 to 1020.2: the SBC does not print the former number. RENUMBERED 1020.1 -> 1020.2. SBC prints the corridor fire-resistance table as TABLE 1020.2; there is no TABLE 1020.1 in SBC 201. Hours of rating: a LARGER value is MORE strict.',
    content_md  = '## Table 1020.2 - CORRIDOR FIRE-RESISTANCE RATING
**SBC 201-CC-2024 | Chapter 10 | printed page 1188**

> **[STRUCTURED_FACT - Source: TABLE 1020.2, SBC 201-CC-2024, printed page 1188]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-1001-1250.pdf`, page_index_0based=215, printed_page=1188.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.
> NOTE: this table is printed in the SBC as TABLE 1020.2. The previous record carried the number 1020.1, which the SBC does not print.

| OCCUPANCY | OCCUPANT LOAD SERVED BY CORRIDOR | REQUIRED FIRE-RESISTANCE RATING (hours) - Without sprinkler system | REQUIRED FIRE-RESISTANCE RATING (hours) - With sprinkler systemc |
|---|---|---|---|
| H-1, H-2, H-3 | All | Not Permitted | 1 |
| H-4, H-5 | Greater than 30 | Not Permitted | 1 |
| A, B, E, F, M, S, U | Greater than 30 | 1 | 0 |
| R | Greater than 10 | Not Permitted | 0.5/1d |
| I-2a | All | Not Permitted | 0 |
| I-4 | All | 1 | 0 |
| I-1, I-3 | All | Not Permitted | 1b |

**Notes, legend and footnotes as printed:**
- a. For requirements for occupancies in Group I-2, see Sections 407.2 and 407.3 .
- b. For a reduction in the fire-resistance rating for occupancies in Group I-3, see Section 408.8 .
- c. Buildings equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 or 903.3.1.2 where allowed.
- d. Group R-3 and R-4 buildings equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.3 . See Section 903.2.8 for occupancies where automatic sprinkler systems are permitted in accordance with Section 903.3.1.3 .
'
  WHERE id = '138da5fc-b9b6-4317-ab3c-d51ea381da8b';

-- ===============================================================
-- 8. QUARANTINED_1018.1  ->  table_id 1020.2-width   [RENUMBERED]
--    source   : SBC 201 - The Saudi General Building Code-1001-1250.pdf
--    page     : page_index_0based=216 (printed page 1189)
--    caption  : TABLE 1020.2 - MINIMUM CORRIDOR WIDTH
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
--    ** RENUMBERED: table_id changes from 'QUARANTINED_1018.1' to '1020.2-width'.
--       This changes what extractTableIds() in fire-safety-chat will match.
--    note     : RENUMBERED 1018.1 -> MINIMUM CORRIDOR WIDTH. SBC 201 prints TWO
--    note     : different tables both numbered TABLE 1020.2: corridor fire-resistance
--    note     : rating on printed page 1188 (page_index_0based 215) and minimum corridor
--    note     : width on printed page 1189 (page_index_0based 216). Verified: pdfplumber
--    note     : reports a caption 'TABLE 1020.2' at top=525.15 on index 215 and again at
--    note     : top=75.29 on index 216. The collision is in the printed SBC 201 itself.
--    note     : SBC 801 DOES disambiguate: printed page 839 (801-1000 split,
--    note     : page_index_0based 68) prints 'TABLE 1020.2 CORRIDOR FIRE-RESISTANCE
--    note     : RATING' and 'TABLE 1020.3 MINIMUM CORRIDOR WIDTH' as two separately
--    note     : numbered tables. RECOMMENDATION for the owner: adopt 1020.3 for this
--    note     : row, per SBC 801. Until the owner decides, target_id stays the synthetic
--    note     : '1020.2-width', which extractTableIds() will NOT match - so the row is
--    note     : repaired in place but remains un-injected rather than colliding with the
--    note     : fire-resistance table.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '5f1517df-8853-4bcc-85f4-b89be0b8d350';

UPDATE public.sbc_code_tables SET
    table_id    = '1020.2-width',
    table_title = 'MINIMUM CORRIDOR WIDTH',
    edition     = '2024',
    section     = '1020.2-width',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-1001-1250.pdf, page_index_0based=216, printed page 1189, caption ''TABLE 1020.2''. Units exactly as printed (the SBC prints this table in metric). RENUMBERED from 1018.1 to 1020.2-width: the SBC does not print the former number. RENUMBERED 1018.1 -> MINIMUM CORRIDOR WIDTH. SBC 201 prints TWO different tables both numbered TABLE 1020.2: corridor fire-resistance rating on printed page 1188 (page_index_0based 215) and minimum corridor width on printed page 1189 (page_index_0based 216). Verified: pdfplumber reports a caption ''TABLE 1020.2'' at top=525.15 on index 215 and again at top=75.29 on index 216. The collision is in the printed SBC 201 itself. SBC 801 DOES disambiguate: printed page 839 (801-1000 split, page_index_0based 68) prints ''TABLE 1020.2 CORRIDOR FIRE-RESISTANCE RATING'' and ''TABLE 1020.3 MINIMUM CORRIDOR WIDTH'' as two separately numbered tables. RECOMMENDATION for the owner: adopt 1020.3 for this row, per SBC 801. Until the owner decides, target_id stays the synthetic ''1020.2-width'', which extractTableIds() will NOT match - so the row is repaired in place but remains un-injected rather than colliding with the fire-resistance table.',
    content_md  = '## Table 1020.2 - MINIMUM CORRIDOR WIDTH
**SBC 201-CC-2024 | Chapter 10 | printed page 1189**

> **[STRUCTURED_FACT - Source: TABLE 1020.2, SBC 201-CC-2024, printed page 1189]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-1001-1250.pdf`, page_index_0based=216, printed_page=1189.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.
> NOTE: this table is printed in the SBC as TABLE 1020.2. The previous record carried the number 1018.1, which the SBC does not print.

| OCCUPANCY | MINIMUM WIDTH (mm) |
|---|---|
| Any facilities not listed below | 1100 |
| Access to and utilization of mechanical, plumbing or electrical systems or<br>equipment | 600 |
| With an occupant load of less than 50 | 900 |
| Within a dwelling unit | 900 |
| In Group E with a corridor having an occupant load of 100 or more | 1800 |
| In corridors and areas serving stretcher traffic in ambulatory care facilities | 1800 |
| Group I-2 in areas where required for bed movement | 2400 |
'
  WHERE id = '5f1517df-8853-4bcc-85f4-b89be0b8d350';

-- ===============================================================
-- 9. 504.3  ->  table_id 504.3   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-251-500.pdf
--    page     : page_index_0based=241 (printed page 464)
--    caption  : TABLE 504.3 - ALLOWABLE BUILDING HEIGHT IN METERS ABOVE GRADE PLANEa
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '03127d3d-4ea8-417b-b3b2-dd8833863b65';

UPDATE public.sbc_code_tables SET
    table_id    = '504.3',
    table_title = 'ALLOWABLE BUILDING HEIGHT IN METERS ABOVE GRADE PLANEa',
    edition     = '2024',
    section     = '504.3',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-251-500.pdf, page_index_0based=241, printed page 464, caption ''TABLE 504.3''. Units exactly as printed (the SBC prints this table in metric).',
    content_md  = '## Table 504.3 - ALLOWABLE BUILDING HEIGHT IN METERS ABOVE GRADE PLANEa
**SBC 201-CC-2024 | Chapter 5 | printed page 464**

> **[STRUCTURED_FACT - Source: TABLE 504.3, SBC 201-CC-2024, printed page 464]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-251-500.pdf`, page_index_0based=241, printed_page=464.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| OCCUPANCY CLASSIFICATION | TYPE OF CONSTRUCTION - SEE FOOTNOTES | TYPE OF CONSTRUCTION - TYPE I - A | TYPE OF CONSTRUCTION - TYPE I - B | TYPE OF CONSTRUCTION - TYPE II - A | TYPE OF CONSTRUCTION - TYPE II - B | TYPE OF CONSTRUCTION - TYPE III - A | TYPE OF CONSTRUCTION - TYPE III - B | TYPE OF CONSTRUCTION - TYPE IV - A | TYPE OF CONSTRUCTION - TYPE IV - B | TYPE OF CONSTRUCTION - TYPE IV - C | TYPE OF CONSTRUCTION - TYPE IV - HT | TYPE OF CONSTRUCTION - TYPE V - A | TYPE OF CONSTRUCTION - TYPE V - B |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A, B, E, F, M, S, U | NSb | UL | 48 | 19.5 | 16.5 | 19.5 | 16.5 | 19.5 | 19.5 | 19.5 | 19.5 | 15 | 12 |
| A, B, E, F, M, S, U | S | UL | 54 | 25.5 | 23 | 25.5 | 23 | 81 | 54 | 25.5 | 25.5 | 21 | 18 |
| H-1, H-2, H-3, H-5 | NSc, d | UL | 48 | 19.5 | 16.5 | 19.5 | 16.5 | 36 | 27 | 19.5 | 19.5 | 15 | 12 |
| H-1, H-2, H-3, H-5 | S | UL | 48 | 19.5 | 16.5 | 19.5 | 16.5 | 36 | 27 | 19.5 | 19.5 | 15 | 12 |
| H-4 | NSc, d | UL | 48 | 19.5 | 16.5 | 19.5 | 16.5 | 19.5 | 19.5 | 19.5 | 19.5 | 15 | 12 |
| H-4 | S | UL | 54 | 25.5 | 23 | 25.5 | 23 | 42 | 30 | 25.5 | 25.5 | 21 | 18 |
| I-1 Condition 1, I-3 | NSd, e | UL | 48 | 19.5 | 16.5 | 19.5 | 16.5 | 19.5 | 19.5 | 19.5 | 19.5 | 15 | 12 |
| I-1 Condition 1, I-3 | S | UL | 54 | 25.5 | 23 | 25.5 | 23 | 54 | 36 | 25.5 | 25.5 | 21 | 18 |
| I-1 Condition 2, I-2 | NSd, f, e | UL | 48 | 19.5 | 16.5 | 19.5 | 16.5 | 19.5 | 19.5 | 19.5 | 19.5 | 15 | 12 |
| I-1 Condition 2, I-2 | S | UL | 54 | 25.5 | 16.5 | 19.5 | 16.5 | 19.5 | 19.5 | 19.5 | 19.5 | 15 | 12 |
| I-4 | NSd, g | UL | 48 | 19.5 | 16.5 | 19.5 | 16.5 | 19.5 | 19.5 | 19.5 | 19.5 | 15 | 12 |
| I-4 | S | UL | 54 | 25.5 | 23 | 25.5 | 23 | 54 | 36 | 25.5 | 25.5 | 21 | 18 |
| Rh | NSd | UL | 48 | 19.5 | 16.5 | 19.5 | 16.5 | 19.5 | 19.5 | 19.5 | 19.5 | 15 | 12 |
| Rh | S13D | 18 | 18 | 18 | 18 | 18 | 18 | 18 | 18 | 18 | 18 | 15 | 12 |
| Rh | S13R | 18 | 18 | 18 | 18 | 18 | 18 | 18 | 18 | 18 | 18 | 18 | 18 |
| Rh | S | UL | 54 | 25.5 | 23 | 25.5 | 23 | 81 | 54 | 25.5 | 25.5 | 21 | 18 |

**Notes, legend and footnotes as printed:**
- Note: UL = Unlimited; NS = Buildings not equipped throughout with an automatic sprinkler system; S = Buildings equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.1 ; S13R = Buildings equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.2 . S13D = Buildings equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.3
- a. See Chapter 4 and 5 for specific exceptions to the allowable height in this chapter.
- b. See Section 903.2 for the minimum thresholds for protection by an automatic sprinkler system for specific occupancies.
- c. New Group H occupancies are required to be protected by an automatic sprinkler system in accordance with Section 903.2.5 .
- d. The NS value is only for use in evaluation of existing building height in accordance with SBC 901.
- e. New Group I-1 and I-3 occupancies are required to be protected by an automatic sprinkler system in accordance with Section 903.2.6 . For new Group I-1 occupancies Condition 1, see Exception 1 of Section 903.2.6 .
- f. New and existing Group I-2 occupancies are required to be protected by an automatic sprinkler system in accordance with Section 903.2.6 and Section 1103.5 of SBC 801.
- g. For new Group I-4 occupancies, see Exceptions 2 and 3 of Section 903.2.6 .
- h. New Group R occupancies are required to be protected by an automatic sprinkler system in accordance with Section 903.2.8 .
'
  WHERE id = '03127d3d-4ea8-417b-b3b2-dd8833863b65';

-- ===============================================================
-- 10. 504.4  ->  table_id 504.4   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-251-500.pdf
--    page     : page_index_0based=242 (printed page 465)
--    caption  : TABLE 504.4 - ALLOWABLE NUMBER OF STORIES ABOVE GRADE PLANEa,b
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = 'ed15da7a-7154-4903-936a-d5d0c674ca30';

UPDATE public.sbc_code_tables SET
    table_id    = '504.4',
    table_title = 'ALLOWABLE NUMBER OF STORIES ABOVE GRADE PLANEa,b',
    edition     = '2024',
    section     = '504.4',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-251-500.pdf, page_index_0based=242, printed page 465, caption ''TABLE 504.4''. Units exactly as printed (the SBC prints this table in metric).',
    content_md  = '## Table 504.4 - ALLOWABLE NUMBER OF STORIES ABOVE GRADE PLANEa,b
**SBC 201-CC-2024 | Chapter 5 | printed page 465**

> **[STRUCTURED_FACT - Source: TABLE 504.4, SBC 201-CC-2024, printed page 465]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-251-500.pdf`, page_index_0based=242, printed_page=465.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| OCCUPANCY CLASSIFICATION | TYPE Of CONSTRUCTION - SEE FOOTNOTES | TYPE Of CONSTRUCTION - TYPE Ⅰ - A | TYPE Of CONSTRUCTION - TYPE Ⅰ - B | TYPE Of CONSTRUCTION - TYPE Ⅱ - A | TYPE Of CONSTRUCTION - TYPE Ⅱ - B | TYPE Of CONSTRUCTION - TYPE Ⅲ - A | TYPE Of CONSTRUCTION - TYPE Ⅲ - B | TYPE Of CONSTRUCTION - TYPE Ⅳ - A | TYPE Of CONSTRUCTION - TYPE Ⅳ - B | TYPE Of CONSTRUCTION - TYPE Ⅳ - C | TYPE Of CONSTRUCTION - TYPE Ⅳ - HT | TYPE Of CONSTRUCTION - TYPE Ⅴ - A | TYPE Of CONSTRUCTION - TYPE Ⅴ - B |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A-1 | NS | UL | 5 | 3 | 2 | 3 | 2 | 3 | 3 | 3 | 3 | 2 | 1 |
| A-1 | S | UL | 6 | 4 | 3 | 4 | 3 | 9 | 6 | 4 | 4 | 3 | 2 |
| A-2 | NS | UL | 11 | 3 | 2 | 3 | 2 | 3 | 3 | 3 | 3 | 2 | 1 |
| A-2 | S | UL | 12 | 4 | 3 | 4 | 3 | 18 | 12 | 6 | 4 | 3 | 2 |
| A-3 | NS | UL | 11 | 3 | 2 | 3 | 2 | 3 | 3 | 3 | 3 | 2 | 1 |
| A-3 | S | UL | 12 | 4 | 3 | 4 | 3 | 18 | 12 | 6 | 4 | 3 | 2 |
| A-4 | NS | UL | 11 | 3 | 2 | 3 | 2 | 3 | 3 | 3 | 3 | 2 | 1 |
| A-4 | S | UL | 12 | 4 | 3 | 4 | 3 | 18 | 12 | 6 | 4 | 3 | 2 |
| A-5 | NS | UL | UL | UL | UL | UL | UL | 1 | 1 | 1 | UL | UL | UL |
| A-5 | S | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL |
| B | NS | UL | 11 | 5 | 3 | 5 | 3 | 5 | 5 | 5 | 5 | 3 | 2 |
| B | S | UL | 12 | 6 | 4 | 6 | 4 | 18 | 12 | 9 | 6 | 4 | 3 |
| E | NS | UL | 5 | 3 | 2 | 3 | 2 | 3 | 3 | 3 | 3 | 1 | 1 |
| E | S | UL | 6 | 4 | 3 | 4 | 3 | 9 | 6 | 4 | 4 | 2 | 2 |
| F-1 | NS | UL | 11 | 4 | 2 | 3 | 2 | 3 | 3 | 3 | 4 | 2 | 1 |
| F-1 | S | UL | 12 | 5 | 3 | 4 | 3 | 10 | 7 | 5 | 5 | 3 | 2 |
| F-2 | NS | UL | 11 | 5 | 3 | 4 | 3 | 5 | 5 | 5 | 5 | 3 | 2 |
| F-2 | S | UL | 12 | 6 | 4 | 5 | 4 | 12 | 8 | 6 | 6 | 4 | 3 |
| H-1 | NSc,d | 1 | 1 | 1 | 1 | 1 | 1 | NP | NP | NP | 1 | 1 | NP |
| H-1 | S | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | NP |
| H-2 | NSc,d | UL | 3 | 2 | 1 | 2 | 1 | 1 | 1 | 1 | 2 | 1 | 1 |
| H-2 | S | UL | 3 | 2 | 1 | 2 | 1 | 2 | 2 | 2 | 2 | 1 | 1 |
| H-3 | NSc,d | UL | 6 | 4 | 2 | 4 | 2 | 3 | 3 | 3 | 4 | 2 | 1 |
| H-3 | S | UL | 6 | 4 | 2 | 4 | 2 | 4 | 4 | 4 | 4 | 2 | 1 |
| H-4 | NSc,d | UL | 7 | 5 | 3 | 5 | 3 | 5 | 5 | 5 | 5 | 3 | 2 |
| H-4 | S | UL | 8 | 6 | 4 | 6 | 4 | 8 | 7 | 6 | 6 | 4 | 3 |
| H-5 | NSc,d | 4 | 4 | 3 | 3 | 3 | 3 | 2 | 2 | 2 | 3 | 3 | 2 |
| H-5 | S | 4 | 4 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 2 |
| I-1 Condition 1 | NSd,e | UL | 9 | 4 | 3 | 4 | 3 | 4 | 4 | 4 | 4 | 3 | 2 |
| I-1 Condition 1 | S | UL | 10 | 5 | 4 | 5 | 4 | 10 | 7 | 5 | 5 | 4 | 3 |
| I-1 Condition 2 | NSd,e | UL | 9 | 4 | 3 | 4 | 3 | 3 | 3 | 3 | 4 | 3 | 2 |
| I-1 Condition 2 | S | UL | 10 | 5 | 3 | 4 | 3 | 10 | 6 | 4 | 4 | 3 | 2 |
| I-2 | NSd,f | UL | 4 | 2 | 1 | 1 | NP | NP | NP | NP | 1 | 1 | NP |
| I-2 | S | UL | 5 | 3 | 1 | 1 | NP | 7 | 5 | 1 | 1 | 1 | NP |
| I-3 | NSd,e | UL | 4 | 2 | 1 | 2 | 1 | 2 | 2 | 2 | 2 | 2 | 1 |
| I-3 | S | UL | 5 | 3 | 2 | 3 | 2 | 7 | 5 | 3 | 3 | 3 | 2 |
| I-4 | NSd,g | UL | 5 | 3 | 2 | 3 | 2 | 3 | 3 | 3 | 3 | 1 | 1 |
| I-4 | S | UL | 6 | 4 | 3 | 4 | 3 | 9 | 6 | 4 | 4 | 2 | 2 |
| M | NS | UL | 11 | 4 | 2 | 4 | 2 | 4 | 4 | 4 | 4 | 3 | 1 |
| M | S | UL | 12 | 5 | 3 | 5 | 3 | 12 | 8 | 6 | 5 | 4 | 2 |
| R-1h | NSd | UL | 11 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 2 |
| R-1h | S13R | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 |
| R-1h | S | UL | 12 | 5 | 5 | 5 | 5 | 18 | 12 | 8 | 5 | 4 | 3 |
| R-2h | NSd | UL | 11 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 2 |
| R-2h | S13R | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 |
| R-2h | S | UL | 12 | 5 | 5 | 5 | 5 | 18 | 12 | 8 | 5 | 4 | 3 |
| R-3h | NSd | UL | 11 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 3 |
| R-3h | S13D | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 3 |
| R-3h | S13R | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| R-3h | S | UL | 12 | 5 | 5 | 5 | 5 | 18 | 12 | 5 | 5 | 4 | 4 |
| R-4h | NSd | UL | 11 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 2 |
| R-4h | S13D | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 2 |
| R-4h | S13R | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 |
| R-4h | S | UL | 12 | 5 | 5 | 5 | 5 | 18 | 12 | 5 | 5 | 4 | 3 |
| S-1 | NS | UL | 11 | 4 | 2 | 3 | 2 | 4 | 4 | 4 | 4 | 3 | 1 |
| S-1 | S | UL | 12 | 5 | 4 | 4 | 4 | 10 | 7 | 5 | 5 | 4 | 2 |
| S-2 | NS | UL | 11 | 5 | 3 | 4 | 3 | 4 | 4 | 4 | 5 | 4 | 2 |
| S-2 | S | UL | 12 | 6 | 4 | 5 | 4 | 12 | 8 | 5 | 6 | 5 | 3 |
'
  WHERE id = 'ed15da7a-7154-4903-936a-d5d0c674ca30';

-- ===============================================================
-- 11. 506.2  ->  table_id 506.2   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-251-500.pdf
--    page     : page_index_0based=244 (printed page 467)
--    caption  : TABLE 506.2 a, b - ALLOWABLE AREA FACTOR (A = NS, S1, S13R, OR SM, AS APPLICABLE) IN SQUARE T METERS
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
--    note     : Spans printed pages 467 and 468 (page indices 244 and 245); the SBC
--    note     : repeats the caption on the continuation page.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '74ba6a33-3cfc-41f6-8cfe-7dd0a4e80c4d';

UPDATE public.sbc_code_tables SET
    table_id    = '506.2',
    table_title = 'ALLOWABLE AREA FACTOR (A = NS, S1, S13R, OR SM, AS APPLICABLE) IN SQUARE T METERS',
    edition     = '2024',
    section     = '506.2',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-251-500.pdf, page_index_0based=244, printed page 467, caption ''TABLE 506.2 a, b''. Units exactly as printed (the SBC prints this table in metric). Spans printed pages 467 and 468 (page indices 244 and 245); the SBC repeats the caption on the continuation page.',
    content_md  = '## Table 506.2 - ALLOWABLE AREA FACTOR (A = NS, S1, S13R, OR SM, AS APPLICABLE) IN SQUARE T METERS
**SBC 201-CC-2024 | Chapter 5 | printed page 467**

> **[STRUCTURED_FACT - Source: TABLE 506.2, SBC 201-CC-2024, printed page 467]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-251-500.pdf`, page_index_0based=244, printed_page=467.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| OCCUPANCY CLASSIFICATION | SEE FOOTNOTES | TYPE OF CONSTRUCTION - TYPE I - A | TYPE OF CONSTRUCTION - TYPE I - B | TYPE OF CONSTRUCTION - TYPE II - A | TYPE OF CONSTRUCTION - TYPE II - B | TYPE OF CONSTRUCTION - TYPE III - A | TYPE OF CONSTRUCTION - TYPE III - B | TYPE OF CONSTRUCTION - TYPE IV - A | TYPE OF CONSTRUCTION - TYPE IV - B | TYPE OF CONSTRUCTION - TYPE IV - C | TYPE OF CONSTRUCTION - TYPE IV - HT | TYPE OF CONSTRUCTION - TYPE V - A | TYPE OF CONSTRUCTION - TYPE V - B |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A-1 | NS | UL | UL | 1,440 | 790 | 1,300 | 790 | 4,180 | 2,786 | 1,740 | 1,390 | 1,070 | 510 |
| A-1 | S1 | UL | UL | 5,760 | 3,160 | 5,200 | 3,160 | 16,720 | 11,150 | 6,970 | 5,580 | 4,280 | 2,040 |
| A-1 | SM | UL | UL | 4,320 | 2,370 | 3,900 | 2,370 | 12,540 | 8,360 | 5,225 | 4,180 | 3,210 | 1,530 |
| A-2 | NS | UL | UL | 1,440 | 880 | 1,300 | 880 | 4,180 | 2,786 | 1,740 | 1,390 | 1,070 | 560 |
| A-2 | S1 | UL | UL | 5,760 | 3,530 | 5,200 | 3,530 | 16,720 | 11,150 | 6,970 | 5,580 | 4,280 | 2,230 |
| A-2 | SM | UL | UL | 4,320 | 2,650 | 3,900 | 2,650 | 12,540 | 8,360 | 5,225 | 4,180 | 3,210 | 1,670 |
| A-3 | NS | UL | UL | 1,440 | 880 | 1,300 | 880 | 4,180 | 2,786 | 1,740 | 1,390 | 1,070 | 560 |
| A-3 | S1 | UL | UL | 5,760 | 3,530 | 5,200 | 3,530 | 16,720 | 11,150 | 6,970 | 5,580 | 4,280 | 2,230 |
| A-3 | SM | UL | UL | 4,320 | 2,650 | 3,900 | 2,650 | 12,540 | 8,360 | 5,225 | 4,180 | 3,210 | 1,670 |
| A-4 | NS | UL | UL | 1,440 | 880 | 1,300 | 880 | 4,180 | 2,786 | 1,740 | 1,390 | 1,070 | 560 |
| A-4 | S1 | UL | UL | 5,760 | 3,530 | 5,200 | 3,530 | 16,720 | 11,150 | 6,970 | 5,580 | 4,280 | 2,230 |
| A-4 | SM | UL | UL | 4,320 | 2,650 | 3,900 | 2,650 | 12,540 | 8,360 | 5,225 | 4,180 | 3,210 | 1,670 |
| A-5 | NS | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL |
| A-5 | S1 | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL |
| A-5 | SM | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL |
| B | NS | UL | UL | 3,490 | 2,140 | 2,650 | 1,770 | 10,032 | 6690 | 4,180 | 3,350 | 1,670 | 840 |
| B | S1 | UL | UL | 13,940 | 8,550 | 10,590 | 7,060 | 40,130 | 26,750 | 16,720 | 13,380 | 6,690 | 3,350 |
| B | SM | UL | UL | 10,460 | 6,410 | 7,950 | 5,300 | 30,100 | 20,065 | 12,540 | 10,040 | 5,020 | 2,510 |
| E | NS | UL | UL | 2,460 | 1,350 | 2,180 | 1,350 | 7,110 | 4,750 | 2,960 | 2,370 | 1,720 | 880 |
| E | S1 | UL | UL | 9,850 | 5,390 | 8,740 | 5,390 | 28,425 | 18,960 | 11,850 | 9,480 | 6,880 | 3,530 |
| E | SM | UL | UL | 7,390 | 4,040 | 6,550 | 4,040 | 21,350 | 14,220 | 8,890 | 7,110 | 5,160 | 2,650 |
| F-1 | NS | UL | UL | 2,320 | 1,440 | 1,770 | 1,120 | 9,340 | 6,225 | 3,900 | 3,110 | 1,300 | 790 |
| F-1 | S1 | UL | UL | 9,290 | 5,760 | 7,060 | 4,460 | 37,350 | 24,900 | 15,550 | 12,450 | 5,200 | 3,160 |
| F-1 | SM | UL | UL | 6,970 | 4,320 | 5,300 | 3,350 | 28,000 | 18,700 | 11,675 | 9,340 | 3,900 | 2,370 |
| F-2 | NS | UL | UL | 3,490 | 2,140 | 2,650 | 1,670 | 14,080 | 9,390 | 5,875 | 4,690 | 1,950 | 1,210 |
| F-2 | S1 | UL | UL | 13,940 | 8,550 | 10,590 | 6,690 | 56,320 | 37,550 | 23,475 | 18,770 | 7,810 | 4,830 |
| F-2 | SM | UL | UL | 10,460 | 6,410 | 7,950 | 5,020 | 42,250 | 28,160 | 17,600 | 14,080 | 5,860 | 3,620 |
| H-1 | NSc | 1,950 | 1,530 | 1,020 | 650 | 880 | 650 | 980 | 980 | 980 | 980 | 700 | NP |
| H-1 | S1 | 1,950 | 1,530 | 1,020 | 650 | 880 | 650 | 980 | 980 | 980 | 980 | 700 | NP |
| H-2 | NSc | 1,950 | 1,530 | 1,020 | 650 | 880 | 650 | 980 | 980 | 980 | 980 | 700 | 280 |
| H-2 | S1 | 1,950 | 1,530 | 1,020 | 650 | 880 | 650 | 980 | 980 | 980 | 980 | 700 | 280 |
| H-2 | SM | 1,950 | 1,530 | 1,020 | 650 | 880 | 650 | 980 | 980 | 980 | 980 | 700 | 280 |
| H-3 | NSc | UL | 5,580 | 2,460 | 1,300 | 1,630 | 1,210 | 2370 | 2370 | 2370 | 2,370 | 930 | 460 |
| H-3 | S1 | UL | 5,580 | 2,460 | 1,300 | 1,630 | 1,210 | 2370 | 2370 | 2370 | 2,370 | 930 | 460 |
| H-3 | SM | UL | 5,580 | 2,460 | 1,300 | 1,630 | 1,210 | 2370 | 2370 | 2370 | 2,370 | 930 | 460 |
| H-4 | NSc, d | UL | UL | 3,490 | 1,630 | 2,650 | 1,630 | 6,690 | 5,020 | 3,775 | 3,350 | 1,670 | 600 |
| H-4 | S1 | UL | UL | 13,940 | 6,510 | 10,590 | 6,510 | 26,765 | 20,075 | 15,050 | 13,380 | 6,690 | 2,420 |
| H-4 | SM | UL | UL | 10,460 | 4,880 | 7,950 | 4,880 | 20,075 | 15,050 | 11,290 | 10,040 | 5,020 | 1,810 |
| H-5 | NSc, d | UL | UL | 3,490 | 2,140 | 2,650 | 1,770 | 6,710 | 5,020 | 3,770 | 3,350 | 1,670 | 840 |
| H-5 | S1 | UL | UL | 13,940 | 8,550 | 10,590 | 7,060 | 26,765 | 20,075 | 15,050 | 13,380 | 6,690 | 3,350 |
| H-5 | SM | UL | UL | 10,460 | 6,410 | 7,950 | 5,300 | 20,075 | 15,050 | 11,290 | 10,040 | 5,020 | 2,510 |
| I-1 | NSd, e | UL | 5,110 | 1,770 | 930 | 1,530 | 930 | 5,020 | 3,350 | 1,675 | 1,670 | 980 | 420 |
| I-1 | S1 | UL | 20,450 | 7,060 | 3,720 | 6,130 | 3,720 | 20,075 | 13,380 | 6,690 | 6,690 | 3,900 | 1,670 |
| I-1 | SM | UL | 15,330 | 5,300 | 2,790 | 4,600 | 2,790 | 15,050 | 10,050 | 5,020 | 5,020 | 2,930 | 1,250 |
| I-2 | NSd, f | UL | UL | 1,390 | 1,020 | 1,120 | NP | 3,350 | 2,230 | 1,150 | 1,120 | 880 | NP |
| I-2 | S1 | UL | UL | 5,580 | 4,090 | 4,460 | NP | 13,380 | 8,920 | 4,460 | 4,460 | 3,530 | NP |
| I-2 | SM | UL | UL | 4,180 | 3,070 | 3,350 | NP | 10,050 | 6,690 | 3,350 | 3,350 | 2,650 | NP |
| I-3 | NSd, e | UL | UL | 1,390 | 930 | 980 | 700 | 3,350 | 2,230 | 1,150 | 1,120 | 700 | 460 |
| I-3 | S1 | UL | UL | 5,580 | 3,720 | 3,900 | 2,790 | 13,380 | 8,920 | 4,460 | 4,460 | 2,790 | 1,860 |
| I-3 | SM | UL | UL | 4,180 | 2,790 | 2,930 | 2,090 | 10,050 | 6,690 | 3,350 | 3,350 | 2,090 | 1,390 |
| I-4 | NSd, g | UL | 5620 | 2,460 | 1,210 | 2,180 | 1,210 | 7,110 | 4,750 | 2,185 | 2,370 | 1,720 | 840 |
| I-4 | S1 | UL | 11,250 | 9,850 | 4,830 | 8,740 | 4,830 | 28,450 | 18,960 | 9,500 | 9,480 | 6,880 | 3,350 |
| I-4 | SM | UL | 16,870 | 7,390 | 3,620 | 6,550 | 3,620 | 21,325 | 14,220 | 7,110 | 7,110 | 5,160 | 2,510 |
| M | NS | UL | UL | 2,000 | 1,160 | 1,720 | 1,160 | 5,715 | 3,810 | 2,575 | 1,910 | 1,300 | 840 |
| M | S1 | UL | UL | 7,990 | 4,650 | 6,880 | 4,650 | 22,860 | 15,250 | 9,525 | 7,620 | 5,200 | 3,350 |
| M | SM | UL | UL | 5,990 | 3,490 | 5,160 | 3,490 | 17,150 | 11,450 | 7,150 | 5,720 | 3,900 | 2,510 |
| R-1h | NSd | UL | UL | 2,230 | 1,490 | 2,230 | 1,490 | 5,715 | 3,810 | 2,575 | 1,910 | 1,120 | 650 |
| R-1h | S13R | UL | UL | 2,230 | 1,490 | 2,230 | 1,490 | 5,715 | 3,810 | 2,575 | 1,910 | 1,120 | 650 |
| R-1h | S1 | UL | UL | 8,920 | 5,950 | 8,920 | 5,950 | 22,860 | 15,250 | 9,525 | 7,620 | 4,460 | 2,600 |
| R-1h | SM | UL | UL | 6,690 | 4,460 | 6,690 | 4,460 | 17,150 | 11,450 | 7,150 | 5,720 | 3,350 | 1,950 |
| R-2h | NSd | UL | UL | 2,230 | 1,490 | 2,230 | 1,490 | 5,715 | 3,810 | 2,575 | 1,910 | 1,120 | 650 |
| R-2h | S13R | UL | UL | 2,230 | 1,490 | 2,230 | 1,490 | 5,715 | 3,810 | 2,575 | 1,910 | 1,120 | 650 |
| R-2h | S1 | UL | UL | 8,920 | 5,950 | 8,920 | 5,950 | 22,860 | 15,250 | 9,525 | 7,620 | 4,460 | 2,600 |
| R-2h | SM | UL | UL | 6,690 | 4,460 | 6,690 | 4,460 | 17,150 | 11,450 | 7,150 | 5,720 | 3,350 | 1,950 |
| R-3h | NSd | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL |
| R-3h | S13D | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL |
| R-3h | S13R | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL |
| R-3h | S1 | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL |
| R-3h | SM | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL | UL |
| R-4h | NSd | UL | UL | 2,230 | 1,490 | 2,230 | 1,490 | 5,715 | 3,810 | 2,575 | 1,910 | 1,120 | 650 |
| R-4h | S13D | UL | UL | 2,230 | 1,490 | 2,230 | 1,490 | 5,715 | 3,810 | 2,575 | 1,910 | 1,120 | 650 |
| R-4h | S13R | UL | UL | 2,230 | 1,490 | 2,230 | 1,490 | 5,715 | 3,810 | 2,575 | 1,910 | 1,120 | 650 |
| R-4h | S1 | UL | UL | 8,920 | 5,950 | 8,920 | 5,950 | 22,860 | 15,250 | 9,525 | 7,620 | 4,460 | 2,600 |
| R-4h | SM | UL | UL | 6,690 | 4,460 | 6,690 | 4,460 | 17,150 | 11,450 | 7,150 | 5,720 | 3,350 | 1,950 |
| S-1 | NS | UL | 4,460 | 2,420 | 1,630 | 2,420 | 1,630 | 7,110 | 4,750 | 2,975 | 2,370 | 1,300 | 840 |
| S-1 | S1 | UL | 17,840 | 9,670 | 6,510 | 9,670 | 6,510 | 28,450 | 18,960 | 11,850 | 9,480 | 5,200 | 3,350 |
| S-1 | SM | UL | 13,380 | 7,250 | 4,880 | 7,250 | 4,880 | 21,325 | 14,220 | 8,890 | 7,110 | 3,900 | 2,510 |
| S-2 | NS | UL | 7,340 | 3,620 | 2,420 | 3,620 | 2,420 | 10,750 | 7,150 | 4,475 | 3,580 | 1,950 | 1,250 |
| S-2 | S1 | UL | 29,370 | 14,500 | 9,670 | 14,500 | 9,670 | 42,950 | 28,625 | 17,890 | 14,310 | 7,810 | 5,020 |
| S-2 | SM | UL | 22,030 | 10,870 | 7,250 | 10,870 | 7,250 | 32,200 | 21,470 | 13,420 | 10,730 | 5,860 | 3,760 |
| U | NSi | UL | 3,300 | 1,770 | 790 | 1,300 | 790 | 5,020 | 3,350 | 2,100 | 1,670 | 840 | 510 |
| U | S1 | UL | 13,200 | 7,060 | 3,160 | 5,200 | 3,160 | 20,075 | 13,380 | 8,370 | 6,690 | 3,350 | 2,040 |
| U | SM | UL | 9,900 | 5,300 | 2,370 | 3,900 | 2,370 | 15,050 | 10,050 | 6,275 | 5,020 | 2,510 | 1,530 |

**Notes, legend and footnotes as printed:**
- Note: UL = Unlimited; NP = Not permitted; NS = Buildings not equipped throughout with an automatic sprinkler system; S1 = Buildings a maximum of one story above grade plane equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.1 ; SM = Buildings two or more stories above grade plane equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.1 ; S13R = Buildings equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.2 . S13D = Buildings equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.3 .
- a. See Chapter 4 and 5 for specific exceptions to the allowable height in this chapter.
- b. See Section 903.2 for the minimum thresholds for protection by an automatic sprinkler system for specific occupancies.
- c. New Group H occupancies are required to be protected by an automatic sprinkler system in accordance with Section 903.2.5 .
- d. The NS value is only for use in evaluation of existing building area in accordance with SBC 901.
- e. New Group I-1 and I-3 occupancies are required to be protected by an automatic sprinkler system in accordance with Section 903.2.6 . For new Group I-1 occupancies, Condition 1, see Exception 1 of Section 903.2.6 .
- f. New and existing Group I-2 occupancies are required to be protected by an automatic sprinkler system in accordance with Section 903.2.6 and Section 1103.5 of SBC 801.
- g. New Group I-4 occupancies see Exceptions 2 and 3 of Section 903.2.6 .
- h. New Group R occupancies are required to be protected by an automatic sprinkler system in accordance with Section 903.2.8 .
- i. The maximum allowable area for a single story non-sprinklered Group U greenhouse is permitted to be 435 m2 or shall be permitted to comply with Table C102.1of Appendix C in this code.
'
  WHERE id = '74ba6a33-3cfc-41f6-8cfe-7dd0a4e80c4d';

-- ===============================================================
-- 12. 508.4  ->  table_id 508.4   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-251-500.pdf
--    page     : page_index_0based=246 (printed page 469)
--    caption  : TABLE 508.4 - REQUIRED SEPARATION OF OCCUPANCIES (HOURS)f
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
--    note     : SUBJECT MISMATCH: printed TABLE 508.4 is 'REQUIRED SEPARATION OF
--    note     : OCCUPANCIES (HOURS)', while the production row 508.4 is titled
--    note     : 'Nonseparated Occupancies'. Owner decision required.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '1ff010d8-a168-4f92-b698-7f2e3e8c8b26';

UPDATE public.sbc_code_tables SET
    table_id    = '508.4',
    table_title = 'REQUIRED SEPARATION OF OCCUPANCIES (HOURS)f',
    edition     = '2024',
    section     = '508.4',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-251-500.pdf, page_index_0based=246, printed page 469, caption ''TABLE 508.4''. Units exactly as printed (the SBC prints this table in metric). SUBJECT MISMATCH: printed TABLE 508.4 is ''REQUIRED SEPARATION OF OCCUPANCIES (HOURS)'', while the production row 508.4 is titled ''Nonseparated Occupancies''. Owner decision required.',
    content_md  = '## Table 508.4 - REQUIRED SEPARATION OF OCCUPANCIES (HOURS)f
**SBC 201-CC-2024 | Chapter 5 | printed page 469**

> **[STRUCTURED_FACT - Source: TABLE 508.4, SBC 201-CC-2024, printed page 469]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-251-500.pdf`, page_index_0based=246, printed_page=469.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| OCCUPANCY | A, E - S | A, E - NS | I-1a, I-3, I-4 - S | I-1a, I-3, I-4 - NS | I-2 - S | I-2 - NS | R a - S | R a - NS | F-2, S-2b, U - S | F-2, S-2b, U - NS | Be, F-1, M, S-1 - S | Be, F-1, M, S-1 - NS | H-1 - S | H-1 - NS | H-2 - S | H-2 - NS | H-3, H-4 - S | H-3, H-4 - NS | H-5 - S | H-5 - NS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A, E | N | N | 1 | 2 | 2 | NP | 1 | 2 | N | 1 | 1 | 2 | NP | NP | 3 | 4 | 2 | 3 | 2 | NP |
| I-1a, I-3, I-4 | 1 | 2 | N | N | 2 | NP | 1 | NP | 1 | 2 | 1 | 2 | NP | NP | 3 | NP | 2 | NP | 2 | NP |
| I-2 | 2 | NP | 2 | NP | N | N | 2 | NP | 2 | NP | 2 | NP | NP | NP | 3 | NP | 2 | NP | 2 | NP |
| Ra | 1 | 2 | 1 | NP | 2 | NP | N | N | 1c | c<br>2 | 1 | 2 | NP | NP | 3 | NP | 2 | NP | 2 | NP |
| F-2, S-2b, U | N | 1 | 1 | 2 | 2 | NP | 1c | 2c | N | N | 1 | 2 | NP | NP | 3 | 4 | 2 | 3 | 2 | NP |
| Be, F-1, M, S-1 | 1 | 2 | 1 | 2 | 2 | NP | 1 | 2 | 1 | 2 | N | N | NP | NP | 2 | 3 | 1 | 2 | 1 | NP |
| H-1 | NP | NP | NP | NP | NP | NP | NP | NP | NP | NP | NP | NP | N | NP | NP | NP | NP | NP | NP | NP |
| H-2 | 3 | 4 | 3 | NP | 3 | NP | 3 | NP | 3 | 4 | 2 | 3 | NP | NP | N | NP | 1 | NP | 1 | NP |
| H-3, H-4 | 2 | 3 | 2 | NP | 2 | NP | 2 | NP | 2 | 3 | 1 | 2 | NP | NP | 1 | NP | d<br>1 | NP | 1 | NP |
| H-5 | 2 | NP | 2 | NP | 2 | NP | 2 | NP | 2 | NP | 1 | NP | NP | NP | 1 | NP | 1 | NP | N | NP |

**Notes, legend and footnotes as printed:**
- S = Buildings equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.1 . NS = Buildings not equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.1 . N = No separation requirement. NP = Not Permitted.
- a. See Section 420.
- b. The required separation from areas used only for private or pleasure vehicles shall be reduced by 1 hour but not to less than 1 hour.
- c. See Sections 406.3.2 and 406.6.4 .
- d. Separation is not required between occupancies of the same classification.
- e. See Section 422.2 for ambulatory care facilities.
- f. Occupancy separations that serve to define fire area limits established in Chapter 9 for requiring fire protection systems shall also comply with Section 707.3.10 and Table 707.3.10 in accordance with Section 901.7 .
'
  WHERE id = '1ff010d8-a168-4f92-b698-7f2e3e8c8b26';

-- ===============================================================
-- 13. QUARANTINED_509  ->  table_id 509.1   [RENUMBERED]
--    source   : SBC 201 - The Saudi General Building Code-251-500.pdf
--    page     : page_index_0based=247 (printed page 470)
--    caption  : TABLE 509.1 - INCIDENTAL USES
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
--    ** RENUMBERED: table_id changes from 'QUARANTINED_509' to '509.1'.
--       This changes what extractTableIds() in fire-safety-chat will match.
--    note     : RENUMBERED 509 -> 509.1. SBC prints TABLE 509.1 INCIDENTAL USES.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '24f1239a-3b0c-42bf-a015-94411e42315c';

UPDATE public.sbc_code_tables SET
    table_id    = '509.1',
    table_title = 'INCIDENTAL USES',
    edition     = '2024',
    section     = '509.1',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-251-500.pdf, page_index_0based=247, printed page 470, caption ''TABLE 509.1''. Units exactly as printed (the SBC prints this table in metric). RENUMBERED from 509 to 509.1: the SBC does not print the former number. RENUMBERED 509 -> 509.1. SBC prints TABLE 509.1 INCIDENTAL USES.',
    content_md  = '## Table 509.1 - INCIDENTAL USES
**SBC 201-CC-2024 | Chapter 5 | printed page 470**

> **[STRUCTURED_FACT - Source: TABLE 509.1, SBC 201-CC-2024, printed page 470]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-251-500.pdf`, page_index_0based=247, printed_page=470.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.
> NOTE: this table is printed in the SBC as TABLE 509.1. The previous record carried the number 509, which the SBC does not print.

| ROOM OR AREA | SEPARATIONa |
|---|---|
| Furnace room where any piece of equipment is over 117<br>kW per hour input | 1 hour or provide automatic sprinkler system |
| Rooms with any boiler over 103.5 kPa and 7.5 kW | 1 hour or provide automatic sprinkler system |
| Refrigerant machinery rooms | 1 hour or provide automatic sprinkler system |
| Hydrogen fuel gas rooms, not classified as Group H | 1 hour in Group B, F, H, M, S and U occupancies. 2 hours<br>in Group A, E, I and R occupancies. |
| Incinerator rooms | 2 hours and provide automatic sprinkler system |
| Paint shops, not classified as Group H, located in<br>occupancies other than Group F | 2 hours; or 1 hour and provide automatic sprinkler system |
| In Group E occupancies, Laboratories and vocational<br>shops, not classified as Group H, | 1 hour or provide automatic sprinkler system |
| In Group I-2 occupancies, laboratories not classified as<br>Group H | 1 hour and provide automatic sprinkler system |
| In ambulatory care facilities, laboratories not classified as<br>Group H | 1 hour or provide automatic sprinkler system |
| Laundry rooms over 9 m2 | 1 hour or provide automatic sprinkler system |
| In Group I-2, laundry rooms over 9 m2 | 1 hour |
| In ambulatory care facilities or Group, I-2 occupancies,<br>Storage rooms over 9 m2 | 1 hour |
| Group I-3 cells and Group I-2 patient rooms equipped with<br>padded surfaces | 1 hour |
| In Group I-2, physical plant maintenance shops | 1 hour |
| In ambulatory care facilities or Group, I-2 occupancies,<br>waste and linen collection rooms with containers that have<br>an aggregate volume of 0.28 cubic meter or greater | 1 hour |
| In other than ambulatory care facilities and Group I-2<br>occupancies, Waste and linen collection rooms over 9 m2 | 1 hour or provide automatic sprinkler system |
| Electrical installations and transformers | See Sections 110.26 through 110.34 and Sections 450.8<br>through 450.48 of NFPA 70 for protection and separation<br>requirements. |

**Notes, legend and footnotes as printed:**
- a. Where an automatic fire-extinguishing system is provided, it need only be provided in the incidental use room or area. FIGURE 503.1.2(1) BUILDINGS ON SAME LOT
'
  WHERE id = '24f1239a-3b0c-42bf-a015-94411e42315c';

-- ===============================================================
-- 14. 601  ->  table_id 601   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-501-1000.pdf
--    page     : page_index_0based=32 (printed page 505)
--    caption  : TABLE 601 - FIRE-RESISTANCE RATING REQUIREMENTS FOR BUILDING ELEMENTS (HOURS)
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
--    note     : Printed ONCE only, in SBC 201 printed page 505. SBC 801 does not print a
--    note     : TABLE 601; it only cross-references 'Table 601 of SBC 201' (SBC 801
--    note     : printed page 981). So unlike TABLE 1006.2.1 and the TABLE 1020.2
--    note     : collision, there is no second printing that could resolve the duplicated
--    note     : row label below.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = 'e4dc98f4-8030-4ac5-bd8a-a9e708b04a39';

UPDATE public.sbc_code_tables SET
    table_id    = '601',
    table_title = 'FIRE-RESISTANCE RATING REQUIREMENTS FOR BUILDING ELEMENTS (HOURS)',
    edition     = '2024',
    section     = '601',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-501-1000.pdf, page_index_0based=32, printed page 505, caption ''TABLE 601''. Units exactly as printed (the SBC prints this table in metric). Printed ONCE only, in SBC 201 printed page 505. SBC 801 does not print a TABLE 601; it only cross-references ''Table 601 of SBC 201'' (SBC 801 printed page 981). So unlike TABLE 1006.2.1 and the TABLE 1020.2 collision, there is no second printing that could resolve the duplicated row label below.',
    content_md  = '## Table 601 - FIRE-RESISTANCE RATING REQUIREMENTS FOR BUILDING ELEMENTS (HOURS)
**SBC 201-CC-2024 | Chapter 6 | printed page 505**

> **[STRUCTURED_FACT - Source: TABLE 601, SBC 201-CC-2024, printed page 505]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-501-1000.pdf`, page_index_0based=32, printed_page=505.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| BUILDING ELEMENT | TYPE I - A | TYPE I - B | TYPE II - A | TYPE II - B | TYPEIII - A | TYPEIII - B | TYPE IV - A | TYPE IV - B | TYPE IV - C | TYPE IV - HT | TYPE V - A | TYPE V - B |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Primary Structural framef (see<br>Section 202) | 3a, b | 2a, b,c | 1b,c | 0c | 1b,c | 0 | 3a, | 2a | 2a | HT | 1b,c | 0 |
| Bearing walls<br>Exterior e,f<br>Interior | 3<br>3a | 2<br>2a | 1<br>1 | 0<br>0 | 2<br>1 | 2<br>0 | 3<br>3 | 2<br>2 | 2<br>2 | 2<br>1/HTg | 1<br>1 | 0<br>0 |
| Non-bearing walls and<br>partitions Exterior | See Table 705.5 | See Table 705.5 | See Table 705.5 | See Table 705.5 | See Table 705.5 | See Table 705.5 | See Table 705.5 | See Table 705.5 | See Table 705.5 | See Table 705.5 | See Table 705.5 | See Table 705.5 |
| Non-bearing walls and<br>partitions Interiord | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | See Section<br>2304.11.2 | 0 | 0 |
| Floor construction and<br>associated secondary structural<br>members (see Section 202) | 2 | 2 | 1 | 0 | 1 | 0 | 2 | 2 | 2 | HT | 1 | 0 |
| Floor construction and<br>associated secondary structural<br>members (see Section 202) | b<br>  | 1b, c | 1b, c | 0c | 1b, c | 0 | 1 | 1 | 1 | HT | 1b, c | 0 |

**Notes, legend and footnotes as printed:**
- Permitted1;
- UL = Unlimited; NP = Not N S = Buildings not equipped throughou1t with an automatic sprinkler system; S1 = Buildings a - 2 maximum of one story above grade plane equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.1 ; SM = Buildings two or more stories above grade plane equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.1 ; S13R = Buildings equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.2 ; S13D = Buildings equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.3 .
- a. Roof supports: Fire-resistance ratings of primary structural frame and bearing walls are permitted to be reduced by 1 hour where supporting a roof only.
- b. Except in Group F-1, H, M and S-1 occupancies, fire protection of structural members in roof construction shall not be required, including protection of primary structural frame members, roof framing and decking where every part of the roof construction is 6 meters or more above any floor immediately below. Fire-retardant-treated wood members shall be allowed to be used for such unprotected members.
- c. In all occupancies, heavy timber complying with Section 2304.11 shall be allowed for roof construction, including primary structural frame members, where a 1hour or less fire-resistance rating is required.
- d. Not less than the fire-resistance rating required by other sections of this code.
- e. Not less than the fire-resistance rating based on fire separation distance (see Table 705.5).
- f. Not less than the fire-resistance rating as referenced in Section 704.10 .
- g. Heavy timber bearing walls supporting more than two floors or more than a floor and a roof shall have a fire-resistance rating of not less than 1 hour.

> **[AMBIGUITY IN THE PRINTED CODE - READ BEFORE USING THIS TABLE]**
> The row label ''Floor construction and associated secondary structural members (see Section 202)'' is printed TWICE in this table, at y-top 262.7 and again at y-top 297.5 of the page, with DIFFERENT required fire-resistance ratings. The first prints ''2 | 2 | 1 | 0 | 1 | 0 | 2 | 2 | 2 | HT | 1 | 0''; the second prints ''b | 1b, c | 1b, c | 0c | 1b, c | 0 | 1 | 1 | 1 | HT | 1b, c | 0''. There is no categorical column separating the two rows, so there is no reading of the printed page under which both are simultaneously true for the same construction type. Note also that the word ''Roof'' does not appear as a row label anywhere in this table - it occurs only in the footnotes - so the table as printed states no roof-construction requirement at all.
> Both rows are transcribed above exactly as printed; neither has been dropped, merged or corrected.
> **For design purposes the conservative value (the HIGHER rating in each column - a fire-resistance rating is a requirement, so the larger number is the stricter one (for example 2 hours rather than 1 hour for Types I-A and I-B)) governs until clarified by the authority having jurisdiction.**
> Origin of the contradiction: UNKNOWN. It is present in the printed page cited above.
> What the second row was intended to say is UNKNOWN and is NOT inferred here. TABLE 601 is printed only once in the whole corpus (SBC 201 printed page 505), so no second printing is available to settle it. This needs the authority having jurisdiction.
'
  WHERE id = 'e4dc98f4-8030-4ac5-bd8a-a9e708b04a39';

-- ===============================================================
-- 15. 602  ->  table_id 705.5   [RENUMBERED]
--    source   : SBC 201 - The Saudi General Building Code-501-1000.pdf
--    page     : page_index_0based=184 (printed page 657)
--    caption  : TABLE 705.5 - FIRE-RESISTANCE RATING REQUIREMENTS FOR EXTERIOR WALLS BASED ON FIRE SEPERATION DISTANCEa,d,g
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
--    ** RENUMBERED: table_id changes from '602' to '705.5'.
--       This changes what extractTableIds() in fire-safety-chat will match.
--    note     : RENUMBERED 602 -> 705.5. SBC 201 prints no TABLE 602. The table titled
--    note     : 'FIRE-RESISTANCE RATING REQUIREMENTS FOR EXTERIOR WALLS BASED ON FIRE
--    note     : SEPARATION DISTANCE' - which is what the production row is titled - is
--    note     : printed as TABLE 705.5.
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '745781a8-b58b-4dbb-94f8-91653863cb36';

UPDATE public.sbc_code_tables SET
    table_id    = '705.5',
    table_title = 'FIRE-RESISTANCE RATING REQUIREMENTS FOR EXTERIOR WALLS BASED ON FIRE SEPERATION DISTANCEa,d,g',
    edition     = '2024',
    section     = '705.5',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-501-1000.pdf, page_index_0based=184, printed page 657, caption ''TABLE 705.5''. Units exactly as printed (the SBC prints this table in metric). RENUMBERED from 602 to 705.5: the SBC does not print the former number. RENUMBERED 602 -> 705.5. SBC 201 prints no TABLE 602. The table titled ''FIRE-RESISTANCE RATING REQUIREMENTS FOR EXTERIOR WALLS BASED ON FIRE SEPARATION DISTANCE'' - which is what the production row is titled - is printed as TABLE 705.5.',
    content_md  = '## Table 705.5 - FIRE-RESISTANCE RATING REQUIREMENTS FOR EXTERIOR WALLS BASED ON FIRE SEPERATION DISTANCEa,d,g
**SBC 201-CC-2024 | Chapter 6 | printed page 657**

> **[STRUCTURED_FACT - Source: TABLE 705.5, SBC 201-CC-2024, printed page 657]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-501-1000.pdf`, page_index_0based=184, printed_page=657.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.
> NOTE: this table is printed in the SBC as TABLE 705.5. The previous record carried the number 602, which the SBC does not print.

| FIRE SEPARATION DISTANCE X (meters) | TYPE OF CONSTRUCTION | GROUP He | GROUP F-1, M, S-1f | GROUP A, B, E, F-2, I, Ri, S-2, Uh |
|---|---|---|---|---|
| X < 1.5b | All | 3 | 2 | 1 |
| 1.5 ≤ X < 3 | IA, IVA | 3 | 2 | 1 |
| 1.5 ≤ X < 3 | Others | 2 | 1 | 1 |
| 3 ≤ X < 9 | IA, IB, IVA, IVB | 2 | 1 | 1c |
| 3 ≤ X < 9 | IIB, VB | 1 | 0 | 0 |
| 3 ≤ X < 9 | Others | 1 | 1 | 1c |
| X ≥ 9 | All | 0 | 0 | 0 |

**Notes, legend and footnotes as printed:**
- a. Load-bearing exterior walls shall also comply with the fire-resistance rating requirements of Table 601.
- b. See Section 706.1.1 for party walls.
- c. Open parking garages complying with Section 406 shall not be required to have a fire-resistance rating.
- d. The fire-resistance rating of an exterior wall is determined based upon the fire separation distance of the exterior wall and the story in which the wall is located.
- e. For special requirements for Group H occupancies, see Section 415.6 .
- f. For special requirements for Group S aircraft hangars, see Section 412.3.1 .
- g. Where Table 705.8 permits non-bearing exterior walls with unlimited area of unprotected openings, the required fire-resistance rating for the exterior walls is 0 hours.
- h. For a building containing only a Group U occupancy private garage or carport, the exterior wall shall not be required to have a fire-resistance rating where the fire separation distance is 1.5 meters or greater.
- i. For a Group R-3 building of Type II-B or Type V-B construction, the exterior wall shall not be required to have a fire-resistance rating where the fire separation distance is 1.5 m or greater.
'
  WHERE id = '745781a8-b58b-4dbb-94f8-91653863cb36';

-- ===============================================================
-- 16. 705.8  ->  table_id 705.8   [MATCH]
--    source   : SBC 201 - The Saudi General Building Code-501-1000.pdf
--    page     : page_index_0based=185 (printed page 658)
--    caption  : TABLE 705.8 - MAXIMUM AREA OF EXTERIOR WALL OPENINGS BASED ON FIRE SEPARATION DISTANCE AND DEGREE OF OPENING PROTECTION
--    checks   : (a) PASS  (b) PASS  (c) N/A  (d) PASS
-- ---------------------------------------------------------------
-- Owner pre-check - run this SELECT to see the row as it stands now:
-- SELECT id, table_id, table_title, edition, chapter, section,
--        length(content_md) AS md_len, left(content_md, 400) AS head
--   FROM public.sbc_code_tables WHERE id = '578fc6bf-d8da-4843-a6af-3550135c77d3';

UPDATE public.sbc_code_tables SET
    table_id    = '705.8',
    table_title = 'MAXIMUM AREA OF EXTERIOR WALL OPENINGS BASED ON FIRE SEPARATION DISTANCE AND DEGREE OF OPENING PROTECTION',
    edition     = '2024',
    section     = '705.8',
    notes       = 'Transcribed verbatim from the printed SBC table. Provenance: SBC 201 - The Saudi General Building Code-501-1000.pdf, page_index_0based=185, printed page 658, caption ''TABLE 705.8''. Units exactly as printed (the SBC prints this table in metric).',
    content_md  = '## Table 705.8 - MAXIMUM AREA OF EXTERIOR WALL OPENINGS BASED ON FIRE SEPARATION DISTANCE AND DEGREE OF OPENING PROTECTION
**SBC 201-CC-2024 | Chapter 7 | printed page 658**

> **[STRUCTURED_FACT - Source: TABLE 705.8, SBC 201-CC-2024, printed page 658]**
> Transcribed verbatim from the printed table with pdfplumber.
> Provenance: `SBC 201 - The Saudi General Building Code-501-1000.pdf`, page_index_0based=185, printed_page=658.
> Units are exactly as printed in the Saudi Building Code. Every NOT PERMITTED / NP cell is reproduced verbatim.

| FIRE SEPARATION DISTANCE (meter) | DEGREE OF OPENING PROTECTION | a ALLOWABLE AREA |
|---|---|---|
| 0 to less than 0.9b,c,k | Unprotected, Nonsprinklered (UP, NS) | Not Permittedk |
| 0 to less than 0.9b,c,k | Unprotected, Sprinklered (UP, S)i | Not Permittedk |
| 0 to less than 0.9b,c,k | Protected (P) | Not Permittedk |
| 0.9 to less than 1.5d,e | Unprotected, Nonsprinklered (UP, NS) | Not Permitted |
| 0.9 to less than 1.5d,e | Unprotected, Sprinklered (UP, S)i | 15% |
| 0.9 to less than 1.5d,e | Protected (P) | 15% |
| 1.5 to less than 3e,f,j | Unprotected, Nonsprinklered (UP, NS) | 10%h |
| 1.5 to less than 3e,f,j | Unprotected, Sprinklered (UP, S)i | 25% |
| 1.5 to less than 3e,f,j | Protected (P) | 25% |
| 3 to less than 4.5e,f,g | Unprotected, Nonsprinklered (UP, NS) | 15%h |
| 3 to less than 4.5e,f,g | Unprotected, Sprinklered (UP, S)i | 45% |
| 3 to less than 4.5e,f,g | Protected (P) | 45% |
| 4.5 to less than 6f,g | Unprotected, Nonsprinklered (UP, NS) | 25% |
| 4.5 to less than 6f,g | Unprotected, Sprinklered (UP, S)i | 75% |
| 4.5 to less than 6f,g | Protected (P) | 75% |
| 6 to less than 7.5 f,g | Unprotected, Nonsprinklered (UP, NS) | 45% |
| 6 to less than 7.5 f,g | Unprotected, Sprinklered (UP, S)i | No Limit |
| 6 to less than 7.5 f,g | Protected (P) | No Limit |
| 7.5 to less than 9 f,g | Unprotected, Nonsprinklered (UP, NS) | 70% |
| 7.5 to less than 9 f,g | Unprotected, Sprinklered (UP, S)i | No Limit |
| 7.5 to less than 9 f,g | Protected (P) | No Limit |
| 9 or greater | Unprotected, Nonsprinklered (UP, NS) | No Limit |
| 9 or greater | Unprotected, Sprinklered (UP, S)i | No Limit |
| 9 or greater | Protected (P) | No Limit |

**Notes, legend and footnotes as printed:**
- UP, NS = Unprotected openings in buildings not equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 . UP, S = Unprotected openings in buildings equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 .
- P = Openings protected with an opening protective assembly in accordance with Section 705.8.2 .
- a. Values indicated are the percentage of the area of the exterior wall, per story.
- b. For the requirements for fire walls of buildings with differing heights, see Section 706.6.1 .
- c. For openings in a fire wall for buildings on the same lot, see Section 706.8 .
- d. The maximum percentage of unprotected and protected openings shall be 25 percent for Group R-3 occupancies.
- e. Unprotected openings shall not be permitted for openings with a fire separation distance of less than 4.5 meter for Group H-2 and H-3 occupancies.
- f. The area of unprotected and protected openings shall not be limited for Group R-3 occupancies, with a fire separation distance of 1.5 meter or greater.
- g. The area of openings in an open parking structure with a fire separation distance of 3 meter or greater shall not be limited.
- h. Includes buildings accessory to Group R-3.
- i. Not applicable to Group H-1, H-2 and H-3 occupancies.
- j. The area of openings in a building containing only a Group U occupancy private garage or carport with a fire separation distance of 1.5 m or greater shall not be limited.
- k. For openings between S-2 parking garage and Group R-2 building, see Section 705.3 , Exception 2.
'
  WHERE id = '578fc6bf-d8da-4843-a6af-3550135c77d3';

-- ===============================================================
-- PART 2: QUARANTINE - rows whose table number the SBC DOES NOT PRINT
-- ===============================================================
-- These 42 rows are injected into the AI prompt today under
-- 'STRUCTURED CODE TABLES (DB-AUTHORITATIVE - CITE THESE VERBATIM)', but
-- no printed SBC table carries their number, so no cell of them can be
-- verified against the code. They are renamed - NOT deleted - exactly the
-- reversible way the safety alert does it, so extractTableIds() stops
-- matching them and they stop being injected. Content is preserved in
-- full for later repair.
--
-- Evidence of absence is recorded per row in the companion report: the
-- chapter's own 'TABLES AND FIGURES OF CHAPTER n' block is quoted with
-- the captions it actually lists.

-- 303  (chapter 3, SBC 201) - Assembly Occupancy Group A — Sub-Classification A-1 Through 
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_303'
 WHERE id = 'c54eccd5-e3cd-47f9-bbd3-029e93b84a3c'
   AND table_id = '303';

-- 304  (chapter 3, SBC 201) - Business Occupancy Group B — Classification and Boundary Rul
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_304'
 WHERE id = 'b45622ae-2ecf-481d-8e45-a84950ae959d'
   AND table_id = '304';

-- 305  (chapter 3, SBC 201) - Educational Occupancy Group E — Classification and Boundary 
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_305'
 WHERE id = '247010e2-d359-442a-9b8b-547d98652479'
   AND table_id = '305';

-- 306  (chapter 3, SBC 201) - Factory Occupancy Group F — F-1 Moderate Hazard vs. F-2 Low 
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_306'
 WHERE id = 'ea60aae1-0912-43e4-bf03-5d934e2fc870'
   AND table_id = '306';

-- 307  (chapter 3, SBC 201) - High Hazard Occupancy Group H — H-1 Through H-5 Classificati
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_307'
 WHERE id = 'de47f272-f928-4ff3-b685-623d2bba6f46'
   AND table_id = '307';

-- 308  (chapter 3, SBC 201) - Institutional Occupancy Group I — Sub-Classification I-1 Thr
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_308'
 WHERE id = 'ae6dacf8-9cdd-4e3c-82ec-4eb62416c125'
   AND table_id = '308';

-- 309  (chapter 3, SBC 201) - Mercantile Occupancy Group M — Classification and Boundary R
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_309'
 WHERE id = 'ad5f183d-5455-401b-af3d-c009dcf28b13'
   AND table_id = '309';

-- 310  (chapter 3, SBC 201) - Residential Occupancy Group R — R-1 Through R-4 Classificati
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_310'
 WHERE id = '457f4f76-76da-4057-bbf4-91e49f6f8aa0'
   AND table_id = '310';

-- 412  (chapter 4, SBC 201) - Aircraft-Related Occupancies - Core Commercial Hangar Path (
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_412'
 WHERE id = '995dbc83-c79b-4967-b00b-740ba6b6e860'
   AND table_id = '412';

-- 412.2  (chapter 4, SBC 201) - Airport Traffic Control Towers - Core Egress, Emergency Syst
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_412.2'
 WHERE id = 'dbe2a716-1179-4f7f-b7ed-95e0df916d73'
   AND table_id = '412.2';

-- 412.5  (chapter 4, SBC 201) - Aircraft Paint Hangars - Classification, Operations, Suppres
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_412.5'
 WHERE id = '352fbd59-7bd9-4346-8dc8-559dceae97be'
   AND table_id = '412.5';

-- 414  (chapter 4, SBC 201) - Hazardous Materials — Control Areas, MAQ Thresholds, and Sto
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_414'
 WHERE id = '124dd84d-872d-4c2b-a25e-f6c0d0965c35'
   AND table_id = '414';

-- 417  (chapter 4, SBC 201) - Drying Rooms — Construction, Sprinkler Protection, Ventilati
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_417'
 WHERE id = '1024a3dc-4f62-4cb4-8cd4-40c98b1c6a9f'
   AND table_id = '417';

-- 417  (chapter 4, SBC 201) - Drying Rooms - Noncombustible Construction, Piping Clearance
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_417'
 WHERE id = '806f1bae-6f80-40cc-96c0-e160be71f059'
   AND table_id = '417';

-- 420  (chapter 4, SBC 201) - Groups I-1, R-1, R-2, R-3 — Sleeping Units Special Provision
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_420'
 WHERE id = 'a1023e04-1cf4-49f8-94e6-bd64209cf662'
   AND table_id = '420';

-- 508  (chapter 5, SBC 201) - Mixed Occupancy — Accessory, Nonseparated, and Separated App
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_508'
 WHERE id = '22d00536-02b1-4b6b-b4a8-95d2ead000c0'
   AND table_id = '508';

-- 508.3  (chapter 5, SBC 201) - Accessory Occupancies — Area Threshold and Separation Requir
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_508.3'
 WHERE id = 'a2b566d4-2f5e-431e-88e3-5cab3de027ae'
   AND table_id = '508.3';

-- 508.5  (chapter 5, SBC 201) - Separated Occupancies — Method and Fire-Barrier Requirements
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_508.5'
 WHERE id = 'a98875f5-b1ff-4c7b-a5bd-661eaa2aacae'
   AND table_id = '508.5';

-- 1009  (chapter 10, SBC 201) - Accessible Means of Egress — Requirements and Areas of Refug
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1009'
 WHERE id = 'a86ba99e-4e9c-4b57-affe-5e57b08ea43b'
   AND table_id = '1009';

-- 1014  (chapter 10, SBC 201) - Section 1014 — Handrails (Overview)
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1014'
 WHERE id = '1c41ee6c-babd-4ce5-8c01-82a9ae1773ef'
   AND table_id = '1014';

-- 1014.1  (chapter 10, SBC 201) - Section 1014.1 — Handrails: Where Required
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1014.1'
 WHERE id = 'b2e43269-bed8-4533-b6be-7209eddc3ec2'
   AND table_id = '1014.1';

-- 1014.2  (chapter 10, SBC 201) - Section 1014.2 — Handrail Height
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1014.2'
 WHERE id = 'ae165286-e4b0-4821-b4f6-7058bbc41622'
   AND table_id = '1014.2';

-- 1014.3  (chapter 10, SBC 201) - Section 1014.3 — Handrail Graspability (Type I and Type II)
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1014.3'
 WHERE id = 'd58e2b7d-71f0-455d-88c7-c1a2c984226a'
   AND table_id = '1014.3';

-- 1014.4  (chapter 10, SBC 201) - Section 1014.4 — Handrail Continuity
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1014.4'
 WHERE id = '338ad2ce-94fc-4346-9a49-77f9c049ebda'
   AND table_id = '1014.4';

-- 1014.5  (chapter 10, SBC 201) - Section 1014.5 — Handrail Fittings
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1014.5'
 WHERE id = 'f79da001-978d-4960-8dca-9a3da8d3108d'
   AND table_id = '1014.5';

-- 1014.6  (chapter 10, SBC 201) - Section 1014.6 — Handrail Extensions
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1014.6'
 WHERE id = '74381e94-82fa-4742-8736-04ca3d392b5c'
   AND table_id = '1014.6';

-- 1019  (chapter 10, SBC 201) - Exit Access Stairways and Ramps — Enclosure, Openings, and T
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1019'
 WHERE id = '90fd087e-1ecd-49bd-ac78-ac4d16e5f7a5'
   AND table_id = '1019';

-- 1021.2  (chapter 10, SBC 201) - Minimum Number of Exits or Exit Access Doorways
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1021.2'
 WHERE id = '3995a9dd-59ba-45eb-a355-8a6e0b8c78f6'
   AND table_id = '1021.2';

-- 1024  (chapter 10, SBC 201) - Luminous Egress Path Markings — Where Required, Materials, a
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_1024'
 WHERE id = '1d79dd64-7a82-4a67-b739-25ea999bd013'
   AND table_id = '1024';

-- 903.2.7  (chapter 9, SBC 801) - Group M — Automatic Sprinkler System (Mercantile)
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_903.2.7'
 WHERE id = '47dc1d22-b6db-47dd-b6fb-b90eb813ef0c'
   AND table_id = '903.2.7';

-- 903.3.2  (chapter 9, SBC 801) - Quick-Response and Residential Sprinkler Heads — Where Requi
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_903.3.2'
 WHERE id = '4d93758b-e452-4c80-9b08-a6fbe9b8b7a9'
   AND table_id = '903.3.2';

-- 903.4  (chapter 9, SBC 801) - Sprinkler System Supervision — Required Supervisory Signals 
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_903.4'
 WHERE id = '8e24391a-c09f-4115-95a0-6ff79d81bffc'
   AND table_id = '903.4';

-- 903.4.3  (chapter 9, SBC 801) - Floor Control Valves — High-Rise Sprinkler Systems
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_903.4.3'
 WHERE id = '770a89e0-105b-4449-9bd3-c1396be92d8d'
   AND table_id = '903.4.3';

-- 904  (chapter 9, SBC 801) - Alternative Automatic Fire-Extinguishing Systems — System Ty
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_904'
 WHERE id = '1b698bc6-a9d6-4239-b6aa-26457318b7d8'
   AND table_id = '904';

-- 907.2.7  (chapter 9, SBC 801) - Group M — Manual Fire Alarm System (Mercantile)
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_907.2.7'
 WHERE id = 'cd1e9986-1db8-4d25-9bc4-894f12d1247a'
   AND table_id = '907.2.7';

-- 907.3  (chapter 9, SBC 801) - Fire Alarm Initiating Devices — Smoke Detectors, Heat Detect
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_907.3'
 WHERE id = '7f2f8e39-6115-4140-8bb9-eb2ed0b216b7'
   AND table_id = '907.3';

-- 907.4.2  (chapter 9, SBC 801) - Manual Fire Alarm Boxes — Location, Height, Color, Signs
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_907.4.2'
 WHERE id = 'beba7f56-fa48-45eb-a4ff-78c7dbffc97a'
   AND table_id = '907.4.2';

-- 907.5  (chapter 9, SBC 801) - Occupant Notification Systems — Audible and Visible Requirem
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_907.5'
 WHERE id = 'a85550c9-e7f1-4a81-90f4-29829d2325b2'
   AND table_id = '907.5';

-- 907.6  (chapter 9, SBC 801) - Fire Alarm Monitoring — Supervising Station Requirement
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_907.6'
 WHERE id = '31539770-9756-4c04-b913-0d72fd6e4d9c'
   AND table_id = '907.6';

-- 911  (chapter 9, SBC 801) - Commercial Cooking Hood Suppression Systems — Where Required
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_911'
 WHERE id = 'b4362641-4a27-44d2-9804-53d38e73dc77'
   AND table_id = '911';

-- 914  (chapter 9, SBC 801) - Emergency Responder Radio Coverage — Where Required, Testing
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_914'
 WHERE id = 'ac0a9987-5709-444a-8e13-9e43348640cf'
   AND table_id = '914';

-- 915  (chapter 9, SBC 801) - Carbon Monoxide Detection — Where Required by Occupancy and 
UPDATE public.sbc_code_tables
   SET table_id = 'QUARANTINED_915'
 WHERE id = 'e124037c-a5b0-49f5-b7ea-ec71f296fb49'
   AND table_id = '915';

-- ---------------------------------------------------------------
-- VERIFY (run after COMMIT):
-- SELECT id, table_id, table_title, length(content_md) AS md_len
--   FROM public.sbc_code_tables
--  WHERE id IN (
--        '8b7d0de6-5298-4c99-b638-fd284c5a9b48',
--        '5339003f-4f51-4e8c-91f8-def550343af7',
--        '76cd8e97-b854-4f4c-bc62-e19e3a2fa1bb',
--        'a6ce9d2c-e38e-4f29-9e53-834b48c18b8b',
--        'd419009f-e558-4a06-9d98-d5174957156e',
--        '36615928-df1b-42c1-937a-75afc343d3a2',
--        '138da5fc-b9b6-4317-ab3c-d51ea381da8b',
--        '5f1517df-8853-4bcc-85f4-b89be0b8d350',
--        '03127d3d-4ea8-417b-b3b2-dd8833863b65',
--        'ed15da7a-7154-4903-936a-d5d0c674ca30',
--        '74ba6a33-3cfc-41f6-8cfe-7dd0a4e80c4d',
--        '1ff010d8-a168-4f92-b698-7f2e3e8c8b26',
--        '24f1239a-3b0c-42bf-a015-94411e42315c',
--        'e4dc98f4-8030-4ac5-bd8a-a9e708b04a39',
--        '745781a8-b58b-4dbb-94f8-91653863cb36',
--        '578fc6bf-d8da-4843-a6af-3550135c77d3',
--        'c54eccd5-e3cd-47f9-bbd3-029e93b84a3c',
--        'b45622ae-2ecf-481d-8e45-a84950ae959d',
--        '247010e2-d359-442a-9b8b-547d98652479',
--        'ea60aae1-0912-43e4-bf03-5d934e2fc870',
--        'de47f272-f928-4ff3-b685-623d2bba6f46',
--        'ae6dacf8-9cdd-4e3c-82ec-4eb62416c125',
--        'ad5f183d-5455-401b-af3d-c009dcf28b13',
--        '457f4f76-76da-4057-bbf4-91e49f6f8aa0',
--        '995dbc83-c79b-4967-b00b-740ba6b6e860',
--        'dbe2a716-1179-4f7f-b7ed-95e0df916d73',
--        '352fbd59-7bd9-4346-8dc8-559dceae97be',
--        '124dd84d-872d-4c2b-a25e-f6c0d0965c35',
--        '1024a3dc-4f62-4cb4-8cd4-40c98b1c6a9f',
--        '806f1bae-6f80-40cc-96c0-e160be71f059',
--        'a1023e04-1cf4-49f8-94e6-bd64209cf662',
--        '22d00536-02b1-4b6b-b4a8-95d2ead000c0',
--        'a2b566d4-2f5e-431e-88e3-5cab3de027ae',
--        'a98875f5-b1ff-4c7b-a5bd-661eaa2aacae',
--        'a86ba99e-4e9c-4b57-affe-5e57b08ea43b',
--        '1c41ee6c-babd-4ce5-8c01-82a9ae1773ef',
--        'b2e43269-bed8-4533-b6be-7209eddc3ec2',
--        'ae165286-e4b0-4821-b4f6-7058bbc41622',
--        'd58e2b7d-71f0-455d-88c7-c1a2c984226a',
--        '338ad2ce-94fc-4346-9a49-77f9c049ebda',
--        'f79da001-978d-4960-8dca-9a3da8d3108d',
--        '74381e94-82fa-4742-8736-04ca3d392b5c',
--        '90fd087e-1ecd-49bd-ac78-ac4d16e5f7a5',
--        '3995a9dd-59ba-45eb-a355-8a6e0b8c78f6',
--        '1d79dd64-7a82-4a67-b739-25ea999bd013',
--        '47dc1d22-b6db-47dd-b6fb-b90eb813ef0c',
--        '4d93758b-e452-4c80-9b08-a6fbe9b8b7a9',
--        '8e24391a-c09f-4115-95a0-6ff79d81bffc',
--        '770a89e0-105b-4449-9bd3-c1396be92d8d',
--        '1b698bc6-a9d6-4239-b6aa-26457318b7d8',
--        'cd1e9986-1db8-4d25-9bc4-894f12d1247a',
--        '7f2f8e39-6115-4140-8bb9-eb2ed0b216b7',
--        'beba7f56-fa48-45eb-a4ff-78c7dbffc97a',
--        'a85550c9-e7f1-4a81-90f4-29829d2325b2',
--        '31539770-9756-4c04-b913-0d72fd6e4d9c',
--        'b4362641-4a27-44d2-9804-53d38e73dc77',
--        'ac0a9987-5709-444a-8e13-9e43348640cf',
--        'e124037c-a5b0-49f5-b7ea-ec71f296fb49'
--  ) ORDER BY table_id;
--
-- Expected after this file: 16 rows rebuilt, 42 newly quarantined.

COMMIT;

-- ===============================================================
-- REVERSAL - restores every row this file touched
-- ===============================================================
-- Run the whole block to undo BOTH parts. It restores from the step-0
-- backup, so it also undoes a partially applied run.
--
-- BEGIN;
-- UPDATE public.sbc_code_tables t
--    SET table_id    = b.table_id,
--        table_title = b.table_title,
--        edition     = b.edition,
--        section     = b.section,
--        notes       = b.notes,
--        content_md  = b.content_md
--   FROM public.sbc_code_tables_backup_20260823 b
--  WHERE t.id = b.id
--    AND (t.table_id    IS DISTINCT FROM b.table_id
--      OR t.table_title IS DISTINCT FROM b.table_title
--      OR t.edition     IS DISTINCT FROM b.edition
--      OR t.section     IS DISTINCT FROM b.section
--      OR t.notes       IS DISTINCT FROM b.notes
--      OR t.content_md  IS DISTINCT FROM b.content_md);
-- COMMIT;
--
-- To reverse ONLY the quarantine part:
-- UPDATE public.sbc_code_tables
--    SET table_id = replace(table_id, 'QUARANTINED_', '')
--  WHERE id IN ('c54eccd5-e3cd-47f9-bbd3-029e93b84a3c', 'b45622ae-2ecf-481d-8e45-a84950ae959d', '247010e2-d359-442a-9b8b-547d98652479', 'ea60aae1-0912-43e4-bf03-5d934e2fc870', 'de47f272-f928-4ff3-b685-623d2bba6f46', 'ae6dacf8-9cdd-4e3c-82ec-4eb62416c125', 'ad5f183d-5455-401b-af3d-c009dcf28b13', '457f4f76-76da-4057-bbf4-91e49f6f8aa0', '995dbc83-c79b-4967-b00b-740ba6b6e860', 'dbe2a716-1179-4f7f-b7ed-95e0df916d73', '352fbd59-7bd9-4346-8dc8-559dceae97be', '124dd84d-872d-4c2b-a25e-f6c0d0965c35', '1024a3dc-4f62-4cb4-8cd4-40c98b1c6a9f', '806f1bae-6f80-40cc-96c0-e160be71f059', 'a1023e04-1cf4-49f8-94e6-bd64209cf662', '22d00536-02b1-4b6b-b4a8-95d2ead000c0', 'a2b566d4-2f5e-431e-88e3-5cab3de027ae', 'a98875f5-b1ff-4c7b-a5bd-661eaa2aacae', 'a86ba99e-4e9c-4b57-affe-5e57b08ea43b', '1c41ee6c-babd-4ce5-8c01-82a9ae1773ef', 'b2e43269-bed8-4533-b6be-7209eddc3ec2', 'ae165286-e4b0-4821-b4f6-7058bbc41622', 'd58e2b7d-71f0-455d-88c7-c1a2c984226a', '338ad2ce-94fc-4346-9a49-77f9c049ebda', 'f79da001-978d-4960-8dca-9a3da8d3108d', '74381e94-82fa-4742-8736-04ca3d392b5c', '90fd087e-1ecd-49bd-ac78-ac4d16e5f7a5', '3995a9dd-59ba-45eb-a355-8a6e0b8c78f6', '1d79dd64-7a82-4a67-b739-25ea999bd013', '47dc1d22-b6db-47dd-b6fb-b90eb813ef0c', '4d93758b-e452-4c80-9b08-a6fbe9b8b7a9', '8e24391a-c09f-4115-95a0-6ff79d81bffc', '770a89e0-105b-4449-9bd3-c1396be92d8d', '1b698bc6-a9d6-4239-b6aa-26457318b7d8', 'cd1e9986-1db8-4d25-9bc4-894f12d1247a', '7f2f8e39-6115-4140-8bb9-eb2ed0b216b7', 'beba7f56-fa48-45eb-a4ff-78c7dbffc97a', 'a85550c9-e7f1-4a81-90f4-29829d2325b2', '31539770-9756-4c04-b913-0d72fd6e4d9c', 'b4362641-4a27-44d2-9804-53d38e73dc77', 'ac0a9987-5709-444a-8e13-9e43348640cf', 'e124037c-a5b0-49f5-b7ea-ec71f296fb49');

-- Rows not touched by this file remain exactly as they are in production.
-- See the companion report for the per-row reason.
