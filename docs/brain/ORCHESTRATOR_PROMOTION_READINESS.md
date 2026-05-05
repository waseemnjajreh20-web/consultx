# Orchestrator Promotion — Readiness Audit

Date: 2026-05-05
Branch: `claude/affectionate-solomon-f5e304`

---

## 1. Candidate scripts inspected

| Path | Purpose | Local-only? | Verdict |
|------|---------|-------------|---------|
| `orchestrator.cjs` (repo root) | GraphRAG indexer — POSTs to `https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/sbc-graph-indexer` in a tight loop. Writes embeddings + community structures to **production Supabase**. | **NO — production writes** | **BLOCKED.** Hard-coded production URL + ANON_KEY at [orchestrator.cjs:8-10](orchestrator.cjs:8). Running it touches the live DB. Out of scope. |
| `scripts/build-consultx-brain-full.cjs` | Coordinator/generator: reads `data/consultx_brain/full_corpus/{sources,relations,facts,synthesis,manifests,indexes}/`, writes `generated/consultx_brain_full/{chunks,relations,facts,synthesis,indexes}/...`. | **YES — local only** | **CANDIDATE.** No HTTP calls, no env vars, no Supabase imports. Verified by grep (`supabase\|http\|fetch\|axios\|process\.env\|SUPABASE_URL` returned zero matches). Fails closed via `process.exit(2)` on any FAIL invariant. |
| Other `scripts/*.cjs` | One-off migration appliers, embedding generators, table inspectors. Each touches DB. | NO (most) | Out of scope. |

**The only local-only promotion path is `scripts/build-consultx-brain-full.cjs`.**

---

## 2. Inputs the build script reads

Read paths (verified at [scripts/build-consultx-brain-full.cjs:181-289](scripts/build-consultx-brain-full.cjs:181)):

- `data/consultx_brain/full_corpus/manifests/sbc{201,801}_source_manifest.json`
- `data/consultx_brain/full_corpus/indexes/{section_index,section_aliases,page_map,pdf_map}.json`
- `data/consultx_brain/full_corpus/relations/*.json` (base + gap_completion + round2_gap)
- `data/consultx_brain/full_corpus/facts/*.json` (facts_full + gap_completion_facts + round2_gap_facts + thresholds + exceptions + definitions)
- `data/consultx_brain/full_corpus/synthesis/{advisory_workflows,analytical_workflows,main_mode_patterns}.json`
- `data/consultx_brain/full_corpus/synthesis/decision_trees/*.json`
- `data/consultx_brain/full_corpus/sources/sbc{201,801}/*.md` (95 + 137 = 232 files)
- `data/consultx_brain/full_corpus/extracted_gaps/sbc{201,801}/*.md` (41 + 84 = 125 round-1 files)
- `data/consultx_brain/full_corpus/extracted_gaps/sbc{201,801}_round2/*.md` (14 + 24 = 38 round-2 files)

---

## 3. Outputs the build script writes

Write paths (all under `generated/consultx_brain_full/`):

- `chunks/SBC{201,801}_canonical_chunks.json`
- `relations/{relations_full,cross_code_relations_full,parent_child_relations_full,exception_relations_full,trigger_relations_full,analytical_dependency_relations_full}.json`
- `facts/{facts_full,thresholds_full,exceptions_full,definitions_full}.json`
- `synthesis/{advisory_workflows,analytical_workflows,main_mode_patterns}.json`
- `synthesis/decision_trees/<copies>`
- `indexes/{section_index,section_aliases,page_map,pdf_map}.json`
- `brain_manifest_full.json`
- `rollback_manifest_full.json`
- `validation_report_full.json`

**No writes to**: production bucket, Supabase DB, edge functions, frontend, migrations, billing.

---

## 4. Validation invariants enforced

The script runs **3,498 invariants** across these categories ([scripts/build-consultx-brain-full.cjs:354-510](scripts/build-consultx-brain-full.cjs:354)):

| Category | What it checks |
|----------|----------------|
| no-banned-symbol | The U+00A7 byte does not appear in any output file |
| chunk-shape | Every chunk has `source_code`, `section_ref`, `content_kind === "canonical_verbatim"`, and one of `source_pages` / `extraction_status ∈ {non_pdf_ready, stub, page_pending}` |
| chunk-no-llm-synthesis | No chunk body contains a literal `LLM_SYNTHESIS` token |
| chunk-no-structured-fact-tag | No chunk body contains a literal `STRUCTURED_FACT` token |
| fact-has-source-refs | Every fact has at least one entry in `source_refs` |
| relation-has-source-basis | Every relation has a non-empty `source_basis` string |
| tree-step-has-refs | Every decision-tree step has at least one of `source_refs` or `relation_refs` |
| governance | Various flat assertions (no destructive edits to `D:\sbc_consultx`, manual-review items listed, high-confidence chunks have content) |

