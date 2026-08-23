"""Build a per-PDF page-text cache used to LOCATE table captions.

Why two engines: pdfplumber costs 26-175 s per page on the image-heavy SBC
volumes (measured), so indexing ~4,300 pages with it is infeasible. PyMuPDF
reads the same text layer in milliseconds. PyMuPDF is used ONLY to find which
page a caption is on; every value that ends up in content_md is extracted with
pdfplumber (see extract_tables.py). Both libraries index the same physical
pages, so the 0-based page index is identical between them - assert_page_counts()
proves that per file.

    python index_pdfs.py            # index every SBC PDF
    python index_pdfs.py --force    # rebuild even if the cache exists

Output: <CACHE_DIR>/<pdf basename>.pages.json
        {"pdf":..., "n_pages":N, "pages":[{"i":0based,"printed":int|null,"text":str}]}
"""
from __future__ import annotations

import json
import os
import sys

import fitz  # PyMuPDF

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sbc_common import CACHE_DIR, pdf_files, printed_page  # noqa: E402


def cache_path(pdf_path: str) -> str:
    return os.path.join(CACHE_DIR, os.path.basename(pdf_path) + ".pages.json")


def index_one(pdf_path: str, force: bool = False) -> str:
    out = cache_path(pdf_path)
    if os.path.exists(out) and not force:
        return "cached"
    pages = []
    with fitz.open(pdf_path) as doc:
        for i, page in enumerate(doc):
            txt = page.get_text("text") or ""
            pages.append({"i": i, "printed": printed_page(txt), "text": txt})
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(
            {"pdf": os.path.basename(pdf_path), "n_pages": len(pages), "pages": pages},
            fh,
        )
    return "indexed %d pages" % len(pages)


def load_index(pdf_basename: str):
    with open(os.path.join(CACHE_DIR, pdf_basename + ".pages.json"), encoding="utf-8") as fh:
        return json.load(fh)


def assert_page_counts():
    """Prove PyMuPDF and pdfplumber agree on page count (=> identical 0-based idx)."""
    import pdfplumber

    for p in pdf_files():
        with fitz.open(p) as d:
            a = d.page_count
        with pdfplumber.open(p) as d:
            b = len(d.pages)
        print("%-60s fitz=%d pdfplumber=%d %s" % (os.path.basename(p), a, b, "OK" if a == b else "MISMATCH"))


def main():
    if "--assert-pages" in sys.argv:
        assert_page_counts()
        return
    force = "--force" in sys.argv
    for p in pdf_files():
        print("%-60s %s" % (os.path.basename(p), index_one(p, force)), flush=True)


if __name__ == "__main__":
    main()
