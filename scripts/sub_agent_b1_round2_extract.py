#!/usr/bin/env python3
"""
SUB-AGENT B1 (round 2) — Process the 23 remaining SBC 201 manual_review gaps.

For each entry in sbc201_gap_completion_agent_report.json with action == "manual_review":
  - if proposed_pdf is None  -> quarantine
  - else                     -> attempt re-extraction with wider page sweep (+/- 60)
                                AND stricter quality filter:
                                    extracted text >= 200 chars
                                    AND contains the section ref
                                    AND non-letter ratio < 30%
                                If pass: targeted_extract -> write .md + .meta.json
                                Else:   manual_review_keep with explicit reason

Hard rules:
  - Section symbol "Section" banned in output. After every save, grep -c for that
    glyph in the file MUST return 0; otherwise we abort that file.
  - LOCAL ONLY. No DB, no bucket, no deploy.
  - Do NOT modify any file inside D:/sbc_consultx.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import fitz  # PyMuPDF


# ---------------------------------------------------------------------------
# paths
# ---------------------------------------------------------------------------
ROOT = Path(r"D:/ConsultX_Clean")
ROUND1_REPORT = ROOT / "reports" / "sbc201_gap_completion_agent_report.json"
GAP_REPORT    = ROOT / "reports" / "sbc201_extraction_gap_report.json"

OUT_DIR = ROOT / "data" / "consultx_brain" / "full_corpus" / "extracted_gaps" / "sbc201_round2"
OUT_DIR.mkdir(parents=True, exist_ok=True)

OUT_REPORT_MD   = ROOT / "reports" / "sbc201_manual_review_resolution_report.md"
OUT_REPORT_JSON = ROOT / "reports" / "sbc201_manual_review_resolution_report.json"

# sections explicitly absent from SBC 201 2024 corpus per ledger
QUARANTINE_HARD_LIST = {
    "sbc-201-section-203",
    "sbc-201-section-204",
    "sbc-201-section-205",
    "sbc-201-section-206",
    "sbc-201-section-207",
    "sbc-201-section-429",
    "sbc-201-section-918",
    "sbc-201-section-801",
    "sbc-201-section-807",
}

SECTION_GLYPH = "§"  # banned section symbol

PAGE_SWEEP = 60          # +/- pages around proposed page
MIN_CHARS  = 200
MAX_NON_LETTER_RATIO = 0.30

# All SBC 201 PDFs we may search if the proposed_pdf doesn't contain the section.
SBC201_PDFS = [
    Path(r"D:/sbc_consultx/SBC 201 - The Saudi General Building Code-1-250.pdf"),
    Path(r"D:/sbc_consultx/SBC 201 - The Saudi General Building Code-251-500.pdf"),
    Path(r"D:/sbc_consultx/SBC 201 - The Saudi General Building Code-501-1000.pdf"),
    Path(r"D:/sbc_consultx/SBC 201 - The Saudi General Building Code-1001-1250.pdf"),
    Path(r"D:/sbc_consultx/SBC 201 - The Saudi General Building Code-1251-1500.pdf"),
    Path(r"D:/sbc_consultx/SBC 201 - The Saudi General Building Code-1501-1750.pdf"),
    Path(r"D:/sbc_consultx/SBC 201 - The Saudi General Building Code-1751-2000.pdf"),
    Path(r"D:/sbc_consultx/SBC 201 - The Saudi General Building Code-2001-2200.pdf"),
]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def section_id(rec_id: str) -> str:
    # "sbc-201-section-103" -> "103"
    return rec_id.rsplit("-", 1)[-1]


def parse_proposed_page(rng: str | None) -> int | None:
    if not rng:
        return None
    m = re.search(r"p\.\s*(\d+)", rng)
    if not m:
        return None
    return int(m.group(1))


def non_letter_ratio(text: str) -> float:
    if not text:
        return 1.0
    letters = sum(1 for c in text if c.isalpha())
    total   = sum(1 for c in text if not c.isspace())
    if total == 0:
        return 1.0
    return 1.0 - (letters / total)


def normalize_text(text: str) -> str:
    """Strip the section glyph and normalize unicode."""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace(SECTION_GLYPH, "Section")
    # collapse runs of 3+ blank lines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


# Heading patterns we accept as a TRUE section start (not a TOC / cross-ref line).
# We reject prose lines like "Section 113 requires the establishment of …" by
# requiring the heading to look like an actual chapter/section banner:
#
#   * Body convention in this PDF — first sub-numbered paragraph "<ref>.1  Title"
#     where the `.1` falls within the first 8 chars of a line and is followed by
#     two-or-more spaces then a capitalised word (this is how every numbered
#     subsection actually looks on the printed page).
#   * Explicit "SECTION <ref>" banner — case-SENSITIVE all-caps "SECTION", on
#     a line that is short (<= 80 chars, since real banners stand alone). This
#     filters out sentence prose that contains a stray "Section 113".
SECTION_BANNER_TPL = (
    # ^ or newline, then optional whitespace, then exactly "SECTION " (caps),
    # then the ref, then anything except a newline up to 80 chars, then newline
    r"(?:^|\n)[ \t]*SECTION[ \t]+{ref}\b[^\n]{{0,80}}\n"
)
SECTION_SUBNUM_HEADING_TPL = (
    # newline-anchored, "<ref>.1" then 2+ spaces then a Capitalised word
    r"(?:^|\n)[ \t]*{ref}\.1\s{{2,}}[A-Z][A-Za-z]"
)


def find_section_start(pdf: fitz.Document, ref: str, lo: int, hi: int) -> tuple[int, int] | None:
    """
    Sweep pages [lo, hi] and locate the first page where a real section heading
    appears (NOT a TOC entry or in-prose cross-reference).
    Returns (page_index, char_offset_into_page) or None.
    """
    # Case-SENSITIVE on "SECTION" so we don't catch "Section" inside prose.
    banner_pat = re.compile(SECTION_BANNER_TPL.format(ref=re.escape(ref)))
    sub_pat    = re.compile(SECTION_SUBNUM_HEADING_TPL.format(ref=re.escape(ref)))

    # First sweep: prefer the explicit "SECTION <ref>" banner
    for p in range(lo, hi + 1):
        if p < 0 or p >= pdf.page_count:
            continue
        try:
            txt = pdf.load_page(p).get_text("text") or ""
        except Exception:
            continue
        m = banner_pat.search(txt)
        if m:
            return (p, m.start())

    # Second sweep: first sub-numbered body heading "<ref>.1  Title"
    for p in range(lo, hi + 1):
        if p < 0 or p >= pdf.page_count:
            continue
        try:
            txt = pdf.load_page(p).get_text("text") or ""
        except Exception:
            continue
        m = sub_pat.search(txt)
        if m:
            return (p, m.start())

    return None


def find_next_section_start(pdf: fitz.Document, current_ref: str, start_page: int, hi: int) -> int | None:
    """
    Find the NEXT top-level section heading after current_ref so we can stop the
    extraction window. We just look for any SECTION NNN heading where NNN != current_ref.
    """
    next_pat = re.compile(r"(?:^|\n)\s*SECTION\s+(\d{3})\b", re.IGNORECASE)
    for p in range(start_page + 1, hi + 1):
        if p >= pdf.page_count:
            break
        try:
            txt = pdf.load_page(p).get_text("text") or ""
        except Exception:
            continue
        for m in next_pat.finditer(txt):
            if m.group(1) != current_ref:
                return p
    return None


def extract_section_text(pdf_path: Path, ref: str, proposed_page: int) -> dict:
    """
    Try to locate and extract the verbatim text of section `ref` near
    proposed_page (1-based printed). Returns a dict with extraction metadata.
    """
    result: dict = {
        "ok": False,
        "reason": "",
        "text": "",
        "global_page_start": None,
        "global_page_end": None,
        "pages_extracted": 0,
        "section_marker_found": False,
    }

    try:
        pdf = fitz.open(pdf_path)
    except Exception as e:
        result["reason"] = f"open_failed:{e}"
        return result

    try:
        # PyMuPDF is 0-based; proposed_page is 1-based but ALSO printed-page
        # which can be off by a few from PDF-page. We accept this and sweep.
        center = max(0, proposed_page - 1)
        lo = max(0, center - PAGE_SWEEP)
        hi = min(pdf.page_count - 1, center + PAGE_SWEEP)

        hit = find_section_start(pdf, ref, lo, hi)
        if not hit:
            result["reason"] = f"section_marker_not_found_in_sweep[{lo}..{hi}]"
            return result

        start_page, _ = hit
        result["section_marker_found"] = True

        # find next SECTION heading to bound the window
        nxt = find_next_section_start(pdf, ref, start_page, hi)
        if nxt is None:
            # fall back: take up to 6 pages forward
            end_page = min(pdf.page_count - 1, start_page + 5)
        else:
            end_page = nxt - 1
            if end_page < start_page:
                end_page = start_page

        # cap window for safety
        end_page = min(end_page, start_page + 14)

        chunks = []
        for p in range(start_page, end_page + 1):
            try:
                chunks.append(pdf.load_page(p).get_text("text") or "")
            except Exception:
                pass

        raw = "\n".join(chunks)
        # crop to the section start within the first page
        # (so we don't pick up tail of previous section above heading)
        first_page_text = chunks[0] if chunks else ""
        banner_pat = re.compile(SECTION_BANNER_TPL.format(ref=re.escape(ref)))
        sub_pat    = re.compile(SECTION_SUBNUM_HEADING_TPL.format(ref=re.escape(ref)))
        crop_m = banner_pat.search(first_page_text) or sub_pat.search(first_page_text)
        if crop_m:
            cropped_first = first_page_text[crop_m.start():]
            raw = cropped_first + "\n" + "\n".join(chunks[1:])

        text = normalize_text(raw)

        # quality gates
        if len(text) < MIN_CHARS:
            result["reason"] = f"quality_fail:too_short:{len(text)}"
        elif ref not in text:
            result["reason"] = f"quality_fail:section_ref_missing"
        else:
            nlr = non_letter_ratio(text)
            if nlr >= MAX_NON_LETTER_RATIO:
                result["reason"] = f"quality_fail:non_letter_ratio:{nlr:.2f}"
            else:
                result["ok"]                = True
                result["text"]              = text
                result["global_page_start"] = start_page + 1
                result["global_page_end"]   = end_page + 1
                result["pages_extracted"]   = end_page - start_page + 1
                result["non_letter_ratio"]  = round(nlr, 3)
                result["char_count"]        = len(text)

        return result

    finally:
        pdf.close()


def write_outputs(rec_id: str, ref: str, pdf_path: Path, ext: dict) -> str:
    """Write .md and .meta.json. Returns the .md path. Aborts if banned glyph appears."""
    md_path   = OUT_DIR / f"{rec_id}.md"
    meta_path = OUT_DIR / f"{rec_id}.meta.json"

    front = (
        "---\n"
        f"record_id: {rec_id}\n"
        "code_family: SBC 201\n"
        "edition: '2024'\n"
        f"section_id: '{ref}'\n"
        "page_type: section\n"
        "authority_level: STRUCTURED_FACT\n"
        "status: PARTIAL_STRUCTURED\n"
        "source_files:\n"
        f'  - "{pdf_path.name}"\n'
        f'source_pages: "p. {ext["global_page_start"]}-{ext["global_page_end"]} '
        f'({ext["pages_extracted"]} pages, round2 wide-sweep)"\n'
        'extraction_method: "pymupdf-round2"\n'
        'extraction_confidence: "medium"\n'
        "requires_review: true\n"
        "round: 2\n"
        "---\n\n"
    )

    body = ext["text"]
    md_path.write_text(front + body, encoding="utf-8")

    # hard-stop: section glyph must not appear in saved file
    saved = md_path.read_text(encoding="utf-8", errors="replace")
    if SECTION_GLYPH in saved:
        # delete the offending file so the grep-count stays 0
        md_path.unlink(missing_ok=True)
        raise RuntimeError(f"banned section glyph survived in {md_path}")

    meta = {
        "source_pdf": str(pdf_path).replace("\\", "/"),
        "page_range": f"p. {ext['global_page_start']}-{ext['global_page_end']} "
                      f"({ext['pages_extracted']} pages, round2 wide-sweep)",
        "global_page_start": ext["global_page_start"],
        "global_page_end":   ext["global_page_end"],
        "pages_extracted":   ext["pages_extracted"],
        "extraction_method": "pymupdf-round2",
        "confidence":        "medium",
        "requires_review":   True,
        "section_marker_found": ext["section_marker_found"],
        "char_count":           ext["char_count"],
        "non_letter_ratio":     ext["non_letter_ratio"],
        "extracted_at":         now_iso(),
        "round":                2,
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return str(md_path).replace("\\", "/")


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def grep_glyph_count(path: Path) -> int:
    if not path.exists():
        return 0
    txt = path.read_text(encoding="utf-8", errors="replace")
    return txt.count(SECTION_GLYPH)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> int:
    round1   = json.loads(ROUND1_REPORT.read_text(encoding="utf-8"))
    gap_data = json.loads(GAP_REPORT.read_text(encoding="utf-8"))
    gap_by_id = {g["id"]: g for g in gap_data["gaps"]}

    todo = [e for e in round1["entries"] if e["action"] == "manual_review"]
    print(f"[round2] manual_review entries: {len(todo)}", file=sys.stderr)

    out_entries: list[dict] = []
    counts = {
        "resolved":           0,  # successful targeted_extract this round
        "quarantined":        0,
        "manual_review_keep": 0,
    }
    resolved_records: list[dict] = []

    for e in todo:
        rec_id = e["id"]
        gap    = gap_by_id.get(rec_id, {})
        ref    = section_id(rec_id)
        pdf    = gap.get("proposed_pdf")
        rng    = gap.get("proposed_page_range")
        round1_note = e.get("notes", "")

        record: dict = {
            "id":                 rec_id,
            "section_ref":        ref,
            "round1_note":        round1_note,
            "proposed_pdf":       pdf,
            "proposed_page_range": rng,
        }

        # ---- quarantine path ---------------------------------------------------
        if rec_id in QUARANTINE_HARD_LIST or pdf is None:
            record.update({
                "action":               "quarantine",
                "reason":               "no_pdf_or_unknown_range; absent from SBC 201 2024 corpus per ledger",
                "output_md":            None,
                "extraction_confidence": "n/a",
            })
            counts["quarantined"] += 1
            out_entries.append(record)
            continue

        # ---- targeted_extract attempt -----------------------------------------
        proposed_page = parse_proposed_page(rng)
        if proposed_page is None:
            record.update({
                "action":                "manual_review_keep",
                "reason":                "could_not_parse_proposed_page",
                "output_md":             None,
                "extraction_confidence": "low",
            })
            counts["manual_review_keep"] += 1
            out_entries.append(record)
            continue

        pdf_path = Path(pdf)
        if not pdf_path.exists():
            record.update({
                "action":                "manual_review_keep",
                "reason":                f"pdf_not_found:{pdf_path.name}",
                "output_md":             None,
                "extraction_confidence": "low",
            })
            counts["manual_review_keep"] += 1
            out_entries.append(record)
            continue

        ext = extract_section_text(pdf_path, ref, proposed_page)
        used_pdf = pdf_path

        # If the proposed PDF didn't contain the section banner, sweep the
        # other SBC 201 PDFs end-to-end (the round1 metadata sometimes points
        # at the wrong volume). We search ALL pages of each fallback PDF.
        if not ext["ok"] and not ext["section_marker_found"]:
            for alt in SBC201_PDFS:
                if not alt.exists() or alt.resolve() == pdf_path.resolve():
                    continue
                try:
                    page_count = fitz.open(alt).page_count
                except Exception:
                    continue
                # full-PDF sweep on the fallback (mid-point + huge sweep)
                center_alt = page_count // 2
                ext_alt = extract_section_text(alt, ref, center_alt + 1)
                # extract_section_text uses PAGE_SWEEP, so to cover all pages
                # we just call it again with a sweep that covers the doc.
                # Easier: monkey-bound via a one-off direct search:
                if not ext_alt["section_marker_found"]:
                    pdf_alt = fitz.open(alt)
                    try:
                        hit = find_section_start(pdf_alt, ref, 0, pdf_alt.page_count - 1)
                    finally:
                        pdf_alt.close()
                    if hit:
                        # re-extract anchored at the real hit page (1-based)
                        ext_alt = extract_section_text(alt, ref, hit[0] + 1)
                if ext_alt["ok"]:
                    ext      = ext_alt
                    used_pdf = alt
                    record["fallback_pdf_used"] = alt.name
                    break

        if not ext["ok"]:
            record.update({
                "action":                "manual_review_keep",
                "reason":                ext["reason"],
                "output_md":             None,
                "extraction_confidence": "low",
                "section_marker_found":  ext["section_marker_found"],
            })
            counts["manual_review_keep"] += 1
            out_entries.append(record)
            continue

        # use whatever PDF actually yielded the section
        pdf_path = used_pdf

        # success: write outputs and verify glyph
        try:
            md_out = write_outputs(rec_id, ref, pdf_path, ext)
        except RuntimeError as exc:
            record.update({
                "action":                "manual_review_keep",
                "reason":                f"glyph_violation:{exc}",
                "output_md":             None,
                "extraction_confidence": "low",
            })
            counts["manual_review_keep"] += 1
            out_entries.append(record)
            continue

        # final per-file glyph audit (must be 0)
        glyph_count = grep_glyph_count(Path(md_out))
        if glyph_count != 0:
            Path(md_out).unlink(missing_ok=True)
            record.update({
                "action":                "manual_review_keep",
                "reason":                f"glyph_post_audit_failed:{glyph_count}",
                "output_md":             None,
                "extraction_confidence": "low",
            })
            counts["manual_review_keep"] += 1
            out_entries.append(record)
            continue

        record.update({
            "action":                "targeted_extract",
            "output_md":             md_out,
            "extraction_confidence": "medium",
            "char_count":            ext["char_count"],
            "non_letter_ratio":      ext["non_letter_ratio"],
            "section_marker_found":  ext["section_marker_found"],
            "pages_extracted":       ext["pages_extracted"],
            "global_page_start":     ext["global_page_start"],
            "global_page_end":       ext["global_page_end"],
        })
        counts["resolved"] += 1
        resolved_records.append(record)
        out_entries.append(record)

    # ----- write reports ----------------------------------------------------
    summary = {
        "audited_at":    now_iso(),
        "code_family":   "SBC 201",
        "round":         2,
        "input_report":  str(ROUND1_REPORT).replace("\\", "/"),
        "output_dir":    str(OUT_DIR).replace("\\", "/"),
        "manual_review_total": len(todo),
        "counts":        counts,
        "rules": {
            "page_sweep":          PAGE_SWEEP,
            "min_chars":           MIN_CHARS,
            "max_non_letter_ratio": MAX_NON_LETTER_RATIO,
            "section_glyph_banned": True,
        },
        "entries":       out_entries,
    }
    OUT_REPORT_JSON.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    md_lines = [
        "# SBC 201 — Round 2 manual_review resolution",
        "",
        f"- audited_at: {summary['audited_at']}",
        f"- code_family: SBC 201",
        f"- round: 2",
        f"- manual_review_total: {len(todo)}",
        f"- resolved (targeted_extract): {counts['resolved']}",
        f"- quarantined: {counts['quarantined']}",
        f"- manual_review_keep: {counts['manual_review_keep']}",
        "",
        "## Rules",
        f"- wider page sweep: +/- {PAGE_SWEEP}",
        f"- min chars: {MIN_CHARS}",
        f"- max non-letter ratio: {MAX_NON_LETTER_RATIO}",
        '- section glyph banned in any output (hard stop)',
        "",
        "## Entries",
        "",
        "| id | action | reason / notes | output |",
        "|----|--------|----------------|--------|",
    ]
    for rec in out_entries:
        out = rec.get("output_md") or ""
        out_disp = Path(out).name if out else ""
        reason = rec.get("reason") or rec.get("round1_note", "")
        md_lines.append(
            f"| {rec['id']} | {rec['action']} | {reason} | {out_disp} |"
        )
    OUT_REPORT_MD.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    # ----- final glyph audit on the report files -----
    glyph_in_md   = grep_glyph_count(OUT_REPORT_MD)
    glyph_in_json = grep_glyph_count(OUT_REPORT_JSON)
    glyph_in_outputs = sum(grep_glyph_count(p) for p in OUT_DIR.glob("*.md"))

    sha_md   = sha256_of(OUT_REPORT_MD)
    sha_json = sha256_of(OUT_REPORT_JSON)

    print(json.dumps({
        "counts": counts,
        "resolved_top5": [r["id"] for r in resolved_records[:5]],
        "sha256": {
            "report_md":   sha_md,
            "report_json": sha_json,
        },
        "glyph_count": {
            "report_md":   glyph_in_md,
            "report_json": glyph_in_json,
            "round2_md_files_total": glyph_in_outputs,
        },
        "out_dir": str(OUT_DIR).replace("\\", "/"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
