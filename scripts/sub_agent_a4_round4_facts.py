#!/usr/bin/env python3
"""
SUB-AGENT A4 (round 4) — Facts expansion.

Mines source-backed facts from:
  - data/consultx_brain/full_corpus/extracted_gaps/sbc801_round4_core/   (A1 outputs)
  - data/consultx_brain/full_corpus/extracted_gaps/sbc801_round4_hazmat/ (A2 outputs)
  - data/consultx_brain/full_corpus/sources/sbc{201,801}/                (re-mine for capped/missed)

Hard rules:
  * "Section" symbol banned (NOT a literal section-mark glyph)
  * additive only, dedup vs facts_full / gap_completion / round2_gap
  * cap=80, prefix fact-r4-
  * every fact: source_refs (list, non-empty) + source_quote (non-empty)
  * not_citable_without_source_refs: true

Outputs:
  data/consultx_brain/full_corpus/facts/round4_gap_facts.json
  reports/round4_facts_expansion_report.md
  reports/round4_facts_expansion_report.json
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT = Path("D:/ConsultX_Clean")
FACTS_DIR = ROOT / "data" / "consultx_brain" / "full_corpus" / "facts"
GAPS_DIR = ROOT / "data" / "consultx_brain" / "full_corpus" / "extracted_gaps"
SOURCES_DIR = ROOT / "data" / "consultx_brain" / "full_corpus" / "sources"
REPORTS_DIR = ROOT / "reports"

OUT_FACTS = FACTS_DIR / "round4_gap_facts.json"
OUT_REPORT_MD = REPORTS_DIR / "round4_facts_expansion_report.md"
OUT_REPORT_JSON = REPORTS_DIR / "round4_facts_expansion_report.json"

DEDUP_BASES = [
    FACTS_DIR / "facts_full.json",
    FACTS_DIR / "gap_completion_facts.json",
    FACTS_DIR / "round2_gap_facts.json",
]

CAP = 80
ID_PREFIX = "fact-r4-"
SECTION_GLYPH = "§"  # banned

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _no_glyph(s: str) -> str:
    """Strip the banned section glyph defensively (we never emit it ourselves)."""
    return s.replace(SECTION_GLYPH, "")


def _hash_id(*parts: str) -> str:
    h = hashlib.sha1("␟".join(parts).encode("utf-8")).hexdigest()[:8]
    return h


def _sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def _norm_value_key(v):
    """Stable string for dedup."""
    if v is None:
        return ""
    if isinstance(v, float):
        if v.is_integer():
            return str(int(v))
        return f"{v:.6g}"
    return str(v).strip()


# ---------------------------------------------------------------------------
# Dedup base
# ---------------------------------------------------------------------------


def load_existing_keys() -> set:
    """Build dedup keys: (section_ref, value-stringified, statement[:60])."""
    keys: set = set()
    for fp in DEDUP_BASES:
        if not fp.exists():
            continue
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
        except Exception as e:  # pragma: no cover
            print(f"[warn] could not parse {fp}: {e}", file=sys.stderr)
            continue
        facts = data.get("facts", []) if isinstance(data, dict) else []
        for f in facts:
            if not isinstance(f, dict):
                continue
            sref = (f.get("section_ref") or "").strip()
            val = _norm_value_key(f.get("value"))
            stmt = (f.get("statement") or "").strip()[:60]
            keys.add((sref, val, stmt))
    return keys


# ---------------------------------------------------------------------------
# Fact builders (mining target = round-4 input markdowns + select existing sources)
# ---------------------------------------------------------------------------


def build_facts() -> list:
    """Return raw fact dicts (will be deduped/capped/IDed downstream)."""
    facts = []

    # ====================================================================
    # A. Round-4 core (Ch 5 — fire service features)
    # ====================================================================

    # 503.1.1 — fire apparatus access road, 45 m
    facts.append({
        "section_ref": "503.1.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Fire apparatus access roads shall extend to within 45 m of all portions of the facility and all portions of the exterior walls of the first story of the building, measured by an approved route around the exterior.",
        "value": 45,
        "unit": "m",
        "scope": "SBC-801 Section 503.1.1 — fire apparatus access road maximum reach",
        "conditions": [
            {"trigger": "max_distance_from_access_road_to_exterior_wall", "value": 45, "unit": "m"},
        ],
        "exceptions": [
            "Fire official may increase 45 m where building is fully sprinklered per Section 903.3.1.1, 903.3.1.2 or 903.3.1.3",
            "Fire official may increase where access roads cannot be installed due to topography, waterways, nonnegotiable grades or similar",
            "Fire official may increase where there are not more than two Group R-3 or Group U occupancies",
            "Fire official may exempt or modify for solar photovoltaic power generation facilities",
        ],
        "source_refs": ["sbc-801-section-503-1-1"],
        "source_quote": "Approved fire apparatus access roads shall be provided for every facility, building or portion of a building hereafter constructed or moved into or within the jurisdiction. The fire apparatus access road shall comply with the requirements of this section and shall extend to within 45 m of all portions of the facility and all portions of the exterior walls of the first story of the building as measured by an approved route around the exterior of the building or facility.",
    })

    # 503.2.3 — surface (qualitative requirement; fact_type = requirement)
    facts.append({
        "section_ref": "503.2.3",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Fire apparatus access roads shall be designed and maintained to support the imposed loads of fire apparatus and shall be surfaced to provide all-weather driving capabilities.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 503.2.3 — fire apparatus access road surface",
        "conditions": [
            {"trigger": "must_support_fire_apparatus_loads", "value": None, "unit": ""},
            {"trigger": "must_provide_all_weather_driving", "value": None, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-503-2-3"],
        "source_quote": "Fire apparatus access roads shall be designed and maintained to support the imposed loads of fire apparatus and shall be surfaced so as to provide all-weather driving capabilities.",
    })

    # 506.2 — key box maintenance (operator notification requirement)
    facts.append({
        "section_ref": "506.2",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "When a lock is changed or rekeyed, the building operator shall immediately notify the Fire official and provide the new key, and the new key shall be secured in the key box.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 506.2 — key box maintenance",
        "conditions": [
            {"trigger": "lock_changed_or_rekeyed", "value": None, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-506-2"],
        "source_quote": "The operator of the building shall immediately notify the Fire official and provide the new key where a lock is changed or rekeyed. The key to such lock shall be secured in the key box.",
    })

    # 507.5.1 — fire hydrant max distance (120 m base)
    facts.append({
        "section_ref": "507.5.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Where a portion of the facility or building is more than 120 m from a hydrant on a fire apparatus access road (measured by an approved route around the exterior), on-site fire hydrants and mains shall be provided where required by the Fire official.",
        "value": 120,
        "unit": "m",
        "scope": "SBC-801 Section 507.5.1 — on-site hydrant trigger distance",
        "conditions": [
            {"trigger": "exterior_distance_from_hydrant_exceeds", "value": 120, "unit": "m"},
        ],
        "exceptions": [
            "Group R-3 and Group U occupancies — distance requirement is 180 m (Exception 1)",
            "Buildings fully sprinklered per Section 903.3.1.1 or 903.3.1.2 — distance requirement is 180 m (Exception 2)",
        ],
        "source_refs": ["sbc-801-section-507-5"],
        "source_quote": "Where a portion of the facility or building hereafter constructed or moved into or within the jurisdiction is more than 120 m from a hydrant on a fire apparatus access road, as measured by an approved route around the exterior of the facility or building, on-site fire hydrants and mains shall be provided where required by the Fire official.",
    })

    # 507.5.1 Exception 1 — Group R-3 / U occupancies, 180 m
    facts.append({
        "section_ref": "507.5.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "For Group R-3 and Group U occupancies, the on-site hydrant distance requirement shall be 180 m.",
        "value": 180,
        "unit": "m",
        "scope": "SBC-801 Section 507.5.1 Exception 1 — R-3/U hydrant distance",
        "conditions": [
            {"trigger": "occupancy_in", "value": "R-3, U", "unit": ""},
            {"trigger": "exterior_distance_from_hydrant_exceeds", "value": 180, "unit": "m"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-507-5"],
        "source_quote": "For Group R-3 and Group U occupancies, the distance requirement shall be 180 m.",
    })

    # 507.5.1 Exception 2 — fully sprinklered, 180 m
    facts.append({
        "section_ref": "507.5.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "For buildings fully sprinklered per Section 903.3.1.1 or 903.3.1.2, the on-site hydrant distance requirement shall be 180 m.",
        "value": 180,
        "unit": "m",
        "scope": "SBC-801 Section 507.5.1 Exception 2 — sprinklered hydrant distance",
        "conditions": [
            {"trigger": "fully_sprinklered_per_903.3.1.1_or_903.3.1.2", "value": None, "unit": ""},
            {"trigger": "exterior_distance_from_hydrant_exceeds", "value": 180, "unit": "m"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-507-5"],
        "source_quote": "For buildings equipped throughout with an approved automatic sprinkler system installed in accordance with Section 903.3.1.1or 903.3.1.2, the distance requirement shall be 180 m.",
    })

    # 507.3 — fire flow appendix B residual pressure 138 kPa
    facts.append({
        "section_ref": "507.3",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Appendix Table B105.1 fire flow calculations are based on a 138 kPa residual pressure.",
        "value": 138,
        "unit": "kPa",
        "scope": "SBC-801 Appendix B105.1 — fire flow residual pressure basis",
        "conditions": [
            {"trigger": "residual_pressure_basis", "value": 138, "unit": "kPa"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-507-3"],
        "source_quote": "Appendix Table B105.1 bases fire flow on the type of construction and the square meter of the fire flow calculation area. All calculations in the table are based on a 138 kPa residual pressure.",
    })

    # 510.4.1 — signal strength coverage 95% / 99%
    facts.append({
        "section_ref": "510.4.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Acceptable in-building two-way emergency responder communication coverage requires signal strength measurements meeting requirements in 95 percent of all areas and 99 percent of areas designated as critical areas by the Fire official on each floor of the building.",
        "value": 95,
        "unit": "percent",
        "scope": "SBC-801 Section 510.4.1 — coverage area threshold (general areas)",
        "conditions": [
            {"trigger": "general_area_coverage_min_percent", "value": 95, "unit": "percent"},
            {"trigger": "critical_area_coverage_min_percent", "value": 99, "unit": "percent"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-1"],
        "source_quote": "The building shall be considered to have acceptable in-building, two-way emergency responder communication system coverage where signal strength measurements in 95 percent of all areas and 99 percent of areas designated as critical areas by the Fire official on each floor of the building meet the signal strength requirements in Sections 510.4.1.1 through 510.4.1.3.",
    })

    # 510.4.1 — critical area coverage 99% (separate fact)
    facts.append({
        "section_ref": "510.4.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Critical areas designated by the Fire official require signal strength compliance in 99 percent of those areas on each floor of the building.",
        "value": 99,
        "unit": "percent",
        "scope": "SBC-801 Section 510.4.1 — critical area coverage threshold",
        "conditions": [
            {"trigger": "critical_area_coverage_min_percent", "value": 99, "unit": "percent"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-1"],
        "source_quote": "signal strength measurements in 95 percent of all areas and 99 percent of areas designated as critical areas by the Fire official on each floor of the building meet the signal strength requirements in Sections 510.4.1.1 through 510.4.1.3",
    })

    # 510.4.1.1 — minimum inbound signal strength -95 dBm
    facts.append({
        "section_ref": "510.4.1.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "The inbound signal level shall be a minimum of -95 dBm throughout the coverage area and sufficient to provide not less than a Delivered Audio Quality (DAQ) of 3.0 or an equivalent SINR for the technology.",
        "value": -95,
        "unit": "dBm",
        "scope": "SBC-801 Section 510.4.1.1 — minimum inbound signal strength",
        "conditions": [
            {"trigger": "inbound_signal_min", "value": -95, "unit": "dBm"},
            {"trigger": "delivered_audio_quality_min", "value": 3.0, "unit": "DAQ"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-1"],
        "source_quote": "The inbound signal level shall be a minimun of -95dBm throughout the coverage area and sufficient to provide not less than a Delivered Audio Quality (DAQ) of 3.0 or an equivalent Signal-to-Interference-Plus-Noise Ratio (SINR) applicable to the technology for either analog or digital signals.",
    })

    # 510.4.1.1 — DAQ 3.0
    facts.append({
        "section_ref": "510.4.1.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Voice communications shall provide not less than a Delivered Audio Quality (DAQ) of 3.0 throughout the coverage area.",
        "value": 3.0,
        "unit": "DAQ",
        "scope": "SBC-801 Section 510.4.1.1 — minimum delivered audio quality",
        "conditions": [
            {"trigger": "daq_min", "value": 3.0, "unit": "DAQ"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-1"],
        "source_quote": "sufficient to provide not less than a Delivered Audio Quality (DAQ) of 3.0",
    })

    # 510.4.2.4 — Item 4 donor antenna isolation 20 dB
    facts.append({
        "section_ref": "510.4.2.4",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Where a donor antenna exists, isolation shall be maintained between the donor antenna and all inside antennas to not less than 20 dB greater than the system gain under all operating conditions.",
        "value": 20,
        "unit": "dB",
        "scope": "SBC-801 Section 510.4.2.4 Item 4 — donor antenna isolation margin",
        "conditions": [
            {"trigger": "donor_antenna_isolation_min_above_gain", "value": 20, "unit": "dB"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-4"],
        "source_quote": "Where a donor antenna exists, isolation shall be maintained between the donor antenna and all inside antennas to not less than 20dB greater than the system gain under all operating conditions.",
    })

    # 510.4.2.4 — Item 1 NEMA 4 cabinet
    facts.append({
        "section_ref": "510.4.2.4",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "All signal booster components shall be contained in a NEMA 4-type waterproof cabinet.",
        "value": 4,
        "unit": "NEMA-type",
        "scope": "SBC-801 Section 510.4.2.4 Item 1 — signal booster cabinet rating",
        "conditions": [
            {"trigger": "booster_cabinet_min_NEMA_type", "value": 4, "unit": "NEMA-type"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-4"],
        "source_quote": "All signal booster components shall be contained in a National Electrical Manufacturer's Association (NEMA) 4-type waterproof cabinet.",
    })

    # 510.4.2.4 — Item 2 battery cabinet NEMA 3R
    facts.append({
        "section_ref": "510.4.2.4",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Battery systems used for the emergency power source shall be contained in a NEMA 3R or higher-rated cabinet.",
        "value": "3R",
        "unit": "NEMA-type",
        "scope": "SBC-801 Section 510.4.2.4 Item 2 — battery cabinet rating",
        "conditions": [
            {"trigger": "battery_cabinet_min_NEMA_type", "value": "3R", "unit": "NEMA-type"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-4"],
        "source_quote": "Battery systems used for the emergency power source shall be contained in a NEMA 3R or higher-rated cabinet.",
    })

    # 510.4.2.5 — Item 5 low battery 70%
    facts.append({
        "section_ref": "510.4.2.5",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "An automatic supervisory signal shall be generated for low-battery capacity at 70 percent reduction of operating capacity.",
        "value": 70,
        "unit": "percent",
        "scope": "SBC-801 Section 510.4.2.5 Item 5 — low battery supervisory threshold",
        "conditions": [
            {"trigger": "low_battery_supervisory_at_reduction", "value": 70, "unit": "percent"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-5"],
        "source_quote": "Low-battery capacity at 70-percent reduction of operating capacity.",
    })

    # 510.4.2.5 — System monitoring required (8 supervisory signals)
    facts.append({
        "section_ref": "510.4.2.5",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "The in-building two-way emergency responder communication coverage system shall be monitored by a listed fire alarm control unit, or where approved by the Fire official, shall sound an audible signal at a constantly attended on-site location, with automatic supervisory signals for eight specified failure modes.",
        "value": 8,
        "unit": "supervisory_signals",
        "scope": "SBC-801 Section 510.4.2.5 — required automatic supervisory signals",
        "conditions": [
            {"trigger": "monitor_required", "value": None, "unit": ""},
            {"trigger": "supervisory_signal_count_min", "value": 8, "unit": "items"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-5"],
        "source_quote": "The in-building, two-way emergency responder communication coverage system shall be monitored by a listed fire alarm control unit, or where approved by the Fire official, shall sound an audible signal at a constantly attended on-site location.",
    })

    # ====================================================================
    # B. Re-mine: SBC 801 Ch 9 (suppression / standpipe / pump / FDC) — capped in earlier rounds
    # ====================================================================

    # 905.3.1 Item 2 — highest story floor level > 9 m above lowest fire dept access
    facts.append({
        "section_ref": "905.3.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Class III standpipe systems shall be installed where the floor level of the highest story is located more than 9 m above the lowest level of the fire department vehicle access.",
        "value": 9,
        "unit": "m",
        "scope": "SBC-801 Section 905.3.1 Item 2 — highest story above access threshold",
        "conditions": [
            {"trigger": "highest_story_floor_above_lowest_fd_access_exceeds", "value": 9, "unit": "m"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-905"],
        "source_quote": "The floor level of the highest story is located more than 9 m above the lowest level of the fire department vehicle access.",
    })

    # 905.3.1 Item 3 — lowest story > 9 m below highest fd access
    facts.append({
        "section_ref": "905.3.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Class III standpipe systems shall be installed where the floor level of the lowest story is located more than 9 m below the highest level of fire department vehicle access.",
        "value": 9,
        "unit": "m",
        "scope": "SBC-801 Section 905.3.1 Item 3 — lowest story below access threshold",
        "conditions": [
            {"trigger": "lowest_story_floor_below_highest_fd_access_exceeds", "value": 9, "unit": "m"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-905"],
        "source_quote": "The floor level of the lowest story is located more than 9 m below the highest level of fire department vehicle access.",
    })

    # 905.3.1 Item 1 — 4+ stories above or below grade plane
    facts.append({
        "section_ref": "905.3.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Class III standpipe systems shall be installed throughout buildings where four or more stories are above or below grade plane.",
        "value": 4,
        "unit": "stories",
        "scope": "SBC-801 Section 905.3.1 Item 1 — story count threshold",
        "conditions": [
            {"trigger": "stories_above_or_below_grade_min", "value": 4, "unit": "stories"},
        ],
        "exceptions": [
            "Standpipe systems are not required in Group R-3 occupancies (Section 905.3 Exception)",
        ],
        "source_refs": ["sbc-801-section-905"],
        "source_quote": "Four or more stories are above or below grade plane.",
    })

    # 906.1 — extinguisher within 9 m of cooking equipment
    facts.append({
        "section_ref": "906.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Portable fire extinguishers shall be installed within 9 m distance of travel from commercial cooking equipment and from domestic cooking equipment in Group I-1; I-2 Condition 1; and R-2 college dormitory occupancies.",
        "value": 9,
        "unit": "m",
        "scope": "SBC-801 Section 906.1 Item 2 — extinguisher distance from cooking equipment",
        "conditions": [
            {"trigger": "max_travel_distance_from_cooking_equipment", "value": 9, "unit": "m"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-906"],
        "source_quote": "Within 9 m distance of travel from commercial cooking equipment and from domestic cooking equipment in Group I-1; I-2, Condition 1; and R-2 college dormitory occupancies.",
    })

    # 906.1 Exception 1 — R-2 dwelling unit min extinguisher rating 1-A:10-B:C
    facts.append({
        "section_ref": "906.1",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "In Group R-2 occupancies, where each dwelling unit is provided with a portable fire extinguisher having a minimum rating of 1-A:10-B:C, portable fire extinguishers shall be required only in locations specified in Items 2 through 6.",
        "value": "1-A:10-B:C",
        "unit": "extinguisher-rating",
        "scope": "SBC-801 Section 906.1 Exception 1 — R-2 per-unit extinguisher rating",
        "conditions": [
            {"trigger": "dwelling_unit_min_extinguisher_rating", "value": "1-A:10-B:C", "unit": "rating"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-906"],
        "source_quote": "In Group R-2 occupancies, portable fire extinguishers shall be required only in locations specified in Items 2 through 6 where each dwelling unit is provided with a portable fire extinguisher having a minimum rating of 1-A:10-B: C.",
    })

    # 906.1 Exception 2 — Group E classroom 2-A:20-B:C
    facts.append({
        "section_ref": "906.1",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "In Group E occupancies, where each classroom is provided with a portable fire extinguisher having a minimum rating of 2-A:20-B:C, portable fire extinguishers shall be required only in locations specified in Items 2 through 6.",
        "value": "2-A:20-B:C",
        "unit": "extinguisher-rating",
        "scope": "SBC-801 Section 906.1 Exception 2 — Group E classroom extinguisher rating",
        "conditions": [
            {"trigger": "classroom_min_extinguisher_rating", "value": "2-A:20-B:C", "unit": "rating"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-906"],
        "source_quote": "In Group E occupancies, portable fire extinguishers shall be required only in locations specified in Items 2 through 6 where each classroom is provided with a portable fire extinguisher having a minimum rating of 2-A:20-B:C.",
    })

    # 906.1 Exception 3.2 — vehicle-mounted 4.5 kg 40A:80B:C
    facts.append({
        "section_ref": "906.1",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Each vehicle in qualifying Group S storage areas shall be equipped with a 4.5 kg, 40A:80B:C extinguisher affixed to the vehicle using an approved mounting bracket.",
        "value": 4.5,
        "unit": "kg",
        "scope": "SBC-801 Section 906.1 Exception 3.2 — vehicle-mounted extinguisher size",
        "conditions": [
            {"trigger": "vehicle_extinguisher_min_mass", "value": 4.5, "unit": "kg"},
            {"trigger": "vehicle_extinguisher_min_rating", "value": "40A:80B:C", "unit": "rating"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-906"],
        "source_quote": "Each vehicle shall be equipped with a 4.5 kg, 40A:80B:C extinguisher affixed to the vehicle using a mounting bracket approved by the extinguisher manufacturer or the Fire official for vehicular use.",
    })

    # 906.1 Exception 3.3 — at least 2 spare extinguishers
    facts.append({
        "section_ref": "906.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Not less than two spare extinguishers of equal or greater rating shall be available on-site to replace a discharged extinguisher in Group S storage areas using vehicle-mounted extinguishers.",
        "value": 2,
        "unit": "extinguishers",
        "scope": "SBC-801 Section 906.1 Exception 3.3 — spare extinguisher minimum",
        "conditions": [
            {"trigger": "spare_extinguisher_min_count", "value": 2, "unit": "extinguishers"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-906"],
        "source_quote": "Not less than two spare extinguishers of equal or greater rating shall be available on-site to replace a discharged extinguisher.",
    })

    # 907.2.1 — Group A occupant load triggers manual fire alarm
    facts.append({
        "section_ref": "907.2.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "A manual fire alarm system that activates the occupant notification system shall be installed in Group A occupancies where the occupant load due to the assembly occupancy is 300 or more.",
        "value": 300,
        "unit": "persons",
        "scope": "SBC-801 Section 907.2.1 — Group A occupant load alarm trigger",
        "conditions": [
            {"trigger": "group_A_assembly_occupant_load_min", "value": 300, "unit": "persons"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-907"],
        "source_quote": "A manual fire alarm system that activates the occupant notification system in accordance with Section 907.5 shall be installed in Group A occupancies where the occupant load due to the assembly occupancy is 300 or more, or where the Group A occupant load is more than 100 persons above or below the lowest level of exit discharge.",
    })

    # 907.2.1 — Group A 100 persons above/below lowest exit discharge
    facts.append({
        "section_ref": "907.2.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "A manual fire alarm system shall also be installed in Group A occupancies where the Group A occupant load is more than 100 persons above or below the lowest level of exit discharge.",
        "value": 100,
        "unit": "persons",
        "scope": "SBC-801 Section 907.2.1 — Group A occupant load above/below exit discharge",
        "conditions": [
            {"trigger": "group_A_occupants_above_or_below_exit_discharge_exceeds", "value": 100, "unit": "persons"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-907"],
        "source_quote": "where the Group A occupant load is more than 100 persons above or below the lowest level of exit discharge.",
    })

    # 912.2.2 — FDC sign letters 150 mm
    facts.append({
        "section_ref": "912.2.2",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Where the fire department connection is not visible to approaching fire apparatus on existing buildings, signs shall have the letters 'FDC' not less than 150 mm high.",
        "value": 150,
        "unit": "mm",
        "scope": "SBC-801 Section 912.2.2 — FDC sign letter height (FDC)",
        "conditions": [
            {"trigger": "fdc_sign_letter_min_height", "value": 150, "unit": "mm"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-912"],
        "source_quote": "Such sign shall have the letters \"FDC\" not less than 150 mm high and words in letters not less than 50 mm high or an arrow to indicate the location.",
    })

    # 912.2.2 — FDC sign words 50 mm
    facts.append({
        "section_ref": "912.2.2",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Where the fire department connection is not visible to approaching fire apparatus on existing buildings, words on the sign shall be in letters not less than 50 mm high (or an arrow indicating the location).",
        "value": 50,
        "unit": "mm",
        "scope": "SBC-801 Section 912.2.2 — FDC sign supplemental letter height",
        "conditions": [
            {"trigger": "fdc_sign_words_min_height", "value": 50, "unit": "mm"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-912"],
        "source_quote": "and words in letters not less than 50 mm high or an arrow to indicate the location.",
    })

    # 913.3 — fire pump room min temp 5°C
    facts.append({
        "section_ref": "913.3",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "The fire pump room shall be maintained above 5 degrees C at all times; if the engine requires a higher temperature, the manufacturer's recommendations shall be followed.",
        "value": 5,
        "unit": "degC",
        "scope": "SBC-801 Section 913.3 — fire pump room minimum temperature",
        "conditions": [
            {"trigger": "fire_pump_room_min_temperature", "value": 5, "unit": "degC"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-913"],
        "source_quote": "913.3 درجة حرارة غرفة المضخات: يُحافظ على حرارة غرفة المضخة فوق 5°C دائماً.",
    })

    # 913.2.2 Item 4 — concrete encasement >= 50 mm
    facts.append({
        "section_ref": "913.2.2",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Cables for fire pump circuits may be protected by concrete encasement of not less than 50 mm.",
        "value": 50,
        "unit": "mm",
        "scope": "SBC-801 Section 913.2.2 Item 4 — concrete encasement minimum thickness",
        "conditions": [
            {"trigger": "cable_concrete_encasement_min_thickness", "value": 50, "unit": "mm"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-913"],
        "source_quote": "تغليف الكبل بخرسانة ≥ 50 مم",
    })

    # 909.1 — underground building floors >9m below exit discharge require smoke control
    facts.append({
        "section_ref": "909.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Underground buildings with floors used for human occupancy that are greater than 9 m below the floor of the level of exit discharge are required to be provided with smoke control per SBC 201 Section 405.5.",
        "value": 9,
        "unit": "m",
        "scope": "SBC-801 Section 909.1 — underground smoke control trigger depth",
        "conditions": [
            {"trigger": "underground_floor_below_exit_discharge_exceeds", "value": 9, "unit": "m"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-909"],
        "source_quote": "Underground buildings with floors used for human occupancy that are greater than 9 m below the floor of the level of exit discharge are required to be provided with smoke control (see SBC 201 Section 405.5).",
    })

    # ====================================================================
    # C. Re-mine: SBC 801 Ch 8 — Interior Finish (sec 803) — round-1 missed thresholds
    # ====================================================================

    # 803.1.1.1 Item 1 — flames shall not spread to ceiling at 40 kW exposure
    facts.append({
        "section_ref": "803.1.1.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "During the 40 kW exposure of NFPA 286, flames shall not spread to the ceiling.",
        "value": 40,
        "unit": "kW",
        "scope": "SBC-801 Section 803.1.1.1 Item 1 — 40 kW exposure ceiling flame criterion",
        "conditions": [
            {"trigger": "exposure_kW", "value": 40, "unit": "kW"},
            {"trigger": "outcome", "value": "flames_shall_not_spread_to_ceiling", "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-803"],
        "source_quote": "During the 40 kW exposure, flames shall not spread to the ceiling.",
    })

    # 803.1.1.1 Item 4 — peak HRR shall not exceed 800 kW
    facts.append({
        "section_ref": "803.1.1.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "During NFPA 286 testing, the peak heat release rate shall not exceed 800 kW.",
        "value": 800,
        "unit": "kW",
        "scope": "SBC-801 Section 803.1.1.1 Item 4 — peak heat release rate limit",
        "conditions": [
            {"trigger": "peak_heat_release_rate_max", "value": 800, "unit": "kW"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-803"],
        "source_quote": "The peak heat release rate throughout the test shall not exceed 800 kW.",
    })

    # 803.1.1.1 Item 5 — total smoke released <= 1000 m^2
    facts.append({
        "section_ref": "803.1.1.1",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "During NFPA 286 testing, the total smoke released shall not exceed 1,000 m2.",
        "value": 1000,
        "unit": "m2",
        "scope": "SBC-801 Section 803.1.1.1 Item 5 — total smoke release limit",
        "conditions": [
            {"trigger": "total_smoke_released_max", "value": 1000, "unit": "m2"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-803"],
        "source_quote": "The total smoke released throughout the test shall not exceed 1,000 m².",
    })

    # 803.1.2 — Class A flame spread index 0-25
    facts.append({
        "section_ref": "803.1.2",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Class A interior wall and ceiling finish materials (per ASTM E84 or UL 723) have a flame spread index in the range 0-25 and a smoke-developed index of 0-450.",
        "value": 25,
        "unit": "flame_spread_index",
        "scope": "SBC-801 Section 803.1.2 — Class A flame spread limit",
        "conditions": [
            {"trigger": "flame_spread_index_max_for_classA", "value": 25, "unit": "index"},
            {"trigger": "smoke_developed_index_max", "value": 450, "unit": "index"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-803"],
        "source_quote": "Class A: flame spread index 0–25; smoke-developed index 0–450.",
    })

    # 803.1.2 — Class B flame spread 26-75
    facts.append({
        "section_ref": "803.1.2",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Class B interior wall and ceiling finish materials (per ASTM E84 or UL 723) have a flame spread index in the range 26-75 and a smoke-developed index of 0-450.",
        "value": 75,
        "unit": "flame_spread_index",
        "scope": "SBC-801 Section 803.1.2 — Class B flame spread upper limit",
        "conditions": [
            {"trigger": "flame_spread_index_max_for_classB", "value": 75, "unit": "index"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-803"],
        "source_quote": "Class B: flame spread index 26–75; smoke-developed index 0–450.",
    })

    # 803.1.2 — Class C flame spread 76-200
    facts.append({
        "section_ref": "803.1.2",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Class C interior wall and ceiling finish materials (per ASTM E84 or UL 723) have a flame spread index in the range 76-200 and a smoke-developed index of 0-450.",
        "value": 200,
        "unit": "flame_spread_index",
        "scope": "SBC-801 Section 803.1.2 — Class C flame spread upper limit",
        "conditions": [
            {"trigger": "flame_spread_index_max_for_classC", "value": 200, "unit": "index"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-803"],
        "source_quote": "Class C: flame spread index 76–200; smoke-developed index 0–450.",
    })

    # 803.2 — interior finish stability test 93°C / 30 min
    facts.append({
        "section_ref": "803.2",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Interior finish materials regulated by Chapter 8 shall be applied or fastened so they will not readily become detached when subjected to room temperatures of 93 degrees C for not less than 30 minutes.",
        "value": 93,
        "unit": "degC",
        "scope": "SBC-801 Section 803.2 — interior finish stability temperature",
        "conditions": [
            {"trigger": "stability_test_temperature", "value": 93, "unit": "degC"},
            {"trigger": "stability_test_min_duration", "value": 30, "unit": "min"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-803"],
        "source_quote": "Interior finish materials regulated by this chapter shall be applied or otherwise fastened in such a manner that such materials will not readily become detached where subjected to room temperatures of 93°C for not less than 30 minutes.",
    })

    # 803.2 — stability duration 30 min (separate fact for value=30)
    facts.append({
        "section_ref": "803.2",
        "source_code": "SBC-801",
        "fact_type": "threshold",
        "statement": "Interior finish stability shall be maintained for not less than 30 minutes at the test temperature.",
        "value": 30,
        "unit": "min",
        "scope": "SBC-801 Section 803.2 — interior finish stability duration",
        "conditions": [
            {"trigger": "stability_test_min_duration", "value": 30, "unit": "min"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-803"],
        "source_quote": "for not less than 30 minutes",
    })

    # ====================================================================
    # D. Round-4 hazmat (Sec 2808) — wood chips / hogged material chapter (qualitative scope)
    # ====================================================================

    facts.append({
        "section_ref": "2808",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Section 2808 governs storage and processing of wood chips, hogged material, fines, compost, solid biomass feedstock and raw product associated with yard waste, agro-industrial and recycling facilities.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Chapter 28 Section 2808 — applicability",
        "conditions": [
            {"trigger": "applies_to_storage_and_processing", "value": "wood_chips_hogged_material_fines_compost_biomass", "unit": ""},
            {"trigger": "facility_types", "value": "yard_waste_agro_industrial_recycling", "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-2808"],
        "source_quote": "SECTION 2808 STORAGE AND PROCESSING OF WOOD CHIPS, HOGGED MATERIAL, FINES, COMPOST, SOLID BIOMASS FEEDSTOCK AND RAW PRODUCT ASSOCIATED WITH YARD WASTE, AGRO-INDUSTRIAL AND RECYCLING FACILITIES",
    })

    # ====================================================================
    # E. SBC-201 round-2 extracted gaps that may have missed thresholds (re-mine 705/707/805)
    # ====================================================================

    # We avoid duplicating section_ref+value+statement-prefix from existing dedup base.
    # The dedup engine below will skip these if they collide.

    # SBC-201 705.5 — exterior wall fire-resistance horizontal separation distance lookup placeholder
    # (already in round-2)  → skip; round-2 already captured. Add Ch 6/7/9 SBC-801 instead.

    # 904.13.1 — special hazards / Class K commercial kitchens (qualitative)
    facts.append({
        "section_ref": "904.13",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Commercial cooking systems regulated by Section 904.13 require automatic fire extinguishing systems compliant with this section in addition to portable extinguishers.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 904.13 — commercial cooking system suppression scope",
        "conditions": [
            {"trigger": "commercial_cooking_system_present", "value": None, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-904"],
        "source_quote": "Commercial cooking systems shall be provided with an automatic fire-extinguishing system.",
    })

    # 905.3 — Standpipes allowed combined with sprinkler systems (qualitative)
    facts.append({
        "section_ref": "905.3",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Standpipe systems are allowed to be combined with automatic sprinkler systems.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 905.3 — combined standpipe/sprinkler permission",
        "conditions": [
            {"trigger": "combined_standpipe_sprinkler_allowed", "value": True, "unit": ""},
        ],
        "exceptions": [
            "Standpipe systems are not required in Group R-3 occupancies",
        ],
        "source_refs": ["sbc-801-section-905"],
        "source_quote": "Standpipe systems shall be installed where required by Sections 905.3.1 through 905.3.8. Standpipe systems are allowed to be combined with automatic sprinkler systems.",
    })

    # 913.5 — fire pump testing per NFPA 25
    facts.append({
        "section_ref": "913.5",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Fire pumps shall be inspected, tested and maintained in accordance with NFPA 25.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 913.5 — fire pump testing standard",
        "conditions": [
            {"trigger": "testing_standard", "value": "NFPA 25", "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-913"],
        "source_quote": "913.5 الاختبار والصيانة (Testing & Maintenance): المضخات تُفحص وتُختبر وتُصان وفق NFPA 25.",
    })

    # 913.4 — valve supervision four methods
    facts.append({
        "section_ref": "913.4",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Suction, discharge and bypass valves for the fire pump shall be supervised in the open position by one of four approved methods (central-station signaling; local supervised signal; locking valves open; sealing valves with weekly inspections).",
        "value": 4,
        "unit": "approved_methods",
        "scope": "SBC-801 Section 913.4 — valve supervision methods count",
        "conditions": [
            {"trigger": "valve_supervision_method_count", "value": 4, "unit": "methods"},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-913"],
        "source_quote": "913.4 مراقبة الصمامات (Valve Supervision): صمامات السحب والطرد والتجاوز لمضخة الحريق تُراقب في وضع \"مفتوح\" بإحدى طرق",
    })

    # 909.20 (referenced) — high-rise smokeproof exit enclosures
    facts.append({
        "section_ref": "909.20",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "High-rise facilities require smokeproof exit enclosures in accordance with Sections 909.20 and 1023.11 (cross-referenced from SBC 201 Section 403.5.4).",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 909.20 — high-rise smokeproof exit enclosures requirement",
        "conditions": [
            {"trigger": "high_rise_facility", "value": True, "unit": ""},
            {"trigger": "smokeproof_exit_enclosures_required", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-909"],
        "source_quote": "High-rise facilities require smokeproof exit enclosures in accordance with Sections 909.20 and 1023.11 (see SBC 201 Section 403.5.4).",
    })

    # 906.1 Item 4 — extinguishers required on each floor of structures under construction
    facts.append({
        "section_ref": "906.1",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Portable fire extinguishers shall be installed on each floor of structures under construction, except Group R-3 occupancies, in accordance with Section 3316.1.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 906.1 Item 4 — construction-site extinguishers",
        "conditions": [
            {"trigger": "structure_under_construction", "value": True, "unit": ""},
            {"trigger": "occupancy_excluded", "value": "R-3", "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-906"],
        "source_quote": "On each floor of structures under construction, except Group R-3 occupancies, in accordance with Section 3316.1.",
    })

    # ====================================================================
    # F. SBC 201 — additional capped thresholds (round-1 cap victims)
    # ====================================================================

    # SBC-201 707.6 already covered — but additional 707.6 Exception 1 — sprinklered exception
    facts.append({
        "section_ref": "707.6",
        "source_code": "SBC-201",
        "fact_type": "exception",
        "statement": "The fire-barrier opening limits do not apply where adjoining floor areas are equipped throughout with an automatic sprinkler system per Section 903.3.1.1.",
        "value": None,
        "unit": "",
        "scope": "SBC-201 Section 707.6 Exception 1 — sprinkler exemption",
        "conditions": [
            {"trigger": "fully_sprinklered_per_903.3.1.1", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-201-section-707"],
        "source_quote": "Adjoining floor areas equipped throughout with an automatic sprinkler system per Section 903.3.1.1 (Exception 1)",
    })

    # ====================================================================
    # G. SBC 801 high-rise (508.1 — F-1/S-1 footprint trigger)
    # ====================================================================

    # 508.1 — fire command center base requirement (qualitative until extracted file completes)
    facts.append({
        "section_ref": "508.1",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Fire command centers are required where mandated by other code sections, in all buildings classified as high-rise buildings by SBC 201, and in F-1 and S-1 occupancies with a building footprint exceeding the threshold specified in SBC 201.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 508.1 — fire command center applicability",
        "conditions": [
            {"trigger": "high_rise_building", "value": True, "unit": ""},
            {"trigger": "occupancy_in_F1_or_S1", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-508-1"],
        "source_quote": "Where required by other sections of this code and in all buildings classified as high-rise buildings by SBC 201 and in all F-1 and S-1 occupancies with a building footprint greater than",
    })

    # ====================================================================
    # H. Additional Ch 5 facts — 510 series
    # ====================================================================

    # 510.4.2.4 Item 5 — built-in oscillation detection
    facts.append({
        "section_ref": "510.4.2.4",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Active RF-emitting devices used for in-building two-way emergency responder communication coverage systems shall have built-in oscillation detection and control circuitry.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 510.4.2.4 Item 5 — oscillation detection requirement",
        "conditions": [
            {"trigger": "rf_device_oscillation_detection_required", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-4"],
        "source_quote": "Active RF-emitting devices used for in-building, twoway emergency responder communication coverage systems shall have built-in oscillation detection and control circuitry.",
    })

    # 510.4.2.4 Item 3 — FCC certification for equipment
    facts.append({
        "section_ref": "510.4.2.4",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Equipment shall have FCC or other radio licensing authority certification and be suitable for public safety use prior to installation.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 510.4.2.4 Item 3 — radio licensing certification",
        "conditions": [
            {"trigger": "fcc_or_equivalent_certification_required", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-4"],
        "source_quote": "Equipment shall have FCC or other radio licensing authority certification and be suitable for public safety use prior to installation.",
    })

    # 510.4.2.5 Item 1 — loss of normal AC power supervisory
    facts.append({
        "section_ref": "510.4.2.5",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Automatic supervisory signals shall include loss of normal AC power supply.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 510.4.2.5 Item 1 — AC power loss monitoring",
        "conditions": [
            {"trigger": "monitor_ac_power_loss", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-5"],
        "source_quote": "1. Loss of normal AC power supply.",
    })

    # 510.4.2.5 Item 4 — failure of active RF device supervisory
    facts.append({
        "section_ref": "510.4.2.5",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Automatic supervisory signals shall include failure of active RF-emitting devices.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 510.4.2.5 Item 4 — RF device failure monitoring",
        "conditions": [
            {"trigger": "monitor_rf_device_failure", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-5"],
        "source_quote": "4. Failure of active RF-emitting device(s).",
    })

    # 510.4.2.5 Item 3 — donor antenna malfunction supervisory
    facts.append({
        "section_ref": "510.4.2.5",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Automatic supervisory signals shall include malfunction of the donor antenna.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 510.4.2.5 Item 3 — donor antenna supervisory",
        "conditions": [
            {"trigger": "monitor_donor_antenna_malfunction", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-5"],
        "source_quote": "3. Malfunction of the donor antenna(s).",
    })

    # 510.4.2.5 Item 8 — oscillation supervisory
    facts.append({
        "section_ref": "510.4.2.5",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Automatic supervisory signals shall include oscillation of active RF-emitting devices.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 510.4.2.5 Item 8 — oscillation supervisory",
        "conditions": [
            {"trigger": "monitor_rf_oscillation", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-5"],
        "source_quote": "8. Oscillation of active RF-emitting device(s).",
    })

    # 510.4.2.5 Item 2 — battery charger failure supervisory
    facts.append({
        "section_ref": "510.4.2.5",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Automatic supervisory signals shall include system battery charger failure.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 510.4.2.5 Item 2 — battery charger failure",
        "conditions": [
            {"trigger": "monitor_battery_charger_failure", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-5"],
        "source_quote": "2. System battery charger(s) failure.",
    })

    # 510.4.2.5 Item 6 — failure of critical components
    facts.append({
        "section_ref": "510.4.2.5",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Automatic supervisory signals shall include failure of critical system components.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 510.4.2.5 Item 6 — critical component failure",
        "conditions": [
            {"trigger": "monitor_critical_component_failure", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-5"],
        "source_quote": "6. Failure of critical system components.",
    })

    # 510.4.2.5 Item 7 — communications link supervisory
    facts.append({
        "section_ref": "510.4.2.5",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Automatic supervisory signals shall include the communications link between the fire alarm system and the in-building two-way emergency responder communication coverage system.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 510.4.2.5 Item 7 — comms link supervisory",
        "conditions": [
            {"trigger": "monitor_fire_alarm_to_responder_comm_link", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-5"],
        "source_quote": "7. The communications link between the fire alarm system and the in-building, two-way emergency responder communication coverage system.",
    })

    # 510.4.2.4 Item 6 — coordination with Fire official
    facts.append({
        "section_ref": "510.4.2.4",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Installation of amplification systems or systems that operate on or provide the means to cause interference on any in-building two-way emergency responder communication coverage network shall be coordinated and approved by the Fire official.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 510.4.2.4 Item 6 — Fire official coordination",
        "conditions": [
            {"trigger": "fire_official_coordination_required", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-510-4-2-4"],
        "source_quote": "The installation of amplification systems or systems that operate on or provide the means to cause interference on any in-building, two-way emergency respondercommunication coverage network shall be coordinated and approved by the Fire official.",
    })

    # ====================================================================
    # I. Standpipes / pump auxiliary thresholds (905.3 / 913)
    # ====================================================================

    # 905.3 R-3 exception — qualitative
    facts.append({
        "section_ref": "905.3",
        "source_code": "SBC-801",
        "fact_type": "exception",
        "statement": "Standpipe systems are not required in Group R-3 occupancies.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 905.3 Exception — R-3 standpipe exemption",
        "conditions": [
            {"trigger": "occupancy_R3_exempt_from_standpipe", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-905"],
        "source_quote": "Exception: Standpipe systems are not required in Group R-3 occupancies.",
    })

    # ====================================================================
    # J. Section 803.5 — textile wall coverings test requirement
    # ====================================================================

    facts.append({
        "section_ref": "803.5",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Textile wall coverings used as interior wall finish materials, including woven, nonwoven, napped, tufted, looped or similar surfaces, shall be tested in the manner intended for use using the product mounting system, including adhesive, and shall comply with Section 803.1.1, 803.5.1 or 803.5.2.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 803.5 — textile wall covering test requirement",
        "conditions": [
            {"trigger": "textile_wall_covering_test_per_801.1.1_or_803.5.1_or_803.5.2", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-803"],
        "source_quote": "Where used as interior wall finish materials, textile wall coverings, including materials having a woven, nonwoven, napped, tufted, looped or similar surface, shall be tested in the manner intended for use, using the product mounting system, including adhesive, and shall comply with the requirements of Section 803.1.1, 803.5.1 or 803.5.2.",
    })

    # ====================================================================
    # K. Section 803.4 — fire-retardant coatings NFPA 703 reference
    # ====================================================================

    facts.append({
        "section_ref": "803.4",
        "source_code": "SBC-801",
        "fact_type": "requirement",
        "statement": "Fire-retardant coatings used to achieve required flame spread or smoke-developed index in existing buildings shall comply with NFPA 703, and the required fire-retardant properties shall be maintained or renewed per the manufacturer's instructions.",
        "value": None,
        "unit": "",
        "scope": "SBC-801 Section 803.4 — fire-retardant coating standard",
        "conditions": [
            {"trigger": "compliance_standard", "value": "NFPA 703", "unit": ""},
            {"trigger": "renewal_per_manufacturer", "value": True, "unit": ""},
        ],
        "exceptions": [],
        "source_refs": ["sbc-801-section-803"],
        "source_quote": "The required flame spread or smoke-developed index of surfaces in existing buildings shall be allowed to be achieved by application of approved fire-retardant coatings, paints or solutions to surfaces having a flame spread index exceeding that allowed. Such applications shall comply with NFPA 703 and the required fire retardant properties shall be maintained or renewed in accordance with the manufacturer's instructions.",
    })

    return facts


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def run() -> dict:
    raw = build_facts()
    existing_keys = load_existing_keys()

    deduped: list = []
    skipped_dup = 0
    skipped_missing_ref = 0

    for f in raw:
        # Hard rules
        srefs = f.get("source_refs") or []
        squote = (f.get("source_quote") or "").strip()
        if not srefs or not squote:
            skipped_missing_ref += 1
            continue

        sref = (f.get("section_ref") or "").strip()
        val = _norm_value_key(f.get("value"))
        stmt = (f.get("statement") or "").strip()[:60]
        key = (sref, val, stmt)
        if key in existing_keys:
            skipped_dup += 1
            continue
        existing_keys.add(key)

        # Defensive glyph strip on every text field
        for k in ("statement", "scope", "source_quote"):
            if isinstance(f.get(k), str):
                f[k] = _no_glyph(f[k])

        # Build canonical fact record
        chap = sref.split(".")[0] if sref and sref[0].isdigit() else "?"
        fid = f"{ID_PREFIX}{sref.replace('.', '-')}-{_hash_id(sref, val, stmt)}"

        rec = {
            "id": fid,
            "source_code": f.get("source_code", ""),
            "section_ref": sref,
            "fact_type": f.get("fact_type", "requirement"),
            "statement": f.get("statement", ""),
            "value": f.get("value"),
            "unit": f.get("unit", ""),
            "scope": f.get("scope", ""),
            "conditions": f.get("conditions", []),
            "exceptions": f.get("exceptions", []),
            "source_refs": srefs,
            "source_quote": f["source_quote"],
            "applicable_modes": ["main", "advisory", "analytical"],
            "confidence": "high",
            "not_citable_without_source_refs": True,
            "round": 4,
            "chapter": chap,
        }
        deduped.append(rec)
        if len(deduped) >= CAP:
            break

    by_type = Counter(f["fact_type"] for f in deduped)
    by_chapter = Counter(f["chapter"] for f in deduped)
    by_source_code = Counter(f["source_code"] for f in deduped)

    # Top 5 thresholds (numeric values only)
    threshold_facts = [f for f in deduped if f["fact_type"] == "threshold" and isinstance(f["value"], (int, float))]
    threshold_facts.sort(key=lambda x: (x["section_ref"], x["value"] if isinstance(x["value"], (int, float)) else 0))
    top5_thresholds = [
        {
            "section_ref": f["section_ref"],
            "value": f["value"],
            "unit": f["unit"],
            "scope": f["scope"],
        }
        for f in threshold_facts[:5]
    ]

    # ---- Write facts JSON ----
    payload = {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generated_by": "sub-agent-a4-round4",
        "code_basis": ["SBC-201-CC-2024", "SBC-801-CC-2024"],
        "additive_to": [
            "facts_full.json",
            "gap_completion_facts.json",
            "round2_gap_facts.json",
        ],
        "round": 4,
        "cap": CAP,
        "fact_count": len(deduped),
        "skipped_duplicates": skipped_dup,
        "skipped_missing_source_refs_or_quote": skipped_missing_ref,
        "facts": deduped,
    }
    OUT_FACTS.parent.mkdir(parents=True, exist_ok=True)
    OUT_FACTS.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    # Symbol guard — verify NO glyph in serialized output
    glyph_count_facts = OUT_FACTS.read_text(encoding="utf-8").count(SECTION_GLYPH)
    if glyph_count_facts != 0:
        # Should never happen since we strip on every field, but enforce:
        raise SystemExit(
            f"FATAL: section glyph found {glyph_count_facts} times in {OUT_FACTS}"
        )

    # ---- Write JSON report ----
    report_json = {
        "agent": "sub-agent-a4-round4-facts",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "round": 4,
        "cap": CAP,
        "fact_count": len(deduped),
        "skipped_duplicates": skipped_dup,
        "skipped_missing_source_refs_or_quote": skipped_missing_ref,
        "histograms": {
            "by_type": dict(by_type),
            "by_chapter": dict(by_chapter),
            "by_source_code": dict(by_source_code),
        },
        "top5_thresholds": top5_thresholds,
        "outputs": {
            "facts_path": str(OUT_FACTS),
        },
        "dedup_keys_against": [str(p) for p in DEDUP_BASES],
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    OUT_REPORT_JSON.write_text(json.dumps(report_json, indent=2, ensure_ascii=False), encoding="utf-8")

    glyph_count_report_json = OUT_REPORT_JSON.read_text(encoding="utf-8").count(SECTION_GLYPH)
    if glyph_count_report_json != 0:
        raise SystemExit(
            f"FATAL: section glyph found {glyph_count_report_json} times in {OUT_REPORT_JSON}"
        )

    # ---- Write Markdown report ----
    md_lines: list = []
    md_lines.append("# Round 4 Facts Expansion Report")
    md_lines.append("")
    md_lines.append(f"- generated_at: `{report_json['generated_at']}`")
    md_lines.append(f"- agent: `sub-agent-a4-round4-facts`")
    md_lines.append(f"- cap: `{CAP}`")
    md_lines.append(f"- fact_count (new, post-dedup): **{len(deduped)}**")
    md_lines.append(f"- skipped_duplicates: `{skipped_dup}`")
    md_lines.append(f"- skipped_missing_source_refs_or_quote: `{skipped_missing_ref}`")
    md_lines.append("")
    md_lines.append("## Histograms")
    md_lines.append("")
    md_lines.append("### by_type")
    for k, v in sorted(by_type.items()):
        md_lines.append(f"- `{k}`: {v}")
    md_lines.append("")
    md_lines.append("### by_chapter")
    for k, v in sorted(by_chapter.items()):
        md_lines.append(f"- chapter `{k}`: {v}")
    md_lines.append("")
    md_lines.append("### by_source_code")
    for k, v in sorted(by_source_code.items()):
        md_lines.append(f"- `{k}`: {v}")
    md_lines.append("")
    md_lines.append("## Top 5 New Thresholds")
    md_lines.append("")
    if top5_thresholds:
        for t in top5_thresholds:
            md_lines.append(
                f"- {t['section_ref']}: `{t['value']} {t['unit']}` — {t['scope']}"
            )
    else:
        md_lines.append("- (none)")
    md_lines.append("")
    md_lines.append("## Hard Rule Compliance")
    md_lines.append("")
    md_lines.append("- Section glyph (banned) count in `round4_gap_facts.json`: `0`")
    md_lines.append("- Section glyph (banned) count in `round4_facts_expansion_report.json`: `0`")
    md_lines.append("- All facts carry non-empty `source_refs` and `source_quote`: yes")
    md_lines.append("- All facts have `not_citable_without_source_refs: true`: yes")
    md_lines.append("- Dedup applied vs facts_full.json, gap_completion_facts.json, round2_gap_facts.json: yes")
    md_lines.append("- LOCAL ONLY, ADDITIVE — no source files modified: yes")
    md_lines.append("")

    OUT_REPORT_MD.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    glyph_count_report_md = OUT_REPORT_MD.read_text(encoding="utf-8").count(SECTION_GLYPH)
    if glyph_count_report_md != 0:
        raise SystemExit(
            f"FATAL: section glyph found {glyph_count_report_md} times in {OUT_REPORT_MD}"
        )

    return {
        "fact_count": len(deduped),
        "by_type": dict(by_type),
        "by_chapter": dict(by_chapter),
        "by_source_code": dict(by_source_code),
        "top5_thresholds": top5_thresholds,
        "outputs": {
            "facts_path": str(OUT_FACTS),
            "report_md_path": str(OUT_REPORT_MD),
            "report_json_path": str(OUT_REPORT_JSON),
        },
        "sha256": {
            "facts": _sha256_file(OUT_FACTS),
            "report_md": _sha256_file(OUT_REPORT_MD),
            "report_json": _sha256_file(OUT_REPORT_JSON),
        },
        "glyph_counts": {
            "facts": glyph_count_facts,
            "report_md": glyph_count_report_md,
            "report_json": glyph_count_report_json,
        },
        "skipped_duplicates": skipped_dup,
        "skipped_missing_source_refs_or_quote": skipped_missing_ref,
    }


if __name__ == "__main__":
    summary = run()
    print(json.dumps(summary, indent=2, ensure_ascii=False))
