-- SBC Structured Tables — canonical seed data (SBC 201, Edition 2024)
-- Sources: Saudi Building Code 2024 (SBC 201 based on IBC 2021 with KSA amendments)
--
-- Tables seeded:
--   Table 1004.5  — Maximum Floor Area Allowances Per Occupant
--   Table 1006.3.3 — Spaces with One Exit or Exit Access Doorway
--   Table 1006.3.4 — Spaces or Stories with One Exit (multi-story)
--   Table 504.3   — Allowable Number of Stories Above Grade Plane
--   Table 504.4   — Allowable Building Height in Feet Above Grade Plane
--   Table 506.2   — Allowable Area Factor (AT, in sq ft)
--
-- Applied 2026-04-10.

-- ============================================================
-- TABLE 1004.5  (replaces Table 1004.1.2 from SBC 201 2018)
-- ============================================================
INSERT INTO public.sbc_code_tables
  (table_id, table_title, source_code, edition, chapter, section, content_md, keywords, notes, supersedes)
VALUES (
  '1004.5',
  'Maximum Floor Area Allowances Per Occupant',
  'SBC 201',
  '2024',
  10,
  '1004',
$$## Table 1004.5 — Maximum Floor Area Allowances Per Occupant
**SBC 201 | Section 1004.5 | Chapter 10 — Means of Egress**

| FUNCTION OF SPACE | OCCUPANT LOAD FACTOR^a |
|---|---|
| Agricultural building | 300 gross |
| Aircraft hangars | 500 gross |
| Airport terminal — Baggage claim | 20 gross |
| Airport terminal — Baggage handling | 300 gross |
| Airport terminal — Concourse | 100 gross |
| Airport terminal — Waiting areas | 15 gross |
| Assembly with fixed seats | See Section 1004.4 |
| Assembly without fixed seats — Concentrated (chairs only, not fixed) | 7 net |
| Assembly without fixed seats — Standing space | 5 net |
| Assembly without fixed seats — Unconcentrated (tables and chairs) | 15 net |
| Bowling centers (5 persons per lane including 15 ft of runway; additional areas) | 7 net |
| Business areas | 150 gross |
| Courtrooms — other than fixed-seating areas | 40 net |
| Day care | 35 net |
| Dormitories | 50 gross |
| Educational — Classroom area | 20 net |
| Educational — Shops and other vocational rooms | 50 net |
| Exercise rooms | 50 gross |
| H-5 Fabrication and manufacturing areas | 200 gross |
| Industrial areas | 100 gross |
| Institutional areas — Inpatient treatment areas | 240 gross |
| Institutional areas — Outpatient areas | 100 gross |
| Institutional areas — Sleeping areas | 120 gross |
| Kitchens, commercial | 200 gross |
| Library — Reading rooms | 50 net |
| Library — Stack areas | 100 gross |
| Locker rooms | 50 gross |
| Malls | See Section 402 |
| Mercantile — Sales floors on street floor level | 60 gross |
| Mercantile — Sales floors on floors above or below grade | 60 gross |
| Mercantile — Stock, shipping or receiving areas | 300 gross |
| Parking garages | 200 gross |
| Residential | 200 gross |
| Skating rinks, swimming pools — Rink and pool | 50 gross |
| Skating rinks, swimming pools — Decks | 15 gross |
| Stages and platforms | 15 net |
| Storage areas, mechanical equipment rooms | 300 gross |
| Utility areas | 300 gross |
| Warehouses | 500 gross |

**Footnote a:** Floor area in square feet (sq ft) per occupant.
**"Gross"** = floor area within exterior walls including all enclosed spaces.
**"Net"** = actual occupied area, not including unoccupied accessory areas (corridors, stairways, restrooms, mechanical spaces, closets).

> **SI Equivalents:** 1 sq ft = 0.0929 m². To convert: divide sq ft value by 10.764 to obtain m²/occupant.
$$,
  ARRAY['table 1004.5','1004.5','1004','occupant load','occupant load factor','floor area per occupant',
        'means of egress','chapter 10','business area','mercantile','assembly','classroom',
        'جدول 1004.5','حمل إشغال','معامل الإشغال','مساحة لكل شخص','مخارج'],
  'SI equivalents: divide the sq-ft value by 10.764 to obtain m²/occupant. Section 1004.4 applies to fixed seating.',
  ARRAY['1004.1.2']
)
ON CONFLICT (table_id, source_code, edition) DO UPDATE
  SET content_md = EXCLUDED.content_md,
      keywords   = EXCLUDED.keywords,
      notes      = EXCLUDED.notes,
      supersedes = EXCLUDED.supersedes;

