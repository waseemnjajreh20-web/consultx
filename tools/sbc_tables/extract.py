"""Caption-anchored table extraction from the SBC PDFs with pdfplumber.

pdfplumber is the ONLY engine allowed to produce a value that reaches content_md.
PyMuPDF (index_pdfs.py) is used purely to decide which page to open.

    extract_captioned_table(pdf_path, page_index_0based, table_number, occurrence=0)

Returns provenance (pdf, page_index_0based, printed_page), the caption and printed
title, the raw pdfplumber grid, a SPAN-EXPANDED grid, the header/data split and the
footnote lines.

Span expansion: a merged cell in a printed table is returned by pdfplumber as text
at its starting grid position and None at every position it covers. Expansion
replicates that text across the covered positions using the cell's own bbox against
the table's column/row edges. That is geometry, not interpretation - it recovers
what the printed page shows at each visual position and nothing else.

Selection rule (deterministic and re-derivable): among the ruled tables on the page,
take the first whose bbox top lies at/below the caption line and above the NEXT
caption line on that page.
"""
from __future__ import annotations

import os
import re
import sys

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sbc_common import norm, printed_page  # noqa: E402

# NOTE the trailing (?![0-9.]) rather than \b: "TABLE 1006.3.4(1)" ends on ')',
# and \b would not match between ')' and end-of-line, so the regex would silently
# backtrack and report the number as "1006.3.4" - conflating two different tables.
CAPTION_RE = re.compile(
    r"^\s*TABLE\s+([0-9]+(?:\.[0-9]+)*(?:\([0-9A-Za-z]+\))?)(?![0-9.])", re.IGNORECASE
)
TOL = 2.0

_HANDLES: dict[str, object] = {}


def _open(pdf_path: str):
    """One pdfplumber handle per file: reopening a 34 MB volume costs minutes."""
    if pdf_path not in _HANDLES:
        _HANDLES[pdf_path] = pdfplumber.open(pdf_path)
    return _HANDLES[pdf_path]


def close_all():
    for h in _HANDLES.values():
        h.close()
    _HANDLES.clear()


def _lines_with_y(page):
    """Group words into visual lines: [(top, text)] ordered top-down."""
    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
    buckets: dict[int, list] = {}
    for w in words:
        buckets.setdefault(round(w["top"] / 3.0), []).append(w)
    out = []
    for key in sorted(buckets):
        ws = sorted(buckets[key], key=lambda w: w["x0"])
        out.append((min(w["top"] for w in ws), " ".join(w["text"] for w in ws)))
    return out


def caption_positions(page):
    """[(top, table_number, caption_text)] for every caption line on the page."""
    hits = []
    for top, text in _lines_with_y(page):
        m = CAPTION_RE.match(text)
        if m and "...." not in text:
            hits.append((top, m.group(1), text.strip()))
    return hits


def _edges(table):
    """Sorted, tolerance-collapsed x and y grid edges of a pdfplumber Table."""
    xs, ys = set(), set()
    for row in table.rows:
        for c in row.cells:
            if c is None:
                continue
            xs.add(round(c[0], 1))
            xs.add(round(c[2], 1))
            ys.add(round(c[1], 1))
            ys.add(round(c[3], 1))

    def collapse(vals):
        out = []
        for v in sorted(vals):
            if not out or v - out[-1] > TOL:
                out.append(v)
        return out

    return collapse(xs), collapse(ys)


def expand_spans(table, raw):
    """Replicate merged-cell text across every grid position the cell covers."""
    xedges, _ = _edges(table)
    ncols = max(len(r) for r in raw)
    grid = [[None] * ncols for _ in raw]
    spanned = [[False] * ncols for _ in raw]

    def col_range(x0, x1):
        first = last = None
        for j in range(len(xedges) - 1):
            lo, hi = xedges[j], xedges[j + 1]
            if lo >= x0 - TOL and hi <= x1 + TOL:
                first = j if first is None else first
                last = j
        return first, last

    # origin[r][c] = (row, col) of the printed cell that occupies this position.
    origin = [[None] * ncols for _ in raw]
    own = [0] * len(raw)          # how many cells of its own each row has

    # PASS 1 - every cell writes its OWN grid position first. A cell that exists
    # in its own right must never be overwritten by a neighbour's span; getting
    # this order wrong silently replaces e.g. "Roof construction" with the
    # "Floor construction" label of the row above.
    plan = []
    for i, row in enumerate(table.rows):
        if i >= len(raw):
            break
        for j, cell in enumerate(row.cells):
            if cell is None or j >= ncols:
                continue
            own[i] += 1
            text = raw[i][j] if j < len(raw[i]) else None
            c0, c1 = col_range(cell[0], cell[2])
            if c0 is None:
                c0 = c1 = j
            rhi = i
            for k in range(i + 1, len(table.rows)):
                mid = None
                for c2 in table.rows[k].cells:
                    if c2 is not None:
                        mid = (c2[1] + c2[3]) / 2.0
                        break
                if mid is not None and mid < cell[3] - TOL:
                    rhi = k
                else:
                    break
            grid[i][c0] = text
            spanned[i][c0] = False
            origin[i][c0] = (i, j)
            plan.append((i, j, c0, c1, rhi, text))

    # PASS 2 - fill the positions a merged cell covers, without ever clobbering
    # a position that pass 1 already claimed as some cell's own.
    for (i, j, c0, c1, rhi, text) in plan:
        for rr in range(i, min(rhi + 1, len(grid))):
            for cc in range(c0, min(c1 + 1, ncols)):
                if (rr, cc) == (i, c0):
                    continue
                if origin[rr][cc] is None:
                    grid[rr][cc] = text
                    spanned[rr][cc] = True
                    origin[rr][cc] = (i, j)
    return grid, spanned, origin, own


