# Advisory Post-R5 — Test Matrix

Date: 2026-05-05 (R6)
Companion: [docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md](docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md)

This matrix is the contract for the next live Advisory smoke. Execution requires a signed-in user JWT (no service-role-driven user-faking allowed). Each test specifies: query, expected retrieval family, expected citation family, pass/fail criteria, and the specific risk it probes after the R5 bucket refresh.

The matrix expects the **current production runtime behavior**: primary retrieval from the Phase 1 bucket-root corpus + V1 sidecar reasoning aid (when triggered) from `brain_full_v1/`.

---

## A — Non-code intent (greeting)

| Field | Value |
|-------|-------|
| Query (AR) | `السلام عليكم` |
| Query (EN equivalent) | `Hi` / `Hello` |
| Mode | `standard` |
| Expected intent classification | `casual` |
| Expected retrieval family | **None** — `classifyAdvisoryIntent` short-circuits before retrieval |
| Expected citation family | **None** — `X-SBC-Sources: ""`, `X-SBC-Source-Meta: []` headers |
| Expected response | Short canned greeting in user's language; offer to help with SBC question |
| Pass | (a) Response renders with no source panel chips. (b) No `[SBC-201|801 ...]` citation tokens in body. (c) Latency < 2 s (no Gemini call). |
| Fail | Sources panel shows fallback chips, OR response cites a section, OR latency > 5 s (suggests retrieval ran). |
| Risk after R5 | Trivial — the gate runs before any bucket fetch. Verifies R1 / R3 work still active. |

---

## B — SBC 201 occupancy (Mercantile, 1200 m²)

| Field | Value |
|-------|-------|
| Query (AR) | `ما متطلبات الإشغال لمحل تجاري بمساحة 1200 متر مربع؟` |
| Query (EN equivalent) | `What are the occupancy requirements for a 1,200 m² mercantile shop?` |
| Mode | `standard` |
| Expected intent | `code_domain` — domain hit on `محل` / `إشغال` / `مساحة` |
| Expected retrieval family | **SBC-201** — chapters 3 (Use & Occupancy) and 5 (Heights/Areas). Chapter 10 (Egress) may also be cited if the response touches exits. |
| Expected V1 sidecar trigger | **NO** — singular `محل تجاري` doesn't match the `محلات\s+تجارية` plural pattern in the trigger regex. Confirmed in [evals/advisory/intent_gate_fixtures.test.ts:108](evals/advisory/intent_gate_fixtures.test.ts:108) (scenario B). Main retrieval still finds the answer via the keyword path. |
| Expected citation family | `[SBC-201 Section 309 ...]` for Mercantile classification, `[SBC-201 Section 506.x ...]` for area limits, possibly `[SBC-201 Table 1004.5 ...]` for occupant load. |
| Pass | (a) Citations resolve to SBC-201 only (no SBC-801 citations for this purely-201 question). (b) Mercantile (Group M) is correctly identified. (c) Numerical limits cited come with section references that pass the Citation Verifier. |
| Fail | Mixes in SBC-801 fire-protection citations as the primary answer, OR cites unverified numerical thresholds, OR claims the answer is not available when the question is purely SBC-201. |
| Risk after R5 | The bucket root has Phase 1 SBC-201 chapters in 8 page-range files. None of them are policy-gated. R5 didn't change them. Behavior should be the same as before R5 — the question is whether the existing corpus answers it well. |

---

## C — SBC 201 Table 1004.5 (occupant load tabular)

| Field | Value |
|-------|-------|
| Query (AR) | `ما الحمل الإشغالي حسب جدول 1004.5؟` |
| Query (EN equivalent) | `What is the occupant load per Table 1004.5?` |
| Mode | `standard` |
| Expected intent | `code_domain` — domain hit on `إشغال` |
| Expected V1 sidecar trigger | **YES** — matches `حمل\s+الإشغال` and the `egress` family in the regex |
| Expected DB-first table path | **YES** — query references `1004.5` explicitly. `fetchStructuredTables` should match before keyword retrieval runs. |
| Expected citation family | `[SBC-201 Table 1004.5 ...]` with explicit factor values per occupancy classification |
| Pass | (a) Response includes a tabular structure with classification labels (Assembly / Business / Mercantile / etc.) and numeric `m²/occupant` factors. (b) Citation token explicitly names `Table 1004.5`. (c) Each factor is sourced — no "general knowledge" tabular guess. |
| Fail | Numeric factors are emitted without a citation, OR factors do not match the SBC-201 published table, OR the response says the table isn't available when the structured-table path was supposed to fetch it. |
| Risk after R5 | Critical test of the structured-table path (which is independent of the bucket refresh). If structured-tables is not provisioned for `1004.5`, the fallback is keyword retrieval against the bucket root, which may or may not surface the verbatim table cells. |