-- ============================================================
-- TABLE 1006.3.3  — Spaces with One Exit or Exit Access Doorway
-- ============================================================
INSERT INTO public.sbc_code_tables
  (table_id, table_title, source_code, edition, chapter, section, content_md, keywords, notes, supersedes)
VALUES (
  '1006.3.3',
  'Spaces with One Exit or Exit Access Doorway',
  'SBC 201',
  '2024',
  10,
  '1006',
$$## Table 1006.3.3 — Spaces with One Exit or Exit Access Doorway
**SBC 201 | Section 1006.3.3 | Chapter 10 — Means of Egress**

| OCCUPANCY | MAXIMUM OCCUPANT LOAD (persons) | MAXIMUM TRAVEL DISTANCE (ft / mm) |
|---|---|---|
| A, B, E, F, M, U | 49 | 75 ft (22 860 mm) |
| H-1, H-2, H-3 | 3 | 25 ft (7 620 mm) |
| H-4, H-5, I-1, I-3, I-4, R | 10 | 75 ft (22 860 mm) |
| S | 29 | 100 ft (30 480 mm) |

> **Section 1006.3.3 — Permitted Uses:**
> Rooms or spaces in the occupancies listed above with occupant loads not exceeding those listed and where the travel distance from the most remote point to the exit access doorway does not exceed the listed distance shall be permitted to have a single exit or exit access doorway.

**Key Definitions:**
- **Travel Distance:** Measured from the most remote occupied point to the nearest exit (SBC 201 Section 1017).
- **Exit Access Doorway:** A door that provides access from a space to an exit or to a corridor/aisle leading to an exit.
- These limits apply to ROOMS/SPACES — for stories/floors with one exit see **Table 1006.3.4**.

**Sprinkler Modification (Section 1006.3.3 Exception):**
In buildings equipped throughout with an automatic sprinkler system per SBC 801 Section 903.3.1.1, the maximum occupant loads in this table do not apply; only the travel distance limit governs.
$$,
  ARRAY['table 1006.3.3','1006.3.3','1006.3','1006','single exit','one exit','exit access doorway',
        'travel distance','occupant load','means of egress','chapter 10',
        'جدول 1006.3.3','مخرج واحد','مسافة سفر','باب خروج'],
  'For stories or floors with one exit, see Table 1006.3.4. Sprinkler exception in Section 1006.3.3 removes occupant load caps.',
  ARRAY[]::text[]
)
ON CONFLICT (table_id, source_code, edition) DO UPDATE
  SET content_md = EXCLUDED.content_md,
      keywords   = EXCLUDED.keywords,
      notes      = EXCLUDED.notes;

-- ============================================================
-- TABLE 1006.3.4  — Stories or Sections of Stories with One Exit
-- ============================================================
INSERT INTO public.sbc_code_tables
  (table_id, table_title, source_code, edition, chapter, section, content_md, keywords, notes, supersedes)
