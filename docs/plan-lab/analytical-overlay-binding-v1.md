# ConsultX — Analytical → Plan Lab Overlay Binding v1

**Status:** Design — documentation only, no code change in this phase
**Date:** 2026-05-19
**Phase:** Plan Lab Phase 8
**Companion documents:** [`consultx-plan-model-v1.md`](./consultx-plan-model-v1.md), [`postmessage-contract-v1.md`](./postmessage-contract-v1.md)
**Scope:** Defines how the existing `analytical_plan_evidence_v1` artifact produced by `fire-safety-chat` would be projected onto Plan Lab's Fire Safety Overlay markers. This document is a target for a future implementation phase — it does not modify `fire-safety-chat`, prompts, edge functions, report generation, PDF rendering, or any runtime code.

---

## 0. One-Paragraph Summary

`fire-safety-chat` already emits a structured `AnalyticalPlanEvidenceV1` artifact (defined in [supabase/functions/fire-safety-chat/index.ts:4089–4155](../../supabase/functions/fire-safety-chat/index.ts)) that captures per-system coverage, visible components, retrieved code references, compliance rows, package completeness gaps, and final-verdict blockers. Plan Lab's overlay is 9 categories × 5 evidence statuses. This document maps each `analytical_plan_evidence_v1` field to one or more overlay categories and assigns an evidence status — translating an Analytical-mode JSON report into a `ConsultXPlanModel` populated with findings, evidence anchors, and floor-scoped overlay markers. Phase 8 is the design; Phase 9+ (out of scope here) would wire it into the iframe `PLAN_MODEL_IMPORT` flow.

---

## 1. Schema Anchors (Read-Only Citations)

The `analytical_plan_evidence_v1` structure is declared in the edge function source as an interface and built up by `buildAnalyticalPlanEvidenceV1(...)`. Citations below are read-only — Phase 8 does not modify this file or any other under `supabase/`.

| Field path | Edge function line | Notes |
|---|---|---|
| `metadata.artifact_type: "analytical_plan_evidence_v1"` | [4091](../../supabase/functions/fire-safety-chat/index.ts) | Discriminator literal |
| `metadata.artifact_version: "1.0"` | [4092](../../supabase/functions/fire-safety-chat/index.ts) | Independent of `ConsultXPlanModel.version` |
| `page_inventory[].sheet_type` | [4099](../../supabase/functions/fire-safety-chat/index.ts) | One of: `cover`, `drawing_list`, `general_site`, `life_safety`, `fire_alarm`, `fire_fighting`, `details`, `notes`, `unknown` |
| `page_inventory[].confidence` | [4103](../../supabase/functions/fire-safety-chat/index.ts) | `confirmed | inferred | requires_confirmation` |
| `project_classification.confidence` | [4109](../../supabase/functions/fire-safety-chat/index.ts) | `confirmed | inferred | requires_confirmation | cannot_conclude` |
| `package_systems[].coverage_status` | [4116](../../supabase/functions/fire-safety-chat/index.ts) | `shown | partial | not_shown | unknown` |
| `package_systems[].compliance_status` | [4118](../../supabase/functions/fire-safety-chat/index.ts) | `visible_only | source_backed_compliant | package_completeness_gap | requires_confirmation | cannot_conclude` |
| `visible_components[].status` | [4126](../../supabase/functions/fire-safety-chat/index.ts) | 6-value enum (see Section 4) |
| `code_grounding.source_status` | [4132](../../supabase/functions/fire-safety-chat/index.ts) | `full | partial | none` |
| `compliance_rows[].verdict` | [4139](../../supabase/functions/fire-safety-chat/index.ts) | `compliant | noncompliant | needs_verification | cannot_conclude | package_completeness_gap` |
| `package_gaps[].severity` | [4145](../../supabase/functions/fire-safety-chat/index.ts) | `critical | high | medium | low` |
| `final_verdict_inputs.can_issue_final_compliance` | [4151](../../supabase/functions/fire-safety-chat/index.ts) | Always `false` in v1 of the artifact |
| `final_verdict_inputs.blockers[]` | [4153](../../supabase/functions/fire-safety-chat/index.ts) | One string per blocker |