On any FAIL, the script writes the failure list into `validation_report_full.json` and exits with code 2.

---

## 5. Idempotency analysis

The build script is **idempotent**: given identical inputs, it produces byte-identical outputs (modulo `generated_at` timestamp). Re-running it without changing any input file will:

- Regenerate `chunks/`, `relations/`, `facts/`, `synthesis/`, `indexes/`, `brain_manifest_full.json`, `rollback_manifest_full.json`, `validation_report_full.json`
- Produce the same 369 chunks (148 SBC-201 + 221 SBC-801) the runtime already serves
- Pass the 3,498 invariants (already passing per the committed `validation_report_full.json`)

---

## 6. What "promotion" actually means here

This is the central finding of the readiness audit. The runtime does NOT filter on `canonical_status`:

- Searched `supabase/functions/fire-safety-chat/index.ts` — `canonical_status` returned **zero matches**.
- Searched `src/` — `canonical_status` returned **zero matches**.

So `canonical_status` is **purely a governance / reporting label**. Changing a chunk's status from `PARTIAL_STRUCTURED` to `EXISTS_CANONICAL` or `VERIFIED_CORE` does **not** change what is served, scored, or cited by the runtime.

The 233/550 (42%) figure in [docs/brain/SBC_BRAIN_GAP_CLOSURE_STATUS.md](docs/brain/SBC_BRAIN_GAP_CLOSURE_STATUS.md) was computed from the **ledger files** (`data/consultx_brain/full_corpus/manifests/sbc{201,801}_source_manifest.json`), which the build script **reads but does not write**. Re-running the build script does not change the ledger and will not change the 42% figure.

**To actually move the canonical-completion percentage upward, one would have to either:**
- Edit each round-1 `.md` file's frontmatter `status:` field (changes 125 files), and/or
- Edit each ledger entry's `ledger_status` in the source manifests (changes 159 + 391 = 550 entries).

These are bulk metadata edits, not orchestrator runs. They require a deliberate decision about what content qualifies for promotion, plus an operating-policy update because they would change the meaning of the canonical label going forward.

---

## 7. Real chunk-level inventory (as currently shipped)

For ground truth, here is the actual breakdown of the 369 chunks the runtime is serving today (computed from `generated/consultx_brain_full/chunks/SBC{201,801}_canonical_chunks.json`):

| Source | Total chunks | VERIFIED_CORE | PARTIAL_STRUCTURED | EXISTS_CANONICAL |
|--------|-------------:|--------------:|-------------------:|-----------------:|
| SBC-201 | 148 | 95 | 53 | 0 |
| SBC-801 | 221 | 117 | 20 | 84 |
| **Combined** | **369** | **212** | **73** | **84** |

The runtime serves all 369. The labels distinguish provenance (sub-agent batch) but are not retrieval gates.

---

## 8. Decision

**SAFE_TO_RUN_LOCAL** for `scripts/build-consultx-brain-full.cjs` with **CURRENT inputs**.

**No promotion action is needed.** Re-running the build will produce byte-identical outputs (modulo `generated_at` timestamp) because no input file has changed since the May-1 build. The 3,498 invariants will pass. The chunks file the runtime reads will not change.

If the user wants the published canonical-percentage figure to move up, that requires a separate, explicit metadata-update task (see Section 6) — not a script run. Bulk-editing 125 round-1 frontmatter fields without a clearly stated policy is **out of scope** for this stabilization round; doing it without policy review would just shift the same content under a more aggressive label without any user-visible improvement.

### Risk level
| Action | Risk |
|--------|------|
| Re-run `build-consultx-brain-full.cjs` with current inputs | **Very low** — idempotent, validation has historically passed, fails closed |
| Bulk-edit round-1 frontmatter to flip status | **Medium** — 125 file edits, no runtime effect, but changes the meaning of canonical label |
| Edit ledger manifests directly | **High** — changes the source-of-truth ledger; requires SME review of every entry |

### Rollback plan (local-only, build script run)
```
rm -rf generated/consultx_brain_full/
git checkout HEAD -- generated/consultx_brain_full/
```
No production effect — the runtime reads the bucket, not local files.

### Will I run the build script?
**Yes — once, to confirm idempotency.** This is the safest thing the brief allows. Output sha256 hashes will be compared against the committed `brain_manifest_full.json` to detect any drift. If hashes match (modulo timestamp), no commit is needed. If hashes differ, the differences will be inspected and reported before any commit.
