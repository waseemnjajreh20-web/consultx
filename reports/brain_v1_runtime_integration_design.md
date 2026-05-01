# Brain V1 Runtime Integration Design — Audit Report

**Audited:** 2026-05-01  
**Schema Version:** 1.0  
**Auditor:** SUB-AGENT F — Runtime Integration Design Auditor  

---

## Executive Summary

This audit examines the integration pathway for Brain V1 canonical chunks and sidecars (relations, facts, decision trees) into the existing ConsultX fire-safety-chat advisory system. The recommended route is **Hybrid (Route C)**: JSON uploads to bucket `ssss` for both canonical chunks and sidecar metadata, with **zero DB writes** and gating only on Group M / Mercantile queries in Advisory and Analytical modes. Primary mode is **unaffected**.

**Key Finding:** The existing `fetchSBCContext` keyword path, Evidence Ledger (Step 4), and citation verifier (`verifyAdvisoryCitations`) are architecturally ready to accept Brain V1 artifacts without runtime code changes to core streaming or verification logic.

---

## Answer to Each Question

### Question 1: JSON Chunk Upload Pattern & Chunker Shape

**Can Brain V1 canonical chunks be uploaded as JSON files and picked up by the existing `fetchSBCContext` keyword path?**

**Answer:** Yes. The storage retrieval in `fetchSBCContext` (lines 1871-1932) lists files from bucket `ssss`, filters by name patterns containing `"chunk"` and suffix `.json`, and selects candidates based on chapter/page-range scoring. 

**Filename pattern:** The function accepts `*_extracted_chunks.json` or `*_extracted.json` (see `sourceMetadata.ts` lines 8-10).

**Expected chunk shape:**
```json
[
  {
    "text": "Section 903.2.7 Group M. An automatic sprinkler system shall be provided...",
    "pageStart": 869,
    "pageEnd": 897,
    "source": "SBC_801_Ch9_GroupM_canonical_v1",
    "section_number": "903.2.7"
  }
]
```

---

### Question 2: Exact Fields Returned & Frontend Flow

**What are the EXACT fields `fetchSBCContext` returns and how do they reach the frontend?**

**Answer:** The function signature (line 1846) returns:
```typescript
Promise<{ context: string; files: string[]; sourceMeta: SourcePageMeta[] }>
```

**SourcePageMeta shape** (sourceMetadata.ts lines 33-40):
- file: string
- pageStart: number | null
- pageEnd: number | null
- precision: SourcePrecision
- sectionRef: string | null
- sectionConfidence: SectionConfidence

**Frontend headers:**
- X-SBC-Sources: comma-delimited filenames
- X-SBC-Source-Meta: JSON array of ChunkPageMeta

ChatInterface.tsx (lines 663-668) extracts headers, resolveSourceMeta maps to SourceMeta, Step 3.2 hard-stop validates family match.

---

### Question 3: Evidence Ledger & canonical_verbatim with section_number

**Can the Evidence Ledger treat canonical_verbatim chunks as `sectionConfidence: 'high'` if `section_number` is provided?**

**Answer:** **Conditionally yes.** If `section_number` matches the verbatim heading in `text`, set `sectionConfidence: 'high'`. Otherwise set `'medium'`. The verifier (line 1258-1266) respects ledger confidence and will not downgrade if ledger says high.

---

### Question 4: Relation/Fact Sidecars in Advisory Path

**How should relation/fact sidecars be loaded without changing the buffered streaming?**

**Answer:** Load sidecars **synchronously before streaming starts**, prepend as non-citable prompt block (4-6 lines). The buffered advisory path (lines 5407-5450) will not be disrupted because the verifier checks only the model output against the ledger—sidecars are never in the ledger.

---

### Question 5: Keep Main Mode Fast

**How to keep Main mode fast (no relation/fact loads)?**

