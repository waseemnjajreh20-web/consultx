#!/usr/bin/env python3
"""SUB-AGENT A2 (round 4) - SBC 801 Hazardous / Special Chapters resolver.

Filters manual_review_keep entries by hazmat criteria and classifies each into:
  resolved_canonical | resolved_existing | cross_reference_only |
  absent_from_2024_pdf | quarantine | manual_review_keep
Then extracts text for resolved items via pymupdf.
"""

from __future__ import annotations
import datetime as _dt
import hashlib
import json
import os
import re
import sys
from typing import Dict, List, Optional, Tuple

import fitz  # pymupdf

PDF_DIR = r"D:\sbc_consultx"
INPUT_REPORT = r"D:\ConsultX_Clean\reports\sbc801_manual_review_resolution_report.json"
OUTPUT_DIR = r"D:\ConsultX_Clean\data\consultx_brain\full_corpus\extracted_gaps\sbc801_round4_hazmat"
REPORT_MD = r"D:\ConsultX_Clean\reports\sbc801_round4_hazmat_resolution_report.md"
REPORT_JSON = r"D:\ConsultX_Clean\reports\sbc801_round4_hazmat_resolution_report.json"
EXISTING_DIRS = [
    r"D:\ConsultX_Clean\data\consultx_brain\full_corpus\extracted_gaps\sbc801",
    r"D:\ConsultX_Clean\data\consultx_brain\full_corpus\extracted_gaps\sbc801_round2",
    r"D:\ConsultX_Clean\data\consultx_brain\full_corpus\extracted_gaps\sbc801_round3_priority",
    r"D:\ConsultX_Clean\data\consultx_brain\full_corpus\extracted_gaps\sbc801_round3_hazmat",
]

TARGET_CHAPTERS = {15, 16, 20, 23, 24, 25, 28, 29, 31, 32, 35, 37}
MAX_RESOLVED = 25  # token budget cap
AGENT_NAME = "Sub-Agent A2 (round 4)"
NOW_UTC = _dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


# -- Helpers ----------------------------------------------------------------

def matches_hazmat(item: dict) -> bool:
    sec = str(item.get("section_number", "")).strip()
    chap = str(item.get("chapter", "")).strip()
    if re.match(r"^5[0-9]\.", sec):
        return True
    if re.match(r"^6[0-3]\.", sec):
        return True
    try:
        c = int(chap)
        if c in TARGET_CHAPTERS:
            return True
    except (ValueError, TypeError):
        pass
    return False


def slug(section_number: str) -> str:
    return f"sbc-801-section-{section_number.replace('.', '-')}"


def load_input() -> List[dict]:
    with open(INPUT_REPORT, encoding="utf-8") as f:
        data = json.load(f)
    items = data.get("manual_review_keep_items", [])
    return [it for it in items if it.get("status") == "manual_review_keep"
            and matches_hazmat(it)]


def find_existing(section_number: str) -> Optional[str]:
    target = slug(section_number) + ".md"
    for d in EXISTING_DIRS:
        p = os.path.join(d, target)
        if os.path.isfile(p):
            return p
    return None


# -- PDF index --------------------------------------------------------------

def list_pdfs() -> List[str]:
    return sorted(
        os.path.join(PDF_DIR, f)
        for f in os.listdir(PDF_DIR)
        if "SBC 801" in f and f.endswith(".pdf")
    )


def build_pdf_index(pdfs: List[str]) -> Dict[str, List[str]]:
    """Cache raw text for each PDF page (key=pdf, value=list[page_text])."""
    index: Dict[str, List[str]] = {}
    for pdf in pdfs:
        sys.stderr.write(f"[idx] {os.path.basename(pdf)} ... ")
        sys.stderr.flush()
        doc = fitz.open(pdf)
        pages: List[str] = []
        for i in range(len(doc)):
            try:
                pages.append(doc[i].get_text("text"))
            except Exception:
                pages.append("")
        doc.close()
        index[pdf] = pages
        sys.stderr.write(f"{len(pages)} pages\n")
    return index


