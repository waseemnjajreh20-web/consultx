---
record_id: group-m-fire-protection-advisory-tree-v1
use_case: group-m-fire-protection-required
applicable_modes:
  - advisory
not_legal_source: true
related_sources:
  - sbc-201-section-309
  - sbc-801-section-903
  - sbc-801-section-903.2.7
  - sbc-801-section-903.2.7.1
  - sbc-801-section-903.2.7.2
  - sbc-801-section-907
  - sbc-801-section-907.2.7
  - sbc-801-section-907.2.7.1
related_relations:
  - rel-309-to-903-2-7-classification
  - rel-309-to-907-2-7-classification
  - rel-903-2-7-parent-child-1
  - rel-903-2-7-parent-child-2
  - rel-907-2-7-parent-child-1
  - rel-fire-area-1115-triggers-903-2-7
  - rel-combined-area-2230-triggers-903-2-7
  - rel-upholstered-465-triggers-903-2-7-2
  - rel-occupant-500-triggers-907-2-7
  - rel-occupant-100-discharge-triggers-907-2-7
  - rel-907-2-7-exception-mall
  - rel-907-2-7-exception-sprinkler-waterflow
last_reviewed: 2026-05-01
---

# Group M Mercantile — Fire-Protection Advisory Decision Tree

This decision tree guides Advisory reasoning. It is not legal source. Cite Section 903.2.7 / Section 907.2.7 verbatim from sources.

The Advisory output produced by this tree must always be paired with the corresponding source citations from SBC 201 (Section 309) and SBC 801 (Section 903 and Section 907). The tree itself paraphrases triggers; final dispositions must reference the source text.

## Missing-info checklist

Before evaluating the steps, confirm every required input. If any are missing, ask the user using the bilingual prompts below and stop until answers are received.

Required inputs:

- floor_count
- floor_area_each_floor_m2
- stories_above_grade
- existing_sprinkler_yes_no
- is_covered_or_open_mall
- upholstered_furniture_display_area_m2
- occupant_load_total
- occupant_load_above_or_below_exit_discharge

Bilingual clarifying questions:

English:
1. How many floors does the building have, and what is the area (in square metres) of each floor?
2. How many stories are located above the grade plane?
3. Is the building (or the Group M tenant space) currently sprinklered?
4. Is the building a covered mall or open mall complying with SBC 201 Section 402?
5. Is upholstered furniture or mattresses displayed and offered for sale, and if so, what is the total display + sale area in square metres?
6. What is the total occupant load for all Group M floors combined?
7. What is the occupant load located above, or below, the lowest level of exit discharge?

Arabic (use "القسم" — never the section symbol):
1. كم عدد الطوابق في المبنى، وما هي مساحة كل طابق بالمتر المربع؟
2. كم عدد الطوابق الواقعة فوق منسوب التسوية؟
3. هل المبنى (أو حيز المجموعة M) مزود حاليا بشبكة رشاشات؟
4. هل المبنى مجمع تجاري مغطى أو مفتوح يتوافق مع القسم 402 من كود البناء السعودي 201؟
5. هل يتم عرض وبيع أثاث منجد أو مراتب، وإذا نعم فما إجمالي مساحة العرض والبيع بالمتر المربع؟
6. ما إجمالي حمولة الإشغال لجميع طوابق المجموعة M مجتمعة؟
7. ما حمولة الإشغال الواقعة فوق أو تحت أدنى مستوى لتفريغ الخروج؟

---

## 1. Classify occupancy

Confirm that the building or tenant space being assessed is a Mercantile (Group M) occupancy under SBC 201 Section 309. The Advisory must capture the user's free-text use description and validate it against the Group M scope (display and sale of merchandise, accessible to the public).

If the description is ambiguous or the use does not fall within Group M, escalate: ask the user "what occupancy group?". If the answer is not Group M, hand off to the general decision tree rather than continuing with the M-specific logic.

**Sources:** sbc-201-section-309
**Relations:** (none required at this step)

## 2. Identify missing inputs

Verify that every required input listed in the checklist above has been supplied. If any input is missing, emit the Arabic and English clarifying questions above and stop the evaluation. Do not infer values silently — assumptions must be flagged later in Step 10.

