# ADR: Drawing intelligence processing service (C3, phase 1)

Status: Proposed. Date: 2026-09-03. Item: C3 "ذكاء المخططات: من الرسم إلى فحص المخارج"
in `docs/launch/next-wave-proposals-20260903.html`. Backed by a measured spike:
`docs/launch/drawing-intelligence-spike-results.md` and `scripts/spike/dxf_probe.py`.

## Context

C3's end goal: an engineer uploads a floor plan (PDF/DWG/IFC), ConsultX extracts rooms,
doors, exits and dimensions with human confirmation, then computes egress travel
distance, common path, and door width vs. occupant load, displayed on the drawing
itself. This ADR covers phase 1 only: how and where the extraction runs, and whether
it's worth building at all. It does **not** decide the egress-graph algorithm or the
rule-engine wiring (phase 2/3) — those are out of scope until phase 1.5 passes its exit
criteria below.

This is a new, additive processing capability. It does not replace or modify Supabase,
Vercel, Gemini, or any existing ConsultX service — per the hard rule against rebuilding
or swapping the existing architecture, it is an out-of-band worker that the existing app
calls out to and stores results from, the same way any other background job would be
added.

Inventory (CONFIRMED, 2026-09-03): the owner's real drawings under `D:\وسيم\` are 15 DWG
files (283 KB–37.3 MB, header versions AC1021 and AC1032), several PDFs, and **zero**
DXF or IFC files. The ODA File Converter is not installed. Full detail in the results
doc.

## Decision

**Build a small, self-hosted Python worker (ezdxf for DXF, the ODA File Converter CLI
for DWG→DXF, IfcOpenShell for IFC — untested this spike), run as an asynchronous job,
not a synchronous request/response endpoint.** Prefer Cloud Run Jobs at ConsultX's
current volume; a small always-on VPS is an acceptable fallback if job-length or
networking limits become a problem in phase 1.5. Reject Supabase Edge Functions as the
extraction runtime (not technically viable). Reject client-side WebAssembly as the
primary extraction engine (cannot touch DWG at all, and is materially weaker than
ezdxf for DXF); it remains a reasonable choice later, purely for rendering the
confirmation-UI preview once JSON geometry already exists.

The async requirement is not a style preference — it is a direct consequence of the
spike's timing numbers (Section "Why async" below).

## Options considered

**A. Small Python worker, VPS or Cloud Run (chosen).** ezdxf, ODA File Converter CLI,
and IfcOpenShell are native/Python packages with C extensions and (for ODA) a separate
CLI binary. Nothing about this stack runs in a Deno or browser sandbox. A dedicated
container gives full control over what's installed, scales independently of the main
app, and — because containers are ephemeral — gives a clean "process then discard the
raw file" privacy story for free. Cost is usage-driven (Cloud Run) or fixed-low
(VPS); see Costs.

**B. Supabase Edge Function.** Rejected, not on cost or preference but on capability:
Edge Functions run on Deno, which cannot load ezdxf, IfcOpenShell, or shell out to the
ODA File Converter binary. This option does not clear a technical bar, regardless of
how attractive "no new infrastructure" would be.

**C. Client-side WebAssembly parser.** Rejected as the extraction engine. There is no
free, legal WASM port of Autodesk's DWG format or of the ODA converter, so this option
cannot address the one format that is 100% of what the owner's real drawings actually
are (Section "Inventory" above — zero DXF exist). Even restricted to DXF, the mature
JS/WASM parsers (e.g. `dxf-parser`-class libraries) are far less capable than ezdxf:
no bulge-arc-aware polygon handling demonstrated, no DIMENSION-entity rendering, thinner
block/INSERT support. Building and maintaining a competing WASM DXF parser is a bigger
engineering bet than standing up one small worker. Revisit for phase-2 UI rendering
only, once a worker has already produced JSON geometry to display.

## Why async (not request/response)

