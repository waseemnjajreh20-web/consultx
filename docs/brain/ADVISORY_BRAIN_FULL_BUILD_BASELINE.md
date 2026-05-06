# Advisory Brain Full Build — Baseline Check

**Date:** 2026-05-06  
**Branch:** claude/jolly-haibt-602657 (same HEAD as main: 3be8214)  
**Purpose:** Pre-B2 state snapshot before starting Advisory Brain B2 runtime integration.

---

## 1. Git Status

```
Branch: claude/jolly-haibt-602657
HEAD:   3be8214  fix(advisory): non-code intent gate — bypass retrieval for greetings
Status: clean (no uncommitted changes)
```

---

## 2. Key Commits

| Commit | Description | Branch |
|--------|-------------|--------|
| `1d7f9ef` | feat(brain): SBC V4 corpus uploaded to live bucket (merged from live + V4) | mystifying-williams-c3c538 |
| `905ad43` | feat(brain): build semantic advisory brain seed from SBC V4 (B1 PASS) | mystifying-williams-c3c538 |
| `5a9ce48` | docs(brain): design Advisory Brain B2 runtime adoption | mystifying-williams-c3c538 |
| `f8b58f5` | docs(brain): record R15 deploy and smoke result | mystifying-williams-c3c538 |
| `82be382` | fix(advisory): enforce strict source family allowlist (R15.x) | mystifying-williams-c3c538 |
| `3be8214` | fix(advisory): non-code intent gate — bypass retrieval for greetings | **main / current branch** |

---

## 3. R15.x Source Routing Check

R15.x source family allowlist fix (`82be382`) is on branch `claude/mystifying-williams-c3c538`.
It is **not merged to main** yet. The current `fire-safety-chat/index.ts` on main contains:

- Phase 3A broadened allowlist (`line 1236`)
- Source family detection and sidecar filtering (`line 1312+`)
- Non-code intent gate (`line 5352`) — latest fix on main

R15.x strict allowlist was deployed to production (v138) from the mystifying-williams branch
and is available in the bucket. This branch (jolly-haibt-602657) starts from main and implements
B2 on top of main's state. B2 flags are all OFF by default so no source family interaction
occurs until flags are enabled under controlled conditions.

---

## 4. B1 Artifacts Location

B1 artifacts are present in the `claude/mystifying-williams-c3c538` branch/worktree:

```
D:/ConsultX_Clean/.claude/worktrees/mystifying-williams-c3c538/
  generated/consultx_brain_full/v4/advisory_brain/
    nodes/
      sections.json       — 184 section + subsection nodes
      tables.json         — 145 table nodes
      orphans.json        — 11 orphan nodes
      definitions.json    — placeholder
      thresholds.json     — 100 threshold nodes (95 clean)
    edges/
      relationships.json  — 278 in-graph edges
      external_xrefs.json — 405 external evidence xrefs
    workflows/            — 8 workflow files (occupant_load, egress, sprinkler,
                            fire_alarm, fire_pump, standpipe, smoke_control,
                            occupancy_classification)
    validation/
      advisory_validation_cases.json — 10 golden cases
    reports/
      ADVISORY_BRAIN_B1_VALIDATION_REPORT.md — PASS
      build_stats.json    — 440 total nodes, 278 edges, 497 external evidence
```

---

## 5. B1 Validation Result

```
Verdict: PASS
Errors:  0
Warnings: 0

Nodes total: 440
Edges total: 278
Edges no evidence: 0
Dangling edges: 0
Orphan promoted: 0
Unadopted promoted: 0
Workflow ref issues: 0
All 8 workflows: PRESENT
Banned U+00A7: ABSENT
Secret patterns: NONE
```

---

## 6. V4 Corpus Status

- V4 corpus upload commit: `1d7f9ef` on mystifying-williams branch
- Bucket: `ssss/brain_full_v1/` (production)
- Total chunks in production bucket: **612 chunks**
- Files: SBC201_canonical_chunks.json + SBC801_canonical_chunks.json
- Status: LIVE in production

---

## 7. Fire-Safety-Chat Version

- Current file: `supabase/functions/fire-safety-chat/index.ts` — **5,835 lines**
- Latest deployed version: v138 (R15.x source family fix)
- Contains: non-code intent gate, Advisory confidence cap v2, Evidence Ledger,
  Citation Verifier, Brain Full V1 sidecar loader (Phase 2/3A)

---

## 8. B2 State Before This Session

- B2 design: complete (6 design docs on mystifying-williams)
- B2 runtime code: **NOT STARTED**
- Dynamic Thinking UX: designed only, **NOT implemented**
- All B2 feature flags: **UNDEFINED** (not yet in codebase)

---

## 9. What Changes in This Session

This session implements B2 on top of the current main state:

1. Copy B1 artifacts into this branch (from mystifying-williams worktree)
2. Build runtime_package (compact JSONs + manifest)
3. Add brain_b1_loader.ts (flag ADVISORY_BRAIN_B2_ENABLED)
4. Add workflow_router.ts (flag ADVISORY_BRAIN_B2_ROUTER_ENABLED)
5. Add workflow_constraints.ts (flag ADVISORY_BRAIN_B2_EVIDENCE_ENABLED)
6. Add thinking_ux_emitter.ts (flag ADVISORY_DYNAMIC_THINKING_ENABLED)
7. Modify index.ts with safe integration points
8. Write validation tests
9. Deploy with all flags OFF

**No DB write. No migration. No bucket write. No billing changes.
No Main mode changes. No Analytical mode changes.**

---

## 10. Baseline Verdict

| Check | Result |
|-------|--------|
| Git status clean | PASS |
| B1 artifacts present | PASS (via mystifying-williams worktree) |
| B1 validation PASS | PASS |
| V4 corpus live documented | PASS |
| R15.x deployed (v138) | PASS (on separate branch) |
| B2 code: not started | CONFIRMED |
| All flags OFF baseline | CONFIRMED (flags not yet defined) |

**Ready to proceed to Phase 1 — Runtime Package.**