**Sources:** (procedural step — references Section 903.2.7 and Section 907.2.7 inputs)
**Relations:** rel-309-to-903-2-7-classification, rel-309-to-907-2-7-classification

## 3. Compute Group M fire area per floor

For each floor, compute the Group M fire area. If any single fire area on any floor exceeds 1115 square metres, set `sprinkler_required = true`. This is the per-floor area trigger established in Section 903.2.7.

**Sources:** sbc-801-section-903.2.7
**Relations:** rel-fire-area-1115-triggers-903-2-7

## 4. Check stories-above-grade trigger

If a Group M fire area is located more than three stories above the grade plane, set `sprinkler_required = true`, irrespective of area. This is an independent trigger under Section 903.2.7.

**Sources:** sbc-801-section-903.2.7
**Relations:** rel-903-2-7-parent-child-1

## 5. Compute combined Group M area

Sum the Group M fire areas across all floors, including mezzanines. If the combined total exceeds 2230 square metres, set `sprinkler_required = true`. This is the cumulative area trigger under Section 903.2.7.

**Sources:** sbc-801-section-903.2.7
**Relations:** rel-combined-area-2230-triggers-903-2-7

## 6. Sub-clause check 903.2.7.1 — high-piled storage

If merchandise is stored in high-piled or rack-storage arrays, Chapter 32 of SBC 801 also applies in addition to Section 903.2.7. Chapter 32 is out of scope for V1. Mark this branch as an analytical follow-up so Advisory flags it for human review rather than producing a final verdict.

**Sources:** sbc-801-section-903.2.7.1
**Relations:** rel-903-2-7-parent-child-1

## 7. Sub-clause check 903.2.7.2 — upholstered furniture

If the display and sale area dedicated to upholstered furniture or mattresses exceeds 465 square metres, set `sprinkler_required = true` under Section 903.2.7.2. This trigger is independent of the per-floor (Step 3) and combined-area (Step 5) thresholds.

**Sources:** sbc-801-section-903.2.7.2
**Relations:** rel-upholstered-465-triggers-903-2-7-2, rel-903-2-7-parent-child-2

## 8. Group M alarm trigger 907.2.7

Evaluate the manual fire alarm triggers for Group M:

- If the combined Group M occupant load on all floors equals or exceeds 500, set `manual_fire_alarm_required = true`.
- If the occupant load located above, or below, the lowest level of exit discharge exceeds 100, set `manual_fire_alarm_required = true`.

Either trigger alone is sufficient.

**Sources:** sbc-801-section-907.2.7
**Relations:** rel-occupant-500-triggers-907-2-7, rel-occupant-100-discharge-triggers-907-2-7, rel-907-2-7-parent-child-1

## 9. Apply 907.2.7 Exceptions

If `manual_fire_alarm_required` was set to true in Step 8, evaluate the Section 907.2.7 exceptions:

- Exception 1 — Covered or open mall: if the building is a covered mall building or open mall building complying with SBC 201 Section 402, set `manual_fire_alarm_required = false`.
- Exception 2 — Sprinklered with waterflow notification: if the building is fully sprinklered per Section 903.3.1.1 and occupant notification is initiated by waterflow, manual fire alarm boxes are optional. Note: the underlying alarm system requirement may still apply — do not infer a blanket exemption.

**Sources:** sbc-801-section-907.2.7, sbc-801-section-907.2.7.1
**Relations:** rel-907-2-7-exception-mall, rel-907-2-7-exception-sprinkler-waterflow

## 10. Render verdict and missing-info checklist

Produce two separate verdicts:

- `sprinkler_required` — based on Steps 3 through 7.
- `manual_fire_alarm_required` — based on Steps 8 and 9.

If any input was assumed (rather than supplied by the user), mark each verdict as `conditional` and list every assumption in plain language inside the Advisory output. The Advisory must also restate the missing-info checklist so the user knows precisely which answers would convert a `conditional` verdict into a definitive one.

Always cite Section 903.2.7 and Section 907.2.7 verbatim from the source files alongside the verdict — this synthesis is not legal source.

**Sources:** sbc-801-section-903.2.7, sbc-801-section-907.2.7
**Relations:** rel-309-to-903-2-7-classification, rel-309-to-907-2-7-classification