VALUES (
  '1006.3.4',
  'Stories or Sections of Stories with One Exit',
  'SBC 201',
  '2024',
  10,
  '1006',
$$## Table 1006.3.4 — Stories or Sections of Stories with One Exit
**SBC 201 | Section 1006.3.4 | Chapter 10 — Means of Egress**

| OCCUPANCY | MAXIMUM HEIGHT ABOVE GRADE PLANE | MAXIMUM NUMBER OF OCCUPANTS PER STORY | MAXIMUM TRAVEL DISTANCE (ft / mm) |
|---|---|---|---|
| A, B^b, E, F, M, U | 1 story | 49 | 75 ft (22 860 mm) |
| B^b (sprinklered per 903.3.1.1) | 4 stories | 49 | 100 ft (30 480 mm) |
| H-1, H-2, H-3 | 1 story | 3 | 25 ft (7 620 mm) |
| H-4, H-5 | 1 story | 10 | 75 ft (22 860 mm) |
| I-1^c, I-4 | 1 story | 10 | 75 ft (22 860 mm) |
| R-1, R-2^d | 4 stories | 4 dwelling units | 50 ft (15 240 mm) |
| R-2^d (sprinklered per 903.3.1.1) | 4 stories | 4 dwelling units | 125 ft (38 100 mm) |
| S | 1 story | 29 | 100 ft (30 480 mm) |

**Footnotes:**
b. Applies to office buildings (Group B) only when provided with a sprinkler system.
c. Group I-1 limited to one story when not sprinklered.
d. Group R-2 one exit per story permitted for buildings not exceeding 4 stories with ≤4 dwelling units per floor.

> **Note:** Each story shall be separately evaluated. Stories below grade plane shall comply with Section 1006.3.4.
$$,
  ARRAY['table 1006.3.4','1006.3.4','1006.3','single exit per story','one exit per floor',
        'travel distance','means of egress','chapter 10',
        'جدول 1006.3.4','مخرج واحد بالطابق','مسافة سفر'],
  NULL,
  ARRAY[]::text[]
)
ON CONFLICT (table_id, source_code, edition) DO UPDATE
  SET content_md = EXCLUDED.content_md,
      keywords   = EXCLUDED.keywords,
      notes      = EXCLUDED.notes;

-- ============================================================
-- TABLE 504.3  — Allowable Number of Stories Above Grade Plane
-- ============================================================
INSERT INTO public.sbc_code_tables
  (table_id, table_title, source_code, edition, chapter, section, content_md, keywords, notes, supersedes)
