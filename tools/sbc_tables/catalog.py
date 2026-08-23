"""Catalogue of every table the SBC actually PRINTS, per chapter.

Why this exists
---------------
Proving a table EXISTS is easy: find its caption. Proving one does NOT exist is
the hard half, and it is the half that decides whether a production row gets
quarantined. This module supplies the evidence of absence.

Both SBC volumes collect their tables at the end of each chapter under a heading

    TABLES AND FIGURES OF CHAPTER <n>

and every page of that block carries the running header "CHAPTER <n>-<title>".
A block therefore ends at the first page whose running header names a different
chapter. Everything captioned "TABLE x" inside the block is a table the code
prints for that chapter; a number absent from the block is a number the code
does not print there.

Two caveats, both handled:
  * the front-matter table of contents also lists captions - those lines carry
    dot leaders and are excluded (see is_toc / "....");
  * a table may also be captioned inline in the body text rather than in the
    end-of-chapter block. locate() therefore searches the WHOLE volume set, and
    chapter_block() is used only to justify an absence.

    python catalog.py --chapters            # every chapter block found
    python catalog.py --chapter 10          # captions printed for chapter 10
    python catalog.py --locate 1017.2 601   # where these numbers are printed
"""
from __future__ import annotations

import os
import re
import sys
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from index_pdfs import load_index  # noqa: E402
from sbc_common import pdf_files  # noqa: E402

BLOCK_RE = re.compile(r"TABLES?\s+AND\s+FIGURES?\s+OF\s+CHAPTER\s+(\d+)",
                      re.IGNORECASE)
# The running header, e.g. "CHAPTER 10-MEANS OF EGRESS" (em dash in the PDF).
RUNHDR_RE = re.compile(r"^\s*CHAPTER\s+(\d+)\s*[—–-]", re.IGNORECASE | re.M)
CAPTION_RE = re.compile(
    r"^\s*TABLE\s+([0-9]+(?:\.[0-9]+)*(?:\([0-9A-Za-z]+\))?)(?![0-9.])",
    re.IGNORECASE)

_CACHE: dict = {}

# "...Code-1001-1250.pdf" -> (1001, 1250). Needed because the split volumes sort
# LEXICOGRAPHICALLY as 1-250, 1001-1250, 1251-1500, ..., 251-500, 501-1000, which
# is not reading order; a chapter block that runs off the end of one split has to
# continue into the split that physically follows it.
_SPLIT_RE = re.compile(r"-(\d+)-(\d+)\.pdf$", re.IGNORECASE)


def split_range(basename):
    m = _SPLIT_RE.search(basename)
    return (int(m.group(1)), int(m.group(2))) if m else (10 ** 9, 10 ** 9)


def _volumes(source_code=None):
    """(basename, index) in READING order, not lexicographic order."""
    key = ("vols", source_code)
    if key in _CACHE:
        return _CACHE[key]
    out = []
    for p in pdf_files(source_code):
        base = os.path.basename(p)
        try:
            out.append((base, load_index(base)))
        except FileNotFoundError:
            print("NO INDEX (run index_pdfs.py): %s" % base, file=sys.stderr)
    out.sort(key=lambda t: (t[0].split("-")[0], split_range(t[0])))
    _CACHE[key] = out
    return out


def _page_is_toc(text):
    return sum(1 for ln in (text or "").splitlines() if "...." in ln) >= 5


def captions_on(text):
    """Non-TOC captions on one page: [(number, caption_line)]."""
    out = []
    if _page_is_toc(text):
        return out
    for ln in (text or "").splitlines():
        if "...." in ln:
            continue
        m = CAPTION_RE.match(ln)
        if m:
            out.append((m.group(1), ln.strip()))
    return out


