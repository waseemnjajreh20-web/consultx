-- SBC 801 Group M — structured-evidence seed for Sections 903.2.7 and 907.2.7
--
-- Idempotent INSERT … ON CONFLICT DO UPDATE on public.sbc_code_tables.
-- No schema changes; no row deletes; only adds two rows for the two
-- Group-M (Mercantile) sub-clauses that the live Advisory pipeline cited
-- as "expected references" because no structured row backed them.
--
-- Source text (verbatim, OCR-clean):
--   903.2.7 / 903.2.7.1 / 903.2.7.2 — D:\sbc_consultx\extracted_sections.md, lines 869-897
--   907.2.7 / 907.2.7.1            — D:\sbc_consultx\extracted_907_909.txt, lines 1312-1409
--
-- Mirrors the existing pattern of supabase/migrations/20260410000003_sbc_tables_seed.sql.
-- Touches only public.sbc_code_tables. No payment, Enterprise, GraphRAG, corpus,
-- or sbc_documents writes.
--
-- Rollback (manual, NOT auto-applied):
--   DELETE FROM public.sbc_code_tables
--    WHERE table_id IN ('903.2.7','907.2.7')
--      AND source_code = 'SBC 801'
--      AND edition = '2024';

BEGIN;

-- ============================================================
-- 903.2.7 — Group M (Mercantile) Automatic Sprinkler System
-- Source: SBC 801-CC-2024 Chapter 9, mirrors SBC 201 Chapter 9
-- ============================================================
INSERT INTO public.sbc_code_tables
  (table_id, table_title, source_code, edition, chapter, section, content_md, keywords, notes, supersedes)
VALUES (
  '903.2.7',
  'Group M — Automatic Sprinkler System (Mercantile)',
  'SBC 801',
  '2024',
  9,
  '903.2',
$$## Section 903.2.7 — Group M (Mercantile)
**SBC 801 | Chapter 9 — Fire Protection Systems | Section 903.2 (Where Required) | Section 903.2.7**

**903.2.7 Group M.** An automatic sprinkler system shall be provided throughout buildings containing a Group M occupancy where one of the following conditions exists:

1. A Group M fire area exceeds 1115 m².
2. A Group M fire area is located more than three stories above grade plane.
3. The combined area of all Group M fire areas on all floors, including any mezzanines, exceeds 2230 m².

**903.2.7.1 High-piled storage.** An automatic sprinkler system shall be provided as required in Chapter 32 in all buildings of Group M where storage of merchandise is in high-piled or rack storage arrays.

**903.2.7.2 Group M upholstered furniture or mattresses.** An automatic sprinkler system shall be provided throughout a Group M fire area where the area used for the display and sale of upholstered furniture or mattresses exceeds 465 m².

> **Cross-reference:** Section 907.2.7 Exception 2 ties manual fire alarm relief to the presence of an automatic sprinkler system installed per Section 903.3.1.1 with notification appliances activated by sprinkler waterflow.

> **SI thresholds (verbatim from the code):** 1115 m² fire-area threshold; 2230 m² combined-floors threshold; 465 m² upholstered-furniture/mattress display threshold.
$$,
  ARRAY[
    'sprinkler','automatic sprinkler','automatic sprinkler system','sprinkler required',
    'group m','group-m','mercantile','retail','retail store','retail shop','محلات تجارية','تجزئة','مجموعة m',
    'fire area','combined fire area','high-piled storage','upholstered furniture','mattresses',
    '903.2.7','903.2.7.1','903.2.7.2','section 903','sbc 801','sbc801',
    'رش','رشاش','رش آلي','نظام الرش الآلي','مساحة','حد المساحة',
    '1115','1,115','2230','2,230','465'
  ],
  'Thresholds: 1115 m² (single fire area), 2230 m² (combined floors incl. mezzanines), 465 m² (upholstered furniture/mattress display). 903.2.7.1 cross-references Chapter 32 for high-piled storage. Mirrors SBC 201 Section 903.2.7.',
  ARRAY[]::text[]
)
ON CONFLICT (table_id, source_code, edition) DO UPDATE
  SET content_md = EXCLUDED.content_md,
      table_title = EXCLUDED.table_title,
      chapter    = EXCLUDED.chapter,
      section    = EXCLUDED.section,
      keywords   = EXCLUDED.keywords,
      notes      = EXCLUDED.notes,
      supersedes = EXCLUDED.supersedes;