A re-verification on 2026-05-19 confirmed each citation against the current edge function source.

---

## 2. Compliance-Status → EvidenceStatus Translation

`analytical_plan_evidence_v1` uses a 5-value `compliance_status` enum that is **not identical** to Plan Lab's 5-value `EvidenceStatus`. The mapping is:

| `analytical_plan_evidence_v1.compliance_status` | Plan Lab `EvidenceStatus` | Why |
|---|---|---|
| `visible_only` | `visible_only` | Direct match — "drawing shows it, no code citation" |
| `source_backed_compliant` | `source_backed` | "Compliant" qualifier is redundant once the marker is shown next to a citation |
| `package_completeness_gap` | `missing` | The expected document/component is absent from the package |
| `requires_confirmation` | `inferred` | ConsultX inferred presence but cannot confirm without further evidence |
| `cannot_conclude` | `conflict` | Available evidence is contradictory or insufficient to decide |

This mapping is intentionally lossy in one direction: `cannot_conclude` could in principle become either `conflict` (contradictory) or `missing` (insufficient). The binding chooses `conflict` because Plan Lab's `missing` is reserved for cases where an *expected* component or document is *known to be absent*; `cannot_conclude` implies the model could not decide, which is operationally closer to "data disagrees / not enough signal" — i.e. `conflict`.

A consumer that needs the original analytical status can find it under `OverlayMarker.metadata.analyticalComplianceStatus`.

---

## 3. Verdict → CodeFinding Severity Translation

`compliance_rows[].verdict` (5 values) maps to `CodeFindingSeverity` (3 values):

| `verdict` | `CodeFindingSeverity` | Marker `evidenceStatus` for the paired marker |
|---|---|---|
| `compliant` | `info` | `source_backed` (a "compliant" row is by definition cited) |
| `noncompliant` | `violation` | `source_backed` if a code anchor is attached, else `conflict` |
| `needs_verification` | `warning` | `inferred` |
| `cannot_conclude` | `warning` | `conflict` |
| `package_completeness_gap` | `warning` | `missing` |

A `CodeFinding` is created at `ConsultXPlanModel.findings[*]` for every compliance row. A paired `code_finding` overlay marker is emitted only when the row has a spatial anchor (a sheet page that can be resolved to a Plan Lab floor); otherwise the finding is surfaced only in the findings list.

---

## 4. visible_components.status → Marker Generation

`visible_components[].status` is a 6-value enum that drives whether a marker is emitted at all and which evidence status it carries:

| `visible_components[].status` | Marker emitted? | Kind | `evidenceStatus` |
|---|---|---|---|
| `shown_location_confirmed` | yes | derived from `system` (see Section 5) | `source_backed` if a code anchor pairs, else `visible_only` |
| `shown_count_not_verifiable` | yes | derived from `system` | `inferred` |
| `shown_details_notes` | no (system-level note in metadata) | — | — |
| `not_shown` | yes | `code_finding` | `missing` |
| `package_completeness_gap` | yes | `code_finding` | `missing` |
| `requires_dedicated_drawing` | yes | `code_finding` | `inferred` |

`shown_details_notes` is excluded from marker emission because it represents schematic / general-notes information without a placeable spatial anchor — it lives in `ConsultXPlanModel.metadata.analyticalDetailsNotes`.

---

## 5. Component / System → OverlayCategory

The `visible_components[].component` string is free-form text. The binding uses a small lexical classifier to bucket it into one of Plan Lab's 9 overlay categories:

| Component contains (case-insensitive substring) | OverlayCategory |
|---|---|
| `detector`, `smoke`, `heat` | `fire_alarm_detector` |
| `manual call point`, `mcp`, `pull station` | `manual_call_point` |
| `bell`, `sounder`, `horn` | `alarm_bell` |
| `extinguisher` | `fire_extinguisher` |
| `hose`, `hose cabinet`, `landing valve` | `fire_hose_cabinet` |
| `emergency exit`, `exit door`, `emergency door` | `emergency_exit` |
| `egress path`, `means of egress`, `travel path` | `egress_path` |
| (anything else not classified) | `warning` (with `metadata.unclassifiedComponent: <raw>`) |

If `visible_components[].status` is one of the `not_shown` / `package_completeness_gap` / `requires_dedicated_drawing` family, the marker `kind` is forced to `code_finding` regardless of the substring rule.

---

## 6. Worked Examples (the 5 the plan calls for)

Each example shows: (a) a minimal `analytical_plan_evidence_v1` fragment, (b) the resulting `ConsultXPlanModel` content the binding would produce. All examples assume a single floor with id `lvl-ground` already created.

### 6.1 Visible-only component

**Input (`analytical_plan_evidence_v1` fragment):**

```json
{
  "visible_components": [
    {
      "component": "Smoke detector",
      "system": "fire_alarm",
      "pages": [3],
      "evidence": "Page 3 floor plan shows ceiling-mounted smoke detector symbols on grid A-2.",
      "status": "shown_location_confirmed",
      "needs_verification": "Device schedule and quantities not provided"
    }
  ],
  "code_grounding": { "retrieved_references": [], "missing_references": [], "source_status": "none" }
}
```

**Output (in `ConsultXPlanModel`):**

```ts
floors[0].overlayMarkers.push({
  id: "ana-vc-001-marker",
  kind: "fire_alarm_detector",
  position: [/* floor centroid — no precise XY in the artifact */],
  evidenceStatus: "visible_only",
  label: "Smoke detector",
  metadata: {
    analyticalSource: "visible_components",
    analyticalComponent: "Smoke detector",
    analyticalSystem: "fire_alarm",
    analyticalPages: [3],
    analyticalEvidence: "Page 3 floor plan shows ceiling-mounted smoke detector symbols on grid A-2.",
    analyticalNeedsVerification: "Device schedule and quantities not provided",
  },
});
```

No `CodeFinding` is emitted — the source has no clause-level citation. The marker carries the page reference so a future drill-down can open the PDF at page 3.

### 6.2 Missing document (package completeness gap)

**Input:**

```json
{
  "package_gaps": [
    {
      "gap": "Hydraulic calculations",
      "severity": "critical",
      "affected_system": "fire_fighting",
      "why_it_matters": "Missing performance documents are package completeness gaps — cannot verify system adequacy without this document",
      "required_action": "Submit Hydraulic calculations for complete design review"
    }
  ]
}
```

**Output:**

```ts
model.findings.push({
  id: "ana-gap-001",
  code: "Process",
  clauseRef: "Package Completeness — Hydraulic calculations",
  severity: "warning",
  message: "Missing: Hydraulic calculations. Cannot verify fire_fighting system adequacy without this document. Required action: Submit Hydraulic calculations for complete design review.",
  anchorIds: [],
});

floors[0].overlayMarkers.push({
  id: "ana-gap-001-marker",
  kind: "code_finding",
  position: [/* affected system region or floor centroid */],
  evidenceStatus: "missing",
  label: "Missing: Hydraulic calculations",
  metadata: {
    analyticalSource: "package_gaps",
    analyticalAffectedSystem: "fire_fighting",
    analyticalSeverity: "critical",
    findingId: "ana-gap-001",
  },
});
```

`CodeFinding.severity = "warning"` (not `violation`) because per the artifact's own design rule, missing documents are completeness gaps, not design noncompliance.

### 6.3 Source-backed finding

**Input:**