VALUES (
  '504.3',
  'Allowable Number of Stories Above Grade Plane',
  'SBC 201',
  '2024',
  5,
  '504',
$$## Table 504.3 — Allowable Number of Stories Above Grade Plane
**SBC 201 | Section 504.3 | Chapter 5 — General Building Heights and Areas**

> *S* = Sprinklered throughout per SBC 801 Section 903.3.1.1 or 903.3.1.2
> *NS* = Not sprinklered (or sprinklered per Section 903.3.1.2 only)
> UL = Unlimited
> NP = Not Permitted

| OCCUPANCY GROUP | TYPE I-A (S/NS) | TYPE I-B (S/NS) | TYPE II-A (S/NS) | TYPE II-B (S/NS) | TYPE III-A (S/NS) | TYPE III-B (S/NS) | TYPE IV-HT (S/NS) | TYPE V-A (S/NS) | TYPE V-B (S/NS) |
|---|---|---|---|---|---|---|---|---|---|
| **A-1** | UL / UL | UL / UL | 3 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | 1 / 1 |
| **A-2** | UL / UL | UL / UL | 11 / 3 | 3 / 2 | 3 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | 1 / 1 |
| **A-3** | UL / UL | UL / UL | 11 / 3 | 3 / 2 | 3 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | 1 / 1 |
| **A-4** | UL / UL | UL / UL | 11 / 3 | 3 / 2 | 3 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | 1 / 1 |
| **A-5** | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL |
| **B** | UL / UL | UL / UL | 11 / 5 | 5 / 3 | 5 / 3 | 3 / 2 | 5 / 3 | 3 / 2 | 2 / 1 |
| **E** | UL / UL | UL / UL | 5 / 3 | 4 / 2 | 3 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | 1 / 1 |
| **F-1** | UL / UL | UL / UL | 7 / 4 | 4 / 2 | 3 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | 1 / NP |
| **F-2** | UL / UL | UL / UL | 11 / 5 | 5 / 3 | 5 / 3 | 3 / 2 | 5 / 3 | 3 / 2 | 2 / 1 |
| **H-1** | 1 / NP | 1 / NP | 1 / NP | 1 / NP | 1 / NP | NP / NP | 1 / NP | 1 / NP | NP / NP |
| **H-2** | UL / 3 | UL / 3 | 6 / 3 | 4 / 2 | 4 / 2 | 2 / 1 | 4 / 2 | 2 / 1 | NP / NP |
| **H-3** | UL / UL | UL / UL | 6 / 4 | 4 / 2 | 4 / 2 | 2 / 1 | 4 / 2 | 2 / 1 | 1 / NP |
| **H-4** | UL / UL | UL / UL | 7 / 5 | 5 / 3 | 5 / 3 | 3 / 2 | 5 / 3 | 3 / 2 | 2 / 1 |
| **H-5** | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 |
| **I-1** | UL / UL | UL / UL | 9 / 4 | 4 / 2 | 4 / 2 | 2 / 1 | 4 / 2 | 2 / 1 | 1 / NP |
| **I-2** | UL / UL | UL / UL | 4 / NP | NP / NP | NP / NP | NP / NP | NP / NP | NP / NP | NP / NP |
| **I-3** | UL / UL | UL / UL | 4 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | NP / NP |
| **I-4** | UL / UL | UL / UL | 5 / 3 | 3 / 2 | 3 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | 1 / NP |
| **M** | UL / UL | UL / UL | 11 / 4 | 4 / 2 | 4 / 2 | 2 / 1 | 4 / 2 | 2 / 1 | 1 / NP |
| **R-1** | UL / UL | UL / UL | 11 / 4 | 4 / 2 | 4 / 2 | 2 / 1 | 4 / 2 | 2 / 1 | 1 / NP |
| **R-2** | UL / UL | UL / UL | 11 / 4 | 4 / 2 | 4 / 2 | 2 / 1 | 4 / 2 | 2 / 1 | 1 / NP |
| **R-3** | UL / UL | UL / UL | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 | 3 / 3 | 3 / 3 |
| **R-4** | UL / UL | UL / UL | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 | 3 / 3 | 3 / 3 |
| **S-1** | UL / UL | UL / UL | 7 / 3 | 3 / 2 | 3 / 2 | 2 / 1 | 3 / 2 | 2 / 1 | 1 / NP |
| **S-2** | UL / UL | UL / UL | 11 / 4 | 4 / 2 | 4 / 2 | 2 / 1 | 4 / 2 | 2 / 1 | 1 / NP |
| **U** | UL / UL | UL / UL | 4 / 2 | 2 / 1 | 2 / 1 | 1 / 1 | 2 / 1 | 1 / 1 | 1 / 1 |

**Sprinkler Increase (Section 504.3):**
Where a building is equipped throughout with an NFPA 13 automatic sprinkler system (SBC 801 Section 903.3.1.1), the allowable number of stories is increased by the sprinklered value shown (S column).

**Mixed Occupancy:** See Section 508 for mixed occupancy buildings; most restrictive occupancy governs unless Section 508.3 (accessory) or 508.4 (non-separated) is applied.
$$,
  ARRAY['table 504.3','504.3','504','allowable stories','number of stories','building height stories',
        'construction type','occupancy group','sprinkler increase','chapter 5',
        'جدول 504.3','عدد الطوابق المسموحة','نوع الإنشاء','تصنيف الإشغال'],
  'S = Sprinklered (NFPA 13/SBC 801 903.3.1.1); NS = Not sprinklered. UL = Unlimited; NP = Not Permitted.',
  ARRAY['503']
)
ON CONFLICT (table_id, source_code, edition) DO UPDATE
  SET content_md = EXCLUDED.content_md,
      keywords   = EXCLUDED.keywords,
      notes      = EXCLUDED.notes,
      supersedes = EXCLUDED.supersedes;

-- ============================================================
-- TABLE 504.4  — Allowable Building Height in Feet Above Grade Plane
-- ============================================================
INSERT INTO public.sbc_code_tables
  (table_id, table_title, source_code, edition, chapter, section, content_md, keywords, notes, supersedes)
