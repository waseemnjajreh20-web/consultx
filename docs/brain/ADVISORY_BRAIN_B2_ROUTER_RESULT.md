# Advisory Brain B2 — Workflow Router Result

**Date:** 2026-05-06  
**Phase:** B2 Phase 3 — Workflow Router  
**File:** `supabase/functions/fire-safety-chat/workflow_router.ts`  
**Flag:** `ADVISORY_BRAIN_B2_ROUTER_ENABLED`

---

## What Was Built

`workflow_router.ts` — a pure, deterministic classifier that maps Advisory queries to one of
8 B1 workflows (or non_code / general_code_lookup).

### Classification Logic (priority order)
1. Explicit code refs (`903.2.7`, `Table 1004.5`) → +3 pts
2. Arabic domain keywords → +2 pts each (max 3)
3. English domain keywords → +1 pt each (max 3)
4. Fallback: `general_code_lookup` if score = 0

### Flag Behavior

| Flag value | Behavior |
|-----------|----------|
| unset / "0" | `isRouterEnabled()` → false; `routeAdvisoryQuery()` returns null; no-op |
| "1" | Classifies query; emits `[RouterB2]` diagnostic; NO answer/retrieval change |

### Diagnostic Emitted (flag ON)
```
[RouterB2] selected_workflow=wf_occupant_load confidence=high source_family=SBC201
  required_inputs=2 parking_lot_refs=0 matched_by=explicit_ref:1004.5,keyword_ar:حمل الإشغال
```

---

## Domains Supported

| Domain | Workflow ID | Key identifiers |
|--------|------------|-----------------|
| occupant_load | wf_occupant_load | 1004.5, جدول 1004, floor area allowance |
| egress | wf_egress | مخارج, 1006, exit, travel distance |
| occupancy_classification | wf_occupancy_classification | تصنيف الإشغال, Group M, group b |
| sprinkler | wf_sprinkler | رشاشات, 903, automatic sprinkler |
| fire_alarm | wf_fire_alarm | إنذار, 907, alarm system |
| fire_pump | wf_fire_pump | مضخة الحريق, 913, fire pump |
| standpipe | wf_standpipe | أنبوب ثابت, 905, standpipe |
| smoke_control | wf_smoke_control | تحكم بالدخان, 909, smoke control |
| non_code | — | greetings, casual |
| general_code_lookup | — | fallback |

---

## Tests (22/22 PASS — node scripts/validate_advisory_brain_b2.cjs)

| Test Query | Expected Domain | Result |
|-----------|----------------|--------|
| اعطني قيمة من جدول 1004.5 | occupant_load | PASS |
| مبنى Group M كيف يُصنَّف | occupancy_classification | PASS |
| كم عدد المخارج لطابق 700 شخص؟ | egress | PASS |
| متى تجب الرشاشات التلقائية؟ | sprinkler | PASS |
| ما متطلبات نظام إنذار الحريق؟ | fire_alarm | PASS |
| ما سعة مضخة الحريق لـ 20 طابق؟ | fire_pump | PASS |
| what standpipe class is required? | standpipe | PASS |
| مرحبا كيف الحال؟ | non_code | PASS |
| vc_01 Table 1004.5 query | occupant_load | PASS |
| vc_02 min exits query | egress | PASS |

---

## Mode Isolation

- Advisory mode: router called from B2 bootstrap block (if mode === "standard")
- Main mode: never reaches router
- Analytical mode: never reaches router

---

## Verdict: PASS — Router added, diagnostics-only when ON, flag OFF by default.
