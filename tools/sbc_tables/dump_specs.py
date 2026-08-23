"""Extract and print every table in specs.SPECS, for eyeballing before a build.

    python dump_specs.py               # all specs
    python dump_specs.py 1017.2 601    # only these production table_ids
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import close_all, extract_captioned_table  # noqa: E402
from sbc_common import PDF_DIR  # noqa: E402
from specs import SPECS  # noqa: E402


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    only = set(a for a in sys.argv[1:] if not a.startswith("--"))
    for s in SPECS:
        if only and s["table_id"] not in only:
            continue
        print("=" * 78)
        print("%s  ->  %s   [%s]" % (s["table_id"], s["target_id"], s["status"]))
        r = extract_captioned_table(
            os.path.join(PDF_DIR, s["pdf"]), s["page"], s["number"], s["occurrence"]
        )
        if "error" in r:
            print("  ERROR: %s" % r["error"])
            if r.get("captions_on_page"):
                print("  captions on page: %s" % r["captions_on_page"])
            continue
        print("  %s | idx=%d | printed=%s" % (r["pdf"][:46], r["page_index_0based"],
                                              r["printed_page"]))
        print("  CAPTION: %s" % r["caption"])
        print("  TITLE  : %s" % r["title"][:120])
        print("  HEADER :")
        for h in r["flat_header"]:
            print("     | %s" % h[:150])
        print("  DATA (%d rows):" % len(r["data_rows"]))
        for row in r["data_rows"]:
            print("     " + " | ".join(
                "" if c is None else c.replace("\n", " ") for c in row)[:200])
        print("  FOOTNOTES: %d lines" % len(r["footnotes"]))
    close_all()


if __name__ == "__main__":
    main()