VALUES (
  '504.4',
  'Allowable Building Height in Feet Above Grade Plane',
  'SBC 201',
  '2024',
  5,
  '504',
$$## Table 504.4 — Allowable Building Height in Feet Above Grade Plane
**SBC 201 | Section 504.4 | Chapter 5 — General Building Heights and Areas**

> *S* = Sprinklered throughout per SBC 801 Section 903.3.1.1 or 903.3.1.2
> *NS* = Not sprinklered
> UL = Unlimited | NP = Not Permitted
> Heights are in **feet** above grade plane. (1 ft = 0.3048 m)

| OCCUPANCY GROUP | TYPE I-A (S/NS) | TYPE I-B (S/NS) | TYPE II-A (S/NS) | TYPE II-B (S/NS) | TYPE III-A (S/NS) | TYPE III-B (S/NS) | TYPE IV-HT (S/NS) | TYPE V-A (S/NS) | TYPE V-B (S/NS) |
|---|---|---|---|---|---|---|---|---|---|
| **A-1** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / 35 |
| **A-2** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / 35 |
| **A-3** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / 35 |
| **A-4** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / 35 |
| **A-5** | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL |
| **B** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / 35 |
| **E** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / 35 |
| **F-1** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / NP |
| **F-2** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / 35 |
| **H-1** | 21 / NP | 21 / NP | 21 / NP | 21 / NP | 21 / NP | NP / NP | 21 / NP | 21 / NP | NP / NP |
| **H-2** | UL / 55 | 160 / 55 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | NP / NP |
| **H-3** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / NP |
| **H-4** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / 35 |
| **H-5** | 55 / 55 | 55 / 55 | 55 / 55 | 55 / 55 | 55 / 55 | 55 / 55 | 55 / 55 | 55 / 55 | 55 / 55 |
| **I-1** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / NP |
| **I-2** | UL / UL | 160 / UL | 65 / NP | NP / NP | NP / NP | NP / NP | NP / NP | NP / NP | NP / NP |
| **I-3** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | NP / NP |
| **I-4** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / NP |
| **M** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / NP |
| **R-1** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / NP |
| **R-2** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / NP |
| **R-3** | UL / UL | UL / UL | 65 / 65 | 65 / 65 | 65 / 65 | 65 / 65 | 65 / 65 | 50 / 50 | 40 / 40 |
| **R-4** | UL / UL | UL / UL | 65 / 65 | 65 / 65 | 65 / 65 | 65 / 65 | 65 / 65 | 50 / 50 | 40 / 40 |
| **S-1** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / NP |
| **S-2** | UL / UL | 160 / 65 | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / NP |
| **U** | UL / UL | UL / UL | 65 / 55 | 55 / 40 | 65 / 55 | 55 / 40 | 65 / 55 | 50 / 40 | 40 / 35 |

**Note:** Height is measured from grade plane to average roof height per Section 502.
**Sprinkler Increase:** Section 504.4 — No additional height increase for sprinklers beyond what is shown in the S column.
**SBC 201 Saudi Amendment:** Heights may not exceed those permitted by local municipality regulations (Amanah/Baladia) regardless of code allowance.
$$,
  ARRAY['table 504.4','504.4','504','allowable height','building height','height limit',
        'construction type','occupancy group','chapter 5',
        'جدول 504.4','الارتفاع المسموح','ارتفاع المبنى','نوع الإنشاء'],
  'Heights in feet above grade plane. 1 ft = 0.3048 m. Saudi amendment: municipal height limits (Amanah) take precedence.',
  ARRAY['503']
)
ON CONFLICT (table_id, source_code, edition) DO UPDATE
  SET content_md = EXCLUDED.content_md,
      keywords   = EXCLUDED.keywords,
      notes      = EXCLUDED.notes,
      supersedes = EXCLUDED.supersedes;

-- ============================================================
-- TABLE 506.2  — Allowable Area Factor (AT) in Square Feet
-- ============================================================
INSERT INTO public.sbc_code_tables
  (table_id, table_title, source_code, edition, chapter, section, content_md, keywords, notes, supersedes)
