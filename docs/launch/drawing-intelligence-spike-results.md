# C3 phase-1 feasibility spike — results

Date: 2026-09-03. Scope: can ConsultX pull rooms, doors, exits and dimensions out of a
floor plan well enough to later compute egress travel distances? Tool: `scripts/spike/dxf_probe.py`
(ezdxf 1.4.4, Python 3.14.0). Companion decision doc: `docs/launch/drawing-intelligence-adr-20260903.md`.

## 1. Inventory of real drawings (read-only, CONFIRMED)

Scanned `D:\وسيم\مدارس الملك عبد العزيز\` and `D:\وسيم\waseem\` recursively.

| Folder | Files | DWG | PDF | BAK | Other |
|---|---|---|---|---|---|
| مدارس الملك عبد العزيز | 23 | 9 | 2 | 7 | rar, pptx, html, 2×png |
| waseem | 19 | 6 | 4 | 4 | xlsx, log, docx, 2×png |

**Zero DXF files. Zero IFC files.** Real DWG sizes range 289,771 bytes to 39,079,729 bytes
(≈283 KB to ≈37.3 MB) across the 15 real DWGs (excluding `.bak` duplicates). Header
magic-byte check on 3 samples: `AC1021` (AutoCAD 2007–2009) and `AC1032` (AutoCAD
2018–2023) both present — a mixed version range. Several files are explicitly named
"الأمن والسلامة" (security/safety) — these are life-safety drawings, i.e. exactly the
egress-relevant content this feature targets. PDFs present were not opened (out of
scope for a DXF-specific spike; their content — plotted vector CAD output vs. scanned
raster — is UNKNOWN and matters for a later PDF-path spike).

**Consequence: phase 1 could not be run against any real ConsultX drawing.** The ODA
File Converter (needed for DWG→DXF) is confirmed NOT installed (`where ODAFileConverter.exe`
found nothing; no ODA/Bricsys install directories present), and installing it was out of
scope for this spike per its constraints. Per the spike brief, this is stated plainly:
**every number below comes from an ezdxf-generated synthetic sample, not a real drawing.**

## 2. Synthetic sample

`dxf_probe.py --make-sample` builds a stand-in floor plan: N "wings", each with 4
classrooms + a corridor + an exit stair (6 closed LWPOLYLINE rooms), 5 door INSERTs
(4 standard + 1 exit door whose block name carries an Arabic suffix, `..._باب_طوارئ`),
6 TEXT/MTEXT room labels (mixing Latin and Arabic, e.g. `غرفة اجتماعات`), and (once,
not per-wing) 2 rendered linear DIMENSION entities. INSUNITS set to 6 (meters). This is
**not** a real ConsultX client drawing — it exists only to exercise the extraction code
path with numbers attached. Two scales were run: `wings=1` (small) and `wings=1800`
(large, chosen to land near the middle of the real DWG size range above).

## 3. Extraction results (numbers)

| Metric | Small (1 wing) | Large (1800 wings) |
|---|---|---|
| File size | 27,921 B | 5,214,951 B |
| DXF version written | AC1032 | AC1032 |
| INSUNITS read back | 6 (meters) — correct | 6 (meters) — correct |
| Layers found | 7 (`0`, `Defpoints`, `A-WALL`, `A-ROOM`, `A-DOOR`, `A-ANNO-TEXT`, `A-ANNO-DIMS`) | same 7 |
| Entities: LWPOLYLINE / TEXT / MTEXT / INSERT / DIMENSION | 6 / 5 / 1 / 5 / 2 | 10,800 / 9,000 / 1,800 / 9,000 / 2 |
| Extents (computed) | min (-2.65, -2.15) → max (27.0, 11.0) | min (-2.65, -2.15) → max (53997.0, 11.0) |
| Rooms detected (closed LWPOLYLINE, layer matches `wall|room|جدار|غرف`) | 6 / 6 (100%) | 10,800 / 10,800 (100%) |
| Doors detected (INSERT, block name matches `door|باب`) | 5 / 5 (100%), Arabic-suffixed block matched correctly | 9,000 / 9,000 (100%) |
| Text labels extracted, Arabic preserved | 6 / 6, incl. `غرفة اجتماعات`, `مخرج` | 10,800 / 10,800 |
| Dimensions found | 2 / 2 | 2 / 2 |

**100% precision/recall on both runs is a synthetic-file ceiling, not a real-world
result** — every shape was authored on a layer name and block name guaranteed to match
the regex. It proves the *mechanism* works (Arabic substring matching in layer/block
names, closed-polygon area via shoelace formula, DIMENSION entities are queryable) but
says nothing about hit rate on a real drawing with inconsistent, non-standard, or
Arabic-only layer names — that is exactly what phase 1.5 (below) must measure.

## 4. Timings (numbers, not adjectives)

| Stage | Small (1 wing), s | Large (1800 wings), s |
|---|---|---|
| Load (`ezdxf.readfile`) | 0.2737 | 67.0865 |
| Entity scan (count by type) | 0.0003 | 0.2211 |
| Layers | 0.0003 | 0.1794 |
| Extents (`ezdxf.bbox.extents(fast=True)`) | 0.8802 | 66.7983 |
| Room detection | 0.0087 | 7.1705 |
| Door detection | 0.0007 | 0.2810 |
| Text/dimension scan | 0.0977 | 0.1687 |
| **Total** | **1.2616** | **141.9055** |

## 5. What worked

- ezdxf reads layers, INSUNITS, entity counts, TEXT/MTEXT (Arabic and Latin,
  round-tripped correctly), DIMENSION entities, and closed-polyline geometry cleanly.
- Naive regex-based room/door detection is cheap (room detection: 7.17s for 10,800
  candidate polygons on the large file; door detection: 0.28s for 9,000 INSERTs) and
  correctly handles Arabic substrings in layer/block names.
- The extraction code path runs end-to-end and produces a JSON geometry document
  (rooms with area, doors with position/rotation, text labels, extents) shaped closely
  enough to serve as the phase-2 input contract.

## 6. What did not work / real problems found

1. **No real drawing was tested.** This is the single biggest gap. Closing it needs the
   ODA File Converter, which is an owner-approval install decision (system software),
   not something this spike could do.
2. **`ezdxf.bbox.extents(fast=True)` does not scale.** It cost 66.8s of the 141.9s total
   on the large file — essentially tied with file load as the dominant cost. Root cause,
   confirmed by reading the installed `ezdxf/disassemble.py` (lines ~309, ~448): for every
   TEXT entity it calls `fonts.make_font(...)` and for every MTEXT it additionally runs
   word-wrap layout, with **no font-object caching across calls** — `fast=True` only
   changes Bezier-curve flattening tolerance, it does not skip glyph metrics. With 10,800
   TEXT + 1,800 MTEXT entities in the large sample, this is ~12,600 uncached font-metric
   reconstructions. **Fix identified, not yet applied:** read `$EXTMIN`/`$EXTMAX` from the
   DXF header first (AutoCAD maintains these on save) and only fall back to a bbox computed
   from LWPOLYLINE/LINE/INSERT geometry — skipping TEXT/MTEXT — if the header is missing.
3. **File load itself is slow at scale:** 67.1s for a 5.2 MB ASCII DXF (pure-Python tag
   tokenizer, no caching applies here). ASCII DXF is well known to be significantly more
   verbose than binary DWG, so a converted real file could come out larger than its
   source DWG. **This is an extrapolation, not a measurement** — HYPOTHESIS, not
   CONFIRMED — but it is the reason the ADR requires an async job architecture rather
   than a synchronous request/response worker, and it is the first thing phase 1.5 must
   check against real converted files (the largest source DWG found is 39,079,729 bytes).
4. **Entity-type mix in the synthetic sample is not representative.** It is deliberately
   1 room : 1 label : ~1 door, to make counting easy. A real architectural drawing
   typically has far more LINE/HATCH geometry per labeled room. That means the *load*
   time (roughly file-size-driven) likely transfers reasonably to real files, but the
   *extents* time (driven specifically by TEXT/MTEXT volume) is more synthetic-specific
   and should be treated as an upper bound for that stage, not a general prediction.

## 7. Go/no-go for phase 2

**No-go as-is**, split into three separate gates rather than one verdict:

- **(a) Unvalidated on real data — blocking.** Nothing here has touched an actual
  ConsultX client drawing. Phase 1.5 (ODA conversion + a real-file rerun, detailed in
  the ADR) must happen before any phase-2 build investment.
- **(b) Performance bug — fixable, not architecturally fatal.** The extents bottleneck
  has a known, cheap fix (header-first, geometry-only fallback). Apply before phase 1.5.
- **(c) Load-time scaling on large real files — open question, phase 1.5 must answer it.**
  This determines whether the worker can run as a request/response service at all, or
  must be an async job from day one (the ADR recommends async regardless, precisely
  because this question is still open).

Numbers, JSON outputs and the synthetic DXF samples used for this spike are under the
session scratchpad (`c3spike/`), not committed to the repo — they are throwaway
generated artifacts, not real client data.
