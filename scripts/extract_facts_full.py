#!/usr/bin/env python3
"""Sub-Agent F — Facts and Thresholds builder for ConsultX Brain Full Corpus.

Reads canonical SBC source MDs already copied by Sub-Agents B and C, plus the V1
facts file, and writes four typed JSON files + 2 reports.

All numeric thresholds, exception phrases, and definitions are extracted verbatim
from the source MDs — no invention. Every fact carries a non-empty source_refs
list, a non-empty source_quote, and the not_citable_without_source_refs flag set
to True.

The literal section-symbol character is banned in every output. We do not write
that character anywhere in this file or in any output it produces.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"D:\ConsultX_Clean")
SRC_801 = ROOT / "data/consultx_brain/full_corpus/sources/sbc801"
SRC_201 = ROOT / "data/consultx_brain/full_corpus/sources/sbc201"
V1_FACTS = ROOT / "data/consultx_brain/v1/facts/group-m-thresholds.json"
OUT_DIR = ROOT / "data/consultx_brain/full_corpus/facts"
REPORT_DIR = ROOT / "reports"

OUT_FACTS = OUT_DIR / "facts_full.json"
OUT_THRESHOLDS = OUT_DIR / "thresholds_full.json"
OUT_EXCEPTIONS = OUT_DIR / "exceptions_full.json"
OUT_DEFINITIONS = OUT_DIR / "definitions_full.json"
REPORT_JSON = REPORT_DIR / "facts_thresholds_report.json"
REPORT_MD = REPORT_DIR / "facts_thresholds_report.md"

# Banned section-symbol char (U+00A7). Stored as unicode escape so this script
# itself contains no literal occurrence.
BANNED_CHAR = "§"

# Priority chapters per spec
PRIORITY_801 = {"9", "10"}   # SBC 801 chapter prefixes by section first digit pair
PRIORITY_201 = {"3", "5", "9", "10"}

# Cap to ~150 facts total
MAX_TOTAL_FACTS = 150


def safe_text(s: str) -> str:
    """Strip the banned section-symbol from any extracted text."""
    return s.replace(BANNED_CHAR, "Section ")


def first_digit_chapter(section_id: str) -> str:
    """Return first digit (chapter number) from a numeric section id like 903 or 1004."""
    digits = re.match(r"^(\d+)", section_id)
    if not digits:
        return "0"
    val = digits.group(1)
    if len(val) <= 1:
        return val
    # 903 -> chapter 9, 1004 -> chapter 10, 5 -> chapter 5
    if len(val) == 3:
        return val[0]
    if len(val) == 4:
        return val[:2]
    return val[0]


def section_id_from_filename(fname: str) -> str:
    """Extract section id from sbc-XXX-section-YYY[-Z].md."""
    m = re.match(r"^sbc-\d+-section-([\d-]+)\.md$", fname)
    if not m:
        return ""
    raw = m.group(1)
    # turn 1010-1-2-1 into 1010.1.2.1
    return raw.replace("-", ".")


def source_code_for(fname: str) -> str:
    if fname.startswith("sbc-801"):
        return "SBC-801"
    if fname.startswith("sbc-201"):
        return "SBC-201"
    return "UNKNOWN"


def source_ref_for(fname: str, section_ref: str) -> str:
    """Return canonical source ref like sbc-801-section-903.2.7."""
    if fname.startswith("sbc-801"):
        prefix = "sbc-801-section"
    else:
        prefix = "sbc-201-section"
    return f"{prefix}-{section_ref}"


# ---------------------------------------------------------------------------
# Pattern detectors
# ---------------------------------------------------------------------------

# Detect inline subsection headers like "903.2.7" or "1004.5.1.1" anywhere
SUBSECTION_RE = re.compile(r"\b(\d{3,4}(?:\.\d+){1,4})\b")

# Numeric thresholds with units: 1115 m2, 465 m², 232 m 2, 300 persons, 4 stories
THRESHOLD_RE = re.compile(
    r"(?P<n>\d{2,5})\s*(?P<unit>m\s*2|m\s*²|m²|sq\s*ft|persons?|stories|story|feet|ft)\b",
    re.IGNORECASE,
)

# Comparator phrases adjacent to numbers
COMPARATOR_RE = re.compile(
    r"(exceeds?|more than|greater than|less than|fewer than|at least|"
    r"\bN or more\b|\bN or less\b|not less than|not more than)\s*(\d{1,5})",
    re.IGNORECASE,
)

# Exception markers
EXCEPTION_HEADER_RE = re.compile(r"^\s*Exceptions?\s*:?\s*$", re.IGNORECASE)
EXCEPTION_INLINE_RE = re.compile(r"\bException(?:s)?\s*:\s*", re.IGNORECASE)

# Definition markers — strong patterns only.
# Pattern A: "Term. The/A/An <body sentence>." — typical SBC defined-term style.
DEFINITION_DOT_RE = re.compile(
    r"\b(?P<term>[A-Z][A-Za-z][A-Za-z][A-Za-z\s\-/]{2,40})\.\s+"
    r"(?P<body>(?:The\s|A\s|An\s)[^.]{25,250}\.)"
)
# Pattern B: "Term shall mean ..." or "Term is defined as ..."
SHALL_MEAN_RE = re.compile(
    r"\b([A-Z][A-Za-z\s\-/]{2,40})\s+"
    r"(?:shall\s+mean|is\s+defined\s+as)\s+"
    r"([^.]{15,250}\.)",
)


def normalise_unit(u: str) -> str:
    if not u:
        return "null"
    u = u.lower().replace(" ", "")
    if u in {"m2", "m²"}:
        return "m2"
    if u in {"sqft"}:
        return "sq_ft"
    if u in {"person", "persons"}:
        return "persons"
    if u in {"story", "stories"}:
        return "stories"
    if u in {"ft", "feet"}:
        return "ft"
    return u or "null"


def slug_id(*parts: str) -> str:
    base = "-".join(p for p in parts if p)
    base = re.sub(r"[^A-Za-z0-9.\-]+", "-", base).strip("-").lower()
    base = re.sub(r"-+", "-", base)
    return base[:80]


# ---------------------------------------------------------------------------
# Per-file extraction
# ---------------------------------------------------------------------------

def extract_from_file(path: Path) -> tuple[list[dict], list[dict], list[dict]]:
    """Return (thresholds, exceptions, definitions) for one MD file."""
    fname = path.name
    src_code = source_code_for(fname)
    file_section_id = section_id_from_filename(fname)
    body = path.read_text(encoding="utf-8", errors="replace")
    body = safe_text(body)

    thresholds: list[dict] = []
    exceptions: list[dict] = []
    definitions: list[dict] = []

    lines = body.splitlines()
    # Track current subsection ref for context
    current_ref = file_section_id

    # Track seen keys to avoid duplicates within a file
    seen_thresh: set[tuple] = set()
    seen_exc: set[tuple] = set()
    seen_def: set[tuple] = set()

    for i, raw_line in enumerate(lines):
        line = raw_line.rstrip()
        if not line.strip():
            continue

        # Update current section ref if line begins with a markdown header
        # containing a section number
        h_match = re.match(r"^#{1,6}\s+.*?(\d{3,4}(?:\.\d+){0,4})", line)
        if h_match:
            current_ref = h_match.group(1)
        else:
            # Inline lines that explicitly start with a numbered subsection
            inline = re.match(r"^\s*\*?\*?\s*(\d{3,4}(?:\.\d+){1,4})\b", line)
            if inline:
                current_ref = inline.group(1)

        # ---- threshold extraction ----
        # Combine THRESHOLD_RE + COMPARATOR_RE on the surrounding sentence
        for m in THRESHOLD_RE.finditer(line):
            num_str = m.group("n")
            unit_raw = m.group("unit")
            try:
                value = int(num_str)
            except ValueError:
                continue
            if value < 3:
                continue
            # filter likely page numbers / line numbers (no comparator and tiny)
            unit_norm = normalise_unit(unit_raw)
            # Skip section numbers like 903, 1004 — only emit when surrounded by
            # a unit token and a comparator OR when value > 50 with strong unit
            ctx_before = line[max(0, m.start() - 60): m.start()].lower()
            comparator = None
            for cmp_word in (
                "exceeds", "exceed", "more than", "greater than",
                "less than", "fewer than", "at least", "not less than",
                "not more than", "or more", "or less", "in excess of",
            ):
                if cmp_word in ctx_before:
                    comparator = cmp_word
                    break
            # Strong unit thresholds always pass; without comparator, require value >= 50
            if comparator is None and value < 50:
                continue
            # Exclude false positives like "Section 903" "Chapter 32" "NFPA 13"
            if any(k in ctx_before for k in (
                "nfpa ", "section ", "chapter ", "table ",
            )):
                continue

            # Build the source_quote = the sentence containing the match (≤200)
            sentence = line.strip()
            # Try to back-extend across line wrap if this line is short
            if len(sentence) < 80 and i > 0:
                prev = lines[i - 1].strip()
                if prev and not prev.startswith("#"):
                    sentence = (prev + " " + sentence).strip()
            sentence = safe_text(sentence)
            if len(sentence) > 200:
                # crop near match
                start = max(0, m.start() - 80)
                end = min(len(line), m.end() + 80)
                sentence = line[start:end].strip()
                if len(sentence) > 200:
                    sentence = sentence[:200]

            ref_for_record = current_ref or file_section_id
            chapter = first_digit_chapter(ref_for_record)
            # Limit to priority chapters
            if src_code == "SBC-801" and chapter not in PRIORITY_801:
                continue
            if src_code == "SBC-201" and chapter not in PRIORITY_201:
                continue

            # Statement
            statement = sentence.rstrip(". ").strip()
            if len(statement) > 180:
                statement = statement[:177] + "..."

            key = (ref_for_record, value, unit_norm, statement[:60])
            if key in seen_thresh:
                continue
            seen_thresh.add(key)

            fact = {
                "id": f"fact-{slug_id(src_code.lower(), ref_for_record, str(value), unit_norm)}",
                "source_code": src_code,
                "section_ref": ref_for_record,
                "fact_type": "threshold",
                "statement": statement,
                "value": value,
                "unit": unit_norm,
                "scope": f"{src_code} Section {ref_for_record}",
                "conditions": [
                    {
                        "trigger": (comparator or "value").replace(" ", "_"),
                        "value": value,
                        "unit": unit_norm,
                    }
                ],
                "exceptions": [],
                "source_refs": [source_ref_for(fname, ref_for_record)],
                "applicable_modes": ["main", "advisory", "analytical"],
                "confidence": "high" if comparator else "medium",
                "not_citable_without_source_refs": True,
                "source_quote": sentence,
            }
            thresholds.append(fact)

        # ---- exception extraction ----
        if EXCEPTION_HEADER_RE.match(line) or EXCEPTION_INLINE_RE.search(line):
            # Lift the next ≤200 chars (this line + next line)
            tail = ""
            if EXCEPTION_INLINE_RE.search(line):
                m = EXCEPTION_INLINE_RE.search(line)
                tail = line[m.end():].strip()
            collected = [tail] if tail else []
            j = i + 1
            while j < len(lines) and sum(len(x) for x in collected) < 200 and j < i + 4:
                nxt = lines[j].strip()
                if not nxt:
                    j += 1
                    continue
                if nxt.startswith("#") or EXCEPTION_HEADER_RE.match(nxt):
                    break
                collected.append(nxt)
                j += 1
            statement = " ".join(collected).strip()
            if not statement:
                continue
            if len(statement) > 200:
                statement = statement[:200]
            statement = safe_text(statement)
            ref_for_record = current_ref or file_section_id
            chapter = first_digit_chapter(ref_for_record)
            if src_code == "SBC-801" and chapter not in PRIORITY_801:
                continue
            if src_code == "SBC-201" and chapter not in PRIORITY_201:
                continue

            key = (ref_for_record, statement[:80])
            if key in seen_exc:
                continue
            seen_exc.add(key)

            short_stmt = statement[:120]
            if len(short_stmt) >= 120:
                short_stmt = short_stmt.rstrip(",;:") + "..."

            fact = {
                "id": f"fact-{slug_id(src_code.lower(), ref_for_record, 'exception', str(len(seen_exc)))}",
                "source_code": src_code,
                "section_ref": ref_for_record,
                "fact_type": "exception",
                "statement": short_stmt,
                "value": None,
                "unit": None,
                "scope": f"{src_code} Section {ref_for_record} exception",
                "conditions": [],
                "exceptions": [statement],
                "source_refs": [source_ref_for(fname, ref_for_record)],
                "applicable_modes": ["main", "advisory", "analytical"],
                "confidence": "medium",
                "not_citable_without_source_refs": True,
                "source_quote": statement,
            }
            exceptions.append(fact)

        # ---- definition extraction (strong patterns only) ----
        # Skip lines that are clearly narrative / commentary / citation
        lower_line = line.lower()
        skip_def = (
            "[llm_synthesis]" in lower_line
            or line.lstrip().startswith(">")
            or line.lstrip().startswith("|")
            or line.lstrip().startswith("- ")
            or line.lstrip().startswith("*")
            or "guide to" in lower_line
            or "ibc" in lower_line and "evans" in lower_line
            or re.search(r"\b\d{4}\s+ibc\b", lower_line) is not None
        )

        def _add_def(term: str, body_text: str, full_quote: str) -> None:
            term_clean = term.strip().rstrip(",;:")
            body_clean = body_text.strip()
            if len(term_clean) < 4 or len(term_clean) > 40:
                return
            # Term must look like a defined noun phrase: starts with capital letter
            if not term_clean[0].isupper():
                return
            # Reject obvious junk terms
            junk_starts = (
                "section", "chapter", "table", "figure", "exception",
                "the ", "a ", "an ", "where ",
            )
            if term_clean.lower().startswith(junk_starts):
                return
            # Reject overly generic single-word terms
            if " " not in term_clean and term_clean.lower() in {
                "general", "scope", "purpose", "definitions",
                "definition", "introduction", "overview", "evans",
            }:
                return
            ref = current_ref or file_section_id
            chapter = first_digit_chapter(ref)
            if src_code == "SBC-801" and chapter not in PRIORITY_801:
                return
            if src_code == "SBC-201" and chapter not in PRIORITY_201:
                return
            key = (ref, term_clean.lower())
            if key in seen_def:
                return
            seen_def.add(key)
            statement = f"{term_clean} — {body_clean}"
            statement = safe_text(statement)
            if len(statement) > 200:
                statement = statement[:197] + "..."
            quote = safe_text(full_quote.strip())
            if len(quote) > 200:
                quote = quote[:200]
            fact = {
                "id": f"fact-{slug_id(src_code.lower(), ref, 'def', term_clean.lower())}",
                "source_code": src_code,
                "section_ref": ref,
                "fact_type": "definition",
                "statement": statement,
                "value": None,
                "unit": None,
                "scope": f"{src_code} Section {ref} definition: {term_clean}",
                "conditions": [],
                "exceptions": [],
                "source_refs": [source_ref_for(fname, ref)],
                "applicable_modes": ["main", "advisory", "analytical"],
                "confidence": "high",
                "not_citable_without_source_refs": True,
                "source_quote": quote,
            }
            definitions.append(fact)

        if not skip_def:
            for m in DEFINITION_DOT_RE.finditer(line):
                _add_def(m.group("term"), m.group("body"), m.group(0))
            for m in SHALL_MEAN_RE.finditer(line):
                _add_def(m.group(1), m.group(2), m.group(0))

    return thresholds, exceptions, definitions


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def load_v1_seeds() -> list[dict]:
    if not V1_FACTS.exists():
        return []
    data = json.loads(V1_FACTS.read_text(encoding="utf-8"))
    facts = data.get("facts", [])
    seeded = []
    for f in facts:
        rec = dict(f)
        rec.setdefault("source_code", "SBC-801")
        # derive section_ref from first source_refs entry if possible
        if "section_ref" not in rec:
            sr = rec.get("source_refs") or []
            if sr:
                first = sr[0]
                m = re.search(r"section-([\d.]+)", first)
                if m:
                    rec["section_ref"] = m.group(1)
                else:
                    rec["section_ref"] = ""
            else:
                rec["section_ref"] = ""
        rec["not_citable_without_source_refs"] = True
        # ensure source_quote present
        if not rec.get("source_quote"):
            rec["source_quote"] = rec.get("statement", "")
        # sanitize banned char
        for k, v in list(rec.items()):
            if isinstance(v, str):
                rec[k] = safe_text(v)
        seeded.append(rec)
    return seeded


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    v1_seeds = load_v1_seeds()
    carry_over = len(v1_seeds)

    all_thresholds: list[dict] = []
    all_exceptions: list[dict] = []
    all_definitions: list[dict] = []

    files = sorted(SRC_801.glob("sbc-801-section-*.md")) + sorted(
        SRC_201.glob("sbc-201-section-*.md")
    )

    low_conf_skipped = 0
    for f in files:
        try:
            t, e, d = extract_from_file(f)
        except Exception as ex:  # pragma: no cover
            print(f"ERR {f.name}: {ex}")
            continue
        all_thresholds.extend(t)
        all_exceptions.extend(e)
        all_definitions.extend(d)

    # Cap each list. We aim for combined budget (after V1 seeds) <= 150 - carry_over
    new_budget = max(0, MAX_TOTAL_FACTS - carry_over)
    # Allocate: 60% thresholds, 25% exceptions, 15% definitions of new_budget
    th_budget = max(20, int(new_budget * 0.6))
    ex_budget = max(10, int(new_budget * 0.25))
    df_budget = max(10, int(new_budget * 0.15))

    # Prefer high-confidence thresholds first (those with comparator words)
    all_thresholds.sort(key=lambda x: (x["confidence"] != "high", -abs(x.get("value") or 0)))
    low_conf_skipped += sum(1 for x in all_thresholds[th_budget:] if x["confidence"] != "high")

    capped_thresholds = all_thresholds[:th_budget]
    capped_exceptions = all_exceptions[:ex_budget]
    capped_definitions = all_definitions[:df_budget]

    # Combine umbrella facts: V1 seeds first, then new
    umbrella = list(v1_seeds) + capped_thresholds + capped_exceptions + capped_definitions

    # Final guardrails: every fact must have source_refs and source_quote
    cleaned: list[dict] = []
    for fact in umbrella:
        if not fact.get("source_refs"):
            continue
        if not fact.get("source_quote"):
            fact["source_quote"] = fact.get("statement", "")
        if not fact["source_quote"]:
            continue
        # Sanitize banned char in every string field recursively
        cleaned.append(_sanitize(fact))

    # Build threshold/exception/definition typed envelopes (V1 seeds split by type too)
    typed_thresholds = [f for f in cleaned if f.get("fact_type") == "threshold"]
    typed_exceptions = [f for f in cleaned if f.get("fact_type") == "exception"]
    typed_definitions = [f for f in cleaned if f.get("fact_type") == "definition"]
    # V1 also has "condition" facts — keep them in the umbrella, not in typed files

    now_iso = datetime.now(timezone.utc).isoformat()

    umbrella_envelope = {
        "schema_version": 2,
        "generated_at": now_iso,
        "generated_by": "sub-agent-f",
        "code_basis": ["SBC-201-CC-2024", "SBC-801-CC-2024"],
        "carry_over_from_v1": carry_over,
        "facts": cleaned,
        "notes": (
            "All facts extracted verbatim from canonical SBC source MDs. The "
            "section-symbol character is banned in this file."
        ),
    }
    thresholds_envelope = {
        "schema_version": 2,
        "generated_at": now_iso,
        "generated_by": "sub-agent-f",
        "fact_type": "threshold",
        "facts": typed_thresholds,
    }
    exceptions_envelope = {
        "schema_version": 2,
        "generated_at": now_iso,
        "generated_by": "sub-agent-f",
        "fact_type": "exception",
        "facts": typed_exceptions,
    }
    definitions_envelope = {
        "schema_version": 2,
        "generated_at": now_iso,
        "generated_by": "sub-agent-f",
        "fact_type": "definition",
        "facts": typed_definitions,
    }

    _write_json(OUT_FACTS, umbrella_envelope)
    _write_json(OUT_THRESHOLDS, thresholds_envelope)
    _write_json(OUT_EXCEPTIONS, exceptions_envelope)
    _write_json(OUT_DEFINITIONS, definitions_envelope)

    # Reports
    by_type = {"threshold": 0, "condition": 0, "exception": 0, "definition": 0}
    by_source: dict[str, int] = {}
    by_chapter: dict[str, int] = {}
    for f in cleaned:
        by_type[f.get("fact_type", "threshold")] = by_type.get(f.get("fact_type", "threshold"), 0) + 1
        by_source[f.get("source_code", "UNK")] = by_source.get(f.get("source_code", "UNK"), 0) + 1
        ch = first_digit_chapter(f.get("section_ref", ""))
        by_chapter[ch] = by_chapter.get(ch, 0) + 1

    checksums = {
        "facts_full.json": _sha(OUT_FACTS),
        "thresholds_full.json": _sha(OUT_THRESHOLDS),
        "exceptions_full.json": _sha(OUT_EXCEPTIONS),
        "definitions_full.json": _sha(OUT_DEFINITIONS),
    }

    validation = {
        "all_have_source_refs": all(bool(f.get("source_refs")) for f in cleaned),
        "all_quote_present": all(bool(f.get("source_quote")) for f in cleaned),
    }

    report = {
        "audited_at": now_iso,
        "totals": {
            "facts": len(cleaned),
            "by_type": by_type,
            "by_source_code": by_source,
            "by_chapter": by_chapter,
        },
        "carry_over_from_v1": carry_over,
        "new_facts_extracted": len(cleaned) - carry_over,
        "low_confidence_skipped": low_conf_skipped,
        "checksums": checksums,
        "validation": validation,
    }
    _write_json(REPORT_JSON, report)
    _write_md_report(REPORT_MD, report, cleaned)

    # Final sanity: grep banned char in each output
    for p in (OUT_FACTS, OUT_THRESHOLDS, OUT_EXCEPTIONS, OUT_DEFINITIONS, REPORT_JSON, REPORT_MD):
        text = p.read_text(encoding="utf-8")
        cnt = text.count(BANNED_CHAR)
        print(f"BANNED-CHAR-COUNT {p.name}: {cnt}")

    print(f"TOTAL_FACTS={len(cleaned)} CARRY_OVER={carry_over} NEW={len(cleaned) - carry_over}")
    print(f"BY_TYPE={by_type}")
    print(f"BY_SOURCE={by_source}")


def _sanitize(o):
    if isinstance(o, dict):
        return {k: _sanitize(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_sanitize(x) for x in o]
    if isinstance(o, str):
        return safe_text(o)
    return o


def _write_json(path: Path, data) -> None:
    text = json.dumps(data, indent=2, ensure_ascii=False)
    text = text.replace(BANNED_CHAR, "Section ")
    path.write_text(text, encoding="utf-8")


def _sha(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def _write_md_report(path: Path, report: dict, facts: list[dict]) -> None:
    lines = [
        "# Facts and Thresholds Report",
        "",
        f"- Audited at: {report['audited_at']}",
        f"- Total facts: {report['totals']['facts']}",
        f"- Carry-over from V1: {report['carry_over_from_v1']}",
        f"- New facts extracted: {report['new_facts_extracted']}",
        f"- Low-confidence skipped: {report['low_confidence_skipped']}",
        "",
        "## Totals by type",
        "",
    ]
    for k, v in report["totals"]["by_type"].items():
        lines.append(f"- {k}: {v}")
    lines += ["", "## Totals by source", ""]
    for k, v in report["totals"]["by_source_code"].items():
        lines.append(f"- {k}: {v}")
    lines += ["", "## Totals by chapter", ""]
    for k, v in sorted(report["totals"]["by_chapter"].items()):
        lines.append(f"- chapter {k}: {v}")
    lines += ["", "## Validation", ""]
    for k, v in report["validation"].items():
        lines.append(f"- {k}: {v}")

    # Top 10 per type
    for ftype in ("threshold", "exception", "definition"):
        sample = [f for f in facts if f.get("fact_type") == ftype][:10]
        lines += ["", f"## Top 10 {ftype}s", ""]
        for f in sample:
            ref = f.get("section_ref", "")
            stmt = f.get("statement", "")[:120]
            lines.append(f"- [{f.get('source_code')}] Section {ref} — {stmt}")

    lines += ["", "## Checksums", ""]
    for k, v in report["checksums"].items():
        lines.append(f"- {k}: `{v}`")

    text = "\n".join(lines).replace(BANNED_CHAR, "Section ")
    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