# -- Section locator --------------------------------------------------------

def find_section_heading(
    section_number: str,
    pdf_index: Dict[str, List[str]],
) -> Tuple[Optional[Tuple[str, int]], int]:
    """Search every page for `SECTION <ref>` heading.

    Returns ((pdf, page_idx) of best heading match, num_body_only_hits).
    A heading match requires the literal `SECTION <ref>` followed by a newline
    or whitespace+capital letter (i.e. heading-like context).
    """
    pat_heading = re.compile(
        rf"\bSECTION\s+{re.escape(section_number)}\b", re.MULTILINE
    )
    heading_hits: List[Tuple[str, int]] = []
    body_hits = 0
    for pdf, pages in pdf_index.items():
        for i, txt in enumerate(pages):
            if not txt:
                continue
            for m in pat_heading.finditer(txt):
                # context check: is this near the top of a section block?
                start = m.start()
                ctx_after = txt[m.end():m.end() + 80]
                # heading is followed by uppercase title or newline
                if re.match(r"\s*\n?\s*[A-Z]", ctx_after) or re.match(r"\s*\n", ctx_after):
                    heading_hits.append((pdf, i))
                else:
                    body_hits += 1
    if heading_hits:
        return heading_hits[0], body_hits
    # fallback: any reference to the bare number that looks like a section start
    pat_bare = re.compile(rf"^\s*{re.escape(section_number)}\s+[A-Z]", re.MULTILINE)
    for pdf, pages in pdf_index.items():
        for i, txt in enumerate(pages):
            if not txt:
                continue
            if pat_bare.search(txt):
                heading_hits.append((pdf, i))
    if heading_hits:
        return heading_hits[0], body_hits
    return None, body_hits


# -- Section body extractor -------------------------------------------------

def extract_section_body(
    section_number: str,
    pdf_index: Dict[str, List[str]],
    pdf: str,
    start_page: int,
) -> Tuple[str, Tuple[int, int]]:
    """Pull text starting at `SECTION <num>` heading to the next heading.

    Walks forward through pages until next `SECTION <other>` or end of PDF.
    Cap is 4 pages to keep extractions tight.
    """
    pages = pdf_index[pdf]
    chunks: List[str] = []
    end_page = start_page
    pat_self_heading = re.compile(
        rf"(?:^|\n)SECTION\s+{re.escape(section_number)}\b"
    )
    pat_next_heading = re.compile(r"(?:^|\n)SECTION\s+(\d+(?:\.\d+)*)\b")

    # find start offset on first page
    first = pages[start_page]
    m = pat_self_heading.search(first)
    if not m:
        # try without leading boundary requirement
        m = re.search(rf"SECTION\s+{re.escape(section_number)}\b", first)
        if not m:
            return "", (start_page + 1, start_page + 1)
    chunks.append(first[m.start():])

    for offset in range(1, 5):
        idx = start_page + offset
        if idx >= len(pages):
            break
        page_text = pages[idx]
        # check for next section heading on this page
        next_m = pat_next_heading.search(page_text)
        if next_m and next_m.group(1) != section_number:
            chunks.append(page_text[:next_m.start()])
            end_page = idx
            break
        chunks.append(page_text)
        end_page = idx
    else:
        # no break; check first chunk for inline next heading
        pass

    # Trim first chunk if it has a *later* heading after the start point
    # (prevents bleeding into the next section).
    body = "".join(chunks)
    rest_search = pat_next_heading.search(body, pos=10)
    # rest_search will hit our own heading first; skip it
    own = re.search(rf"SECTION\s+{re.escape(section_number)}\b", body)
    own_end = own.end() if own else 0
    rest_search = pat_next_heading.search(body, pos=own_end + 1)
    if rest_search and rest_search.group(1) != section_number:
        body = body[: rest_search.start()].rstrip()

    return body, (start_page + 1, end_page + 1)


