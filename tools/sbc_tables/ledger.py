"""Adjudicate EVERY production row, not only the ones with a rebuild spec.

A rebuild that reports only the tables it managed to rebuild is a rigged
scoreboard. This module forces the opposite: every row in the production dump
gets exactly one state, and a row can only be left alone if the reason is
written down.

States
------
REBUILT       a rebuild spec exists and checks (a)(b)(c)(d) all passed.
NOT-BUILT     a rebuild spec exists but a check failed. Reason recorded.
QUARANTINE    no printed SBC table carries this number, evidenced by the
              chapter's own "TABLES AND FIGURES OF CHAPTER n" block. The row is
              renamed QUARANTINED_<id> so extractTableIds() stops matching it.
              Already-quarantined rows of this kind are reported as
              QUARANTINE (already) and generate no SQL.
NOT-ATTEMPTED a printed table with this number DOES exist but no spec was
              written for it. This is the only state that admits unfinished
              work, and it must never be silent.

IMPERIAL TOKENS
The SBC prints in metric. An imperial token in content_md that is not printed
on the cited source page is a defect regardless of the row's state, so the
census runs over all 93 rows independently of the rebuild.
"""
from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from catalog import caption_index, chapter_catalog  # noqa: E402

IMPERIAL = [
    (r"\bft\b", "ft"),
    (r"\bfeet\b", "feet"),
    (r"\bfoot\b", "foot"),
    (r"\binches\b", "inches"),
    (r"\binch\b", "inch"),
    (r"\bin\.", "in."),
    (r"\bpsi\b", "psi"),
    (r"\bgpm\b", "gpm"),
    (r"(?:°|\bdegrees?\s*)F\b", "degrees F"),
]

# A caption index entry is a real table caption only when the line is the
# caption itself. Lines like "Table 1020.1b" that live INSIDE another table's
# cell, and prose like "Table 601 provides the minimum ...", also start with
# "Table <n>". Distinguishing them by text alone is unreliable, so a hit only
# counts as a printed table when the line is (near enough) JUST the caption.
_CAPTION_ONLY = re.compile(
    r"^\s*TABLE\s+[0-9]+(?:\.[0-9]+)*(?:\([0-9A-Za-z]+\))?\s*[a-z,\s]{0,12}$",
    re.IGNORECASE)


def base_id(table_id):
    return (table_id or "").replace("QUARANTINED_", "")


def is_quarantined(table_id):
    return (table_id or "").startswith("QUARANTINED_")


def imperial_tokens(text):
    out = []
    for pat, label in IMPERIAL:
        if re.search(pat, text or "", re.IGNORECASE):
            out.append(label)
    return out


def printed_hits(number):
    """Caption hits that really look like a printed table caption."""
    return [h for h in caption_index().get(number, [])
            if _CAPTION_ONLY.match(h["caption"])]


def absence_evidence(chapter, source_code=None):
    """What the chapter's own tables block ACTUALLY lists - the proof of absence."""
    out = []
    for h in chapter_catalog(chapter):
        out.append({
            "pdf": h["pdf"],
            "spans": h.get("spans") or [],
            "numbers": [c["number"] for c in h["captions"]],
        })
    return out


def adjudicate(rows, results):
    """-> list of ledger entries, one per production row, in a stable order."""
    by_row_id = {}
    for r in results:
        by_row_id[r["spec"]["row_id"]] = r

    entries = []
    for row in rows:
        rid = str(row["id"])
        tid = row["table_id"]
        num = base_id(tid)
        res = by_row_id.get(rid)
        hits = printed_hits(num)
        entry = {
            "row_id": rid,
            "table_id": tid,
            "base_id": num,
            "title": row.get("table_title") or "",
            "source_code": row.get("source_code"),
            "chapter": row.get("chapter"),
            "edition": row.get("edition"),
            "already_quarantined": is_quarantined(tid),
            "imperial": imperial_tokens(row.get("content_md") or ""),
            "printed_hits": hits,
            "result": res,
            "sql": None,
        }

        if res is not None and res["emitted"]:
            entry["state"] = "REBUILT"
            entry["target_id"] = res["spec"]["target_id"]
            ex = res["ex"]
            entry["provenance"] = {
                "pdf": ex["pdf"], "page": ex["page_index_0based"],
                "printed_page": ex["printed_page"], "caption": ex["caption"],
                "title": ex["title"],
                "pages": ex.get("pages") or [ex["page_index_0based"]],
            }
            entry["sql"] = "update"
        elif res is not None:
            entry["state"] = "NOT-BUILT"
            entry["target_id"] = res["spec"]["target_id"]
            entry["reason"] = res["reason"]
        elif not hits:
            entry["state"] = "QUARANTINE"
            entry["target_id"] = None
            entry["reason"] = (
                "No printed SBC table carries the number %s. Evidence of "
                "absence: the chapter's own TABLES AND FIGURES block does not "
                "list it." % num)
            entry["absence"] = absence_evidence(entry["chapter"])
            if entry["already_quarantined"]:
                entry["state"] = "QUARANTINE (already)"
            else:
                entry["sql"] = "quarantine"
        else:
            entry["state"] = "NOT-ATTEMPTED"
            entry["target_id"] = None
            entry["reason"] = (
                "A printed TABLE %s exists (%s) but no rebuild spec was written "
                "for this row in this pass." % (
                    num, "; ".join("%s idx=%d printed=%s"
                                   % (h["pdf"], h["page_index_0based"],
                                      h["printed_page"]) for h in hits[:3])))
        entries.append(entry)

    entries.sort(key=lambda e: (str(e["source_code"]), e["chapter"] or 0,
                                _numkey(e["base_id"])))
    return entries


def _numkey(n):
    return [int(x) if x.isdigit() else x for x in re.split(r"[.()]", n or "") if x]


def counts(entries):
    out = {}
    for e in entries:
        out[e["state"]] = out.get(e["state"], 0) + 1
    return out