-- ============================================================
-- 907.2.7 — Group M (Mercantile) Manual Fire Alarm System
-- Source: SBC 801-CC-2024 Chapter 9
-- ============================================================
INSERT INTO public.sbc_code_tables
  (table_id, table_title, source_code, edition, chapter, section, content_md, keywords, notes, supersedes)
VALUES (
  '907.2.7',
  'Group M — Manual Fire Alarm System (Mercantile)',
  'SBC 801',
  '2024',
  9,
  '907.2',
$$## Section 907.2.7 — Group M (Mercantile)
**SBC 801 | Chapter 9 — Fire Protection Systems | Section 907.2 (Where Required, New Buildings) | Section 907.2.7**

**907.2.7 Group M.** A manual fire alarm system that activates the occupant notification system in accordance with Section 907.5 shall be installed in Group M occupancies where one of the following conditions exists:

1. The combined Group M occupant load of all floors is 500 or more persons.
2. The Group M occupant load is more than 100 persons above or below the lowest level of exit discharge.

**Exceptions:**

1. A manual fire alarm system is not required in covered or open mall buildings complying with Section 402 of SBC 201.
2. Manual fire alarm boxes are not required where the building is equipped throughout with an automatic sprinkler system installed in accordance with Section 903.3.1.1 and the occupant notification appliances will automatically activate throughout the notification zones upon sprinkler waterflow.

> **Commentary cross-reference:** Buildings with a fire area containing a Group M occupancy in excess of 1115 m² must be equipped with an automatic sprinkler system complying with Section 903.2.7.

**907.2.7.1 Occupant notification.** During times that the building is occupied, the initiation of a signal from a manual fire alarm box or from a waterflow switch shall not be required to activate the alarm notification appliances when an alarm signal is activated at a constantly attended location from which evacuation instructions shall be initiated over an emergency voice/alarm communication system installed in accordance with Section 907.5.2.2.

> **Occupancy thresholds (verbatim):** 500 occupants combined across all floors; or 100 occupants above/below the lowest level of exit discharge. The two thresholds are independent triggers.
$$,
  ARRAY[
    'fire alarm','manual fire alarm','manual fire alarm system','manual pull','pull station',
    'group m','group-m','mercantile','retail','retail store','retail shop','محلات تجارية','تجزئة','مجموعة m',
    'occupant notification','notification appliances','occupant load','exit discharge',
    'manual fire alarm box','manual fire alarm boxes','waterflow','waterflow switch',
    'covered mall','open mall','mall building','automatic sprinkler exception',
    '907.2.7','907.2.7.1','section 907','sbc 801','sbc801',
    'إنذار','إنذار حريق','نظام إنذار','إنذار يدوي','إخطار الشاغلين','حمل الإشغال','مستوى التفريغ',
    'إنذار 500','100 شخص','مول مغطى','مول مفتوح','استثناء','رش آلي'
  ],
  'Occupancy thresholds (independent): 500 combined or 100 above/below exit discharge. Exception 1: covered/open mall buildings per SBC 201 Section 402. Exception 2: full sprinkler per Section 903.3.1.1 with waterflow-activated notification eliminates the manual-pull-box requirement. Cross-references the Section 903.2.7 Mercantile sprinkler trigger (1115 m²).',
  ARRAY[]::text[]
)
ON CONFLICT (table_id, source_code, edition) DO UPDATE
  SET content_md = EXCLUDED.content_md,
      table_title = EXCLUDED.table_title,
      chapter    = EXCLUDED.chapter,
      section    = EXCLUDED.section,
      keywords   = EXCLUDED.keywords,
      notes      = EXCLUDED.notes,
      supersedes = EXCLUDED.supersedes;

COMMIT;