The spike measured, on a synthetic DXF that is small next to the owner's real files:
5.2 MB / ~30,600 entities took **141.9s total** to load and analyze — 67.1s to parse
the file, 66.8s for a naive full-drawing bounding-box pass (a fixable bug, see the
results doc), 7.2s for room detection. The load-time cost is CONFIRMED for that
synthetic file; whether real ODA-converted DXFs (from source DWGs up to 37.3 MB) take
proportionally longer is a HYPOTHESIS the spike could not test (no ODA converter
available). Either way, a multi-minute worst case is plausible enough that a
synchronous HTTP handler is the wrong shape: the UI should show "processing…" and poll
or subscribe to a job-status row, not hold a connection open.

## Data flow

Reuses the private-bucket-plus-signed-URL pattern already established in ConsultX
(chat-images and other buckets are private with signed URLs — see project memory on the
attachments system) rather than inventing a new storage model:

1. Engineer uploads the drawing in the ConsultX web UI → written directly to a new
   private Supabase Storage bucket, org/user-scoped path, never public.
2. A `drawing_jobs` row is created (RLS-scoped to the owner's org), status
   `queued`.
3. The worker is notified (DB webhook or poll) with a short-lived signed URL — never
   raw storage credentials.
4. Worker downloads to ephemeral container storage, converts DWG→DXF via the ODA CLI
   if needed, runs the ezdxf extraction from this spike (or IfcOpenShell for IFC,
   unverified), and produces a JSON geometry document: rooms (polygon, area), doors
   (position, rotation, source block name), text labels, dimensions, extents, INSUNITS
   — the same shape `dxf_probe.py` already emits.
5. JSON is written to a `drawing_extractions` table / private storage object; the raw
   drawing's local copy is deleted immediately after (the container itself is also
   discarded); job status becomes `awaiting_confirmation`.
6. ConsultX UI renders the JSON overlaid on the drawing; the engineer reviews and
   corrects detected rooms/doors/dimensions before confirming — human confirmation is
   load-bearing, not optional, given the naive detector's real-world hit rate is
   UNKNOWN (Section "Phased plan").
7. Confirmed geometry feeds the phase-2 egress graph (shortest path, travel distance,
   common path, door width), evaluated by rule engine B2, and phase-3 links to the
   evacuation report (C1) — both out of scope for this ADR.

## Privacy

These are client-confidential architectural and security drawings (several are
literally named "الأمن والسلامة" — security/safety — for named schools). Consequences:

- Storage bucket is private from creation, no public-bucket stage ever, mirroring the
  existing chat-images correction.
- Signed URLs only, short TTL, generated per job — never a durable public link.
- No third-party SaaS DWG-conversion API: the entire conversion and extraction path
  runs inside infrastructure ConsultX controls, specifically because these are
  confidential client drawings, not a cost-driven choice.
- Worker containers hold the raw file only for the duration of one job; no persistent
  disk carries drawing content between jobs (Cloud Run Jobs' ephemeral-instance model
  gives this for free; a VPS fallback would need to enforce it explicitly).
- Retention: raw DWG/DXF/IFC/PDF kept only as long as needed for audit/reprocessing
  (a bounded default window, owner-configurable), separate from the confirmed JSON
  geometry, which is ConsultX-derived product data and can be retained longer.
- RLS on `drawing_jobs` / `drawing_extractions`, scoped to the uploading org, matching
  the existing enterprise authz pattern — no new authz model.
- **Open item, NOT VERIFIED this spike:** ODA File Converter's EULA terms for
  commercial server-side/redistribution use inside a production container image need a
  check before shipping — flag to وسيم as an owner-approval item, not an engineering
  assumption.

## Costs (order-of-magnitude estimates, not quotes)

- **Cloud Run Jobs (preferred):** pay per vCPU-second/memory-second, scale to zero
  between uploads. At ConsultX's current low volume, likely low tens of dollars/month
  or less — negligible next to existing Gemini token costs. Per-job cost scales with
  the (currently unmeasured on real files) processing time from the "Why async" section.