```json
{
  "code_grounding": {
    "retrieved_references": [
      { "anchor_id": "sbc-801-903-2-1", "section": "SBC 801 Section 903.2.1", "status": "retrieved" }
    ],
    "missing_references": [],
    "source_status": "partial"
  },
  "compliance_rows": [
    {
      "item": "Automatic sprinkler system required",
      "drawing_observation": "Sprinkler heads shown on pages 4–5 across all occupied spaces.",
      "code_requirement": "SBC 801 Section 903.2.1 — Group B occupancies > 1115 m² require automatic sprinklers.",
      "source_status": "retrieved",
      "verdict": "compliant",
      "basis": "SBC 801 Section 903.2.1",
      "confidence": "confirmed"
    }
  ]
}
```

**Output:**

```ts
model.evidence.push({
  id: "ana-anchor-sbc-801-903-2-1",
  sourceFile: "SBC 801",
  sectionId: "SBC 801 Section 903.2.1",
});

model.findings.push({
  id: "ana-cr-001",
  code: "SBC 801",
  clauseRef: "Section 903.2.1",
  severity: "info",
  message: "Automatic sprinkler system required. Sprinkler heads shown on pages 4–5 across all occupied spaces. Group B occupancies > 1115 m² require automatic sprinklers.",
  anchorIds: ["ana-anchor-sbc-801-903-2-1"],
});

floors[0].overlayMarkers.push({
  id: "ana-cr-001-marker",
  kind: "code_finding",
  position: [/* sprinkler area centroid */],
  evidenceStatus: "source_backed",
  anchorIds: ["ana-anchor-sbc-801-903-2-1"],
  label: "Sprinklers compliant — SBC 801 Section 903.2.1",
  metadata: {
    analyticalSource: "compliance_rows",
    analyticalVerdict: "compliant",
    findingId: "ana-cr-001",
  },
});
```

Note: labels emit `"Section"` (English) or `"القسم"` (Arabic) — never the section sign glyph — per the project's symbol-hygiene rule.

### 6.4 Conflict finding

**Input:**

```json
{
  "package_systems": [
    {
      "system": "fire_alarm",
      "pages": [6],
      "evidence": ["Fire alarm drawings on pages: 6"],
      "coverage_status": "shown",
      "missing_docs": [],
      "compliance_status": "cannot_conclude",
      "confidence": "cannot_conclude"
    }
  ],
  "compliance_rows": [
    {
      "item": "Fire alarm coverage in storage areas",
      "drawing_observation": "Storage rooms on page 6 show no detector symbols.",
      "code_requirement": "SBC 801 Section 907 — fire alarm coverage required in all occupiable spaces.",
      "source_status": "no_source",
      "verdict": "noncompliant",
      "basis": "Drawing observation only — code anchor not retrieved",
      "confidence": "inferred"
    }
  ]
}
```

**Output:**

```ts
model.findings.push({
  id: "ana-cr-002",
  code: "SBC 801",
  clauseRef: "Section 907",
  severity: "violation",
  message: "Fire alarm coverage in storage areas. Storage rooms on page 6 show no detector symbols. SBC 801 Section 907 requires coverage in all occupiable spaces.",
  anchorIds: [],
});

floors[0].overlayMarkers.push({
  id: "ana-cr-002-marker",
  kind: "code_finding",
  position: [/* storage room centroid */],
  evidenceStatus: "conflict",
  label: "Fire alarm coverage — drawing vs. code conflict",
  metadata: {
    analyticalSource: "compliance_rows",
    analyticalVerdict: "noncompliant",
    analyticalComplianceStatus: "cannot_conclude",
    findingId: "ana-cr-002",
  },
});
```

The marker is `conflict` (not `missing`) because the drawing actively shows detectors elsewhere but skips storage — there is contradictory evidence, not absent evidence.

### 6.5 Final-verdict blocker

**Input:**

```json
{
  "final_verdict_inputs": {
    "can_issue_final_compliance": false,
    "reason": "Drawing package shows design coverage only. Performance verification documents are required for final compliance determination. Missing documents are package completeness gaps, not design noncompliance.",
    "blockers": [
      "Hydraulic calculations not submitted — fire fighting system performance cannot be verified from drawings alone",
      "Fire alarm riser diagram not submitted — zone coverage and wiring unverified"
    ]
  }
}
```

