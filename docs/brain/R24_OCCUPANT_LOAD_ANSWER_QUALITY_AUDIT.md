# R24 — Occupant Load Answer Quality Audit

**Date:** 2026-05-07  
**Task:** TASK 2 — Audit advisory answer quality for occupant_load  
**Query tested:** "ما متطلبات الحمل الإشغالي لمحل تجاري؟"  
**Result:** DEFICIENCY CONFIRMED — gross/net confusion, table values absent from first answer

---

## Current Behavior (before R24 fix)

The model's first advisory response to "ما متطلبات الحمل الإشغالي لمحل تجاري؟":

**What it does:**
- Routes correctly to `wf_occupant_load` via B2 router ✓
- Mentions Table 1004.5 ✓
- Asks for: floor area, floor level, storage/office breakdown ✓

**Deficiencies:**
1. **Gross vs net confusion** — says "المساحة الصافية" (net area) for Mercantile, but SBC 201 Table 1004.5 explicitly uses *gross* for all Mercantile rows.
2. **No table values upfront** — does not state the actual factors (2.8 / 5.6 / 28 m²/person) before asking for inputs. A proper advisory answer gives engineering value first.
3. **Missing floor differentiation** — does not explain WHY the floor level matters (different factor: 2.8 vs 5.6).
4. **No Mercantile-specific breakdown** — treats all areas as one factor instead of differentiating sales from storage.

---

## SBC 201 Table 1004.5 — Mercantile Ground Truth

| Area | Factor | Basis |
|---|---|---|
| Mercantile, basement and grade floor | 2.8 m²/person | **Gross** |
| Mercantile, areas on other floors | 5.6 m²/person | **Gross** |
| Storage, stock, and shipping areas | 28 m²/person | (not specified as net/gross in row) |

Source: SBC 201 Table 1004.5 "MAXIMUM FLOOR AREA ALLOWANCES PER OCCUPANT"  
Page: 213, chunk ID: `sbc-201-table-1004-5`

---

## Required Answer Structure (post-R24)

```
1. "المرجع الحاكم: SBC 201 جدول Table 1004.5."

2. "للمحال التجارية (Mercantile - Group M)، المعامل يختلف حسب الطابق:"
   - الطابق الأرضي والبدروم: 2.8 م²/شخص (gross)
   - الطوابق الأخرى: 5.6 م²/شخص (gross)
   - مناطق التخزين والبضاعة والشحن: 28 م²/شخص

3. "لحساب الحمل الإشغالي الدقيق، أحتاج:"
   - مساحة منطقة البيع gross (المساحة الإجمالية، ليس الصافية)
   - الطابق (أرضي/بدروم أم غيره)
   - مساحة التخزين والمكاتب إن وجدت
```

---

## Root Cause

The `safe_answer_rules` in the brain B1 package for `wf_occupant_load` contains only:
```
"Cite Table 1004.5 with page anchor."
```

This is insufficient — it does not:
- Specify gross vs net for Mercantile
- Require stating the actual table values before asking for inputs
- Forbid "المساحة الصافية" for Mercantile rows

---

## Fix Applied (TASK 3)

R24 injects 6 code-level rules into `result.safe_answer_rules` via `workflow_constraints.ts`
when `workflow_id === "wf_occupant_load"`. See `R24_OCCUPANT_LOAD_CONSTRAINT_FIX_RESULT.md`.