VALUES (
  '506.2',
  'Allowable Area Factor (AT) in Square Feet',
  'SBC 201',
  '2024',
  5,
  '506',
$$## Table 506.2 — Allowable Area Factor (AT) in Square Feet
**SBC 201 | Section 506.2 | Chapter 5 — General Building Heights and Areas**

> Area values are in **square feet** per floor per fire area.
> 1 sq ft = 0.0929 m². UL = Unlimited. NP = Not Permitted.
> *S* = Sprinklered per SBC 801 Section 903.3.1.1 | *NS* = Not sprinklered.

| OCCUPANCY GROUP | TYPE I-A (S/NS) | TYPE I-B (S/NS) | TYPE II-A (S/NS) | TYPE II-B (S/NS) | TYPE III-A (S/NS) | TYPE III-B (S/NS) | TYPE IV-HT (S/NS) | TYPE V-A (S/NS) | TYPE V-B (S/NS) |
|---|---|---|---|---|---|---|---|---|---|
| **A-1** | UL / UL | UL / UL | 15,500 / 8,500 | 9,500 / 5,500 | 14,000 / 8,500 | 8,500 / 5,500 | 15,000 / 8,500 | 11,500 / 5,500 | 5,500 / 2,500 |
| **A-2** | UL / UL | UL / UL | 15,500 / 8,500 | 9,500 / 5,500 | 14,000 / 8,500 | 8,500 / 5,500 | 15,000 / 8,500 | 11,500 / 5,500 | 5,500 / 2,500 |
| **A-3** | UL / UL | UL / UL | 15,500 / 8,500 | 9,500 / 5,500 | 14,000 / 8,500 | 8,500 / 5,500 | 15,000 / 8,500 | 11,500 / 5,500 | 5,500 / 2,500 |
| **A-4** | UL / UL | UL / UL | 15,500 / 8,500 | 9,500 / 5,500 | 14,000 / 8,500 | 8,500 / 5,500 | 15,000 / 8,500 | 11,500 / 5,500 | 5,500 / 2,500 |
| **A-5** | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL |
| **B** | UL / UL | UL / UL | 37,500 / 23,000 | 19,000 / 9,500 | 28,500 / 19,000 | 19,000 / 9,500 | 36,000 / 18,000 | 18,000 / 9,000 | 9,000 / 2,500 |
| **E** | UL / UL | UL / UL | 26,500 / 14,500 | 14,500 / 7,500 | 23,500 / 14,500 | 14,500 / 7,500 | 25,500 / 14,500 | 18,500 / 7,500 | 7,500 / 2,500 |
| **F-1** | UL / UL | UL / UL | 25,000 / 15,000 | 12,000 / 6,000 | 19,000 / 12,000 | 12,000 / 6,000 | 33,500 / 12,000 | 14,000 / 6,000 | 6,000 / NP |
| **F-2** | UL / UL | UL / UL | 37,500 / 23,000 | 19,000 / 9,500 | 28,500 / 19,000 | 19,000 / 9,500 | 36,000 / 18,000 | 18,000 / 9,000 | 9,000 / 2,500 |
| **H-1** | 21,000 / NP | 16,500 / NP | 11,000 / NP | 7,000 / NP | 9,500 / NP | NP / NP | 10,500 / NP | 7,500 / NP | NP / NP |
| **H-2** | UL / UL | UL / UL | 25,500 / 15,000 | 10,000 / 5,000 | 14,000 / 10,500 | 10,500 / 5,000 | 25,500 / 10,500 | 10,500 / 5,000 | NP / NP |
| **H-3** | UL / UL | UL / UL | 25,500 / 15,000 | 10,500 / 5,000 | 14,000 / 10,500 | 10,500 / 5,000 | 25,500 / 10,500 | 10,500 / 5,000 | 5,000 / NP |
| **H-4** | UL / UL | UL / UL | 37,500 / 23,000 | 19,000 / 9,500 | 28,500 / 19,000 | 19,000 / 9,500 | 36,000 / 18,000 | 18,000 / 9,000 | 9,000 / 2,500 |
| **H-5** | 37,500 / 37,500 | 23,000 / 23,000 | 37,500 / 37,500 | 23,000 / 23,000 | 37,500 / 37,500 | 23,000 / 23,000 | 37,500 / 37,500 | 23,000 / 23,000 | 23,000 / 23,000 |
| **I-1** | UL / UL | UL / UL | 25,500 / 15,000 | 10,500 / NP | 14,000 / 10,500 | 10,500 / 5,000 | 25,500 / 10,500 | 10,500 / 5,000 | 5,000 / NP |
| **I-2** | UL / UL | UL / UL | 15,000 / NP | NP / NP | NP / NP | NP / NP | NP / NP | NP / NP | NP / NP |
| **I-3** | UL / UL | UL / UL | 15,000 / 10,000 | 10,000 / 7,500 | 10,500 / 10,000 | 7,500 / 5,000 | 12,000 / 7,500 | 7,500 / 5,000 | NP / NP |
| **I-4** | UL / UL | UL / UL | 25,500 / 15,000 | 10,500 / NP | 14,000 / 10,500 | 10,500 / 5,000 | 25,500 / 10,500 | 10,500 / 5,000 | 5,000 / NP |
| **M** | UL / UL | UL / UL | 25,000 / 12,500 | 12,500 / 6,500 | 18,500 / 12,500 | 12,500 / 6,500 | 20,500 / 12,500 | 12,500 / 6,500 | 6,500 / NP |
| **R-1** | UL / UL | UL / UL | 24,000 / 16,000 | 16,000 / 8,500 | 24,000 / 16,000 | 16,000 / 8,500 | 20,500 / 12,000 | 12,000 / 7,000 | 7,000 / NP |
| **R-2** | UL / UL | UL / UL | 24,000 / 16,000 | 16,000 / 8,500 | 24,000 / 16,000 | 16,000 / 8,500 | 20,500 / 12,000 | 12,000 / 7,000 | 7,000 / NP |
| **R-3** | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL |
| **R-4** | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL | UL / UL |
| **S-1** | UL / UL | UL / UL | 26,000 / 17,500 | 9,000 / 4,000 | 17,500 / 13,000 | 13,000 / 5,500 | 26,000 / 10,000 | 10,000 / 5,000 | 5,000 / NP |
| **S-2** | UL / UL | UL / UL | 52,500 / 26,000 | 26,000 / 13,000 | 37,500 / 26,000 | 26,000 / 13,000 | 52,500 / 26,000 | 26,000 / 13,000 | 13,000 / NP |
| **U** | UL / UL | UL / UL | 35,500 / 18,000 | 9,000 / 4,500 | 18,000 / 9,000 | 9,000 / 4,500 | 18,000 / 9,000 | 9,000 / 4,500 | 4,500 / 2,500 |

**Frontage Increase (If):** Per Section 506.3 — If a building has more than 25% of its perimeter on a public open space, an area increase factor (If) may be applied. Formula: At = [Aa + (Aa × If) + (Aa × Is)] where If = (F/P − 0.25) × W/30.

**Sprinkler Increase (Is):** Per Section 506.4 — Sprinklered buildings per SBC 801 Section 903.3.1.1: Is = 300% (single-story) or 200% (multi-story). Per 903.3.1.2: Is = 100% (single-story only).
$$,
  ARRAY['table 506.2','506.2','506','allowable area','floor area','fire area','area factor',
        'construction type','occupancy group','chapter 5','sprinkler increase','frontage increase',
        'جدول 506.2','المساحة المسموحة','مساحة البناء','نوع الإنشاء'],
  'Areas in sq ft per floor per fire area. 1 sq ft = 0.0929 m². Sprinkler increase (Is): 300% single-story, 200% multi-story per 903.3.1.1.',
  ARRAY['503']
)
ON CONFLICT (table_id, source_code, edition) DO UPDATE
  SET content_md = EXCLUDED.content_md,
      keywords   = EXCLUDED.keywords,
      notes      = EXCLUDED.notes,
      supersedes = EXCLUDED.supersedes;
