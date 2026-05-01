# Full Brain Live Integration Design - Phase Specification

**Audited:** 2026-05-01
**Schema Version:** 1.0
**Auditor:** SUB-AGENT H

## Executive Summary

This audit specifies the phased integration pathway for the FULL ConsultX Brain corpus into the live fire-safety-chat without breaking existing behavior.

## Phase 1 - Bucket-only Canonical Chunks (No DB, No Code Change)

**Scope:** Upload canonical chunk JSON files to bucket ssss/ following Brain V1 naming convention.

**Chunk Shape (compatible with extractAndScoreChunks at line 1702):**

\\\json
[
  {
    "text": "Section 903.2.7 Group M. An automatic sprinkler system shall be provided...",
    "pageStart": 869,
    "pageEnd": 897,
    "source": "SBC_801_Ch9_GroupM_canonical_v1",
    "section_number": "903.2.7"
  }
]
\\\

**Backend Integration:**
- fetchSBCContext (line 1846) lists bucket files, filters by "chunk" substring + .json suffix (line 1915-1918)
- Files passed to extractAndScoreChunks (line 1702), tolerates wrapped/bare-array JSON
- Chunks scored by scoreChunk (line 1624): section-number x5, keyword x3-1
- Selected chunks feed into buildEvidenceLedger (line 1092) and X-SBC-Source-Meta headers

**Verification:**
- Chunks appear in advisory responses under their section number
- Pages match pageStart/pageEnd when both are populated in chunk JSON
- If section_number mismatch with verbatim heading, Evidence Ledger downgrades to medium confidence

**Rollback:** Delete bucket files.

**Production Change:** Bucket upload only. Zero code change. Zero DB write.

## Phase 2 - Sidecar Relations + Facts Loader (26-30 LOC)

**Scope:** Load Brain relations/facts JSON from bucket and inject into Advisory prompts as non-citable reasoning context.

**New Helper Function (approx 20 LOC):**

Insert after line 2430 (before fetchStructuredTables):

**Call Site (approx 6-8 LOC):**

Insert after fetchSBCContext call in standard/advisory branch (around line 5200).

**Verification:**
- Relations appear in advisory reasoning but NOT in Evidence Ledger
- Attempt to cite relation as legal source → verifyAdvisoryCitations (line 1217) downgrades to conf:low
- Frontend shows relations as faded (Step 3.2 confidence styling)
- Primary mode unaffected (zero overhead)

**Rollback:** Delete bucket files; revert two commits.

**Production Change:** 26-30 LOC in fire-safety-chat. One edge deploy. Zero DB write.

## Phase 3 - Evidence Ledger Support (Validation Only)

**Scope:** Confirm that canonical chunk section_number fields propagate through extractAndScoreChunks.

**Phase 3 Optional Enhancement:**
- extractAndScoreChunks extracts section_number from chunk object
- buildEvidenceLedger sees match and sets sectionConfidence: "high"
- verifyAdvisoryCitations respects the high-confidence flag

**No Breaking Change:** Existing chunks without section_number continue to work (confidence defaults to medium).

**Production Change:** Optional. Can be deferred to Phase 4.

## Phase 4 - Analytical Mode Hookup (mode === "analysis")

**Scope:** Gate sidecar loader on mode === "analysis" and inject analytical-check relations + workflows.

**Changes:**
1. Update loadBrainFullSidecars to accept mode parameter
2. In analysis branch (after line 5137), call sidecar loader
3. Inject analytical_workflows.json into pageInventoryBlock

**Backend Validation:**
- validateAnalyticalReport (line 3663) already downgrades unsupported claims; no behavior change
- Analytical workflows in prompt, not Section VIII evidence, so validator ignores them

**No Frontend Change:** Analytical UI inherits sidecar context from prompt.

**Production Change:** 4-6 LOC. One edge deploy. Zero DB write.

## Phase 5 - Future DB / Vector / GraphRAG (Out of Scope)

**5A - Migrate canonical chunks to sbc_code_tables DB:**
- Benefits: Vector embedding feasible; faster retrieval
- Cost: Migration rollback complexity
- Timing: Defer to Q3 2026

**5B - GraphRAG or Knowledge Graph Layer:**
- Ingest relations as graph edges
- Use for gap-matrix generation in Analytical mode
- Timing: Defer to Phase 5.2+

**5C - Real-time Corpus Updates:**
- Implement schema versioning in chunk JSON
- Edge function checks chunk version
- Timing: Phase 5.3+

## Architecture Summary

**Main Mode (Primary):** No Change: Zero corpus load. No sidecar injection.

**Advisory Mode (Standard):**
- Phase 1: Canonical chunks retrieved via keyword path (no code change)
- Phase 2: Relations + facts injected as non-citable reasoning context (26-30 LOC)
- Phase 3: Section metadata propagates to Evidence Ledger (optional; backward-compatible)
- Buffered Streaming: Unchanged.
- Citation Behavior: Sidecars auto-downgraded to conf:low if attempt to cite them

**Analytical Mode (Analysis):**
- Phase 1: Canonical chunks retrieved
- Phase 2+4: Analytical workflows injected
- Validator: Unchanged.
- Gap-Matrix: Workflows help populate required-systems checks

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Chunk JSON incompatibility | Medium | Pre-upload validation: test samples |
| section_number mismatch | High | Automated extraction confidence:low; manual review |
| Sidecar citation leakage | Medium | NOT CITABLE header; auto-downgrades |
| Domain trigger false positives | Low | Narrow trigger regex |
| Bucket naming inconsistency | Low | Document convention; test first |
| Primary mode regression | Low | Gate on mode === primary |
| Buffered streaming corruption | Low | Sidecars prepended before streaming |

## Rollback Plan

**Phase 1 Rollback:** Delete bucket files; no code revert.

**Phase 2 Rollback:** Revert two commits; delete bucket files.

**Phase 3 Rollback:** Revert optional section_number extraction (1-2 lines).

**Phase 4 Rollback:** Revert analysis branch conditional (4-6 lines).

**Complete Rollback:** Delete bucket files; revert four commits; re-deploy.

## Timing and Ordering

**Recommended Order:**
1. Phase 1 (days 1-2): Upload canonical chunks. Monitor keyword-path retrieval.
2. Phase 2 (days 3-5): Deploy helper + call site. Test sidecar injection.
3. Phase 3 (days 6-7): Optional. Add section_number extraction.
4. Phase 4 (days 8-10): Extend to Analytical mode.
5. Phase 5 (Q3 2026+): Future DB/vector migration.

**Parallelization:**
- Phases 1 and 2 can be deployed simultaneously
- Phase 4 can be deployed immediately after Phase 2
- Phase 3 is optional and can be deferred