def chapter_blocks(source_code=None):
    """{(volume, chapter): {'start': idx, 'end': idx, 'captions': [...]}}.

    'end' is inclusive. Captions are collected from every page of the block.
    """
    key = ("blocks", source_code)
    if key in _CACHE:
        return _CACHE[key]
    vols = _volumes(source_code)
    out = OrderedDict()

    def scan(vi, start_i, chap, caps, seen, spans):
        """Walk pages from (volume vi, page start_i) while the chapter holds.

        Returns after recording the span; recurses into the next split volume
        when the block runs to the last page of this one.
        """
        base, idx = vols[vi]
        pages = idx["pages"]
        end_i = start_i - 1
        for j in range(start_i, len(pages)):
            hm = RUNHDR_RE.search(pages[j]["text"] or "")
            if j > start_i and hm and int(hm.group(1)) != chap:
                break
            if j > start_i and BLOCK_RE.search(pages[j]["text"] or ""):
                break
            end_i = j
            for num, line in captions_on(pages[j]["text"]):
                if num not in seen:
                    seen.add(num)
                    caps.append({"number": num, "pdf": base,
                                 "page_index_0based": j,
                                 "printed_page": pages[j]["printed"],
                                 "caption": line})
        if end_i >= start_i:
            spans.append({"pdf": base, "start": start_i, "end": end_i})
        # spilled over the split boundary?
        if end_i == len(pages) - 1 and vi + 1 < len(vols):
            nb = vols[vi + 1][0]
            if nb.split("-")[0] == base.split("-")[0]:
                hm = RUNHDR_RE.search(vols[vi + 1][1]["pages"][0]["text"] or "")
                if hm and int(hm.group(1)) == chap:
                    scan(vi + 1, 0, chap, caps, seen, spans)

    for vi, (base, idx) in enumerate(vols):
        for pg in idx["pages"]:
            m = BLOCK_RE.search(pg["text"] or "")
            if not m:
                continue
            chap = int(m.group(1))
            caps, seen, spans = [], set(), []
            scan(vi, pg["i"], chap, caps, seen, spans)
            rec = out.get((base, chap))
            if rec:
                have = {c["number"] for c in rec["captions"]}
                rec["captions"].extend(c for c in caps if c["number"] not in have)
                rec["spans"].extend(spans)
                rec["end"] = max(rec["end"], spans[-1]["end"] if spans else rec["end"])
            else:
                out[(base, chap)] = {
                    "start": pg["i"],
                    "end": spans[-1]["end"] if spans else pg["i"],
                    "spans": spans, "captions": caps}
    _CACHE[key] = out
    return out


def chapter_catalog(chapter, source_code=None):
    """Every caption the code prints in chapter <n>'s tables block, any volume."""
    hits = []
    for (base, chap), rec in chapter_blocks(source_code).items():
        if chap != int(chapter):
            continue
        hits.append({"pdf": base, "start": rec["start"], "end": rec["end"],
                     "spans": rec.get("spans") or [], "captions": rec["captions"]})
    return hits


def caption_index(source_code=None):
    """{table_number: [hit, ...]} built by ONE pass over every indexed page.

    locate() used to rescan all 18 volumes per lookup; surveying 93 production
    rows that way is ~1,700 volume scans and does not finish. Scan once, cache,
    look up.
    """
    key = ("capidx", source_code)
    if key in _CACHE:
        return _CACHE[key]
    out: dict = {}
    for base, idx in _volumes(source_code):
        for pg in idx["pages"]:
            for num, line in captions_on(pg["text"]):
                out.setdefault(num, []).append(
                    {"pdf": base, "page_index_0based": pg["i"],
                     "printed_page": pg["printed"], "caption": line})
    _CACHE[key] = out
    return out


def locate(number, source_code=None):
    """Every non-TOC page that prints 'TABLE <number>' as a caption."""
    return list(caption_index(source_code).get(number, []))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if "--chapters" in args:
        for (base, chap), rec in chapter_blocks().items():
            print("%-58s CHAPTER %-3s idx %4d..%-4d  %3d captions"
                  % (base[:58], chap, rec["start"], rec["end"],
                     len(rec["captions"])))
        return
    if "--chapter" in args:
        n = args[args.index("--chapter") + 1]
        for h in chapter_catalog(n):
            print("=" * 88)
            print("%s  block starts idx %d" % (h["pdf"], h["start"]))
            for sp in h["spans"]:
                print("   span: %-58s idx %d..%d"
                      % (sp["pdf"][:58], sp["start"], sp["end"]))
            for c in h["captions"]:
                print("   TABLE %-14s %-30s idx=%-4d printed=%-6s %s"
                      % (c["number"], c.get("pdf", "")[-28:],
                         c["page_index_0based"], c["printed_page"],
                         c["caption"][:56]))
        return
    if "--locate" in args:
        for num in args[args.index("--locate") + 1:]:
            hits = locate(num)
            if not hits:
                print("TABLE %-14s  NOT PRINTED ANYWHERE" % num)
            for h in hits:
                print("TABLE %-14s %-56s idx=%-4d printed=%-6s %s"
                      % (num, h["pdf"][:56], h["page_index_0based"],
                         h["printed_page"], h["caption"][:60]))
        return
    print(__doc__)


if __name__ == "__main__":
    main()