def _is_header_row(row):
    vals = [norm(c) for c in row if norm(c)]
    if not vals:
        return True
    letters = "".join(ch for v in vals for ch in v if ch.isalpha())
    if not letters:
        return False
    return sum(1 for ch in letters if ch.isupper()) / len(letters) > 0.85


def split_header(grid, origin=None, own=None, ncols=None):
    """Split the (possibly multi-level) printed header from the data rows.

    Row 0 is always header. A later row is a header CONTINUATION when it is
    geometrically part of the header block: it owns fewer cells than the table
    has columns, and the positions it does not own are filled by a cell that
    started in an earlier header row (a vertical merge such as an OCCUPANCY
    stub spanning both header levels). That is what distinguishes
    "Without sprinkler system | With sprinkler system" - a mixed-case second
    header level - from a genuine data row, which owns a cell in every column.

    Falls back to the all-caps heuristic when geometry is unavailable.
    """
    if origin is None or own is None or ncols is None:
        n = 0
        for row in grid:
            if _is_header_row(row):
                n += 1
            else:
                break
        if n == 0 or n == len(grid):
            n = 1
        return grid[:n], grid[n:]

    n = 1
    while n < len(grid):
        if own[n] >= ncols:
            break
        carried = any(
            origin[n][c] is not None and origin[n][c][0] < n for c in range(ncols)
        )
        if not carried:
            break
        n += 1
    if n >= len(grid):
        n = 1
    return grid[:n], grid[n:]


def flatten_header(header_rows, ncols):
    """Column-wise merge of a span-expanded multi-level header, de-duplicated."""
    out = []
    for j in range(ncols):
        parts, seen = [], set()
        for row in header_rows:
            v = norm(row[j]) if j < len(row) else ""
            if v and v not in seen:
                seen.add(v)
                parts.append(v)
        out.append(" - ".join(parts))
    return out


# A footnote begins with a marker: "a.", "b.", "NP =", "NA =", "S =", "For SI:".
# Anything else is the wrap of the footnote above it. These strings go straight
# into the model's context, so a footnote split mid-sentence across two bullets
# reads as two separate (and both incomplete) provisions.
#
# The marker may sit ALONE on its line - the SBC prints Table 1006.2.1 footnote
# b as a bare "b." with its text on the following line. An earlier version
# required whitespace AFTER the dot, so a bare "b." failed to register as a
# marker and footnote b was swallowed into footnote a's bullet. That is a safety
# defect, not a cosmetic one: footnote a cites Sections 903.3.1.1/903.3.1.2 while
# footnote b cites Section 903.2.5, and the Group H rows of that table are marked
# "7.5b"/"23b" - merging the two lets a reader attach the wrong sprinkler
# standard to a hazardous-materials occupancy. Hence (?=\s|$).
_FOOT_START = re.compile(
    r"^\s*(?:[a-z]\.(?=\s|$)|[A-Z]{1,4}\s*=|For\s+SI\s*:|Note\s|\*)",
    re.IGNORECASE)


def join_footnotes(lines):
    """Re-join footnote lines that the PDF wrapped mid-sentence."""
    out = []
    for ln in lines:
        s = (ln or "").strip()
        if not s:
            continue
        if out and not _FOOT_START.match(s):
            out[-1] = (out[-1].rstrip() + " " + s).strip()
        else:
            out.append(s)
    return out