---

## D — SBC 801 fire alarm in commercial building

| Field | Value |
|-------|-------|
| Query (AR) | `متى يتطلب نظام إنذار حريق في مبنى تجاري؟` |
| Query (EN equivalent) | `When is a fire alarm system required in a commercial building?` |
| Mode | `standard` |
| Expected intent | `code_domain` — domain hit on `إنذار`, `حريق` |
| Expected V1 sidecar trigger | **YES** — matches `إنذار` and `fire alarm` |
| Expected retrieval family | **SBC-801 Chapter 9** primarily — the fire-alarm requirements are in Section 907.x. SBC-201 Section 907 is a cross-reference that *also* exists; the model must pick the right one. |
| Expected citation family | `[SBC-801 Section 907.x ...]` — specifically 907.2.7 for Group M thresholds. |
| Pass | (a) Citations resolve to SBC-801, not SBC-201, for the operative requirement. (b) Threshold (sq ft / m² / occupant load) is stated only with a section ref. (c) "Manual" vs "automatic" alarm distinction is preserved. |
| Fail | Cites `[SBC-201 Section 907 ...]` as the operative source (this would be the wrong family — SBC-201 cross-references SBC-801 here), OR provides a threshold without a section ref. |
| Risk after R5 | Cross-code routing test. The `Step 3.2 hard-stop wrong-family routing` (commit `8fdfc6f`) should prevent SBC-201 from being cited as the primary source for an SBC-801 question. R5 did not change this path. |

---

## E — SBC 801 sprinkler in mercantile

| Field | Value |
|-------|-------|
| Query (AR) | `متى يتطلب نظام رش آلي لمحل تجاري؟` |
| Query (EN equivalent) | `When is an automatic sprinkler system required for a mercantile shop?` |
| Mode | `standard` |
| Expected intent | `code_domain` — `رش`, `محل` |
| Expected V1 sidecar trigger | **YES** — matches `رش` and `sprinkler` |
| Expected retrieval family | **SBC-801 Section 903.x** primarily; specifically 903.2.7 for Group M. |
| Expected citation family | `[SBC-801 Section 903.2.7 ...]` and any sub-clauses (903.2.7.1 / 903.2.7.2 for Group M storage thresholds). |
| Pass | (a) Citations resolve to SBC-801 Section 903.x. (b) Sprinkler vs alarm distinction preserved. (c) Threshold values (e.g. fire area > X m², any story above the floor of fire department access) are emitted only with section refs. (d) The model does not confuse "sprinkler required" with "alarm required". |
| Fail | Mixes the answer with alarm requirements (Section 907) as if they were the same threshold, OR emits thresholds without source-backing. |
| Risk after R5 | The most likely scenario where a wrong section family slip occurs. SBC 201 also has a Section 903.x that's a cross-ref. The Step 3.2 hard-stop should catch this. |

---

## F — Fire pump and water supply

| Field | Value |
|-------|-------|
| Query (AR) | `ما متطلبات مضخة الحريق وخزان المياه حسب SBC 801؟` |
| Query (EN equivalent) | `What are the fire pump and water tank requirements per SBC 801?` |
| Mode | `standard` |
| Expected intent | `code_domain` — `مضخة`, `حريق`, `SBC` |
| Expected V1 sidecar trigger | **NO** — `مضخة` is not in the trigger regex. The query has no other trigger keyword. The V1 sidecar will skip; main retrieval handles it. |
| Expected retrieval family | **SBC-801 Sections 903.3 (water supply for sprinkler systems) and 913 (Fire Pumps)** — primarily Chapter 9. NFPA 20 and 22 references may also surface. |
| Expected citation family | `[SBC-801 Section 913.x ...]` for fire pumps; `[SBC-801 Section 903.3 ...]` for sprinkler water supply. |
| Pass | (a) No invented numerical pump curves, GPM ratings, or pressure values without a section ref. (b) NFPA cross-refs are flagged as "external standard" rather than presented as SBC-resident text. (c) The response distinguishes `fire pump` (mechanical) from `water supply` (storage / public main) clearly. |
| Fail | Emits specific PSI / GPM / m³ values without source-backing, OR cites `NFPA 20` as if it were directly in the SBC corpus. |
| Risk after R5 | Tests whether the bucket-root SBC-801 chapter coverage actually extends past Chapter 9. The 800-1000 page-range file is only 200 bytes (effectively empty per the bucket listing), which raises concern about Chapter 9-10 coverage in the primary path. |

