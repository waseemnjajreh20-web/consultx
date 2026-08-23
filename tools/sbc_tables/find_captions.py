"""Locate printed "TABLE <n>" captions in the SBC PDFs.

    python find_captions.py --all                 # every caption found, per volume
    python find_captions.py 1017.2 1006.2.1 ...   # locate specific table numbers

A caption is a line whose text begins with TABLE <number>. Continuation pages of
a multi-page table repeat the caption with "-continued" / "(cont" in the SBC, and
the table of contents lists captions too; both are reported so the caller can see
every candidate rather than silently picking one.
"""
from __future__ import annotations

import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from index_pdfs import load_index  # noqa: E402
from sbc_common import pdf_files  # noqa: E402

# SBC prints captions both as "TABLE 1017.2" and as "Table 1004.5" -> case-insensitive.
CAPTION_RE = re.compile(
    r"^\s*TABLE\s+([0-9]+(?:\.[0-9]+)*(?:\([0-9a-zA-Z]+\))?)\b(.*)$", re.IGNORECASE
)


def scan_volume(pdf_basename: str):
    """Yield (table_number, page_index_0based, printed_page, caption_line, is_toc)."""
    idx = load_index(pdf_basename)
    for pg in idx["pages"]:
        lines = (pg["text"] or "").splitlines()
        # A table-of-contents page is dominated by dot leaders.
        is_toc = sum(1 for ln in lines if "...." in ln) >= 5
        for ln in lines:
            m = CAPTION_RE.match(ln)
            if not m:
                continue
            if "...." in ln:      # dot-leader TOC entry
                is_line_toc = True
            else:
                is_line_toc = is_toc
            yield (m.group(1), pg["i"], pg["printed"], ln.strip(), is_line_toc)


def find(numbers, volumes=None):
    """Map table number -> list of hit dicts across all indexed volumes."""
    want = set(numbers) if numbers else None
    out = defaultdict(list)
    for p in pdf_files():
        base = os.path.basename(p)
        if volumes and not any(v in base for v in volumes):
            continue
        try:
            hits = list(scan_volume(base))
        except FileNotFoundError:
            print("NO INDEX (run index_pdfs.py): %s" % base, file=sys.stderr)
            continue
        for num, i, printed, line, is_toc in hits:
            if want is not None and num not in want:
                continue
            out[num].append(
                {"pdf": base, "page_index_0based": i, "printed_page": printed,
                 "caption": line, "toc": is_toc}
            )
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    res = find(None if "--all" in sys.argv else args)

    def key(n):
        return [int(x) if x.isdigit() else x for x in re.split(r"[.()]", n) if x]

    for num in sorted(res, key=lambda n: (len(key(n)), key(n))):
        for h in res[num]:
            print("TABLE %-14s %-58s idx=%-4d printed=%-6s %s%s"
                  % (num, h["pdf"], h["page_index_0based"], h["printed_page"],
                     "[TOC] " if h["toc"] else "", h["caption"][:70]))
    if not res:
        print("no captions matched")


if __name__ == "__main__":
    main()
