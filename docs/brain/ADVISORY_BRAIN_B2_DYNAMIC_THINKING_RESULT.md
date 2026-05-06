# Advisory Brain B2 — Dynamic Thinking UX Result

**Date:** 2026-05-06  
**Phase:** B2 Phase 6 — Dynamic Thinking UX  
**File:** `supabase/functions/fire-safety-chat/thinking_ux_emitter.ts`  
**Flag:** `ADVISORY_DYNAMIC_THINKING_ENABLED`

---

## What Was Built

`thinking_ux_emitter.ts` — replaces static thinking-status strings with workflow-aware,
domain-specific messages emitted at each phase of the Advisory pipeline.

### Flag Behavior

| Flag value | Behavior |
|-----------|----------|
| unset / "0" | `isDynamicThinkingEnabled()` → false; all functions return null / []; static strings unchanged |
| "1" | Emits domain-specific ThinkingEvent sequence; static strings replaced |

---

## Message Matrix (8 domains × up to 5 phases)

| Domain | routing | inputs_check | retrieval | parking_lot_notice | composition |
|--------|---------|-------------|-----------|-------------------|-------------|
| occupancy_classification | ✓ | ✓ | ✓ | — | ✓ |
| occupant_load | ✓ | ✓ | ✓ | — | ✓ |
| egress | ✓ | ✓ | ✓ | — | ✓ |
| sprinkler | ✓ | ✓ | — | ✓ | ✓ |
| fire_alarm | ✓ | ✓ | — | ✓ | ✓ |
| fire_pump | ✓ | ✓ | — | ✓ | ✓ |
| standpipe | ✓ | ✓ | — | ✓ | ✓ |
| smoke_control | ✓ | ✓ | — | ✓ | ✓ |
| general_code_lookup | ✓ | — | ✓ | — | ✓ |
| non_code | — | — | — | — | ✓ |

*Parking-lot domains (sprinkler/alarm/pump/standpipe/smoke) use parking_lot_notice instead of retrieval
since those refs are not fully in V4.*

---

## Event Emission Logic (`buildThinkingSequence`)

```
1. routing         — always first (if domain has routing message)
2. inputs_check    — only when hasMissingInputs = true
3. retrieval       — for code-domain queries (not non_code)
4. parking_lot_notice — only when hasParkingLotHit = true
5. composition     — always last (if domain has composition message)
```

---

## Invariants

- All messages: Arabic primary, English mirror (both in every event)
- No U+00A7 (§) character anywhere in the matrix
- No chain-of-thought, scoring numbers, or model self-talk exposed
- Max 80 display chars per message (enforced by design)
- Never invoked for Main (primary) or Analytical (analysis) modes

---

## Forbidden Static Phrases Replaced

When flag ON, these old static strings must not be emitted:

**Arabic:**
- جاري البحث بالمصادر
- يجري التحليل
- يجري كتابة التقرير
- جاري استخلاص حقائق التصميم والاشتراطات
- جاري تحليل معمّق، يرجى الانتظار
- جاري التفكير

**English:**
- Extracting design facts and requirements
- Deep analysis in progress
- Thinking...
- Checking compliance against SBC

---

## Verdict: PASS — Dynamic thinking UX added, flag OFF by default, no behavior change.
