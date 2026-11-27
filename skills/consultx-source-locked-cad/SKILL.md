---
name: consultx-source-locked-cad
version: 1.0.0
trigger: all engineering file reading, drawing analysis, CAD/BIM editing, code compliance, dimensioning, design, export and release
---

# Mandatory ConsultX CAD source-lock skill

Read this file and the root `AGENTS.md` before every engineering operation. Work independently: **INSPECT → CLASSIFY → CALIBRATE → REASON → DESIGN → DRAW → VERIFY → RELEASE**.

**Non-negotiable:** Never invent rooms, walls, openings, head locations, room heights, pipes, sprinkler spacing requirements, hydraulic results or source citations. Never substitute a made-up geometric demo for the user's real DWG/DXF/DWFX/PDF. Preserve original source bytes, identity hashes, layer names, block inserts and coordinates; keep DWFX/PDF as secondary published references unless cross-calibrated.

- **INSPECT:** Identify every original file, revision, SHA-256, DWG version, DXF $INSUNITS, layouts, XREF, block transforms and title-block/legend. Read PDF pages visually. Originals are immutable.
- **CLASSIFY:** Confirm source entities and exact handle for each sprinkler, architectural wall, room, door, window, obstruction and annotation. A layer name alone does not establish a wall. An annotation head count cannot override inserted entities; report disagreements explicitly.
- **CALIBRATE:** Prove X and Y physical units with two independent source dimensions and record origin/transform. If DXF says inches while printed annotations appear metric, mark `G02_UNITS=BLOCKED`; never silently convert units.
- **REASON:** For each SBC/NFPA requirement and exception, record authorized edition, section/table/page, source hash, conditions, verdict and unresolved assumptions. No code-derived rule without traceable evidence.
- **DESIGN:** All geometry and engineering elements must reference source handles. For every sprinkler, measure adjacent X/Y head spacing (when aligned) and wall clearances only to semantically classified walls. For every confirmed wall/opening, measure its actual lengths and opening widths. Use UNKNOWN rather than 0 when evidence is absent. Verify pipes are connected and design limitations proven.
- **DRAW:** Export editable genuine CAD geometry with native `DIMENSION` entities, preserved model scale, clear labels and uncluttered dimension chains. Do not merely draw numbers as decorative text or call DXF a DWG. Do not change architecture to make a drawing look complete.
- **VERIFY:** Reopen output independently, compare source handles/geometry and block transforms, regenerate dimension values from endpoints, review PDF/plots for overlaps and check CAD/engineering code validations separately. `ezdxf.audit()==0` does not prove AutoCAD compatibility or NFPA compliance.
- **RELEASE:** Require G01..G10 to be `PASS` from a trusted verifier, with source SHA, design/model/review hashes and artifact checksums. Never treat a user-supplied audit flag or LLM assertion as proof. `services/mcp-server/cad-release-gate.mjs` and mandatory trusted `verifySourceAudit` / `verifyReleaseAudit` adapters enforce this in the engineering workflow. If anything is blocked, output a blocker report with `finalDelivery=false`; NEVER `FOR_CONSTRUCTION` or `CODE_COMPLIANT`.

For offline source-first measurements, use the separately delivered original-preserving Python QA gate. The source-locked tool deliberately fails in strict release mode when source units, opening geometry, labels and authoritative code citations are unresolved. The full original reference files and engineering corpus must never be pushed to a public repository. A synthetic test or mock adapter is not engineering validation.