---

## G — Missing-evidence test (deliberate gap probe)

| Field | Value |
|-------|-------|
| Query (AR) | `اعطني متطلبات تفصيلية لقسم 6304.2.1.1 من SBC 801` |
| Query (EN equivalent) | `Give me detailed requirements for SBC 801 Section 6304.2.1.1` |
| Mode | `standard` |
| Expected intent | `code_domain` — `SBC`, `قسم` |
| Expected V1 sidecar trigger | **NO** — bare section reference doesn't match domain keywords in the regex |
| Expected retrieval family | **SBC-801 Chapter 63** — but Chapter 63 is in the "specialty hazmat" range that has zero canonical content per the gap inventory ([generated/consultx_brain_full/reports/GAP_INVENTORY_CURRENT.md](generated/consultx_brain_full/reports/GAP_INVENTORY_CURRENT.md) Section 4 — Ch 63: 0/2 canonical, 2 PBNC). |
| Expected citation family | **None** — the section is in a chapter that the bucket-root corpus does not cover. |
| Expected response | Apply the diagnostic protocol: the model must declare that the section is not currently indexed and offer to look it up via a different query, OR ask 1–3 clarifying questions. **Must NOT** fabricate text or reach into general memory. |
| Pass | (a) Response acknowledges the section is not in the indexed corpus. (b) No fabricated "Section 6304.2.1.1 says ..." text. (c) No `[SBC-801 Section 6304 ...]` citation token (the Citation Verifier should downgrade if emitted, but ideally the model never emits it). |
| Fail | Emits any text claiming to be the verbatim or paraphrased content of 6304.2.1.1, OR cites a section ref the Evidence Ledger doesn't support, OR claims the section "is" in the index when it isn't. |
| Risk after R5 | Critical anti-hallucination test. The `RETRIEVAL NOTE` empty-retrieval branch ([supabase/functions/fire-safety-chat/index.ts:5447-5462](supabase/functions/fire-safety-chat/index.ts:5447)) is supposed to enforce this. R5 did not change this path. |

---

## Summary of post-R5 specific risks the matrix probes

| Test | What R5 changed for this query |
|------|-------------------------------|
| A — Greeting | Nothing. Gate runs before any bucket fetch. |
| B — Mercantile occupancy | Nothing observable — sidecar trigger doesn't fire on this phrasing. Main retrieval reads bucket-root files (unchanged). |
| C — Table 1004.5 | Sidecar reasoning aid is now newer (gated 358-chunk corpus). Table evidence comes from DB-first path (unchanged). User-visible behavior probably unchanged. |
| D — Fire alarm | Sidecar reasoning aid is now newer. Citations still resolve via Citation Verifier against the Evidence Ledger built from bucket-root retrieval (unchanged). |
| E — Sprinkler | Same as D. |
| F — Fire pump | Sidecar trigger does not fire. Primary retrieval surfaces whatever is in the bucket-root SBC-801 files for Chapter 9. |
| G — Missing evidence | Tests the diagnostic protocol path — no retrieval data should be present. |

Note: tests B, F, and G probe paths that R5 did **not** affect at all. Tests C, D, E probe paths where the sidecar reasoning aid changed but Citation Verifier behavior is unchanged. So the live-smoke result will mostly reflect the *pre-R5* state of the runtime, with the only narrow window of difference being the model's hidden reasoning context on triggered queries.

---

## Execution prerequisites

Tests A–G can be exercised either:

- **Live**, by invoking `https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat` with a real user JWT (signed-in admin or test user). Returns a SSE stream; capture the body, plus the `X-SBC-Sources` and `X-SBC-Source-Meta` response headers, plus the latency.
- **Offline-deterministic**, by extending [evals/advisory/intent_gate_fixtures.test.ts](evals/advisory/intent_gate_fixtures.test.ts) — but this only validates the deterministic gates (intent classifier and sidecar trigger regex), not the retrieval/citation pipeline.

The full live-smoke variant requires a user JWT, which is **not available in this session**. Task 3 will mark this BLOCKED_NO_USER_SESSION.