- **Small VPS (fallback):** fixed ~$6–20/month regardless of usage; simpler for a
  persistent ODA CLI install, avoids any Cloud Run cold-start/timeout edge case
  phase 1.5 might surface, but doesn't scale to zero.
- **Supabase Edge Function:** effectively $0 extra — moot, since it is not technically
  viable (see Option B).
- **Client-side WASM:** $0 server cost, but does not solve the DWG problem regardless
  of price, and carries real engineering cost to build/maintain a parser weaker than
  ezdxf (see Option C).

## Phased plan and exit criteria

**Phase 1 — DONE (this spike).** Built `scripts/spike/dxf_probe.py`, proved the
extraction path end-to-end with real numbers on a synthetic sample (100%
precision/recall on a file constructed to match — a ceiling, not a real-world result),
and found the load/extents performance issue above. Exit criterion (met): a working,
timed extraction path, plus clarity on the real-file format gap.

**Phase 1.5 — next, required before any further build.**
1. Owner-approval gate: install the ODA File Converter (system software) — inside the
   future worker's container image, not necessarily on a dev machine — after checking
   its EULA for this use.
2. Apply the extents fix identified in the results doc (header `$EXTMIN`/`$EXTMAX`
   first, geometry-only fallback, skip TEXT/MTEXT glyph metrics).
3. Convert 3 real owner DWGs spanning the observed size range (~300 KB, ~2–5 MB, the
   37.3 MB largest) to DXF and rerun the (fixed) probe against real output.
4. Have an engineer manually count ground-truth rooms/doors in those 3 drawings and
   compare against the naive regex detector — real layer-naming conventions matching
   `wall|room|جدار|غرف` and block names matching `door|باب` are UNKNOWN until this runs.
   *Exit criteria (proposed, وسيم to confirm the bar):* largest file loads and extracts
   in an operationally acceptable time (target: under 2 minutes post-fix), room recall
   ≥ 70%, door recall ≥ 50%. Below that bar, fall back to geometry-only closed-loop
   detection (planar-graph face extraction from wall centerlines, independent of layer
   names) — a materially larger phase-2 task, so this decision point changes the plan,
   not just the schedule.

**Phase 2 — gated on phase 1.5 passing.** Worker service (Cloud Run Jobs), the
`drawing_jobs`/`drawing_extractions` data flow above, the human-confirmation UI, and the
egress graph (shortest path, travel distance, common path, door widths) wired to rule
engine B2, displayed as a heat map on the drawing — per the proposal's own phase-2
description.

**Phase 3 — gated on phase 2.** Link to evacuation simulation and the official report
(C1), per the proposal's own phase-3 description. Not designed here.

## References

Cited as characterized in `docs/launch/next-wave-proposals-20260903.html`, item C3,
"الأساس العلمي" block (2026-09-03 revision). This spike did not independently verify
these sources' bibliographic details (author, venue, DOI) — attribution is to the
proposals doc, not to the original papers directly; treat as UNKNOWN/NOT VERIFIED
pending a dedicated literature check if this ADR moves toward implementation:

1. Geometrically-enriched BIM compliance-checking frameworks using semantic
   graph-based reasoning (2026).
2. IFC-to-RDF conversion for automated compliance checking.
3. BIM used as a simulation tool for optimal evacuation-route planning (CIB World
   Building Congress, 2025).
4. A user-friendly compliance-checking system for Malaysian fire-safety regulations
   (MDPI, 2023).

## Non-goals of this ADR

Does not select the egress-graph algorithm, does not design the confirmation UI, does
not commit to IFC support (IfcOpenShell was not installed or tested this spike — no IFC
files exist in the inventory either), and does not cover the PDF ingestion path (owner
files include plotted and/or scanned PDFs; whether they're vector or raster is UNKNOWN,
unopened this spike, and is architecturally a different pipeline — likely PyMuPDF/
pdfplumber for vector-plotted PDFs, vision/OCR for scanned ones).
