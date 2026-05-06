# Advisory Brain B2 — Controlled Enablement Plan

**Date:** 2026-05-06  
**Phase:** B2 Phase 9 — Controlled Enablement

---

## Overview

Four flags, enabled one at a time in staging → production order.
Each stage has smoke questions, pass/fail criteria, and a rollback command.

---

## Stage 1 — Brain Loader Only (`ADVISORY_BRAIN_B2_ENABLED=1`)

**Command (staging):**
```bash
supabase secrets set ADVISORY_BRAIN_B2_ENABLED=1 --project-ref <staging-ref>
supabase functions deploy fire-safety-chat --project-ref <staging-ref>
```

**Smoke questions:**
1. (Any Advisory query) — fire a standard occupant-load question
2. (Any Advisory greeting) — fire "مرحبا كيف الحال؟"

**Pass criteria:**
- Response content identical to pre-B2 (no answer change)
- Log shows: `[AdvisoryBrainB2] flag=on package_loaded=true nodes=440`
- No error log from loader
- Latency delta < 200 ms (10-min cache applies after first request)

**Fail criteria:**
- `package_loaded=false reason=bucket_files_not_found` → upload runtime package to bucket first
- Any 5xx error from the function
- Answer content differs from pre-B2 baseline

**Rollback:**
```bash
supabase secrets unset ADVISORY_BRAIN_B2_ENABLED --project-ref <ref>
```

---

## Stage 2 — Workflow Router (`ADVISORY_BRAIN_B2_ROUTER_ENABLED=1`)

Requires Stage 1 passing.

**Command:**
```bash
supabase secrets set ADVISORY_BRAIN_B2_ROUTER_ENABLED=1 --project-ref <staging-ref>
```

**Smoke questions:**
1. "كم الحمل الإشغالي لمساحة مكاتب 500 م²؟" — expected: `occupant_load`
2. "كم عدد المخارج لطابق 700 شخص؟" — expected: `egress`
3. "متى تجب الرشاشات التلقائية؟" — expected: `sprinkler`
4. "مرحبا كيف الحال؟" — expected: `non_code`

**Pass criteria:**
- Log shows: `[RouterB2] selected_workflow=wf_occupant_load confidence=high ...`
- Routing matches expected domain for each smoke question
- Response content identical to Stage 1 (router is diagnostics-only)

**Fail criteria:**
- `selected_workflow=general_code_lookup` for specific domain questions
- Any routing mismatch for the 4 smoke questions
- Answer content changes

**Rollback:**
```bash
supabase secrets unset ADVISORY_BRAIN_B2_ROUTER_ENABLED --project-ref <ref>
```

---

## Stage 3 — Evidence Augmentation (`ADVISORY_BRAIN_B2_EVIDENCE_ENABLED=1`)

Requires Stages 1 + 2 passing.

**Command:**
```bash
supabase secrets set ADVISORY_BRAIN_B2_EVIDENCE_ENABLED=1 --project-ref <staging-ref>
```

**Smoke questions:**
1. "ما الحمل الإشغالي لمكاتب 500 م²؟" — should prompt for space_function if missing
2. "ما الحمل الإشغالي لمكاتب group B مساحة 500 م²؟" — full inputs; should answer with table cite
3. "ما متطلبات الرشاشات لمبنى 903؟" — should show parking-lot warning in log

**Pass criteria:**
- Log shows: `[EvidenceB2] workflow=wf_occupant_load hints=N parking_lot=N missing_inputs=N`
- Log shows: `[EvidenceB2] Overlay injected: hints=...`
- For Q1: model asks for missing floor area (missing_inputs detected)
- For Q2: model cites Table 1004.5 with page reference
- For Q3: log shows `parking_lot=N` (N ≥ 1)
- No answer hallucination — all stated numbers traceable to retrieved chunks

**Fail criteria:**
- Model invents numeric values not in retrieved chunks
- Model omits citation for a tabled value
- Any exception from augmentWithWorkflow (check logs)

**Rollback:**
```bash
supabase secrets unset ADVISORY_BRAIN_B2_EVIDENCE_ENABLED --project-ref <ref>
```

---

## Stage 4 — Dynamic Thinking UX (`ADVISORY_DYNAMIC_THINKING_ENABLED=1`)

Requires Stages 1 + 2 + 3 passing.

**Command:**
```bash
supabase secrets set ADVISORY_DYNAMIC_THINKING_ENABLED=1 --project-ref <staging-ref>
```

**Smoke questions:**
1. "كم الحمل الإشغالي لمساحة 500 م²؟" — check thinking events in streaming response
2. (With missing inputs) "ما الحمل الإشغالي؟" — should show inputs_check event

**Pass criteria:**
- Log shows: `[ThinkingB2] N thinking events built for workflow=wf_occupant_load`
- Frontend receives domain-specific thinking messages (not static strings)
- No forbidden static phrases emitted (جاري البحث بالمصادر etc.)
- Arabic messages for Arabic queries; English messages for English queries

**Fail criteria:**
- Static thinking strings still emitted
- Thinking events exceed 5 per query
- Any frontend error from ThinkingEvent format change

**Rollback:**
```bash
supabase secrets unset ADVISORY_DYNAMIC_THINKING_ENABLED --project-ref <ref>
```

---

## Production Promotion

After all 4 stages pass in staging:
```bash
# Enable all four flags in production (one at a time, with monitoring between)
supabase secrets set ADVISORY_BRAIN_B2_ENABLED=1 --project-ref <prod-ref>
# Monitor for 15 min → then:
supabase secrets set ADVISORY_BRAIN_B2_ROUTER_ENABLED=1 --project-ref <prod-ref>
# Monitor for 15 min → then:
supabase secrets set ADVISORY_BRAIN_B2_EVIDENCE_ENABLED=1 --project-ref <prod-ref>
# Monitor for 30 min → then:
supabase secrets set ADVISORY_DYNAMIC_THINKING_ENABLED=1 --project-ref <prod-ref>
```

**Bucket prerequisite:** Before Stage 1 can pass in any environment, upload runtime package files
to the `ssss` bucket under `brain_full_v1/`:
```
advisory_brain_manifest.json
advisory_nodes_compact.json
advisory_orphans_compact.json
advisory_thresholds_compact.json
advisory_edges_compact.json
advisory_workflows_compact.json
advisory_validation_cases_compact.json
```

Source: `generated/consultx_brain_full/v4/advisory_brain/runtime_package/`

---

## Full Rollback (all flags)
```bash
supabase secrets unset ADVISORY_BRAIN_B2_ENABLED --project-ref <ref>
supabase secrets unset ADVISORY_BRAIN_B2_ROUTER_ENABLED --project-ref <ref>
supabase secrets unset ADVISORY_BRAIN_B2_EVIDENCE_ENABLED --project-ref <ref>
supabase secrets unset ADVISORY_DYNAMIC_THINKING_ENABLED --project-ref <ref>
```
