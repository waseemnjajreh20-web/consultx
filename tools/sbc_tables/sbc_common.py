"""Shared helpers for the SBC code-table rebuild toolchain.

CONVENTIONS (fixed for the whole toolchain):
  * Page indices are ALWAYS 0-BASED indices into the *split PDF file* named.
  * "printed page" is the number the SBC prints in the page footer
    (e.g. "SBC 201-CC-2024 1188"), recovered by regex; None when absent.
  * Provenance is therefore the triple (pdf_basename, page_index_0based, printed_page).
    Re-reading provenance = pdfplumber.open(pdf)[page_index_0based].
"""
from __future__ import annotations

import os
import re

PDF_DIR = os.environ.get("SBC_PDF_DIR", r"D:\sbc_consultx")

# Per-page PyMuPDF text cache for the 18 split PDFs (see index_pdfs.py).
# Set SBC_CACHE_DIR to relocate. The fallback below is a scratch directory that
# may not exist on a fresh machine; index_pdfs.py recreates it in ~2 minutes.
# NEVER hardcode a per-session scratch path here without an env override - a
# previous revision pinned a dead session directory and every locate silently
# failed with FileNotFoundError.
CACHE_DIR = os.environ.get(
    "SBC_CACHE_DIR",
    r"C:\Users\TOSHIBA\AppData\Local\Temp\claude\D--ConsultX-Clean"
    r"\00d12c4d-422f-4efd-b592-d5916b98be88\scratchpad\laneB\sbc_cache",
)

SBC201 = "SBC 201"
SBC801 = "SBC 801"


def pdf_files(source_code: str | None = None) -> list[str]:
    """Absolute paths of the split SBC PDFs, optionally filtered by code."""
    out = []
    for name in sorted(os.listdir(PDF_DIR)):
        if not name.lower().endswith(".pdf"):
            continue
        if source_code and not name.startswith(source_code):
            continue
        out.append(os.path.join(PDF_DIR, name))
    return out


_FOOTER = re.compile(r"SBC\s+(201|801)-[A-Z]{2,3}-(\d{4})\s+(\d{1,4})")


def printed_page(page_text: str):
    """Return the printed page number in the SBC footer, or None."""
    hits = _FOOTER.findall(page_text or "")
    if not hits:
        return None
    return int(hits[-1][2])


def norm(s):
    """Whitespace/typography normalisation used by every comparison."""
    if s is None:
        return ""
    s = s.replace("\u2019", "'").replace("\u2018", "'")
    s = s.replace("\u201c", '"').replace("\u201d", '"')
    s = s.replace("\u2013", "-").replace("\u2014", "-").replace("\u2212", "-")
    s = s.replace("\ufffd", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()
