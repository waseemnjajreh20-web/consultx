#!/usr/bin/env python3
"""C3 feasibility spike: DXF room/door/dimension extraction probe.

Backs docs/launch/drawing-intelligence-adr-20260903.md (item C3, phase 1):
can ConsultX pull rooms, doors, exits and dimensions out of a floor plan
well enough to later compute egress travel distances?

Scope note (read this before trusting the numbers): this script only reads
DXF via ezdxf. DWG is a separate proprietary binary format that requires
Autodesk's format or the free ODA File Converter to get to DXF first. The
ODA File Converter is NOT installed in this environment and was
deliberately not installed for this spike. Every real drawing found under
D:\\wasim\\ during the 2026-09-03 inventory is DWG (header AC1021 or
AC1032) or PDF/BAK -- zero real DXF files exist on this machine. So this
script also generates a synthetic sample floor-plan DXF (--make-sample) to
exercise the extraction path; see the ADR and the results doc for what
that does and does not prove.

Usage:
    python dxf_probe.py --make-sample OUT.dxf
    python dxf_probe.py FILE.dxf [--json OUT.json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

import ezdxf
from ezdxf import bbox

ROOM_LAYER_RE = re.compile(r"(wall|room|\u062c\u062f\u0627\u0631|\u063a\u0631\u0641)", re.IGNORECASE)
DOOR_BLOCK_RE = re.compile(r"(door|\u0628\u0627\u0628)", re.IGNORECASE)


def _polygon_area(pts: list[tuple[float, float]]) -> float:
    """Shoelace formula. pts is a closed ring (first point not repeated)."""
    n = len(pts)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def build_sample_dxf(path: Path, wings: int = 1) -> None:
    """Synthetic stand-in floor plan: `wings` copies of a 4-classroom +
    corridor + exit-stair block (4 doors + 1 exit door each), Latin +
    Arabic room-label text, 2 linear dimensions total. wings=1 is a small
    single-wing plan; wings=N tiles N wings side by side to approximate a
    larger multi-block school drawing for timing/scaling purposes. This is
    NOT a real ConsultX client drawing -- see module docstring."""
    doc = ezdxf.new("R2018")
    doc.header["$INSUNITS"] = 6  # 6 = meters
    msp = doc.modelspace()

    for name, color in [
        ("A-WALL", 7),
        ("A-ROOM", 3),
        ("A-DOOR", 1),
        ("A-ANNO-TEXT", 2),
        ("A-ANNO-DIMS", 5),
    ]:
        doc.layers.add(name=name, color=color)

    door_block = doc.blocks.new(name="DOOR_900")
    door_block.add_line((0, 0), (0.9, 0))
    door_block.add_arc(center=(0, 0), radius=0.9, start_angle=0, end_angle=90)

    exit_block = doc.blocks.new(name="EXIT_DOOR_1200_\u0628\u0627\u0628_\u0637\u0648\u0627\u0631\u0626")
    exit_block.add_line((0, 0), (1.2, 0))
    exit_block.add_arc(center=(0, 0), radius=1.2, start_angle=0, end_angle=90)

    wing_span_x = 30.0  # 27 wide wing + 3 gap, so wings never overlap
    for wing in range(wings):
        ox = wing * wing_span_x
        rooms = [
            (f"Classroom {wing}01", (ox + 0, 0), (6, 8)),
            (f"Classroom {wing}02", (ox + 6, 0), (6, 8)),
            (f"Classroom {wing}03", (ox + 12, 0), (6, 8)),
            ("\u063a\u0631\u0641\u0629 \u0627\u062c\u062a\u0645\u0627\u0639\u0627\u062a", (ox + 18, 0), (6, 8)),
        ]
        for label, (x, y), (w, h) in rooms:
            pts = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
            msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "A-ROOM"})
            msp.add_text(
                label,
                dxfattribs={"layer": "A-ANNO-TEXT", "height": 0.3, "insert": (x + 0.5, y + h - 0.5)},
            )

        corridor_pts = [(ox + 0, 8), (ox + 24, 8), (ox + 24, 11), (ox + 0, 11)]
        msp.add_lwpolyline(corridor_pts, close=True, dxfattribs={"layer": "A-ROOM"})
        msp.add_text(
            "Corridor", dxfattribs={"layer": "A-ANNO-TEXT", "height": 0.3, "insert": (ox + 10, 9.3)}
        )

        stair_pts = [(ox + 24, 8), (ox + 27, 8), (ox + 27, 11), (ox + 24, 11)]
        msp.add_lwpolyline(stair_pts, close=True, dxfattribs={"layer": "A-ROOM"})
        msp.add_mtext(
            "EXIT STAIR\\P\u0645\u062e\u0631\u062c",
            dxfattribs={"layer": "A-ANNO-TEXT", "char_height": 0.3, "insert": (ox + 24.5, 9.3)},
        )

        for _, (x, y), (w, h) in rooms:
            msp.add_blockref("DOOR_900", (x + w / 2 - 0.45, y + h), dxfattribs={"layer": "A-DOOR"})
        msp.add_blockref(
            "EXIT_DOOR_1200_\u0628\u0627\u0628_\u0637\u0648\u0627\u0631\u0626",
            (ox + 24, 9.5),
            dxfattribs={"layer": "A-DOOR", "rotation": 90},
        )

    dim1 = msp.add_linear_dim(base=(0, -1.5), p1=(0, 0), p2=(6, 0), dxfattribs={"layer": "A-ANNO-DIMS"})
    dim1.render()
    dim2 = msp.add_linear_dim(
        base=(-2, 8), p1=(0, 8), p2=(0, 11), angle=90, dxfattribs={"layer": "A-ANNO-DIMS"}
    )
    dim2.render()

    doc.saveas(str(path))


def load_and_probe(path: Path) -> dict:
    timings: dict[str, float] = {}

    def _mark(stage: str, t0: float) -> None:
        timings[stage] = round(time.perf_counter() - t0, 4)
        print(f"[stage] {stage}={timings[stage]}", file=sys.stderr, flush=True)

    t0 = time.perf_counter()
    doc = ezdxf.readfile(str(path))
    _mark("load_s", t0)

    msp = doc.modelspace()

    t0 = time.perf_counter()
    entity_counts = Counter(e.dxftype() for e in msp)
    _mark("entity_scan_s", t0)

    t0 = time.perf_counter()
    layers = [layer.dxf.name for layer in doc.layers]
    layer_entity_counts = Counter(e.dxf.layer for e in msp)
    _mark("layers_s", t0)

    insunits = doc.header.get("$INSUNITS")

    t0 = time.perf_counter()
    try:
        ext = bbox.extents(msp, fast=True)
        extents = {
            "min": tuple(ext.extmin) if ext.has_data else None,
            "max": tuple(ext.extmax) if ext.has_data else None,
        }
    except Exception as exc:  # noqa: BLE001 -- spike script, report and move on
        extents = {"error": str(exc)}
    _mark("extents_s", t0)

    t0 = time.perf_counter()
    rooms = []
    for e in msp.query("LWPOLYLINE"):
        if not e.closed:
            continue
        if not ROOM_LAYER_RE.search(e.dxf.layer):
            continue
        pts = [(p[0], p[1]) for p in e.get_points(format="xy")]
        rooms.append(
            {"layer": e.dxf.layer, "vertices": len(pts), "area_m2": round(_polygon_area(pts), 2)}
        )
    _mark("room_detect_s", t0)

    t0 = time.perf_counter()
    doors = []
    for e in msp.query("INSERT"):
        name = e.dxf.name
        if DOOR_BLOCK_RE.search(name):
            insert = tuple(e.dxf.insert)[:2]
            doors.append({"block": name, "insert_xy": insert, "rotation_deg": e.dxf.rotation})
    _mark("door_detect_s", t0)

    t0 = time.perf_counter()
    text_labels = [e.dxf.text for e in msp.query("TEXT")]
    for e in msp.query("MTEXT"):
        text_labels.append(e.plain_text() if hasattr(e, "plain_text") else e.text)
    dimension_count = len(msp.query("DIMENSION"))
    _mark("text_dim_scan_s", t0)

    timings["total_s"] = round(sum(v for k, v in timings.items() if k != "total_s"), 4)

    return {
        "file": str(path),
        "file_size_bytes": path.stat().st_size,
        "dxf_version": doc.dxfversion,
        "insunits": insunits,
        "entity_counts": dict(entity_counts),
        "layer_count": len(layers),
        "layers": layers,
        "layer_entity_counts": dict(layer_entity_counts),
        "extents": extents,
        "room_count": len(rooms),
        "rooms_detected": rooms,
        "door_count": len(doors),
        "doors_detected": doors,
        "text_label_count": len(text_labels),
        "text_labels": text_labels,
        "dimension_count": dimension_count,
        "timings_seconds": timings,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dxf_file", nargs="?", help="DXF file to analyze")
    ap.add_argument("--make-sample", metavar="OUT.dxf", help="generate a synthetic sample floor-plan DXF and exit")
    ap.add_argument("--wings", type=int, default=1, help="number of wing-blocks to tile in --make-sample (default 1)")
    ap.add_argument("--json", metavar="OUT.json", help="also write the full JSON result to this path")
    args = ap.parse_args()

    if args.make_sample:
        t0 = time.perf_counter()
        out = Path(args.make_sample)
        out.parent.mkdir(parents=True, exist_ok=True)
        build_sample_dxf(out, wings=args.wings)
        dt = time.perf_counter() - t0
        print(f"sample written: {out} ({dt:.4f}s), wings={args.wings}")
        return

    if not args.dxf_file:
        ap.error("provide a DXF file, or --make-sample OUT.dxf")

    result = load_and_probe(Path(args.dxf_file))
    text = json.dumps(result, indent=2, ensure_ascii=False)
    if args.json:
        out = Path(args.json)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        print(f"written: {out}")
    print(text)


if __name__ == "__main__":
    main()