**Answer:** Primary mode (lines 5084-5107) already loads zero documents. Add a guard before sidecar load to skip for Primary. No change needed.

---

### Question 6: Advisory Cite Relations/Facts Without Legal Source

**How to let Advisory use relations/facts without citing them as legal source?**

**Answer:** Prepend sidecar block with `"NOT CITABLE — REASONING AID ONLY"` header. Any attempt to cite them will be parsed by verifyAdvisoryCitations, not found in the ledger, and rewritten as `conf:low | source_family:unretrieved`.

---

### Question 7: Analytical Use Relations for Gap-Matrix

**How to let Analytical use relations for required-system / gap-matrix?**

**Answer:** Add mode-gated hook after fetchSBCContext in analysis branch. The validateAnalyticalReport validator already downgrades unsupported claims; it will not change behavior. Relations are in the prompt, not in Section VIII evidence, so validator ignores them.

---

### Question 8: Exact Code Changes (Line Anchors)

**Proposed changes:**

1. **Add helper `loadBrainV1Sidecars` after line 2623** (post-fetchSBCContextVector):
   - Loads group_m_relations_v1.json and group_m_facts_v1.json from bucket
   - Returns {relationsText, factsText}
   - Approx. 20 lines

2. **Add call site at line 5131** (after fetchSBCContext in standard/advisory branch):
   - Check if usedFiles contains "GroupM" or "canonical_v1"
   - If yes, call loadBrainV1Sidecars
   - Prepend relationsText + factsText to fullSystemPrompt with NOT CITABLE header
   - Approx. 6-8 lines

3. **No changes to:** buffered streaming path (5407-5450), citation verifier (1217+), analytical validator (3663+)

---

### Question 9: Rollback Path

1. `git revert <commit-helper>` + `git revert <commit-call-site>`
2. Delete bucket files: SBC201_Ch3_GroupM_canonical_v1_extracted_chunks.json, SBC801_Ch9_GroupM_canonical_v1_extracted_chunks.json, brain_v1/group_m_relations_v1.json, brain_v1/group_m_facts_v1.json
3. No DB rollback needed.

---

### Question 10: Recommended Route

**Route C (Hybrid): Bucket chunks + sidecars, zero DB writes.**

**Why:** 
- Brain V1 is not frequently updated; bucket upload sufficient.
- Existing fetchSBCContext already retrieves from storage.
- No vector join needed; keyword path sufficient.
- DB tables add surface area for bugs (migrations, RLS, indices).
- Bucket deletes are zero-cost; DB deletes require migration reversal.
- Primary mode unaffected; Advisory/Analytical gate on keywords.
- Sidecars prepended before stream; buffered path unchanged; verifier drops non-ledger citations automatically.

---

## Risks & Mitigations

**Risk 1: Chunk Quality (High)**
- section_number mismatch with verbatim heading → ledger downgrades to medium
- **Mitigation:** Validate heading-section_number match during prep; use automated extraction

**Risk 2: Sidecar Citation Leakage (Medium)**
- Model may try to cite relations/facts
- **Mitigation:** verifyAdvisoryCitations auto-downgrades to conf:low; explicit NOT CITABLE label; frontend shows faded

**Risk 3: Bucket Naming Inconsistency (Medium)**
- Filenames don't match fetchSBCContext patterns
- **Mitigation:** Document naming convention; test chapter detection regex before upload

---

## Production Apply Plan

**Bucket uploads:**
- ssss/SBC201_Ch3_GroupM_canonical_v1_extracted_chunks.json
- ssss/SBC801_Ch9_GroupM_canonical_v1_extracted_chunks.json
- ssss/brain_v1/group_m_relations_v1.json
- ssss/brain_v1/group_m_facts_v1.json
- ssss/brain_v1/group_m_advisory_decision_tree_v1.json (optional)

**DB writes:** None

**Edge deploys:** fire-safety-chat

**Vercel deploys:** None (existing verifier sufficient)

---

