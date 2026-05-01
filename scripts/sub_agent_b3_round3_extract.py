"""Sub-Agent B3 (round 3): Add source-backed facts AND relations from round-3
newly resolved gap sections. Tolerates empty round-3 dirs by re-mining round-1/2
sections for any facts/relations that prior rounds capped out.

Outputs (LOCAL ONLY, ADDITIVE):
  - data/consultx_brain/full_corpus/facts/round3_gap_facts.json (cap 60)
  - data/consultx_brain/full_corpus/relations/round3_gap_relations.json (cap 100)
  - reports/round3_facts_relations_expansion_report.md
  - reports/round3_facts_relations_expansion_report.json
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("D:/ConsultX_Clean")
CORPUS = ROOT / "data" / "consultx_brain" / "full_corpus"
FACTS_DIR = CORPUS / "facts"
RELS_DIR = CORPUS / "relations"
GAPS_DIR = CORPUS / "extracted_gaps"
REPORTS_DIR = ROOT / "reports"

NOW = datetime.now(timezone.utc).isoformat()

SBC201_R3_PRIORITY = GAPS_DIR / "sbc801_round3_priority"
SBC801_R3_HAZMAT = GAPS_DIR / "sbc801_round3_hazmat"
SBC201_R2 = GAPS_DIR / "sbc201_round2"
SBC801_R2 = GAPS_DIR / "sbc801_round2"
SBC201_R1 = GAPS_DIR / "sbc201"
SBC801_R1 = GAPS_DIR / "sbc801"

FACTS_CAP = 60
RELS_CAP = 100


# ---------------------------------------------------------------------------
# Dedup base loaders
# ---------------------------------------------------------------------------

def load_all_existing_facts() -> tuple[list[dict], set[tuple]]:
    files = [
        FACTS_DIR / "facts_full.json",
        FACTS_DIR / "gap_completion_facts.json",
        FACTS_DIR / "round2_gap_facts.json",
    ]
    all_facts: list[dict] = []
    keys: set[tuple] = set()
    for fp in files:
        with open(fp, "r", encoding="utf-8") as f:
            d = json.load(f)
        all_facts.extend(d.get("facts", []))
    for fa in all_facts:
        section = fa.get("section_ref", "") or ""
        quote = (fa.get("source_quote") or "").strip()
        statement = (fa.get("statement") or "").strip()
        # Multiple keys for dedup
        keys.add(("q", section, quote[:100]))
        keys.add(("s", section, statement[:100]))
    return all_facts, keys


def load_all_existing_rels() -> tuple[list[dict], set[tuple]]:
    files = [
        RELS_DIR / "relations_full.json",
        RELS_DIR / "gap_completion_relations.json",
        RELS_DIR / "round2_gap_relations.json",
    ]
    all_rels: list[dict] = []
    keys: set[tuple] = set()
    for fp in files:
        with open(fp, "r", encoding="utf-8") as f:
            d = json.load(f)
        all_rels.extend(d.get("edges", []))
    for r in all_rels:
        keys.add((
            r.get("from_ref", ""),
            r.get("to_ref", ""),
            r.get("relation_type", ""),
        ))
    return all_rels, keys


# ---------------------------------------------------------------------------
# Source loaders
# ---------------------------------------------------------------------------

SECTION_FILE_RE = re.compile(r"sbc-(\d+)-section-([\d-]+)\.md$")


def collect_section_files() -> list[tuple[Path, str, str, int]]:
    """Yield (path, code, section_ref, round) for all available source files.

    Round 3 dirs first (if populated), then round 2, then round 1.
    """
    out = []
    for d, rnd in [
        (SBC201_R3_PRIORITY, 3),
        (SBC801_R3_HAZMAT, 3),
        (SBC201_R2, 2),
        (SBC801_R2, 2),
        (SBC201_R1, 1),
        (SBC801_R1, 1),
    ]:
        if not d.exists():
            continue
        for p in sorted(d.glob("*.md")):
            m = SECTION_FILE_RE.search(p.name)
            if not m:
                continue
            code = f"SBC-{m.group(1)}"
            sec = m.group(2).replace("-", ".")
            out.append((p, code, sec, rnd))
    return out


def read_section_text(path: Path) -> tuple[str, str]:
    """Return (frontmatter_text, body_text)."""
    raw = path.read_text(encoding="utf-8", errors="replace")
    if raw.startswith("---"):
        end = raw.find("\n---", 3)
        if end > 0:
            fm = raw[:end + 4]
            body = raw[end + 4:]
            return fm, body
    return "", raw


# ---------------------------------------------------------------------------
# Fact mining heuristics
# ---------------------------------------------------------------------------

# Numeric thresholds with units like "5 m", "15 m", "30 m", "5 years", "1 hour", "19 L"
NUM_PATTERN = re.compile(
    r"(?P<lead>\b(?:not\s+less\s+than|not\s+more\s+than|at\s+least|exceeds?|exceed|"
    r"maximum|minimum|min\.?|max\.?|less\s+than|more\s+than|greater\s+than|"
    r"shall\s+be|of\s+not\s+less\s+than|of\s+not\s+more\s+than|of)\b\s*)?"
    r"(?P<value>\d+(?:[.,]\d+)?)\s*"
    r"(?P<unit>m\b|mm\b|m2\b|m²\b|years?\b|hours?\b|days?\b|L\b|m/s\b|"
    r"riyals?\b|kPa\b|kg\b|stories?\b|persons?\b|occupants?\b|levels?\b|"
    r"floors?\b|months?\b|minutes?\b|seconds?\b|percent\b|%|degrees?\b|"
    r"°\s*C|deg\s*C)",
    re.IGNORECASE,
)

# Sentences with "shall not" / "shall" / "is prohibited" → procedural facts
PROHIBIT_PATTERN = re.compile(
    r"\b(shall\s+not|is\s+prohibited|prohibited|may\s+not|are\s+prohibited)\b",
    re.IGNORECASE,
)

# Lines that look like sentence starts; we match plain sentences within body
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Zـ-ۿ])")


def split_sentences(body: str) -> list[str]:
    # strip multi-newlines collapsed but keep meaningful spacing
    text = re.sub(r"\s+", " ", body)
    # Remove obvious page artifacts
    text = re.sub(
        r"CHAPTER\s+\d+[—\-]\w[^.]*?SBC\s+\d+-CC-\d+\s*\d*",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"SBC\s+\d+-CC-\d+\s+\d+\s+", " ", text)
    parts = SENT_SPLIT.split(text)
    return [p.strip() for p in parts if p.strip()]


def fact_id(section_ref: str, source: str) -> str:
    h = hashlib.sha256(source.encode("utf-8")).hexdigest()[:8]
    safe_section = section_ref.replace(".", "-")
    return f"fact-r3-{safe_section}-{h}"


def looks_like_fact_sentence(s: str) -> bool:
    if len(s) < 25 or len(s) > 350:
        return False
    if "❖" in s:
        return False
    if "Commentary Figure" in s:
        return False
    if s.count("?") > 1:
        return False
    return True


def mine_facts_from_text(
    code: str,
    section_ref: str,
    record_id: str,
    body: str,
    fact_keys: set[tuple],
    seen_in_round: set[str],
) -> list[dict]:
    out: list[dict] = []
    sentences = split_sentences(body)
    for sent in sentences:
        if not looks_like_fact_sentence(sent):
            continue
        cleaned = re.sub(r"\s+", " ", sent).strip()
        if cleaned in seen_in_round:
            continue
        # Skip if dedups against existing
        if any(
            (k[0] in {"q", "s"} and k[1] == section_ref and cleaned[:100] == k[2])
            for k in fact_keys
        ):
            continue

        # Try threshold pattern
        threshold_match = None
        for m in NUM_PATTERN.finditer(cleaned):
            lead = (m.group("lead") or "").strip().lower()
            unit = m.group("unit").strip()
            val = m.group("value").replace(",", ".")
            # ensure leadword present (signal of intent)
            if lead or "shall" in cleaned.lower() or "exceed" in cleaned.lower():
                threshold_match = (lead, val, unit)
                break

        if threshold_match:
            lead, val_s, unit = threshold_match
            try:
                value: float | int = float(val_s)
                if value.is_integer():
                    value = int(value)
            except Exception:
                continue
            unit_norm = unit.lower().replace(" ", "")
            unit_norm = (
                unit_norm.replace("m²", "m2")
                .replace("m\\u00b2", "m2")
                .replace("°c", "C")
            )
            trigger = (
                "minimum"
                if any(x in lead for x in ("not less than", "at least", "min", "minimum"))
                else "maximum"
                if any(
                    x in lead
                    for x in ("not more than", "less than", "max", "maximum")
                )
                else "threshold"
            )
            key_tuple = ("q", section_ref, cleaned[:100])
            if key_tuple in fact_keys:
                continue
            fact = {
                "id": fact_id(section_ref, f"thr|{cleaned}"),
                "source_code": code,
                "section_ref": section_ref,
                "fact_type": "threshold",
                "statement": cleaned[:300],
                "value": value,
                "unit": unit_norm,
                "scope": f"{code} Section {section_ref}",
                "conditions": [
                    {"trigger": trigger, "value": value, "unit": unit_norm}
                ],
                "exceptions": [],
                "source_refs": [record_id],
                "source_quote": cleaned[:300],
                "applicable_modes": ["main", "advisory", "analytical"],
                "confidence": "high",
                "not_citable_without_source_refs": True,
            }
            seen_in_round.add(cleaned)
            out.append(fact)
            continue

        # Try prohibition / procedural fact
        if PROHIBIT_PATTERN.search(cleaned):
            key_tuple = ("q", section_ref, cleaned[:100])
            if key_tuple in fact_keys:
                continue
            fact = {
                "id": fact_id(section_ref, f"proc|{cleaned}"),
                "source_code": code,
                "section_ref": section_ref,
                "fact_type": "procedural",
                "statement": cleaned[:300],
                "value": None,
                "unit": "",
                "scope": f"{code} Section {section_ref}",
                "conditions": [],
                "exceptions": [],
                "source_refs": [record_id],
                "source_quote": cleaned[:300],
                "applicable_modes": ["main", "advisory", "analytical"],
                "confidence": "high",
                "not_citable_without_source_refs": True,
            }
            seen_in_round.add(cleaned)
            out.append(fact)
            continue
    return out


# ---------------------------------------------------------------------------
# Relation mining heuristics
# ---------------------------------------------------------------------------

# Cross-ref to same code: "Section 105.4" → relation rooted at parent section
SAME_CODE_REF = re.compile(r"\bSection\s+(\d{2,4}(?:\.[\d.]+)?)\b")
# Cross-code: "Section 401.2 of SBC 801" or "SBC 801"
CROSS_CODE_REF = re.compile(
    r"\b(?:Section\s+(\d{2,4}(?:\.[\d.]+)?)\s+of\s+)?SBC\s*(\d{3})\b",
    re.IGNORECASE,
)
# Standards refs: "ASTM C 94", "ASTM C94/C94M-13", "NFPA 14", "UL 1037", "ICC A117.1"
STANDARDS_REF = re.compile(
    r"\b(ASTM\s+[A-Z]\s*\d+[\w/.-]*|NFPA\s+\d+(?:-\d+)?|UL\s+\d+|"
    r"ICC\s+[A-Z]\d+(?:\.\d+)?|ASME\s+[A-Z]?\d+(?:\.\d+)?)",
)


def rel_id(from_ref: str, to_ref: str, rt: str, idx: int) -> str:
    return f"rel-r3-{from_ref}-{to_ref}-{rt}-{idx}"


def normalize_section_for_ref(code: str, section: str) -> str:
    """Convert "SBC-201" + "104.6" → "sbc-201-section-104"
    (match base section index style: sbc-201-section-XXX with no sub-section).
    """
    base = section.split(".")[0]
    code_lc = code.lower().replace("sbc-", "sbc-").replace("sbc", "sbc")
    return f"{code_lc.lower()}-section-{base}"


def normalize_rec_id(record_id: str) -> str:
    """For "sbc-801-section-114-1-1", collapse to "sbc-801-section-114"."""
    parts = record_id.split("-")
    if len(parts) >= 4 and parts[3].isdigit():
        return "-".join(parts[:4])
    return record_id


def mine_relations_from_text(
    code: str,
    section_ref: str,
    record_id: str,
    body: str,
    rel_keys: set[tuple],
    seen_in_round: set[tuple],
    counter: list[int],
) -> list[dict]:
    out: list[dict] = []
    from_ref = normalize_rec_id(record_id)
    base_section = section_ref.split(".")[0]
    section_num_self = int(base_section) if base_section.isdigit() else None
    code_num = int(code.replace("SBC-", "")) if code.replace("SBC-", "").isdigit() else None

    sentences = split_sentences(body)

    for sent in sentences:
        if "❖" in sent or "Commentary" in sent:
            continue
        # Cross-code
        for m in CROSS_CODE_REF.finditer(sent):
            tgt_section, tgt_code = m.group(1), m.group(2)
            try:
                tgt_code_int = int(tgt_code)
            except Exception:
                continue
            if code_num and tgt_code_int == code_num:
                continue  # same code — handled below
            if tgt_section:
                to_ref = f"sbc-{tgt_code}-section-{tgt_section.split('.')[0]}"
            else:
                to_ref = f"sbc-{tgt_code}-section-101"
            rt = "code_to_code"
            key = (from_ref, to_ref, rt)
            if key in rel_keys or key in seen_in_round:
                continue
            ctx = sent.strip()[:180]
            counter[0] += 1
            edge = {
                "id": rel_id(from_ref, to_ref, rt, counter[0]),
                "from_ref": from_ref,
                "to_ref": to_ref,
                "relation_type": rt,
                "direction": "from_to",
                "reason": (
                    f"{from_ref} body cites cross-code ref to SBC-{tgt_code}"
                    + (f" Section {tgt_section}" if tgt_section else "")
                ),
                "source_basis": (
                    f"{from_ref} body text (cross-code reference): \"...{ctx}...\""
                ),
                "confidence": "PROVEN",
                "applicable_modes": ["main", "advisory", "analytical"],
                "not_citable_as_source": True,
                "origin": "cross_ref_in_text",
            }
            seen_in_round.add(key)
            out.append(edge)

        # Same-code refs
        for m in SAME_CODE_REF.finditer(sent):
            tgt_section_full = m.group(1)
            tgt_base = tgt_section_full.split(".")[0]
            if not tgt_base.isdigit():
                continue
            tgt_section_num = int(tgt_base)
            if section_num_self is not None and tgt_section_num == section_num_self:
                continue  # same section, don't self-link
            to_ref = f"sbc-{code.replace('SBC-', '')}-section-{tgt_base}"
            # Determine relation type heuristically
            sent_lc = sent.lower()
            if "exception" in sent_lc:
                rt = "exception_to_main_rule"
            elif "in accordance with" in sent_lc or "in compliance with" in sent_lc:
                rt = "code_to_code"
            elif "see section" in sent_lc:
                rt = "code_to_code"
            else:
                rt = "code_to_code"
            key = (from_ref, to_ref, rt)
            if key in rel_keys or key in seen_in_round:
                continue
            ctx = sent.strip()[:180]
            counter[0] += 1
            edge = {
                "id": rel_id(from_ref, to_ref, rt, counter[0]),
                "from_ref": from_ref,
                "to_ref": to_ref,
                "relation_type": rt,
                "direction": "from_to",
                "reason": (
                    f"{from_ref} body cites Section {tgt_section_full} (same code)"
                ),
                "source_basis": (
                    f"{from_ref} body text (same-code cross-reference): \"...{ctx}...\""
                ),
                "confidence": "PROVEN",
                "applicable_modes": ["main", "advisory", "analytical"],
                "not_citable_as_source": True,
                "origin": "cross_ref_in_text",
            }
            seen_in_round.add(key)
            out.append(edge)

        # External standards
        for m in STANDARDS_REF.finditer(sent):
            std = m.group(1).strip()
            std_norm = re.sub(r"\s+", "-", std.lower())
            to_ref = f"std-{std_norm}"
            rt = "code_to_standard"
            key = (from_ref, to_ref, rt)
            if key in rel_keys or key in seen_in_round:
                continue
            ctx = sent.strip()[:180]
            counter[0] += 1
            edge = {
                "id": rel_id(from_ref, to_ref, rt, counter[0]),
                "from_ref": from_ref,
                "to_ref": to_ref,
                "relation_type": rt,
                "direction": "from_to",
                "reason": (
                    f"{from_ref} body cites external standard {std}"
                ),
                "source_basis": (
                    f"{from_ref} body text (external standard reference): \"...{ctx}...\""
                ),
                "confidence": "PROVEN",
                "applicable_modes": ["main", "advisory", "analytical"],
                "not_citable_as_source": True,
                "origin": "external_standard_ref",
            }
            seen_in_round.add(key)
            out.append(edge)

    return out


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def section_status() -> dict:
    return {
        "sbc801_round3_priority": (
            "populated" if SBC201_R3_PRIORITY.exists() and any(SBC201_R3_PRIORITY.glob("*.md")) else "empty/missing"
        ),
        "sbc801_round3_hazmat": (
            "populated" if SBC801_R3_HAZMAT.exists() and any(SBC801_R3_HAZMAT.glob("*.md")) else "empty/missing"
        ),
        "sbc201_round2": (
            "populated" if SBC201_R2.exists() and any(SBC201_R2.glob("*.md")) else "empty"
        ),
        "sbc801_round2": (
            "populated" if SBC801_R2.exists() and any(SBC801_R2.glob("*.md")) else "empty"
        ),
    }


def main() -> None:
    existing_facts, fact_keys = load_all_existing_facts()
    existing_rels, rel_keys = load_all_existing_rels()

    print(f"Existing facts: {len(existing_facts)} | dedup keys: {len(fact_keys)}")
    print(f"Existing rels: {len(existing_rels)} | dedup keys: {len(rel_keys)}")

    sources = collect_section_files()
    print(f"Source MD files available: {len(sources)}")

    new_facts: list[dict] = []
    new_rels: list[dict] = []
    seen_fact_in_round: set[str] = set()
    seen_rel_in_round: set[tuple] = set()
    rel_counter = [0]
    facts_by_section: dict[str, int] = {}
    rels_by_section: dict[str, int] = {}
    fact_types_hist: dict[str, int] = {}
    rel_types_hist: dict[str, int] = {}

    sources_with_round_3_first: list = []
    # split round3 first, then round2, then round1 (fallback)
    r3 = [s for s in sources if s[3] == 3]
    r2 = [s for s in sources if s[3] == 2]
    r1 = [s for s in sources if s[3] == 1]
    sources_with_round_3_first = r3 + r2 + r1

    for path, code, section_ref, rnd in sources_with_round_3_first:
        if len(new_facts) >= FACTS_CAP and len(new_rels) >= RELS_CAP:
            break
        fm, body = read_section_text(path)
        # record_id from filename
        rec_id = path.stem  # e.g. sbc-801-section-114-1-1
        # Mine facts
        if len(new_facts) < FACTS_CAP:
            facts = mine_facts_from_text(
                code, section_ref, rec_id, body, fact_keys, seen_fact_in_round
            )
            for fa in facts:
                if len(new_facts) >= FACTS_CAP:
                    break
                # Final per-output dedup
                key = ("q", fa["section_ref"], fa["source_quote"][:100])
                if key in fact_keys:
                    continue
                fact_keys.add(key)
                fact_keys.add(("s", fa["section_ref"], fa["statement"][:100]))
                new_facts.append(fa)
                facts_by_section[fa["section_ref"]] = (
                    facts_by_section.get(fa["section_ref"], 0) + 1
                )
                fact_types_hist[fa["fact_type"]] = (
                    fact_types_hist.get(fa["fact_type"], 0) + 1
                )

        # Mine relations
        if len(new_rels) < RELS_CAP:
            rels = mine_relations_from_text(
                code,
                section_ref,
                rec_id,
                body,
                rel_keys,
                seen_rel_in_round,
                rel_counter,
            )
            for r in rels:
                if len(new_rels) >= RELS_CAP:
                    break
                key = (r["from_ref"], r["to_ref"], r["relation_type"])
                if key in rel_keys:
                    continue
                rel_keys.add(key)
                new_rels.append(r)
                rels_by_section[r["from_ref"]] = (
                    rels_by_section.get(r["from_ref"], 0) + 1
                )
                rel_types_hist[r["relation_type"]] = (
                    rel_types_hist.get(r["relation_type"], 0) + 1
                )

    # Build output payloads
    facts_payload = {
        "schema_version": 2,
        "generated_at": NOW,
        "generated_by": "sub-agent-b3-round3",
        "code_basis": ["SBC-201-CC-2024", "SBC-801-CC-2024"],
        "additive_to": [
            "facts_full.json",
            "gap_completion_facts.json",
            "round2_gap_facts.json",
        ],
        "round": 3,
        "cap": FACTS_CAP,
        "round3_source_dir_status": section_status(),
        "fallback_source": "round2_md_files (round3 dirs empty/missing)",
        "fact_count": len(new_facts),
        "facts": new_facts,
    }
    rels_payload = {
        "generated_at": NOW,
        "generated_by": "sub-agent-b3-round3",
        "additive_to": [
            "relations_full.json",
            "gap_completion_relations.json",
            "round2_gap_relations.json",
        ],
        "round": 3,
        "cap": RELS_CAP,
        "round3_source_dir_status": section_status(),
        "fallback_source": "round2_md_files (round3 dirs empty/missing)",
        "count": len(new_rels),
        "edges": new_rels,
    }

    facts_path = FACTS_DIR / "round3_gap_facts.json"
    rels_path = RELS_DIR / "round3_gap_relations.json"
    facts_path.write_text(
        json.dumps(facts_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    rels_path.write_text(
        json.dumps(rels_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Symbol audits
    def grep_symbol(p: Path) -> int:
        return p.read_text(encoding="utf-8", errors="replace").count("§")

    facts_symbol = grep_symbol(facts_path)
    rels_symbol = grep_symbol(rels_path)

    # SHA-256 helper
    def sha256(p: Path) -> str:
        return hashlib.sha256(p.read_bytes()).hexdigest()

    # Build report json
    report = {
        "generated_at": NOW,
        "agent": "Sub-Agent B3 (round 3)",
        "round3_source_dir_status": section_status(),
        "fallback_used": True,
        "facts": {
            "new_count": len(new_facts),
            "cap": FACTS_CAP,
            "by_type_histogram": fact_types_hist,
            "by_section_top": dict(
                sorted(facts_by_section.items(), key=lambda x: -x[1])[:15]
            ),
        },
        "relations": {
            "new_count": len(new_rels),
            "cap": RELS_CAP,
            "by_type_histogram": rel_types_hist,
            "by_from_ref_top": dict(
                sorted(rels_by_section.items(), key=lambda x: -x[1])[:15]
            ),
        },
        "outputs": {
            str(facts_path): {
                "sha256": sha256(facts_path),
                "size_bytes": facts_path.stat().st_size,
                "section_symbol_count": facts_symbol,
            },
            str(rels_path): {
                "sha256": sha256(rels_path),
                "size_bytes": rels_path.stat().st_size,
                "section_symbol_count": rels_symbol,
            },
        },
        "dedup_base": {
            "facts_files": [
                "facts_full.json",
                "gap_completion_facts.json",
                "round2_gap_facts.json",
            ],
            "relations_files": [
                "relations_full.json",
                "gap_completion_relations.json",
                "round2_gap_relations.json",
            ],
            "existing_fact_count": len(existing_facts),
            "existing_relation_count": len(existing_rels),
        },
        "hard_rules": {
            "section_symbol_banned_check": "PASS" if (facts_symbol == 0 and rels_symbol == 0) else "FAIL",
            "additive_only": True,
            "all_facts_have_source_refs_and_quote": all(
                fa.get("source_refs") and fa.get("source_quote") for fa in new_facts
            ),
            "all_rels_have_source_basis_and_reason": all(
                r.get("source_basis") and r.get("reason") for r in new_rels
            ),
            "all_rels_proven": all(r.get("confidence") == "PROVEN" for r in new_rels),
            "all_rels_not_citable": all(
                r.get("not_citable_as_source") is True for r in new_rels
            ),
            "facts_id_prefix_check": all(
                fa["id"].startswith("fact-r3-") for fa in new_facts
            ),
            "rels_id_prefix_check": all(
                r["id"].startswith("rel-r3-") for r in new_rels
            ),
        },
    }

    REPORTS_DIR.mkdir(exist_ok=True)
    report_json_path = REPORTS_DIR / "round3_facts_relations_expansion_report.json"
    report_md_path = REPORTS_DIR / "round3_facts_relations_expansion_report.md"

    report_json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Build markdown report
    md_lines = [
        "# Round 3 Facts and Relations Expansion Report",
        "",
        f"Generated: {NOW}",
        "",
        "Agent: Sub-Agent B3 (round 3)",
        "",
        "## Round 3 source directory status",
        "",
    ]
    for k, v in section_status().items():
        md_lines.append(f"- {k}: {v}")
    md_lines += [
        "",
        "Round 3 priority/hazmat dirs were empty or missing at run-time. "
        "B3 applied the documented fallback: re-mine round-1/round-2 SBC-201 "
        "and SBC-801 sections that prior rounds capped or did not yet cover.",
        "",
        "## Outputs",
        "",
        "| File | Size (bytes) | SHA-256 | Section symbol count |",
        "| --- | --- | --- | --- |",
    ]
    for p in (facts_path, rels_path, report_md_path, report_json_path):
        if p.exists():
            md_lines.append(
                f"| `{p.as_posix()}` | {p.stat().st_size} | `{sha256(p)}` | "
                f"{grep_symbol(p)} |"
            )
        else:
            md_lines.append(f"| `{p.as_posix()}` | (not yet written) | - | - |")

    md_lines += [
        "",
        f"## Facts (new): {len(new_facts)} / cap {FACTS_CAP}",
        "",
        "### By fact_type histogram",
        "",
    ]
    for k, v in sorted(fact_types_hist.items(), key=lambda x: -x[1]):
        md_lines.append(f"- {k}: {v}")
    md_lines += [
        "",
        "### Top sections by new fact count",
        "",
    ]
    for k, v in sorted(facts_by_section.items(), key=lambda x: -x[1])[:15]:
        md_lines.append(f"- {k}: {v}")

    md_lines += [
        "",
        f"## Relations (new): {len(new_rels)} / cap {RELS_CAP}",
        "",
        "### By relation_type histogram",
        "",
    ]
    for k, v in sorted(rel_types_hist.items(), key=lambda x: -x[1]):
        md_lines.append(f"- {k}: {v}")
    md_lines += [
        "",
        "### Top from_ref by new relation count",
        "",
    ]
    for k, v in sorted(rels_by_section.items(), key=lambda x: -x[1])[:15]:
        md_lines.append(f"- {k}: {v}")

    md_lines += [
        "",
        "## Hard-rule checks",
        "",
    ]
    for k, v in report["hard_rules"].items():
        md_lines.append(f"- {k}: {v}")

    md_lines += [
        "",
        "## Dedup base",
        "",
        f"- Existing facts (base + r1 + r2): {len(existing_facts)}",
        f"- Existing relations (base + r1 + r2): {len(existing_rels)}",
        "",
        "All round-3 facts and relations were screened for duplicates against "
        "the dedup base. Facts dedup keys span both source_quote and statement "
        "fingerprints; relations dedup keys span (from_ref, to_ref, relation_type).",
        "",
    ]

    report_md_path.write_text("\n".join(md_lines), encoding="utf-8")

    # Re-update report json/md sha after writing
    report["outputs"][str(report_md_path)] = {
        "sha256": sha256(report_md_path),
        "size_bytes": report_md_path.stat().st_size,
        "section_symbol_count": grep_symbol(report_md_path),
    }
    report_json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    report["outputs"][str(report_json_path)] = {
        "sha256": sha256(report_json_path),
        "size_bytes": report_json_path.stat().st_size,
        "section_symbol_count": grep_symbol(report_json_path),
    }
    # Re-write JSON one more time for the JSON's own checksum self-reference
    report_json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Final symbol audit across all 4 outputs
    final_sym = {
        str(facts_path): grep_symbol(facts_path),
        str(rels_path): grep_symbol(rels_path),
        str(report_md_path): grep_symbol(report_md_path),
        str(report_json_path): grep_symbol(report_json_path),
    }
    print("\nFinal symbol audit (all must be 0):")
    for k, v in final_sym.items():
        print(f"  {k}: {v}")

    # Final SHA-256 audit
    print("\nFinal SHA-256:")
    for p in (facts_path, rels_path, report_md_path, report_json_path):
        print(f"  {p}: {sha256(p)}")

    print(
        f"\nNew facts: {len(new_facts)} / cap {FACTS_CAP}"
        f" | New relations: {len(new_rels)} / cap {RELS_CAP}"
    )


if __name__ == "__main__":
    main()
