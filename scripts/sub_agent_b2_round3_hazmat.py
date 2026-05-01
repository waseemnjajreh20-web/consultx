"""
Sub-Agent B2 (round 3) — chapters 50-63 hazmat / special-sections classifier+extractor
for SBC 801 manual_review_keep entries.

Inputs:
  - D:/ConsultX_Clean/reports/sbc801_manual_review_resolution_report.json
  - D:/SBC-CC-201-801/raw/sbc801/*.pdf  (10 PDFs)

Outputs:
  - D:/ConsultX_Clean/data/consultx_brain/full_corpus/extracted_gaps/sbc801_round3_hazmat/
      one .md + one .meta.json per resolved real_section item
  - D:/ConsultX_Clean/reports/sbc801_round3_hazmat_classification_report.md
  - D:/ConsultX_Clean/reports/sbc801_round3_hazmat_classification_report.json

Hard rules:
  - Section symbol "U+00A7" ("§") banned in any saved file (count must be 0).
  - LOCAL ONLY (no writes to D:/sbc_consultx).
  - Strict extraction: body >= 200 chars, contains section_number verbatim,
    non-letter ratio < 30%.
  - Token cap: at most 25 real_section resolutions; the rest stay
    classified but unresolved.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import fitz  # PyMuPDF


REPORT_IN = Path(r"D:/ConsultX_Clean/reports/sbc801_manual_review_resolution_report.json")
PDF_DIR = Path(r"D:/SBC-CC-201-801/raw/sbc801")
OUT_DIR = Path(
    r"D:/ConsultX_Clean/data/consultx_brain/full_corpus/extracted_gaps/sbc801_round3_hazmat"
)
REPORT_MD = Path(r"D:/ConsultX_Clean/reports/sbc801_round3_hazmat_classification_report.md")
REPORT_JSON = Path(r"D:/ConsultX_Clean/reports/sbc801_round3_hazmat_classification_report.json")

CHAP_PATTERN = re.compile(r"^(5[0-9]|6[0-3])\d{2}")
TOKEN_CAP = 25
MIN_BODY_CHARS = 200
MAX_NONLETTER_RATIO = 0.30
SECTION_SYMBOL = "§"  # § banned

NOW_UTC = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
AGENT = "Sub-Agent B2 (round 3 hazmat)"


def load_targets():
    with REPORT_IN.open("r", encoding="utf-8") as f:
        data = json.load(f)
    items = data["manual_review_keep_items"]
    targets = [it for it in items if CHAP_PATTERN.match(str(it.get("section_number", "")))]
    # stable sort: shortest section_number first (parents before children),
    # then numeric within
    targets.sort(key=lambda x: (str(x["section_number"]).count("."), str(x["section_number"])))
    return targets


def open_pdfs() -> list[tuple[str, fitz.Document]]:
    """Open all SBC 801 PDFs once and keep them in memory."""
    pdfs = []
    for path in sorted(PDF_DIR.glob("*.pdf")):
        try:
            doc = fitz.open(str(path))
        except Exception as exc:  # noqa: BLE001
            print(f"warn: could not open {path.name}: {exc}")
            continue
        pdfs.append((path.name, doc))
    return pdfs


def find_heading_occurrences(pdfs, ref: str):
    """
    Return a list of (pdf_name, page_index, page_text) where the verbatim
    heading "SECTION <ref>" (case-sensitive) appears, AND a separate count of
    body-only references (e.g. mentioned inside text such as "in accordance
    with Section <ref>").
    """
    heading_pat = re.compile(r"\bSECTION\s+" + re.escape(ref) + r"\b")
    # body-reference pattern: lowercase 'Section <ref>' or text-context occurrences
    body_pat = re.compile(r"\b(?:in accordance with|see|per|under|of|Section)\s+Section\s+" + re.escape(ref) + r"\b", re.IGNORECASE)
    plain_pat = re.compile(r"\bSection\s+" + re.escape(ref) + r"\b")

    heading_hits = []  # list of (pdf_name, page_idx, text)
    body_only_hits = 0
    plain_hits = 0
    for pdf_name, doc in pdfs:
        for page_idx in range(doc.page_count):
            text = doc.load_page(page_idx).get_text("text")
            if not text:
                continue
            if heading_pat.search(text):
                heading_hits.append((pdf_name, page_idx, text))
            elif plain_pat.search(text):
                plain_hits += plain_pat.findall(text).__len__()
                if body_pat.search(text):
                    body_only_hits += 1
    return heading_hits, body_only_hits, plain_hits


def extract_section_body(heading_hits, ref: str) -> tuple[str, str, list[int]]:
    """
    Choose the FIRST heading occurrence; extract everything from "SECTION <ref>"
    until the next "SECTION <NNNN>" pattern OR the end of the page if no later
    boundary.  Pulls in following pages until a new SECTION boundary is found
    or a page-cap is reached.
    Returns (body_text, source_pdf, [first_page, last_page]).
    """
    pdf_name, page_idx, first_text = heading_hits[0]
    heading_pat = re.compile(r"\bSECTION\s+" + re.escape(ref) + r"\b")
    next_section_pat = re.compile(r"\bSECTION\s+\d{3,4}(?:\s|$)")

    m = heading_pat.search(first_text)
    if not m:
        return "", pdf_name, [page_idx + 1, page_idx + 1]

    chunk = first_text[m.start():]
    # find next SECTION boundary INSIDE chunk (skipping the very first match)
    matches = list(next_section_pat.finditer(chunk))
    body_text = ""
    last_page_idx = page_idx
    if len(matches) >= 2:
        body_text = chunk[: matches[1].start()]
    else:
        body_text = chunk
        # fall through to subsequent pages on same PDF, up to 4 extra pages
        # try to acquire the same fitz document for additional pages
        for (n, doc) in PDFS_BY_NAME:
            if n == pdf_name:
                doc_obj = doc
                break
        else:
            doc_obj = None
        if doc_obj is not None:
            for offset in range(1, 5):
                if page_idx + offset >= doc_obj.page_count:
                    break
                more = doc_obj.load_page(page_idx + offset).get_text("text") or ""
                m2 = next_section_pat.search(more)
                if m2:
                    body_text += "\n" + more[: m2.start()]
                    last_page_idx = page_idx + offset
                    break
                else:
                    body_text += "\n" + more
                    last_page_idx = page_idx + offset

    return body_text.strip(), pdf_name, [page_idx + 1, last_page_idx + 1]


def quality_ok(body: str, ref: str) -> tuple[bool, dict]:
    """Strict quality gate: >= 200 chars, contains ref verbatim, non-letter ratio < 30%."""
    metrics = {"body_chars": len(body), "contains_ref": ref in body}
    if len(body) < MIN_BODY_CHARS:
        return False, {**metrics, "fail": "too_short"}
    if ref not in body:
        return False, {**metrics, "fail": "ref_not_in_body"}
    letters = sum(1 for ch in body if ch.isalpha())
    non_letters = len(body) - letters
    ratio = non_letters / max(1, len(body))
    metrics["non_letter_ratio"] = round(ratio, 3)
    if ratio >= MAX_NONLETTER_RATIO:
        return False, {**metrics, "fail": "non_letter_ratio_high"}
    return True, metrics


def slugify_ref(ref: str) -> str:
    return ref.replace(".", "-")


def write_md_meta(target: dict, body: str, source_pdf: str, page_range: list[int], confidence: float, metrics: dict):
    ref = target["section_number"]
    chapter = target["chapter"]
    record_id = f"sbc-801-section-{slugify_ref(ref)}"
    md_path = OUT_DIR / f"{record_id}.md"
    meta_path = OUT_DIR / f"{record_id}.meta.json"

    md_text = (
        "---\n"
        f"record_id: {record_id}\n"
        "code_family: SBC 801\n"
        "edition: 2024\n"
        f"section_or_table: {ref}\n"
        f"chapter: {chapter}\n"
        f"source_pdf: {source_pdf}\n"
        f"page_range: [{page_range[0]}, {page_range[1]}]\n"
        "extraction_method: pdf_sweep_round3_hazmat\n"
        f"extraction_confidence: {confidence}\n"
        "requires_review: true\n"
        f"extracted_at_utc: \"{NOW_UTC}\"\n"
        f"agent: {AGENT}\n"
        "---\n\n"
        f"# Section {ref}\n\n"
        "## Canonical Code Text\n\n"
        f"{body}\n"
    )

    if SECTION_SYMBOL in md_text:
        md_text = md_text.replace(SECTION_SYMBOL, "Section")

    md_path.write_text(md_text, encoding="utf-8", newline="\n")
    sha256 = hashlib.sha256(md_path.read_bytes()).hexdigest()

    meta = {
        "section_number": ref,
        "chapter": chapter,
        "source_pdf": source_pdf,
        "page_range": page_range,
        "extraction_method": "pdf_sweep_round3_hazmat",
        "extraction_confidence": confidence,
        "requires_review": True,
        "record_id": record_id,
        "body_chars": len(body),
        "extracted_at_utc": NOW_UTC,
        "agent": AGENT,
        "sha256_md": sha256,
        "section_symbol_count": md_path.read_text(encoding="utf-8").count(SECTION_SYMBOL),
        "quality_metrics": metrics,
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8", newline="\n")
    return str(md_path), str(meta_path), sha256


PDFS_BY_NAME: list[tuple[str, fitz.Document]] = []


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    targets = load_targets()
    print(f"chapters 50-63 manual_review_keep targets: {len(targets)}")

    pdfs = open_pdfs()
    print(f"opened {len(pdfs)} SBC 801 PDFs")

    # publish pdfs for extract_section_body to access additional pages
    global PDFS_BY_NAME
    PDFS_BY_NAME = pdfs

    classifications = {
        "real_section": [],
        "cross_reference_only": [],
        "absent_from_2024_pdf": [],
        "manual_review_keep": [],   # found heading but quality below threshold
        "quarantine": [],            # mirrors cross-ref or absent
    }

    resolved_count = 0
    resolved_items = []

    for target in targets:
        ref = str(target["section_number"])
        chapter = target["chapter"]
        heading_hits, body_only, plain_hits = find_heading_occurrences(pdfs, ref)

        record = {
            "section_number": ref,
            "chapter": chapter,
            "heading_hits": len(heading_hits),
            "body_only_hits": body_only,
            "plain_section_mentions": plain_hits,
        }

        if heading_hits:
            # try extraction unless we've capped
            if resolved_count >= TOKEN_CAP:
                record["status"] = "manual_review_keep"
                record["reason"] = "token_budget_cap_reached"
                classifications["manual_review_keep"].append(record)
                continue
            body, source_pdf, page_range = extract_section_body(heading_hits, ref)
            ok, metrics = quality_ok(body, ref)
            if not ok:
                record["status"] = "manual_review_keep"
                record["reason"] = f"extraction_quality_below_threshold:{metrics.get('fail')}"
                record["metrics"] = metrics
                classifications["manual_review_keep"].append(record)
                continue
            confidence = 0.7 if len(heading_hits) == 1 else 0.6
            md_path, meta_path, sha = write_md_meta(
                target, body, source_pdf, page_range, confidence, metrics
            )
            resolved_count += 1
            record["status"] = "real_section"
            record["md_path"] = md_path
            record["meta_path"] = meta_path
            record["sha256_md"] = sha
            record["body_chars"] = len(body)
            record["source_pdf"] = source_pdf
            record["page_range"] = page_range
            classifications["real_section"].append(record)
            resolved_items.append(record)
        else:
            # no heading anywhere
            if plain_hits > 0 or body_only > 0:
                # only cross-ref'd, never its own heading
                record["status"] = "cross_reference_only"
                record["reason"] = "heading_pattern_not_found_but_text_mentions_exist"
                classifications["cross_reference_only"].append(record)
                classifications["quarantine"].append(record)
            else:
                record["status"] = "absent_from_2024_pdf"
                record["reason"] = "no_heading_no_body_mention"
                classifications["absent_from_2024_pdf"].append(record)
                classifications["quarantine"].append(record)

    # write reports
    summary = {
        "agent": AGENT,
        "code_family": "SBC 801",
        "edition": 2024,
        "generated_at_utc": NOW_UTC,
        "input_report": str(REPORT_IN),
        "scope": "chapters 50-63 hazmat / special-sections (manual_review_keep)",
        "targets_total": len(targets),
        "token_budget_cap": TOKEN_CAP,
        "counts": {
            "real_section": len(classifications["real_section"]),
            "cross_reference_only": len(classifications["cross_reference_only"]),
            "absent_from_2024_pdf": len(classifications["absent_from_2024_pdf"]),
            "manual_review_keep": len(classifications["manual_review_keep"]),
            "quarantine": len(classifications["quarantine"]),
        },
        "output_dir": str(OUT_DIR),
        "real_section_items": classifications["real_section"],
        "cross_reference_only_items": classifications["cross_reference_only"],
        "absent_from_2024_pdf_items": classifications["absent_from_2024_pdf"],
        "manual_review_keep_items": classifications["manual_review_keep"],
        "quarantine_items": classifications["quarantine"],
    }

    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(summary, indent=2), encoding="utf-8", newline="\n")

    # markdown
    md_lines = []
    md_lines.append(f"# SBC 801 round 3 hazmat (chapters 50-63) classification report")
    md_lines.append("")
    md_lines.append(f"- Agent: {AGENT}")
    md_lines.append(f"- Generated: {NOW_UTC}")
    md_lines.append(f"- Input report: `{REPORT_IN}`")
    md_lines.append(f"- Scope: manual_review_keep section_numbers in chapters 50-63")
    md_lines.append(f"- Targets total: {len(targets)}")
    md_lines.append(f"- Token cap: {TOKEN_CAP} resolutions")
    md_lines.append("")
    md_lines.append("## Classification counts")
    md_lines.append("")
    md_lines.append(f"- real_section: {len(classifications['real_section'])}")
    md_lines.append(f"- cross_reference_only: {len(classifications['cross_reference_only'])}")
    md_lines.append(f"- absent_from_2024_pdf: {len(classifications['absent_from_2024_pdf'])}")
    md_lines.append(f"- manual_review_keep (extraction below threshold): {len(classifications['manual_review_keep'])}")
    md_lines.append(f"- quarantine (cross_ref + absent combined): {len(classifications['quarantine'])}")
    md_lines.append("")
    md_lines.append("## Resolved real_section items")
    md_lines.append("")
    for it in classifications["real_section"]:
        md_lines.append(
            f"- `{it['section_number']}` chapter {it['chapter']} -> {Path(it['md_path']).name} "
            f"({it['body_chars']} chars, {it['source_pdf']} pp.{it['page_range'][0]}-{it['page_range'][1]})"
        )
    md_lines.append("")
    md_lines.append("## cross_reference_only items")
    md_lines.append("")
    for it in classifications["cross_reference_only"]:
        md_lines.append(f"- `{it['section_number']}` chapter {it['chapter']} (plain mentions={it['plain_section_mentions']})")
    md_lines.append("")
    md_lines.append("## absent_from_2024_pdf items")
    md_lines.append("")
    for it in classifications["absent_from_2024_pdf"]:
        md_lines.append(f"- `{it['section_number']}` chapter {it['chapter']}")
    md_lines.append("")
    md_lines.append("## manual_review_keep items (heading found, extraction below threshold)")
    md_lines.append("")
    for it in classifications["manual_review_keep"]:
        md_lines.append(f"- `{it['section_number']}` chapter {it['chapter']} reason={it.get('reason')}")
    md_text = "\n".join(md_lines) + "\n"
    if SECTION_SYMBOL in md_text:
        md_text = md_text.replace(SECTION_SYMBOL, "Section")
    REPORT_MD.write_text(md_text, encoding="utf-8", newline="\n")

    # sha256 of report files
    sha_md = hashlib.sha256(REPORT_MD.read_bytes()).hexdigest()
    sha_json = hashlib.sha256(REPORT_JSON.read_bytes()).hexdigest()

    # symbol counts
    md_symbol_count = REPORT_MD.read_text(encoding="utf-8").count(SECTION_SYMBOL)
    json_symbol_count = REPORT_JSON.read_text(encoding="utf-8").count(SECTION_SYMBOL)
    extracted_files = sorted(OUT_DIR.glob("*"))
    extracted_symbol_total = 0
    for p in extracted_files:
        if p.is_file():
            extracted_symbol_total += p.read_text(encoding="utf-8", errors="ignore").count(SECTION_SYMBOL)

    print("=" * 60)
    print("DONE.")
    print(f"resolved real_section: {len(classifications['real_section'])}")
    print(f"cross_reference_only:  {len(classifications['cross_reference_only'])}")
    print(f"absent_from_2024_pdf:  {len(classifications['absent_from_2024_pdf'])}")
    print(f"manual_review_keep:    {len(classifications['manual_review_keep'])}")
    print(f"quarantine (combined): {len(classifications['quarantine'])}")
    print(f"sha256(report_md):     {sha_md}")
    print(f"sha256(report_json):   {sha_json}")
    print(f"symbol-count report_md:   {md_symbol_count}")
    print(f"symbol-count report_json: {json_symbol_count}")
    print(f"symbol-count extracted_files: {extracted_symbol_total}")
    print(f"output_dir files: {len(extracted_files)}")
    print(f"top resolved sample (first 5):")
    for it in classifications["real_section"][:5]:
        print(f"  - {it['section_number']} -> {Path(it['md_path']).name} (chars={it['body_chars']})")


if __name__ == "__main__":
    main()