def extract_captioned_table(pdf_path, page_index, table_number, occurrence=0):
    pdf = _open(pdf_path)
    page = pdf.pages[page_index]
    page_text = page.extract_text() or ""

    caps = caption_positions(page)
    mine = [c for c in caps if c[1] == table_number]
    if not mine:
        return {"error": "caption 'TABLE %s' not found on %s page index %d"
                         % (table_number, os.path.basename(pdf_path), page_index),
                "captions_on_page": [c[1] for c in caps]}
    if occurrence >= len(mine):
        return {"error": "occurrence %d of caption 'TABLE %s' not present (found %d)"
                         % (occurrence, table_number, len(mine))}
    cap_top, _, cap_text = mine[occurrence]
    later = [c[0] for c in caps if c[0] > cap_top + 1]
    next_cap_top = min(later) if later else page.height

    chosen = None
    for t in sorted(page.find_tables(), key=lambda t: t.bbox[1]):
        if t.bbox[1] >= cap_top - TOL and t.bbox[1] < next_cap_top:
            chosen = t
            break
    if chosen is None:
        return {"error": "no ruled table between caption 'TABLE %s' and the next "
                         "caption on %s page index %d"
                         % (table_number, os.path.basename(pdf_path), page_index),
                "caption": cap_text}

    raw = chosen.extract()
    grid, spanned, origin, own = expand_spans(chosen, raw)
    ncols = max(len(r) for r in grid)
    header_rows, data_rows = split_header(grid, origin, own, ncols)

    title_lines = [txt for top, txt in _lines_with_y(page)
                   if cap_top + 1 < top < chosen.bbox[1] - 1]
    foot = [txt for top, txt in _lines_with_y(page)
            if chosen.bbox[3] - 1 < top < next_cap_top]
    foot = [f for f in foot if not re.match(r"^SBC\s+\d+-", f) and f.strip() != "-"]
    foot = join_footnotes(foot)

    return {
        "pdf": os.path.basename(pdf_path),
        "page_index_0based": page_index,
        "printed_page": printed_page(page_text),
        "table_number": table_number,
        "occurrence": occurrence,
        "caption": cap_text,
        "title": " ".join(title_lines).strip(),
        "bbox": [round(v, 2) for v in chosen.bbox],
        "ncols": ncols,
        "raw_rows": raw,
        "grid": grid,
        "spanned": spanned,
        "header_rows": header_rows,
        "flat_header": flatten_header(header_rows, ncols),
        "data_rows": data_rows,
        "footnotes": foot,
        "page_text": page_text,
    }


def extract_multipage(pdf_path, pages, table_number, occurrence=0):
    """A table the SBC prints across consecutive pages, each repeating the caption.

    Returns the first page's result with the later pages' DATA rows appended, plus
    a 'parts' list holding each page's own result so every page keeps its own
    provenance and can be re-verified independently by checks.py.
    """
    parts = []
    for k, pg in enumerate(pages):
        r = extract_captioned_table(pdf_path, pg, table_number,
                                    occurrence if k == 0 else 0)
        if "error" in r:
            return {"error": "page index %d: %s" % (pg, r["error"]), "parts": parts}
        parts.append(r)

    base = dict(parts[0])
    for other in parts[1:]:
        if [norm(h) for h in other["flat_header"]] != \
                [norm(h) for h in base["flat_header"]]:
            return {"error": "continuation page index %d has a different header: "
                             "%r vs %r" % (other["page_index_0based"],
                                           other["flat_header"],
                                           base["flat_header"]),
                    "parts": parts}
        base["data_rows"] = base["data_rows"] + other["data_rows"]
        base["footnotes"] = base["footnotes"] + other["footnotes"]
        base["spanned"] = base["spanned"] + other["spanned"][len(other["header_rows"]):]
        base["page_text"] = base["page_text"] + "\n" + other["page_text"]
    base["parts"] = parts
    base["pages"] = list(pages)
    return base


def recover_footnotes_from_next_page(pdf_path, page_index):
    """Footnote block that spilled onto the following page, above its first caption."""
    pdf = _open(pdf_path)
    if page_index + 1 >= len(pdf.pages):
        return []
    page = pdf.pages[page_index + 1]
    caps = caption_positions(page)
    limit = min([c[0] for c in caps], default=page.height)
    out = []
    for top, txt in _lines_with_y(page):
        if top >= limit:
            break
        if re.match(r"^SBC\s+\d+-", txt) or txt.strip() == "-":
            continue
        if re.match(r"^CHAPTER\s", txt, re.IGNORECASE):
            continue
        out.append(txt)
    # only keep it when it really looks like a footnote block
    if out and re.match(r"^[a-z]\.\s", out[0]):
        return join_footnotes(out)
    return []


def main():
    """python extract.py <pdf> <page_index_0based> <table_number> [occ] [--json]"""
    import json
    sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    pdf, idx, num = args[0], int(args[1]), args[2]
    occ = int(args[3]) if len(args) > 3 else 0
    r = extract_captioned_table(pdf, idx, num, occ)
    r.pop("page_text", None)
    if "--json" in sys.argv:
        r.pop("raw_rows", None)
        r.pop("spanned", None)
        print(json.dumps(r, ensure_ascii=False, indent=1))
    elif "error" in r:
        print("ERROR: " + r["error"])
        if r.get("captions_on_page"):
            print("captions on page: %s" % r["captions_on_page"])
    else:
        print("CAPTION    : %s" % r["caption"])
        print("TITLE      : %s" % r["title"])
        print("PROVENANCE : %s | page_index_0based=%d | printed_page=%s"
              % (r["pdf"], r["page_index_0based"], r["printed_page"]))
        print("HEADER (%d cols):" % r["ncols"])
        for h in r["flat_header"]:
            print("   | %s" % h)
        print("DATA ROWS (%d):" % len(r["data_rows"]))
        for row in r["data_rows"]:
            print("   " + " | ".join(
                "" if c is None else c.replace("\n", " ") for c in row))
        print("FOOTNOTES (%d):" % len(r["footnotes"]))
        for f in r["footnotes"]:
            print("   %s" % f)
    close_all()


if __name__ == "__main__":
    main()