def quality_check(body: str, section_number: str) -> Tuple[bool, str]:
    if len(body) < 200:
        return False, f"body<200 chars ({len(body)})"
    if section_number not in body:
        return False, "section_ref not verbatim"
    letters = sum(1 for c in body if c.isalpha())
    non_letter_ratio = 1.0 - (letters / max(1, len(body)))
    if non_letter_ratio >= 0.30:
        return False, f"non-letter ratio {non_letter_ratio:.2f} >= 0.30"
    if "§" in body:
        return False, "section symbol present"
    return True, ""


# -- File writers -----------------------------------------------------------

def write_md(record_id: str, fm: dict, body: str) -> Tuple[str, str]:
    md_path = os.path.join(OUTPUT_DIR, f"{record_id}.md")
    meta_path = os.path.join(OUTPUT_DIR, f"{record_id}.meta.json")

    # Sanitize body: drop any "section symbol" character if it slipped through.
    body = body.replace("§", "")

    fm_lines = ["---"]
    for k, v in fm.items():
        if isinstance(v, list):
            fm_lines.append(f"{k}: [{', '.join(str(x) for x in v)}]")
        elif isinstance(v, str):
            fm_lines.append(f'{k}: {v}')
        else:
            fm_lines.append(f"{k}: {v}")
    fm_lines.append("---")
    fm_lines.append("")
    fm_lines.append(f"# Section {fm['section_or_table']}")
    fm_lines.append("")
    fm_lines.append("## Canonical Code Text")
    fm_lines.append("")
    fm_lines.append(body.strip())
    fm_lines.append("")

    md_text = "\n".join(fm_lines)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_text)

    sha = hashlib.sha256(md_text.encode("utf-8")).hexdigest()
    meta = {
        "section_number": fm["section_or_table"],
        "chapter": fm["chapter"],
        "source_pdf": fm["source_pdf"],
        "page_range": fm["page_range"],
        "extraction_method": fm["extraction_method"],
        "extraction_confidence": fm.get("extraction_confidence", 0.65),
        "requires_review": fm.get("requires_review", True),
        "record_id": record_id,
        "body_chars": len(body.strip()),
        "extracted_at_utc": NOW_UTC,
        "agent": AGENT_NAME,
        "sha256_md": sha,
        "section_symbol_count": md_text.count("§"),
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    return md_path, sha


# -- Main loop --------------------------------------------------------------

def main() -> int:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    items = load_input()
    sys.stderr.write(f"matched {len(items)} hazmat items\n")

    pdfs = list_pdfs()
    sys.stderr.write(f"loading {len(pdfs)} PDFs ...\n")
    index = build_pdf_index(pdfs)
    sys.stderr.write("PDF index built\n")

    classification: Dict[str, List[dict]] = {
        "resolved_canonical": [],
        "resolved_existing": [],
        "cross_reference_only": [],
        "absent_from_2024_pdf": [],
        "quarantine": [],
        "manual_review_keep": [],
    }

    resolved_count = 0

    for it in items:
        sec = it["section_number"]
        chap = str(it["chapter"])
        record_id = slug(sec)

        # Pre-existing extraction in another sbc801 dir?
        existing = find_existing(sec)
        if existing:
            classification["resolved_existing"].append({
                **it, "md_path": existing, "extraction_method": "reuse_existing",
            })
            continue

        if resolved_count >= MAX_RESOLVED:
            classification["manual_review_keep"].append({
                **it, "reason": "round4_token_budget_cap"
            })
            continue

        location, body_hits = find_section_heading(sec, index)
        if not location:
            if body_hits > 0:
                classification["cross_reference_only"].append({
                    **it, "body_hits": body_hits
                })
            else:
                classification["absent_from_2024_pdf"].append(dict(it))
            continue

        pdf_path, page_idx = location
        body, page_range = extract_section_body(sec, index, pdf_path, page_idx)
        ok, reason = quality_check(body, sec)
        if not ok:
            classification["manual_review_keep"].append({
                **it, "reason": f"quality_check_failed: {reason}"
            })
            continue

        fm = {
            "record_id": record_id,
            "code_family": "SBC 801",
            "edition": 2024,
            "section_or_table": sec,
            "chapter": chap,
            "source_pdf": os.path.basename(pdf_path),
            "page_range": list(page_range),
            "extraction_method": "pymupdf-round4-hazmat",
            "extraction_confidence": 0.65,
            "requires_review": True,
            "extracted_at_utc": f'"{NOW_UTC}"',
            "agent": AGENT_NAME,
        }
        md_path, sha = write_md(record_id, fm, body)
        classification["resolved_canonical"].append({
            "section_number": sec,
            "chapter": chap,
            "md_path": md_path,
            "meta_path": md_path.replace(".md", ".meta.json"),
            "body_chars": len(body.strip()),
            "sha256_md": sha,
            "source_pdf": os.path.basename(pdf_path),
            "page_range": list(page_range),
        })
        resolved_count += 1

    # Build report
    summary = {
        "agent": AGENT_NAME,
        "code_family": "SBC 801",
        "edition": 2024,
        "generated_at_utc": NOW_UTC,
        "input_report": INPUT_REPORT.replace("\\", "/"),
        "filter_criteria": {
            "section_ref_regex": ["^5[0-9]\\.", "^6[0-3]\\."],
            "chapters": sorted(TARGET_CHAPTERS),
        },
        "matched_total": len(items),
        "token_budget_cap": MAX_RESOLVED,
        "counts": {k: len(v) for k, v in classification.items()},
        "section_symbol_total": 0,
        "output_dir": OUTPUT_DIR.replace("\\", "/"),
        "resolved_canonical_items": classification["resolved_canonical"],
        "resolved_existing_items": classification["resolved_existing"],
        "cross_reference_only_items": classification["cross_reference_only"],
        "absent_from_2024_pdf_items": classification["absent_from_2024_pdf"],
        "quarantine_items": classification["quarantine"],
        "manual_review_keep_items": classification["manual_review_keep"],
    }

    with open(REPORT_JSON, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    # Markdown report
    md_lines = [
        f"# SBC 801 Round 4 Hazmat Resolution Report",
        "",
        f"- Agent: {AGENT_NAME}",
        f"- Generated (UTC): {NOW_UTC}",
        f"- Input: `{INPUT_REPORT}`",
        f"- Output dir: `{OUTPUT_DIR}`",
        f"- Token budget cap (resolved_canonical): {MAX_RESOLVED}",
        f"- Matched hazmat items: {len(items)}",
        "",
        "## Classification Counts",
        "",
        "| Class | Count |",
        "|-------|-------|",
    ]
    for k, v in summary["counts"].items():
        md_lines.append(f"| {k} | {v} |")
    md_lines += [
        "",
        "## Resolved Canonical (top 5)",
        "",
        "| Section | Chapter | PDF | Pages | Body chars | sha256 (md) |",
        "|---------|---------|-----|-------|------------|-------------|",
    ]
    for it in classification["resolved_canonical"][:5]:
        md_lines.append(
            f"| {it['section_number']} | {it['chapter']} | "
            f"{it['source_pdf']} | {it['page_range'][0]}-{it['page_range'][1]} | "
            f"{it['body_chars']} | `{it['sha256_md'][:16]}...` |"
        )
    md_lines += ["", "## Notes", ""]
    md_lines.append(
        "- All extractions: section symbol banned (count must be 0)."
    )
    md_lines.append(
        "- Strict quality gate: >=200 chars; section_ref verbatim; "
        "non-letter ratio <30%."
    )

    with open(REPORT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))

    print(json.dumps({k: len(v) for k, v in classification.items()}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