**Output:**

```ts
model.metadata.analyticalFinalVerdict = {
  can_issue_final_compliance: false,
  reason: "Drawing package shows design coverage only. ...",
};

for (const [i, blocker] of blockers.entries()) {
  model.findings.push({
    id: `ana-blocker-${i + 1}`,
    code: "Process",
    clauseRef: "Final Verdict Blocker",
    severity: "warning",
    message: blocker,
    anchorIds: [],
  });
  floors[0].overlayMarkers.push({
    id: `ana-blocker-${i + 1}-marker`,
    kind: "code_finding",
    position: [/* whole-floor banner anchor */],
    evidenceStatus: "missing",
    label: blocker.split(" — ")[0],
    metadata: {
      analyticalSource: "final_verdict_inputs.blockers",
      findingId: `ana-blocker-${i + 1}`,
    },
  });
}
```

Blockers default to `evidenceStatus: "missing"` because the artifact's design treats them as "documents not submitted." A blocker whose text explicitly describes contradictory drawing data can be re-routed to `evidenceStatus: "conflict"` by a future enrichment step — out of scope for this design.

---

## 7. Position Strategy (Caveat)

`analytical_plan_evidence_v1` is page-scoped, not floor-XY-scoped. It carries `pages: number[]` but never a coordinate. The binding therefore cannot place markers at precise positions inside a Plan Lab floor without an additional step.

Three positioning options, in priority order:

1. **Page-anchored marker** — when a Plan Lab floor has been linked to a Pascal-imported floor that already has spatial geometry, use the floor's bounding-box centroid as the marker `position` and surface the original page in `metadata.analyticalPages`. The marker is "somewhere on this floor, reference page N."
2. **System-centroid marker** — when multiple Pascal devices of the same system exist on a floor, compute the centroid of their positions and place the analytical marker there. This co-locates the analytical layer with the physical layer.
3. **Top-left banner anchor** — when neither of the above applies, place the marker at `[0.5, 0.5]` (1 m × 1 m from the floor origin) and document this in `metadata.analyticalPositionStrategy: "banner_anchor"`. Future renderers can show these as a stacked banner rather than as overlay pins.

The choice is per-marker, made at binding time. A future implementation phase would land a small `positionFor(...)` helper.

---

## 8. Out of Scope

The following are explicitly **not** part of this binding design:

- **Modifying `fire-safety-chat`** — no prompt change, no schema change, no edge function change.
- **Modifying Analytical-mode report rendering** — `ChatInterface`, `ChatMarkdownRenderer`, PDF generation pipeline are untouched.
- **Real-time binding hook-up** — a future phase would add the runtime that calls into this binding when an Analytical report is selected, builds a `ConsultXPlanModel`, and pushes it into the iframe via `PLAN_MODEL_IMPORT`. None of that runtime exists in this phase.
- **Bidirectional sync** — the iframe never sends Analytical-side data back to `fire-safety-chat`. Bindings are one-way: Analytical → Plan Lab.
- **AHJ approval workflow** — `ReviewStatus` transitions tied to Enterprise case approvals are out of scope.
- **Persistence** — `ConsultXPlanModel` instances built from this binding are not stored anywhere in v1.

---

## 9. Verification Checklist (Phase 8 PASS)

1. This file exists at `docs/plan-lab/analytical-overlay-binding-v1.md`.
2. `git status --porcelain -uall` shows it as the only Phase 8 addition.
3. All five worked examples are present (Sections 6.1–6.5).
4. Citations in Section 1 reference the current edge function source by line number.
5. No code change in this phase — `npx tsc --noEmit` baseline is unchanged.
6. No `package.json` / `package-lock.json` diff.

---

## 10. Files Owned by This Document

- This document — the entire binding design.

No source file is modified or created by Phase 8.
