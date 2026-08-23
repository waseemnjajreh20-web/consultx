"""content_md rendering, and the inverse parser used by the verifier.

render_content_md() turns an extract.py result into the markdown that goes into
public.sbc_code_tables.content_md.

parse_content_md() turns that markdown back into a grid. check (b) parses the
markdown Claude is about to emit and compares it against a FRESH, independently
selected pdfplumber extraction - so the comparison is between the artefact and
the PDF, not between an extraction and itself.
"""
from __future__ import annotations

import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sbc_common import norm  # noqa: E402

CELL_BR = "<br>"


def esc(cell) -> str:
    """Markdown-safe single-line rendering of one printed cell."""
    if cell is None:
        return ""
    s = str(cell).replace("|", "\\|")
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    return s.replace("\n", CELL_BR).strip()


def unesc(text: str):
    s = text.replace(CELL_BR, "\n")
    return s.replace("\\|", "|").strip()


def _split_md_row(line: str):
    """Split a markdown table row on unescaped pipes."""
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    cells, buf, i = [], "", 0
    while i < len(line):
        ch = line[i]
        if ch == "\\" and i + 1 < len(line) and line[i + 1] == "|":
            buf += "\\|"
            i += 2
            continue
        if ch == "|":
            cells.append(buf)
            buf = ""
            i += 1
            continue
        buf += ch
        i += 1
    cells.append(buf)
    return [unesc(c) for c in cells]


def render_content_md(ex, spec, chapter=None, edition="2024"):
    """Build content_md for one rebuilt table."""
    num = ex["table_number"]
    title = ex["title"].strip()
    code = "SBC 201" if ex["pdf"].startswith("SBC 201") else "SBC 801"
    stamp = "%s-CC-%s" % (code, edition)

    lines = []
    lines.append("## Table %s - %s" % (num, title))
    head = "**%s" % stamp
    if chapter:
        head += " | Chapter %s" % chapter
    head += " | printed page %s**" % ex["printed_page"]
    lines.append(head)
    lines.append("")
    lines.append("> **[STRUCTURED_FACT - Source: TABLE %s, %s, printed page %s]**"
                 % (num, stamp, ex["printed_page"]))
    lines.append("> Transcribed verbatim from the printed table with pdfplumber.")
    lines.append("> Provenance: `%s`, page_index_0based=%d, printed_page=%s."
                 % (ex["pdf"], ex["page_index_0based"], ex["printed_page"]))
    lines.append("> Units are exactly as printed in the Saudi Building Code. "
                 "Every NOT PERMITTED / NP cell is reproduced verbatim.")
    if spec.get("status") == "renumbered":
        lines.append("> NOTE: this table is printed in the SBC as TABLE %s. "
                     "The previous record carried the number %s, which the SBC "
                     "does not print." % (num, spec["table_id"].replace(
                         "QUARANTINED_", "")))
    lines.append("")

    ncols = ex["ncols"]
    lines.append("| " + " | ".join(esc(h) for h in ex["flat_header"]) + " |")
    lines.append("|" + "---|" * ncols)
    for row in ex["data_rows"]:
        cells = [esc(row[j]) if j < len(row) else "" for j in range(ncols)]
        lines.append("| " + " | ".join(cells) + " |")

    if ex["footnotes"]:
        lines.append("")
        lines.append("**Notes, legend and footnotes as printed:**")
        for f in ex["footnotes"]:
            lines.append("- %s" % f)

    # ---- internal contradictions in the PRINTED table ---------------------
    # Where the printed page contradicts itself on a life-safety limit, the
    # contradiction travels WITH the table into the prompt. Silently reconciling
    # it - picking a winner, merging the rows, dropping one - would hide a real
    # defect in the source behind a clean-looking answer.
    for amb in spec.get("ambiguities") or []:
        lines.append("")
        lines.append("> **[AMBIGUITY IN THE PRINTED CODE - READ BEFORE USING THIS "
                     "TABLE]**")
        lines.append("> %s" % amb["what"])
        lines.append("> Both rows are transcribed above exactly as printed; "
                     "neither has been dropped, merged or corrected.")
        lines.append("> **For design purposes the conservative value (%s) governs "
                     "until clarified by the authority having jurisdiction.**"
                     % amb["conservative"])
        lines.append("> Origin of the contradiction: UNKNOWN. It is present in "
                     "the printed page cited above.")
        if amb.get("corroboration"):
            lines.append("> %s" % amb["corroboration"])

    return "\n".join(lines).rstrip() + "\n"


TABLE_BLOCK = re.compile(r"^\|.*\|\s*$")


def parse_content_md(md: str):
    """(header_cells, data_rows) of the FIRST markdown table found in md."""
    rows = []
    for line in md.splitlines():
        if TABLE_BLOCK.match(line):
            rows.append(line)
        elif rows:
            break
    if not rows:
        return [], []
    grid = [_split_md_row(r) for r in rows]
    # drop the |---|---| separator
    body = [g for g in grid[1:] if not all(set(c.strip()) <= set("-: ") for c in g)]
    return grid[0], body


def sig(cell) -> str:
    """Comparison signature of one cell: whitespace and typography normalised."""
    return norm(cell).upper()
