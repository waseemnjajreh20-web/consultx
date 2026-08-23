"""Ad-hoc probe: dump text + tables from one page of one SBC PDF.
Usage: python probe.py "<pdf path>" <page_index_0based> [--tables]
Page indices printed by this tool are 0-BASED throughout the sbc_tables toolchain.
"""
import sys, pdfplumber

sys.stdout.reconfigure(encoding="utf-8")

path = sys.argv[1]
idx = int(sys.argv[2])
want_tables = "--tables" in sys.argv

with pdfplumber.open(path) as pdf:
    print("PAGE COUNT:", len(pdf.pages))
    p = pdf.pages[idx]
    txt = p.extract_text() or ""
    print("=== TEXT (0-based page index %d) ===" % idx)
    print(txt)
    if want_tables:
        for ti, t in enumerate(p.extract_tables()):
            print("=== TABLE %d (%d rows) ===" % (ti, len(t)))
            for r in t:
                print(" | ".join("" if c is None else c.replace("\n", "\n") for c in r))
